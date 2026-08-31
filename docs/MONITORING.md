# WeatherGPT — Monitoring & Observability

## Monitoring Stack

| Layer | Tool | Purpose |
|-------|------|---------|
| Application | Structured JSON logs | Request tracing, errors |
| System | `/api/v1/metrics` | Uptime, providers, cache |
| Health | `/api/v1/health`, `/api/v1/ready` | Liveness, readiness |
| External | Uptime monitor (optional) | Public availability |

## Structured Logging

Every log line is JSON with correlation metadata:

```json
{
  "ts": "2026-08-31T10:00:00.000Z",
  "level": "info",
  "msg": "http",
  "requestId": "a1b2c3d4-e5f6-...",
  "endpoint": "GET /api/v1/weather",
  "status": 200,
  "durationMs": 145
}
```

### Log Levels

| Level | When |
|-------|------|
| `debug` | Detailed flow tracing (dev only) |
| `info` | Normal operations, requests, completions |
| `warn` | Degraded state, cache misses, provider fallback |
| `error` | Failures, unhandled exceptions, provider outages |

## Health Endpoints

### Liveness: `GET /api/v1/health`

Returns 200 when the application process is running.
Use for container orchestration liveness probes.

```json
{ "status": "ok", "timestamp": "2026-08-31T10:00:00.000Z" }
```

### Readiness: `GET /api/v1/ready`

Returns 200 when all critical dependencies are healthy.
Returns 503 when degraded.

```json
{
  "ok": true,
  "mode": "live",
  "weatherProvider": "open-meteo",
  "cache": { "ok": true, "backend": "redis" },
  "llmAvailable": true,
  "officialWarningsConfigured": false,
  "sources": [...]
}
```

### Metrics: `GET /api/v1/metrics`

```json
{
  "uptime_seconds": 86400,
  "mode": "live",
  "weather_provider": "open-meteo",
  "cache_backend": "redis",
  "cache_ok": true,
  "database_ok": true,
  "llm_available": true,
  "alert_sources": 1,
  "official_warnings": false,
  "timestamp": "2026-08-31T10:00:00.000Z"
}
```

## Key Metrics to Track

### Application

| Metric | Source | Alert Threshold |
|--------|--------|-----------------|
| Request latency (p95) | Logs | > 5000ms |
| Error rate | Logs | > 5% of requests |
| Uptime | `/api/v1/health` | Process down |

### Weather Provider

| Metric | Source | Alert Threshold |
|--------|--------|-----------------|
| Provider availability | `/api/v1/ready` | Provider down |
| Cache hit ratio | Logs | < 70% |
| Response latency | Logs | > 10000ms |

### ML Service

| Metric | Source | Alert Threshold |
|--------|--------|-----------------|
| ML availability | `/api/v1/ready` | Service down |
| Prediction latency | Logs | > 5000ms |
| Model version | `/api/v1/metrics` | Version mismatch |

### LLM Gateway

| Metric | Source | Alert Threshold |
|--------|--------|-----------------|
| LLM availability | `/api/v1/ready` | Key missing |
| LLM latency | Logs | > 30000ms |
| Token usage | Logs | Track for cost |

### Database

| Metric | Source | Alert Threshold |
|--------|--------|-----------------|
| Connection pool | `/api/v1/ready` | Connection refused |
| Query latency | Logs | > 1000ms |
| Active connections | pg_stat_activity | > 80% pool |

### Redis

| Metric | Source | Alert Threshold |
|--------|--------|-----------------|
| Redis ping | `/api/v1/ready` | PONG failed |
| Memory usage | `INFO memory` | > 80% maxmemory |
| Hit ratio | `INFO stats` | < 50% |

## Alert Conditions

The following conditions should trigger investigation:

1. **Weather provider unavailable** — Check Open-Meteo status
2. **ML service unavailable** — Check FastAPI logs, model file
3. **Cache falling back to memory** — Check Redis connectivity
4. **Database connection failure** — Check PostgreSQL status
5. **Rate limit spikes** — Possible abuse or misconfigured client
6. **High error rates** — Check application logs
7. **Alert ingestion failures** — Check worker logs
8. **LLM failures** — Check API key validity

## Dashboard (Admin)

Available at `/api/v1/metrics` for programmatic access.
Shows:
- System uptime
- Active data mode (live/demo)
- Provider status
- Cache backend
- Database status
- LLM availability
- Active alert sources
