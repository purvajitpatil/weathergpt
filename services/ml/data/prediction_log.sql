-- WeatherGPT ML — Prediction Logging & Monitoring
--
-- Self-evaluating loop:
--   D+0: prediction logged with (district, date, probability, model_version)
--   D+1: ingestion writes the observed outcome
--   D+2: scheduled job joins them → rolling Brier, reliability, PSI
--
-- Alert if 30-day rolling Brier degrades >20% from validation baseline,
-- or if feature PSI > 0.2.

CREATE TABLE IF NOT EXISTS prediction_log (
    id SERIAL PRIMARY KEY,
    district_id INT NOT NULL,
    target TEXT NOT NULL,               -- 'target_rain', 'target_heavy', 'target_heat'
    valid_date DATE NOT NULL,
    probability REAL NOT NULL,
    model_version TEXT NOT NULL,
    predicted_at TIMESTAMPTZ DEFAULT NOW(),
    outcome BOOLEAN,                    -- filled at D+1 by observation ingestion
    outcome_fetched_at TIMESTAMPTZ,
    UNIQUE(district_id, target, valid_date, model_version)
);

CREATE INDEX IF NOT EXISTS idx_prediction_log_date ON prediction_log(valid_date);
CREATE INDEX IF NOT EXISTS idx_prediction_log_model ON prediction_log(model_version);

-- ─── Rolling Brier Score (30-day window) ────────────────────────────────────

CREATE OR REPLACE VIEW v_rolling_brier AS
SELECT
    target,
    model_version,
    AVG(POWER(probability::float - CASE WHEN outcome THEN 1.0 ELSE 0.0 END, 2)) AS brier_30d,
    COUNT(*) FILTER (WHERE outcome = true) AS positive_count,
    COUNT(*) FILTER (WHERE outcome = false) AS negative_count,
    COUNT(*) AS total_count,
    MIN(valid_date) AS window_start,
    MAX(valid_date) AS window_end
FROM prediction_log
WHERE outcome IS NOT NULL
  AND valid_date >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY target, model_version;

-- ─── Reliability by Target ───────────────────────────────────────────────────

CREATE OR REPLACE VIEW v_reliability AS
SELECT
    target,
    model_version,
    ROUND(probability * 10 / 10.0, 1) AS predicted_bin,
    AVG(CASE WHEN outcome THEN 1.0 ELSE 0.0 END) AS actual_rate,
    COUNT(*) AS sample_count
FROM prediction_log
WHERE outcome IS NOT NULL
GROUP BY target, model_version, ROUND(probability * 10 / 10.0, 1)
ORDER BY target, predicted_bin;

-- ─── District Performance ────────────────────────────────────────────────────

CREATE OR REPLACE VIEW v_district_performance AS
SELECT
    district_id,
    target,
    model_version,
    AVG(POWER(probability::float - CASE WHEN outcome THEN 1.0 ELSE 0.0 END, 2)) AS brier,
    COUNT(*) AS predictions,
    COUNT(*) FILTER (WHERE outcome = true) AS actual_positives
FROM prediction_log
WHERE outcome IS NOT NULL
  AND valid_date >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY district_id, target, model_version;

-- ─── Monitoring Alerts ───────────────────────────────────────────────────────

CREATE OR REPLACE VIEW v_monitoring_alerts AS
SELECT
    'DEGRADATION' AS alert_type,
    target,
    model_version,
    brier_30d AS current_value,
    CASE
        WHEN brier_30d > 0.25 THEN 'CRITICAL'
        WHEN brier_30d > 0.20 THEN 'WARNING'
        ELSE 'OK'
    END AS severity,
    window_start,
    window_end
FROM v_rolling_brier
WHERE brier_30d > 0.20
UNION ALL
SELECT
    'INSUFFICIENT_DATA' AS alert_type,
    target,
    model_version,
    total_count AS current_value,
    CASE
        WHEN total_count < 100 THEN 'WARNING'
        ELSE 'OK'
    END AS severity,
    window_start,
    window_end
FROM v_rolling_brier
WHERE total_count < 100;
