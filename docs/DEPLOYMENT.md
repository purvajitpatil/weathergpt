# WeatherGPT — Deployment Guide

## Prerequisites

- Docker 24+ and Docker Compose v2
- Node.js 20+ (for local development)
- Python 3.11+ (for ML service)
- PostgreSQL 16+ (or Docker)
- Redis 7+ (or Docker)

## Quick Start (Docker Compose)

```bash
# 1. Clone and configure
git clone <repo-url> && cd weathergpt
cp .env.example .env
# Edit .env with your values (GEMINI_API_KEY at minimum)

# 2. Build and start
docker compose up -d

# 3. Verify
curl http://localhost:3000/api/v1/health
curl http://localhost:3000/api/v1/ready

# 4. Open browser
open http://localhost:3000
```

## Production Deployment

### Environment Variables

Required for production:

```bash
NODE_ENV=production
WEATHERGPT_DEMO_MODE=off
DATABASE_URL=postgresql://user:password@host:5432/weathergpt
REDIS_URL=redis://host:6379
GEMINI_API_KEY=your_key
CORS_ORIGINS=https://app.yourdomain.com
POSTGRES_PASSWORD=your_secure_password
```

### Docker Compose (Production)

```bash
# Production deployment
WEATHERGPT_DEMO_MODE=off \
POSTGRES_PASSWORD=$(openssl rand -base64 32) \
CORS_ORIGINS=https://app.yourdomain.com \
docker compose -f docker-compose.yml up -d

# Check status
docker compose ps
docker compose logs -f app
```

### Manual Build

```bash
# Install
npm ci

# Build frontend + backend
NODE_ENV=production npm run build

# Start
NODE_ENV=production node dist/server.cjs
```

## Database Setup

### Initial Schema

The schema is applied automatically on first startup via:
- Docker: `db/schema.sql` mounted as init script
- Application: `db/migrations/001_initial.sql` via migration runner

### Manual Migration

```bash
psql $DATABASE_URL -f db/schema.sql
```

### Backup

```bash
# Backup
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).sql

# Restore
psql $DATABASE_URL < backup.sql
```

## ML Model Setup

```bash
# Train model (generates ml/models/rain_risk_model.pkl)
cd ml && python train.py

# Evaluate
python evaluate.py

# Start ML service
uvicorn serve:app --host 0.0.0.0 --port 8001
```

## Health Checks

```bash
# Application health
curl http://localhost:3000/api/v1/health

# Readiness (checks all dependencies)
curl http://localhost:3000/api/v1/ready

# System metrics
curl http://localhost:3000/api/v1/metrics

# ML service
curl http://localhost:8001/health
```

## Reverse Proxy (Nginx)

```nginx
server {
    listen 80;
    server_name app.yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name app.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/app.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/app.yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # SSE/WebSocket for alerts
    location /api/v1/alerts/stream {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Connection '';
        proxy_buffering off;
        proxy_cache off;
    }
}
```

## Monitoring

### Logs

All logs are structured JSON:

```json
{
  "ts": "2026-08-31T10:00:00.000Z",
  "level": "info",
  "msg": "http",
  "requestId": "uuid",
  "endpoint": "GET /api/v1/weather",
  "status": 200,
  "durationMs": 145
}
```

### Key Metrics

| Metric | Endpoint | Description |
|--------|----------|-------------|
| Uptime | `/api/v1/metrics` | Server uptime |
| Cache backend | `/api/v1/metrics` | Redis or memory |
| Database | `/api/v1/metrics` | Connection status |
| LLM | `/api/v1/metrics` | Availability |
| Alert sources | `/api/v1/metrics` | Configured sources |

## Rollback

```bash
# Docker Compose rollback
git checkout <previous-tag>
docker compose up -d --build

# Database rollback (if migration is reversible)
psql $DATABASE_URL -f db/migrations/<rollback>.sql
```

## Troubleshooting

| Symptom | Check | Fix |
|---------|-------|-----|
| Weather data unavailable | `/api/v1/ready` | Verify Open-Meteo connectivity |
| ML predictions failing | `curl ml:8001/health` | Retrain model or check logs |
| Cache misses | Redis ping | Check REDIS_URL |
| DB errors | `/api/v1/ready` | Check DATABASE_URL, run migrations |
| CORS errors | Browser console | Update CORS_ORIGINS |
