# WeatherGPT

**AI-Powered Conversational Weather & Disaster Intelligence Platform for India**

WeatherGPT transforms authoritative meteorological data into conversational weather intelligence, multilingual assistance, location-aware warnings, risk scoring, and agriculture decision support.

> **Principle:** WEATHER DATA → UNDERSTANDING → RISK → ACTION  
> The LLM explains evidence — it never invents weather.

## Quick Start

```bash
cp .env.example .env
# Set GEMINI_API_KEY for AI explanations (optional — deterministic mode works without it)

npm install
npm run dev          # http://localhost:3000

# Demo mode (deterministic fixtures, no API keys needed)
DEMO_MODE=on npm run dev

# Tests
npm test
npm run lint
npm run build
```

### Docker

```bash
docker compose up --build
# Frontend: http://localhost:3000
# ML inference: http://localhost:8001 (requires trained model: npm run train)
```

## Architecture

Modular monolith: Express + React + PostgreSQL + Redis + optional Python ML service.

```
User → Query Understanding → Location → Tool Router
  → Weather/Alert/Domain Engines → Risk (ML + Rules)
  → Evidence → LLM Gateway → Safety Validator → Response
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/ARCHITECTURE_AUDIT.md](docs/ARCHITECTURE_AUDIT.md).

## API (v1)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/health` | GET | Liveness |
| `/api/v1/ready` | GET | Dependency readiness |
| `/api/v1/meta` | GET | LIVE/DEMO mode for UI |
| `/api/v1/weather` | GET | Dashboard bundle |
| `/api/v1/weather/current` | GET | Current conditions |
| `/api/v1/weather/forecast` | GET | Forecast |
| `/api/v1/weather/hourly` | GET | Hourly forecast |
| `/api/v1/chat` | POST | Conversational query |
| `/api/v1/alerts` | GET | Active warnings |
| `/api/v1/risk` | GET | Risk assessment |
| `/api/v1/agriculture/advisory` | POST | Crop advisory |
| `/api/v1/locations/search` | GET | Location resolution |
| `/api/v1/metrics` | GET | System metrics |
| `/api/v1/sources` | GET | Data source transparency |

Full API docs: [docs/API.md](docs/API.md)

## Data Sources

| Data | Source | Mode |
|------|--------|------|
| Weather & forecast | [Open-Meteo](https://open-meteo.com/) | Live (no API key) |
| Air quality | Open-Meteo Air Quality | Live |
| Geocoding | Open-Meteo Geocoding | Live |
| Alerts (current) | Demo fixtures | Demo only |
| ML rain risk | XGBoost (synthetic training) | Demo pipeline |

**We do not claim IMD data unless an official IMD/NDMA source is integrated.**

## Build Status

| Component | Status |
|-----------|--------|
| Real weather (Open-Meteo) | ✅ |
| Location intelligence | ✅ |
| Query understanding | ✅ |
| Evidence layer | ✅ |
| Safety validator | ✅ |
| Redis caching | ✅ |
| PostgreSQL persistence | ✅ (partial) |
| Agriculture engine | ✅ |
| Multilingual text | ✅ (en, hi, mr + architecture for more) |
| Voice (browser) | ✅ Web Speech API |
| Official IMD alerts | ❌ Not integrated |
| Live radar GIS | ❌ Illustrative only |
| User auth | ❌ Not implemented |

## SIH Demo

See [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md) and [docs/SIH_JUDGE_QA.md](docs/SIH_JUDGE_QA.md).

## License

Private — Smart India Hackathon prototype.
