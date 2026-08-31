# WeatherGPT — Architecture Audit

**Audit Date:** August 2026  
**Codebase Version:** 2.4.0  
**Auditor:** Buffy (automated architecture review)

---

## 1. Current Architecture Summary

```
┌──────────────────────────────────────────────────────────┐
│                    React SPA (Vite)                       │
│  App.tsx → components/ → lib/api.ts → /api/v1/*          │
└───────────────────────┬──────────────────────────────────┘
                        │ HTTP
┌───────────────────────▼──────────────────────────────────┐
│                 Express Server (server.ts)                │
│  ┌─────────────────────────────────────────────────┐     │
│  │  /api/v1/* routes (api.ts)                       │     │
│  │  middleware: requestId, CORS, rate-limit, logging │     │
│  └───────────────┬─────────────────────────────────┘     │
│                  │                                        │
│  ┌───────────────▼─────────────────────────────────┐     │
│  │  WeatherGPTEngine (engine.ts) — orchestrator     │     │
│  │  query → location → data → risk → evidence → chat│     │
│  └───────────────┬─────────────────────────────────┘     │
│                  │                                        │
│  ┌───────┐  ┌────▼────┐  ┌──────────┐  ┌──────────┐    │
│  │Cache  │  │Location │  │AlertService│ │LLMGateway │    │
│  │Service│  │Service  │  │           │  │→ Gemini  │    │
│  │(Redis │  │(alias+  │  │(ingest+  │  │(provider  │    │
│  │ /mem) │  │ geocode)│  │ store)   │  │ abstract) │    │
│  └───────┘  └─────────┘  └──────────┘  └──────────┘    │
│                  │                                        │
│  ┌───────────────▼─────────────────────────────────┐     │
│  │  Providers: OpenMeteo + Demo providers           │     │
│  │  (weather, geocoding, alerts)                    │     │
│  └─────────────────────────────────────────────────┘     │
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐ │
│  │RiskEngine│  │Evidence  │  │AgriEngine│  │ Safety  │ │
│  │(ML+rules)│  │Service   │  │(rules)   │  │Validator│ │
│  └──────────┘  └──────────┘  └──────────┘  └─────────┘ │
└──────────────────────────────────────────────────────────┘
         │                │              │
    ┌────▼────┐    ┌──────▼──────┐  ┌───▼───────┐
    │PostgreSQL│    │ Redis Cache │  │ML Inference│
    │(schema+  │    │             │  │(FastAPI)   │
    │ migrations)│   │             │  │(Python)    │
    └─────────┘    └─────────────┘  └───────────┘
```

## 2. Actual Execution Flow

### Chat Query: "Will it rain tomorrow in Pune?"

```
1. POST /api/v1/chat { query: "Will it rain tomorrow in Pune?" }
2. api.ts validates body via Zod
3. understand(query) → { intent: "precipitation", language: "en", timeRange: { bucket: "tomorrow" } }
4. engine.resolveLocation("Pune") → ResolvedLocation { lat: 18.52, lon: 73.85 }
   └─ LocationService: cache miss → alias map hit ("pune" → Pune, Maharashtra) → cached
5. engine.gatherData(location, "precipitation")
   ├─ WeatherDataFetcher.getCurrent(location) → cached or Open-Meteo API → WeatherObservation
   ├─ WeatherDataFetcher.getForecast(location, 3) → cached or Open-Meteo API → WeatherForecast
   ├─ WeatherDataFetcher.getAqi(location) → cached or Open-Meteo Air Quality API
   ├─ AlertService.getActiveForLocation(location) → in-memory alert store → Alert[]
   └─ fetchMlPrediction() → POST to FastAPI ML service → { probability, modelVersion }
6. computeRisk({ weather, forecast, alerts, calibratedProbability }) → RiskResult
7. evidenceService.buildChain({ observation, forecast, alerts, risk }) → EvidenceItem[]
8. engine.chat() → tryDeterministicAnswer() OR answerWithLLM()
   ├─ Deterministic: "Rain probability is **72%** for Pune..." (no LLM call)
   └─ LLM: system prompt + evidence JSON → Gemini → StructuredChatResponse → SafetyValidator
9. safetyValidator.validate() → 6 layers of checks
10. Response → JSON envelope { data: { chat, evidence, sources, mode }, meta }
```

