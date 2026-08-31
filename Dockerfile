# ═══════════════════════════════════════════════════════════════════════════════
# WeatherGPT — Production Dockerfile (multi-stage)
# ═══════════════════════════════════════════════════════════════════════════════

# ── Stage 1: Install production dependencies ──────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ── Stage 2: Build frontend + backend ─────────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ── Stage 3: Production image ─────────────────────────────────────────────────
FROM node:20-alpine AS production

# Security: run as non-root
RUN addgroup -g 1001 -S weathergpt && \
    adduser -S weathergpt -u 1001 -G weathergpt

WORKDIR /app

# Copy only what's needed for runtime
COPY --from=deps --chown=weathergpt:weathergpt /app/node_modules ./node_modules
COPY --from=build --chown=weathergpt:weathergpt /app/dist ./dist
COPY --from=build --chown=weathergpt:weathergpt /app/server.ts ./
COPY --from=build --chown=weathergpt:weathergpt /app/src ./src
COPY --from=build --chown=weathergpt:weathergpt /app/package.json ./
COPY --from=build --chown=weathergpt:weathergpt /app/tsconfig.json ./

# Migrations and crops config
COPY --from=build --chown=weathergpt:weathergpt /app/db ./db

# Switch to non-root user
USER weathergpt

ENV NODE_ENV=production
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/v1/health || exit 1

CMD ["npx", "tsx", "server.ts"]
