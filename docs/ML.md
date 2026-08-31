# WeatherGPT ML Pipeline

## Overview

Rain risk prediction using XGBoost, served via FastAPI. Integrated into the Node.js Risk Engine as one input alongside deterministic rules.

## Important Disclaimer

**Training data is synthetic by default.** This demonstrates the ML pipeline architecture, not production meteorological intelligence. Never claim "95% accurate" without reproducible evaluation on real data.

## Pipeline

```
Historical/Synthetic Data → Feature Engineering → Train/Val/Test Split
  → XGBoost Classifier → Calibration → Evaluation → Model Registry → Inference
```

## Features (14)

temperature, feels_like, humidity, wind, pressure, cloud_cover, visibility, dew_point, uv_index, hour, day_of_week, month, lat, lon

## Commands

```bash
npm run train      # Train model → ml/models/rain_risk_model.pkl
npm run evaluate   # Quality gates + report → docs/ml_evaluation_report.json
```

## Inference

```bash
# Start ML service
cd ml && uvicorn serve:app --host 0.0.0.0 --port 8001

# Or via Docker
docker compose up ml-inference
```

Set `ML_INFERENCE_URL=http://localhost:8001` in `.env`.

## Evaluation Metrics

- ROC-AUC (gate: ≥ 0.65)
- PR-AUC
- Precision, Recall, F1 (gate: F1 ≥ 0.55)
- Brier score
- Calibration plot
- Confusion matrix
- Baseline comparison (DummyClassifier)

## Integration

`src/server/services/riskEngine.ts` → `fetchMlPrediction()` POSTs to `/risk/predict`.

If ML unavailable, rule engine continues without ML contribution.

## Future Work

1. Train on real Open-Meteo historical data + verified rain events
2. Location-specific calibration for Maharashtra
3. Model versioning in PostgreSQL `ml_predictions` table