## 3. What's Actually Working

| Component | Status | Notes |
|-----------|--------|-------|
| **Weather data (Open-Meteo)** | ✅ Real | GFS/ICON/ECMWF-based, honest attribution |
| **Geocoding (Open-Meteo)** | ✅ Real | GeoNames-based city search |
| **Location resolution** | ✅ Working | Alias map + geocoding + cache |
| **Query understanding** | ✅ Deterministic | Multi-language intent detection, no LLM |
| **Provider abstraction** | ✅ Clean | WeatherProvider, GeolocationProvider interfaces |
| **Canonical models** | ✅ Strong | Well-typed interfaces in core/models.ts |
| **Provenance tracking** | ✅ Every fact | source, retrievedAt, validUntil, isDemo |
| **Evidence layer** | ✅ Traceable | claim → evidence items → LLM context |
| **Safety validator** | ✅ 6 layers | Schema, evidence, warning, certainty, claims, demo |
| **Risk engine** | ✅ ML + rules | Official alert precedence, never downgrades |
| **Agriculture engine** | ✅ Deterministic | Configurable crops.json, rule-based |
| **Cache (Redis/Memory)** | ✅ Working | TTL-based, Redis fallback to memory |
| **Database schema** | ✅ Designed | 12 tables, proper indexes, migrations |
| **Demo mode isolation** | ✅ Honest | isDemo:true everywhere, clear labeling |
| **Structured logging** | ✅ JSON | requestId, endpoint, latency |
| **Rate limiting** | ✅ Redis-backed | Atomic incr, configurable limits |
| **Config validation** | ✅ Fail-fast | Critical config checked at boot |
| **LLM Gateway** | ✅ Provider abstract | GeminiProvider, retry, timeout, structured output |
| **Tests** | ✅ 19 passing | Unit + integration, deterministic |
| **Voice (browser)** | ⚠️ Basic | Web Speech API, honest about limitations |

## 4. Architecture Gaps

### 4.1 Critical Gaps

| Gap | Severity | Impact |
|-----|----------|--------|
| **PostgresAlertStore.upsert()** — incomplete (file truncated mid-query) | 🔴 High | Alerts cannot persist to PostgreSQL in production |
| **No reverse geocoding** | 🟡 Medium | Browser geolocation cannot resolve to city |
| **ML trained on synthetic data** | 🔴 High | Model claims calibrated probability but trained on heuristics |
| **`confidence` label in ML serve.py** | 🟡 Medium | Should be `calibrated_probability` per naming rules |
| **CORS: allow_origins=["*"]** in ML serve.py | 🟡 Medium | Security risk in production |
| **Worker not tested** | 🟡 Medium | Alert ingestion worker unverified |

### 4.2 Missing Features

| Feature | Status | Priority |
|---------|--------|----------|
| `/api/v1/locations/search` route | Missing | High |
| `/api/v1/alerts/nearby` route | Missing | High |
| User authentication | Not implemented | Medium |
| Conversation persistence | Not implemented | Medium |
| Push notifications | Not implemented | Low |
| OpenAPI spec | Not generated | Medium |
| CI/CD pipeline | Not configured | Medium |
| `.env.example` improvements | Needs update | Low |

### 4.3 Frontend Issues

| Issue | Location | Fix |
|-------|----------|-----|
| `reliabilityScore?: number` — hardcoded `0.87` in some UI path | types.ts | Remove or make dynamic |
| `any` types in voice/SpeechRecognition | App.tsx | Type properly |
| User avatar hardcoded to external Unsplash URL | App.tsx | Remove or use local asset |
| HourlyForecastRow.tsx — imported but unused | App.tsx | Verify usage |
| Hourly forecast not displayed in main dashboard | App.tsx | Add hourly row |

### 4.4 Security Issues

