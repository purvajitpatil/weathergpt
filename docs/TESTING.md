# WeatherGPT Testing

## Commands

```bash
npm test           # Run all tests (Vitest)
npm run test:watch # Watch mode
npm run lint       # TypeScript typecheck (tsc --noEmit)
npm run build      # Vite build + esbuild server bundle
```

## Test Suites

### Unit Tests (`tests/backend.unit.test.ts`)

- Query understanding (intent, language, location extraction)
- Risk engine (score computation, reason codes)
- Safety validator (demo mislabel, warning precedence)
- Agriculture engine (crop rules, disclaimers)
- Evidence service (chain building)

### Integration Tests (`tests/integration.test.ts`)

- Full engine pipeline in DEMO mode
- Location resolution (Pune)
- Chat without LLM (deterministic)
- Demo mislabel detection via safety validator
- Agriculture advisory end-to-end

## Environment

Tests run with `DEMO_MODE=on` for deterministic results. No network, Redis, or PostgreSQL required.

## CI

GitHub Actions workflow (`.github/workflows/ci.yml`):
1. `npm ci`
2. `npm run lint`
3. `npm test` (DEMO_MODE=on)
4. `npm run build`

## Not Yet Tested

- HTTP API routes (manual verification)
- Live Open-Meteo integration
- Redis/PostgreSQL persistence
- ML service connection
- Frontend component tests

## Manual Verification

```bash
# Start server
DEMO_MODE=on npm run dev

# Health
curl http://localhost:3000/api/v1/health
curl http://localhost:3000/api/v1/ready

# Weather
curl "http://localhost:3000/api/v1/weather?location=Pune"

# Chat
curl -X POST http://localhost:3000/api/v1/chat \
  -H "Content-Type: application/json" \
  -d '{"query":"Will it rain in Pune tomorrow?","location":"Pune"}'
```
