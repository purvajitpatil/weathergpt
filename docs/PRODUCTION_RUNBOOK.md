# WeatherGPT — Production Runbook

## Operations Reference

### Deploy

```bash
# Build and deploy
docker compose up -d --build

# Verify deployment
docker compose ps
curl http://localhost:3000/api/v1/health
curl http://localhost:3000/api/v1/ready
```

### Rollback

```bash
# Quick rollback to previous version
git checkout <previous-commit>
docker compose up -d --build

# Database rollback (if needed)
psql $DATABASE_URL -c "DELETE FROM schema_migrations WHERE filename = '<migration>.sql';"
psql $DATABASE_URL -f db/migrations/<rollback>.sql
```

### View Logs

```bash
# All services
docker compose logs -f

# Application only
docker compose logs -f app

# ML service
docker compose logs -f ml-inference

# Filter errors
docker compose logs -f app 2>&1 | grep '"level":"error"'
```

### Restart Services

```bash
# Restart application
docker compose restart app

# Restart ML service
docker compose restart ml-inference

# Full restart
docker compose down && docker compose up -d
```

### Database Operations

```bash
# Connect to PostgreSQL
docker compose exec postgres psql -U weathergpt -d weathergpt

# Run migration manually
docker compose exec postgres psql -U weathergpt -d weathergpt -f /docker-entrypoint-initdb.d/01-schema.sql

# Check migration status
docker compose exec postgres psql -U weathergpt -d weathergpt -c "SELECT * FROM schema_migrations;"

# Backup
docker compose exec postgres pg_dump -U weathergpt weathergpt > backup_$(date +%Y%m%d).sql

# Restore
docker compose exec -T postgres psql -U weathergpt weathergpt < backup.sql
```

### Redis Operations

```bash
# Connect to Redis
docker compose exec redis redis-cli

# Check memory usage
docker compose exec redis redis-cli info memory

# Flush cache (if needed)
docker compose exec redis redis-cli FLUSHDB

# Check rate limit keys
docker compose exec redis redis-cli KEYS "rl:*"
```

### ML Model Operations

```bash
# Check ML health
curl http://localhost:8001/health

# Retrain model (inside container or local)
docker compose exec ml-inference python /app/train.py

# Evaluate model
docker compose exec ml-inference python /app/evaluate.py
```

## Troubleshooting

### Application won't start

1. Check `docker compose logs app`
2. Verify DATABASE_URL is reachable
3. Verify REDIS_URL is reachable
4. Check GEMINI_API_KEY is valid

### Weather data unavailable

1. Check Open-Meteo status: `curl https://api.open-meteo.com/v1/forecast?latitude=18.52&longitude=73.86&current=temperature_2m`
2. Check `/api/v1/ready` for provider status
3. Review application logs for provider errors

### ML predictions failing

1. Check `curl http://localhost:8001/health`
2. Verify model file exists: `docker compose exec ml-inference ls -la /app/models/`
3. Retrain if model is missing

### High latency

1. Check Redis cache hit ratio in logs
2. Verify database connection pool isn't exhausted
3. Check LLM response times
4. Review `/api/v1/metrics` for uptime and provider status

### Alert ingestion not working

1. Check worker logs: `docker compose logs -f worker`
2. Verify alert source connectivity
3. Check `SELECT count(*) FROM warnings;` for stored alerts

## Monitoring Endpoints

| Endpoint | Purpose | Expected Response |
|----------|---------|-------------------|
| `GET /api/v1/health` | Liveness | `{ "status": "ok" }` |
| `GET /api/v1/ready` | Readiness | All dependencies healthy |
| `GET /api/v1/metrics` | System stats | Uptime, providers, cache |
| `GET /api/v1/sources` | Data sources | Active providers |

## Incident Response

### Provider Outage (Open-Meteo)

1. Application auto-switches to demo mode (clearly labeled)
2. Monitor logs for `Data mode: DEMO` warnings
3. When Open-Meteo recovers, application switches back automatically
4. Users always see honest data labeling

### Database Down

1. Application degrades to stateless operation
2. Weather data still served (from cache or provider)
3. Alerts use in-memory store
4. Restore database and restart

### Redis Down

1. Application falls back to in-memory cache
2. Rate limiting uses in-memory (single instance only)
3. Restart Redis and application reconnects automatically

### ML Service Down

1. Risk engine falls back to rule-based assessment
2. Response includes: "ML risk model temporarily unavailable"
3. Restart ML service

## Capacity Planning

### Current Limits

| Resource | Limit | Notes |
|----------|-------|-------|
| Weather cache TTL | 5 min current, 15 min forecast | Configurable via env |
| Database pool | 10 connections | Adjustable in db.ts |
| Request rate | 60/min per IP | Configurable via env |
| ML timeout | 6s | Configurable via env |
| LLM timeout | 30s | Configurable via env |

### Scaling Path

1. **100 users**: Current architecture sufficient
2. **1000 users**: Increase Redis memory, add connection pooling
3. **10000 users**: Add read replicas, horizontal app scaling, CDN
4. **100000 users**: Microservice decomposition, distributed caching