| Issue | Severity | Location |
|-------|----------|----------|
| CORS `*` on ML FastAPI service | Medium | ml/serve.py |
| No API key auth on any endpoint | Low | api.ts |
| No request body size limit on chat POST | Low | api.ts |
| No input sanitization beyond Zod | Low | api.ts |
| ML model path not validated | Low | ml/serve.py |

## 5. Technical Debt

1. **PostgresAlertStore.upsert()** — The file is truncated at the SQL query. The PostgreSQL alert persistence is incomplete.
2. **No test for worker.ts** — The background worker has zero test coverage.
3. **evalCondition regex** — Uses `RegExp` with complex escaping; fragile for new condition types.
4. **LLM timeout/cancel** — The Gemini provider uses `AbortController` but no cleanup on connection pool.
5. **Frontend state management** — All state in App.tsx via useState; no context/providers.
6. **No streaming** — Chat responses are not streamed (despite LLM gateway supporting it).
7. **Demo alert expiry** — Demo alerts use `expiresInMinutes` relative to creation, not absolute time.

## 6. What's NOT Fake

This is important for SIH judge questions:

| Claim | Reality |
|-------|---------|
| "Weather data" | Real Open-Meteo API (GFS/ICON/ECMWF models) |
| "Geocoding" | Real Open-Meteo Geocoding (GeoNames) |
| "AQI" | Real Open-Meteo Air Quality (CAMS-AIR) |
| "Risk calculation" | Deterministic rule engine + optional ML |
| "Agriculture advice" | Rule-based engine with configurable crops |
| "Safety validation" | 6-layer validation preventing hallucination |
| "Evidence tracking" | Every claim traced to source data |
| "Query understanding" | Deterministic multi-language NLU |
| "Location resolution" | Alias map + geocoding + caching |

## 7. What IS Fake (Clearly Labeled)

| Component | Label | Notes |
|-----------|-------|-------|
| Demo weather data | "Demo Provider (deterministic fixture)" | 6 cities, isDemo:true |
| Demo alerts | "Demo Provider (deterministic fixture)" | 3 fixture alerts |
| ML model | "xgb-rain-v1.2" | Trained on synthetic data |
| "Live radar" | NOT CLAIMED | No radar data anywhere |
| "IMD data" | NOT CLAIMED | Provider clearly identified as Open-Meteo |

## 8. Recommended Priority Actions

### Priority 1: Fix Critical Bugs
- Complete PostgresAlertStore.upsert()
- Fix ML confidence → calibrated_probability labeling

### Priority 2: Security
- Fix CORS on ML service
- Add proper CORS configuration
- Add input size limits

### Priority 3: Missing Routes
- Add /api/v1/locations/search endpoint
- Add /api/v1/alerts/nearby endpoint

### Priority 4: ML Honesty
- Add explicit "synthetic data" labels to ML model metadata
- Document that ML predictions are demo-grade

### Priority 5: CI/CD
- Add GitHub Actions workflow
- Add lint + typecheck + test steps

### Priority 6: Documentation
- Generate OpenAPI spec
- Update API.md with all endpoints

## 9. Scalability Assessment

| Aspect | Current | Target | Gap |
|--------|---------|--------|-----|
| Concurrent users | ~100 (memory cache) | 1000+ | Need Redis, connection pooling |
| Weather API calls | Cached (5-15 min TTL) | Same | Good |
| LLM calls | Deterministic-first | Same | Good pattern |
| Database | Single pool (10 conn) | Need read replicas | Moderate |
| ML inference | Single FastAPI worker | Need horizontal scaling | Moderate |
| Alert ingestion | Single worker | Same (sufficient) | Good |

## 10. Verdict

The codebase is **architecturally sound** with a well-designed provider abstraction, evidence-grounded LLM usage, and honest data labeling. The main gaps are:

1. An incomplete PostgresAlertStore (truncated file)
2. Synthetic ML data without honest labeling in the model metadata
3. Missing security hardening on the ML service
4. No CI/CD pipeline

These are all fixable. The core architecture is production-grade for an SIH prototype.
