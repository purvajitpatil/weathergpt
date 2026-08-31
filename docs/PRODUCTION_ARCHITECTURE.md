# WeatherGPT — Production Architecture

## Overview

WeatherGPT is an AI-powered conversational weather and disaster intelligence platform.
It converts authoritative meteorological signals into personalized, multilingual,
actionable intelligence for citizens, farmers, and communities in India.

## Architecture Philosophy

```
AUTHORITATIVE DATA
       ↓
DATA VALIDATION
       ↓
LOCATION INTELLIGENCE
       ↓
QUERY UNDERSTANDING
       ↓
TOOL ROUTING
       ↓
WEATHER + ALERT + DOMAIN DATA
       ↓
RISK ENGINE (ML + RULES)
       ↓
EVIDENCE LAYER
       ↓
LLM GATEWAY
       ↓
SAFETY VALIDATOR
       ↓
ACTIONABLE RESPONSE
       ↓
TEXT + VOICE + GIS + ALERTS
       ↓
USER
```

**NOT:** User → LLM → Fake Weather

## System Topology

```
                    ┌─────────────────────┐
                    │   weatherGPT.com    │
                    │      HTTPS/CDN      │
                    └──────────┬──────────┘
                               │
                     ┌─────────▼─────────┐
                     │   React / PWA     │
                     │   (Static/Edge)   │
                     └─────────┬─────────┘
                               │ HTTPS
                     ┌─────────▼─────────┐
                     │   Node.js API     │
                     │  Auth / Chat / GIS │
                     └────┬──────┬───────┘
                          │      │
              ┌───────────┘      └────────────┐
              ▼                               ▼
       ┌─────────────┐                  ┌────────────┐
       │ PostgreSQL  │                  │   Redis    │
       │ Users/Data  │                  │Cache/PubSub│
       └─────────────┘                  └─────┬──────┘
                                             │
                  ┌──────────────────────────┼─────────────┐
                  ▼                          ▼             ▼
          Weather Provider             Alert Feed      ML Service
          (Open-Meteo)                (Ingestion)     (FastAPI)
                  │                          │             │
                  └──────────────────────────┼─────────────┘
                                             ▼
                                      Risk / Evidence
                                             │
                                             ▼
                                        LLM Gateway
                                        (Gemini)
                                             │
                           ┌─────────────────┼───────────────┐
                           ▼                 ▼               ▼
                         Chat             Voice             GIS
                           │                 │               │
                           └─────────────────┼───────────────┘
                                             ▼
                                          USER
```

## Services

| Service | Technology | Port | Purpose |
|---------|-----------|------|---------|
| Application | Node.js + Express | 3000 | API, frontend, chat |
| ML Inference | Python FastAPI | 8001 | XGBoost rain risk |
| PostgreSQL | PostgreSQL 16 | 5432 | Users, data, alerts |
| Redis | Redis 7 | 6379 | Cache, rate limit, pub/sub |

## Data Flow

### 1. Current Weather Query

```
User → /api/v1/weather?location=Pune
→ LocationService.resolve("Pune") → alias map / geocoding
→ WeatherDataFetcher.getCurrent(location)
  → Cache check (Redis key: weather:18.5204:73.8567:current)
  → On miss: Open-Meteo API → normalize → cache
→ Return WeatherObservation with provenance
```

### 2. Chat Query

```
User → POST /api/v1/chat { query: "Will it rain tomorrow in Pune?" }
→ QueryUnderstanding: { intent: "forecast", time: "tomorrow", location: "Pune" }
→ LocationService.resolve("Pune")
→ GatherData: current + forecast + AQI + alerts + risk
→ EvidenceLayer: build claim → evidence chain
→ LLM Gateway (only if needed; deterministic answer if possible)
→ SafetyValidator: 6 layers of checks
→ Return: { answer, risk, recommendation, evidence, sources }
```

### 3. Alert Pipeline

```
External Source
→ AlertIngestionSource.fetchAlerts()
→ Validation (schema + dates)
→ Normalization (severity, hazard type)
→ Deduplication (sourceAlertId)
→ PostgresAlertStore.upsert()
→ Redis Pub/Sub → SSE/WebSocket → Connected Users
```

## Key Design Decisions

### Evidence-Grounded AI

Every factual claim must be traceable to an EvidenceItem. The LLM receives
only structured evidence — it never invents weather, warnings, or sources.

### Deterministic-First Chat

Simple queries (temperature, humidity, AQI) never touch the LLM.
The system tries deterministic answers first; LLM is used only for
explanation, recommendations, and multilingual narration.

### Official Warning Precedence

OFFICIAL WARNING > WEATHERGPT INTERPRETATION > LLM LANGUAGE GENERATION

The LLM cannot create warnings, change severity, or downgrade alerts.

### Honest Data Labeling

Every data point carries `isDemo: true/false` provenance. The UI always
labels data as LIVE or DEMO. Never claim IMD unless actually consuming IMD data.

## API Versioning

All endpoints under `/api/v1/`:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/health` | GET | Liveness probe |
| `/api/v1/ready` | GET | Readiness probe (dependencies) |
| `/api/v1/metrics` | GET | System metrics |
| `/api/v1/meta` | GET | Data mode + provider info |
| `/api/v1/weather` | GET | Full dashboard data |
| `/api/v1/weather/current` | GET | Current conditions |
| `/api/v1/weather/forecast` | GET | Daily forecast |
| `/api/v1/weather/hourly` | GET | Hourly forecast |
| `/api/v1/risk` | GET | Risk assessment |
| `/api/v1/alerts` | GET | Active alerts |
| `/api/v1/alerts/nearby` | GET | Location-aware alerts |
| `/api/v1/locations/search` | GET | Geocoding |
| `/api/v1/sources` | GET | Data source registry |
| `/api/v1/chat` | POST | Conversational weather |
| `/api/v1/agriculture/advisory` | POST | Crop advisory |
| `/api/v1/voice/transcribe` | POST | Voice input (WIP) |

## Environment Modes

| Mode | Weather | Alerts | ML | LLM | Database |
|------|---------|--------|----|-----|----------|
| `demo` | Fixture | Demo fixtures | Synthetic | Optional | Optional |
| `auto` | Open-Meteo | Open-Meteo | Synthetic | Optional | Required |
| `off` | Open-Meteo | Open-Meteo | Synthetic | Required | Required |

## Security Model

- API key authentication for ML service
- Rate limiting (Redis-backed, configurable per endpoint)
- CORS restriction (configurable origins)
- Input validation (Zod schemas)
- Output validation (SafetyValidator)
- No secrets in frontend
- Non-root Docker containers
- Structured logging (no PII)
