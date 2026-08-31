-- WeatherGPT v2 Schema (initial migration)
-- PostgreSQL 16+ · idempotent (safe for docker init AND app migration runner)

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Core reference tables ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS data_sources (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider VARCHAR(64) NOT NULL UNIQUE,
    label VARCHAR(255) NOT NULL,
    is_demo BOOLEAN NOT NULL DEFAULT false,
    status VARCHAR(16) DEFAULT 'unknown',           -- ok | degraded | down | unknown
    last_success_at TIMESTAMPTZ,
    last_error TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE,
    name VARCHAR(128),
    preferred_language VARCHAR(8) DEFAULT 'en',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS saved_locations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    city VARCHAR(128) NOT NULL,
    state VARCHAR(128),
    country VARCHAR(128) DEFAULT 'India',
    latitude DECIMAL(9,6),
    longitude DECIMAL(9,6),
    label VARCHAR(255),
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saved_locations_user ON saved_locations(user_id);

-- ─── Weather data ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS weather_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    city VARCHAR(128) NOT NULL,
    state VARCHAR(128),
    country VARCHAR(128) DEFAULT 'India',
    latitude DECIMAL(9,6),
    longitude DECIMAL(9,6),
    temp_celsius DECIMAL(5,2),
    feels_like_celsius DECIMAL(5,2),
    condition VARCHAR(128),
    humidity_percent SMALLINT,
    wind_speed_kmh DECIMAL(5,2),
    aqi_value SMALLINT,
    aqi_label VARCHAR(32),
    forecast_json JSONB,
    source VARCHAR(64) DEFAULT 'open-meteo',
    data_version VARCHAR(64),
    provenance JSONB,
    is_demo BOOLEAN NOT NULL DEFAULT false,
    captured_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_weather_snapshots_city_time ON weather_snapshots(city, captured_at DESC);

CREATE TABLE IF NOT EXISTS forecasts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    city VARCHAR(128) NOT NULL,
    state VARCHAR(128),
    country VARCHAR(128) DEFAULT 'India',
    latitude DECIMAL(9,6),
    longitude DECIMAL(9,6),
    source VARCHAR(64) DEFAULT 'open-meteo',
    data_version VARCHAR(64),
    generated_at TIMESTAMPTZ DEFAULT NOW(),
    valid_until TIMESTAMPTZ,
    hourly_json JSONB,
    daily_json JSONB,
    provenance JSONB,
    is_demo BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_forecasts_city_lat_lon ON forecasts(city, latitude, longitude);

-- ─── Warnings & alerts ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS warnings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    external_id VARCHAR(64) UNIQUE,
    source VARCHAR(64) NOT NULL,
    hazard_type VARCHAR(32),
    severity VARCHAR(16) NOT NULL CHECK (severity IN ('green', 'yellow', 'orange', 'red')),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    instructions JSONB,
    geometry JSONB,
    affected_areas JSONB,
    affected_districts JSONB,
    issued_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    language VARCHAR(8) DEFAULT 'en',
    is_active BOOLEAN DEFAULT true,
    provenance JSONB,
    is_demo BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_warnings_active ON warnings(is_active, severity) WHERE is_active = true;

CREATE TABLE IF NOT EXISTS warning_areas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    warning_id UUID NOT NULL REFERENCES warnings(id) ON DELETE CASCADE,
    area VARCHAR(255) NOT NULL,
    area_type VARCHAR(32) DEFAULT 'district'          -- district | taluka | ward | custom
);

CREATE INDEX IF NOT EXISTS idx_warning_areas_area ON warning_areas(area);

-- ─── ML predictions ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ml_predictions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    location VARCHAR(255) NOT NULL,
    latitude DECIMAL(9,6),
    longitude DECIMAL(9,6),
    model_version VARCHAR(32) NOT NULL,
    risk_score SMALLINT NOT NULL CHECK (risk_score BETWEEN 0 AND 100),
    risk_level VARCHAR(16) CHECK (risk_level IN ('low', 'moderate', 'high', 'extreme')),
    contributing_factors JSONB,
    input_features JSONB,
    is_demo BOOLEAN NOT NULL DEFAULT false,
    predicted_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ml_predictions_location_time ON ml_predictions(location, predicted_at DESC);

-- ─── Conversations ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    session_id VARCHAR(128),
    location VARCHAR(255),
    language VARCHAR(8) DEFAULT 'en',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role VARCHAR(16) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT,
    structured_data JSONB,
    tool_calls JSONB,
    safety_issues JSONB,
    evidence JSONB,
    model_used VARCHAR(64),
    tokens_used INTEGER,
    latency_ms INTEGER,
    data_mode VARCHAR(8),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);

-- ─── Notifications ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS alerts_sent (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    warning_id UUID REFERENCES warnings(id) ON DELETE SET NULL,
    channel VARCHAR(16) CHECK (channel IN ('push', 'email', 'sms', 'in_app')),
    sent_at TIMESTAMPTZ DEFAULT NOW(),
    opened_at TIMESTAMPTZ,
    clicked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_alerts_sent_user ON alerts_sent(user_id, sent_at DESC);