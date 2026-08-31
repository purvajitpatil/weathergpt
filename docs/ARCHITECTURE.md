# WeatherGPT Architecture

## Overview

WeatherGPT is a modular monolith that separates **data truth** from **AI explanation**.

## Layers

### 1. Data Providers (`src/server/providers/`)

- `WeatherProvider` interface: getCurrent, getForecast, getAirQuality
- `OpenMeteoProvider` — live weather (GFS/ICON-based)
- `DemoProvider` — deterministic fixtures under `/demo`
- `GeolocationProvider` — Open-Meteo geocoding + alias map

### 2. Intelligence Services (`src/server/services/`)

| Service | Role |
|---------|------|
| `LocationService` | Resolve city names, coordinates, multilingual aliases |
| `QueryUnderstandingService` | NL → structured intent |
| `WeatherDataFetcher` | Cached provider calls |
| `AlertService` | Ingestion, normalization, expiry, location matching |
| `RiskEngine` | ML probability + rules + official alert severity |
| `EvidenceService` | Build claim → evidence chains |
| `AgricultureAdvisoryEngine` | Rule-based crop recommendations |

### 3. AI Layer (`src/server/gateway/`, `src/server/safety/`)

- `LLMGateway` — timeout, retry, structured output
- `GeminiProvider` — explanation and multilingual narration
- `SafetyValidator` — schema, evidence, warning precedence, demo mislabel detection

### 4. Persistence

- PostgreSQL: weather snapshots, ML predictions, warnings
- Redis: weather/forecast/AQI/geocode cache, rate limiting

### 5. Frontend (`src/`)

React SPA consuming `/api/v1/*`. Presentation only — no business logic.

## Data Flow Diagram

```
┌──────────┐    ┌─────────────┐    ┌──────────────┐
│  User    │───▶│ Query       │───▶│ Location     │
│  Query   │    │ Understanding│    │ Service      │
└──────────┘    └──────┬──────┘    └──────┬───────┘
                       │                   │
                       ▼                   ▼
                ┌──────────────┐    ┌──────────────┐
                │ Tool Router  │───▶│ Weather      │
                │ (by intent)  │    │ Alert Engine │
                └──────┬───────┘    └──────┬───────┘
                       │                   │
                       ▼                   ▼
                ┌──────────────┐    ┌──────────────┐
                │ Risk Engine  │───▶│ Evidence     │
                │ ML + Rules   │    │ Layer        │
                └──────┬───────┘    └──────┬───────┘
                       │                   │
                       ▼                   ▼
                ┌──────────────┐    ┌──────────────┐
                │ LLM Gateway  │───▶│ Safety       │
                │ (optional)   │    │ Validator    │
                └──────┬───────┘    └──────┬───────┘
                       │                   │
                       └─────────┬─────────┘
                                 ▼
                          Actionable Response
```

## Environment Modes

| Mode | Behavior |
|------|----------|
| `DEMO_MODE=on` | Always demo fixtures |
| `DEMO_MODE=off` | Live only; requires DATABASE_URL + REDIS_URL |
| `DEMO_MODE=auto` | Live with demo fallback on provider failure |
