# WeatherGPT API Reference (v1)

Base URL: `/api/v1`

## Error Format

```json
{
  "error": {
    "code": "location_unresolved",
    "message": "Could not resolve the requested location.",
    "requestId": "req-abc123"
  }
}
```

## Endpoints

### GET /health

Liveness probe.

**Response:** `{ "status": "ok", "timestamp": "..." }`

### GET /ready

Readiness with dependency status.

**Response:**
```json
{
  "ok": true,
  "mode": "live",
  "weatherProvider": "open-meteo",
  "cache": { "ok": true, "backend": "redis" },
  "llmAvailable": true,
  "warningsConfigured": false
}
```

### GET /meta

System metadata for UI labeling.

### GET /weather?location=Pune

Dashboard bundle: current, forecast, AQI, alerts, risk.

### GET /weather/current?location=Pune

Current conditions and AQI only.

### GET /weather/forecast?location=Pune

Multi-day forecast.

### GET /weather/hourly?location=Pune

Hourly forecast points.

### POST /chat

**Body:**
```json
{
  "query": "Will it rain tomorrow evening in Pune?",
  "location": "Pune",
  "language": "mr"
}
```

**Response includes:** understanding, location, weather data, evidence, chat answer, sources, llmUsed.

### GET /alerts?location=Pune

Active alerts filtered by location. Respects `expiresAt`.

### GET /risk?location=Pune

Risk assessment with contributing factors.

### POST /agriculture/advisory

**Body:**
```json
{
  "crop": "soybean",
  "stage": "flowering",
  "location": "Pune",
  "irrigationAvailable": false
}
```

### GET /locations/search?q=pune

Resolve location query.

### GET /sources

Data source transparency registry.

### GET /metrics

Basic system metrics (uptime, mode, cache, database status).

### POST /voice/transcribe

Returns 501 — server-side ASR not implemented. Use browser Web Speech API.

## Rate Limiting

- Default: 60 requests/minute per IP (configurable via `RATE_LIMIT_MAX_REQUESTS`)
- Headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`
- 429 on exceed

## Authentication

None in current prototype. Rate limiting only.
