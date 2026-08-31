# WeatherGPT — Disaster Recovery

## Recovery Objectives

| Metric | Target | Notes |
|--------|--------|-------|
| **RPO** (Recovery Point Objective) | 1 hour | PostgreSQL backup frequency |
| **RTO** (Recovery Time Objective) | 30 minutes | Time to restore service |
| **Availability Target** | 99.9% | ~8.7 hours downtime/year |

## Backup Strategy

### Database (PostgreSQL)

```bash
# Automated backup (cron or Docker schedule)
docker compose exec postgres pg_dump -U weathergpt weathergpt | gzip > \
  backups/weathergpt_$(date +%Y%m%d_%H%M%S).sql.gz

# Retain last 7 daily backups
ls -t backups/weathergpt_*.sql.gz | tail -n +8 | xargs rm -f
```

### Redis

Redis is a cache; no backup required. Data regenerates from weather providers.

### ML Model

```bash
# Model is in ml/models/ — commit to git or store in artifact registry
# Training is reproducible from ml/train.py + ml/data/
```

### Configuration

Environment variables are documented in `.env.example`. Production values
are stored in deployment secrets (not in repository).

## Recovery Procedures

### 1. Database Corruption

```bash
# Stop application
docker compose stop app worker

# Restore from backup
gunzip -c backups/weathergpt_<timestamp>.sql.gz | \
  docker compose exec -T postgres psql -U weathergpt weathergpt

# Restart
docker compose start app worker
```

### 2. Complete Service Failure

```bash
# Full redeploy from Docker
docker compose down
docker compose up -d --build

# Verify
curl http://localhost:3000/api/v1/health
curl http://localhost:3000/api/ready
```

### 3. Data Loss (Weather Snapshots)

Weather data is transient and regenerates from Open-Meteo.
No restoration needed — the system self-heals on next request.

### 4. Alert Data Loss

Alerts are re-ingested from configured sources on startup
and periodically (every 5 minutes). No manual restoration needed.

## Failover Architecture

```
┌──────────────┐     ┌──────────────┐
│  App Node 1  │     │  App Node 2  │
└──────┬───────┘     └──────┬───────┘
       │                     │
       └──────────┬──────────┘
                  │
       ┌──────────▼──────────┐
       │   Load Balancer     │
       │   (health check)    │
       └──────────┬──────────┘
                  │
    ┌─────────────┼─────────────┐
    │             │             │
┌───▼───┐   ┌────▼────┐   ┌───▼───┐
│Postgres│   │  Redis  │   │  ML   │
│Primary │   │         │   │Service │
└───────┘   └─────────┘   └───────┘
```

### Health Check Endpoints

| Endpoint | Use | Expected |
|----------|-----|----------|
| `/api/v1/health` | Liveness (always 200) | `{ "status": "ok" }` |
| `/api/v1/ready` | Readiness (deps check) | All deps healthy |

The load balancer should route traffic only to instances where
`/api/v1/ready` returns 200.

## Communication Plan

### During Outage

1. Users see honest "Data currently unavailable" messages
2. No fabricated data or fake alerts
3. Demo mode provides basic functionality if live providers fail
4. Recovery is automatic when dependencies restore

### Post-Recovery

1. Verify all endpoints via smoke test
2. Check alert ingestion is running
3. Verify ML predictions are working
4. Review logs for any data integrity issues
