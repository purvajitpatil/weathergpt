# WeatherGPT — Security Documentation

## Security Model

WeatherGPT implements defense-in-depth across all layers.

### 1. Authentication & Authorization

- **ML Service**: Bearer token authentication (`ML_API_KEY` env var)
- **API Endpoints**: Rate limiting per IP (Redis-backed atomic counter)
- **Future**: JWT-based user auth for saved locations, preferences

### 2. Input Validation

Every API endpoint validates input using Zod schemas:

```typescript
const chatBody = z.object({
  query: z.string().min(1, "query is required"),
  location: z.string().optional(),
  language: z.string().optional(),
}).strict();  // rejects unknown fields
```

### 3. Output Validation

The SafetyValidator inspects every LLM response across 6 layers:

| Layer | Check | Action |
|-------|-------|--------|
| Schema | Response shape compliance | Reject malformed |
| Evidence | Claims must reference evidence | Reject unsupported claims |
| Warning precedence | Active alerts must be surfaced | Reject if hidden |
| Risk language | No fabricated certainty | Sanitize |
| Unsupported claims | Numbers without evidence | Reject |
| Demo mislabel | IMD claimed in demo mode | Reject |

### 4. Rate Limiting

Redis-backed per-IP rate limiting with configurable window:

```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 45
```

Returns 429 Too Many Requests with retry guidance.

### 5. CORS

Production CORS is configured via `CORS_ORIGINS` environment variable.
Default: same-origin only (empty origins list = only same-origin requests).

### 6. Secrets Management

- Never commit `.env` files
- Docker secrets via environment variables
- API keys not exposed in frontend code
- Database passwords via `POSTGRES_PASSWORD` env var

### 7. Container Security

- Non-root user (`weathergpt:1001`) in production Dockerfile
- Multi-stage builds (no dev dependencies in production)
- Health checks for orchestrator awareness
- Resource limits (memory + CPU)

### 8. SQL Injection Prevention

All database queries use parameterized statements:

```typescript
await db.query(
  "SELECT * FROM warnings WHERE is_active = $1 AND expires_at > $2",
  [true, now]
);
```

### 9. Data Privacy

- Location data only collected with browser permission
- No PII logged (structured logging with requestId correlation)
- Weather data is public; user-specific data is session-scoped
- `POST /api/v1/voice/transcribe` returns 501 (not yet implemented — honest)

### 10. Dependency Security

- `npm audit` in CI pipeline
- Docker base images: `alpine` (minimal attack surface)
- Python dependencies pinned to specific versions

### 11. Network Security

- Express: `x-powered-by` header disabled
- JSON body limit: 1MB
- Request timeout: 20s (configurable)
- ML service timeout: 6s

### 12. Logging Policy

**NEVER LOG:**
- Passwords
- API keys
- JWTs
- Exact user coordinates
- User personal information

**ALWAYS LOG:**
- Request ID
- Endpoint
- Duration
- Status code
- Provider name
- Error category (not stack traces)

## Vulnerability Reporting

Report security issues via responsible disclosure.
Do not open public GitHub issues for security vulnerabilities.

## Production Security Checklist

- [ ] `.env` not in repository
- [ ] CORS_ORIGINS configured for production domain
- [ ] POSTGRES_PASSWORD is strong and unique
- [ ] ML_API_KEY is set for production
- [ ] HTTPS enabled via reverse proxy
- [ ] Docker containers run as non-root
- [ ] No secrets in docker-compose.yml
- [ ] npm audit passes
- [ ] No hardcoded API keys in source
