/**
 * WeatherGPT — Versioned HTTP API (v1).
 *
 * Middleware & routes are dependency-injected so integration tests can mount
 * the router without a live network (demo providers + in-memory cache).
 */
import express, { type Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import type { AppConfig } from "./config";
import { WeatherGPTEngine, type EngineData } from "./engine";
import { AlertService } from "./services/alertsService";
import { CacheService } from "./cache";
import { LLMGateway } from "./gateway/llmGateway";
import { getRegistry } from "./providers";
import { agricultureEngine } from "./services/agricultureEngine";
import { understand } from "./services/queryUnderstanding";
import { logger, newRequestId, type LogContext } from "./logger";
import type { ResolvedLocation } from "./core/models";

export interface ApiDeps {
  cfg: AppConfig;
  engine: WeatherGPTEngine;
  alerts: AlertService;
  cache: CacheService;
  llm: LLMGateway | null;
}

export interface ApiService {
  router: Router;
}

// ─── schemas ─────────────────────────────────────────────────────────────────

const chatBody = z.object({
  query: z.string().min(1, "query is required"),
  location: z.string().optional(),
  language: z.string().optional(),
}).strict();

const advisoryBody = z.object({
  crop: z.string().min(1),
  stage: z.string().optional(),
  location: z.string().optional(),
  irrigationAvailable: z.boolean().optional(),
}).strict();

// ─── helpers ─────────────────────────────────────────────────────────────────

function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

function sendJson<T>(res: Response, status: number, body: T) {
  res.status(status).json(body);
}

function metaResponse(cfg: AppConfig, data: { location?: ResolvedLocation } = {}) {
  const registry = getRegistry();
  return {
    mode: registry.mode,
    sources: [] as string[],
    retrievedAt: new Date().toISOString(),
    model: cfg.geminiModel,
    demoModeConfigured: cfg.demoMode,
  };
}

// ─── middleware ──────────────────────────────────────────────────────────────

function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
  const id = req.header("x-request-id") || (res.locals.requestId = newRequestId());
  res.setHeader("x-request-id", id);
  (req as unknown as { requestId: string }).requestId = id;
  (res.locals as unknown as { requestId: string }).requestId = id;
  next();
}

function logMiddleware(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  const ctx: LogContext = {
    requestId: (req as unknown as { requestId?: string }).requestId,
    endpoint: `${req.method} ${req.path}`,
  };
  res.on("finish", () => {
    logger.info("http", { ...ctx, status: res.statusCode, durationMs: Date.now() - start });
  });
  next();
}

function securityHeadersMiddleware(_req: Request, res: Response, next: NextFunction) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.removeHeader("X-Powered-By");
  next();
}

function corsMiddleware(cfg: AppConfig) {
  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.header("origin");
    if (origin) {
      const allowed = cfg.corsOrigins.length === 0 || cfg.corsOrigins.includes(origin);
      if (allowed) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Vary", "Origin");
      }
    }
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Request-Id, Authorization");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  };
}

function rateLimitMiddleware(cfg: AppConfig, cache: CacheService) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const id = req.header("x-forwarded-for")?.split(",")[0]?.trim() || req.ip || "unknown";
    try {
      const count = await cache.incr(cache.key.rate("v1", id), Math.ceil(cfg.rateLimitWindowMs / 1000));
      res.setHeader("X-RateLimit-Limit", String(cfg.rateLimitMaxPerWindow));
      res.setHeader("X-RateLimit-Remaining", String(Math.max(0, cfg.rateLimitMaxPerWindow - count)));
      if (count > cfg.rateLimitMaxPerWindow) {
        return res.status(429).json({ error: { code: "rate_limited", message: "Rate limit exceeded, try again shortly.", requestId: (req as unknown as { requestId?: string }).requestId } });
      }
      next();
    } catch (err) {
      logger.warn("Rate limiter failed", { error: (err as Error).message });
      next();
    }
  };
}

function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  const message = err instanceof Error ? err.message : String(err);
  logger.error("api_error", { error: message });
  res.status(500).json({ error: { code: "internal", message: "Internal server error", requestId: (res.locals as unknown as { requestId?: string }).requestId } });
}

// ─── handlers ────────────────────────────────────────────────────────────────

function resolveLocationInput(req: Request): string | undefined {
  const q = req.query.location;
  if (typeof q === "string" && q.trim()) return q;
  if (typeof req.body?.location === "string" && req.body.location.trim()) return req.body.location;
  return undefined;
}

export function createApi(deps: ApiDeps): ApiService {
  const { cfg, engine, alerts, cache } = deps;
  const router = express.Router();

  router.use(requestIdMiddleware);
  router.use(logMiddleware);
  router.use(securityHeadersMiddleware);
  router.use(corsMiddleware(cfg));
  router.use(rateLimitMiddleware(cfg, cache));

  // liveness
  router.get("/health", (_req, res) => {
    sendJson(res, 200, { status: "ok", timestamp: new Date().toISOString() });
  });

  // readiness — dependency health for orchestrators
  router.get("/ready", asyncHandler(async (_req, res) => {
    const registry = getRegistry();
    const cacheHealth = await cache.ping();
    sendJson(res, 200, {
      ok: true,
      mode: registry.mode,
      weatherProvider: registry.weather.id,
      cache: cacheHealth,
      demoModeConfigured: cfg.demoMode,
      warningsConfigured: alerts.officialWarningsConfigured,
      llmAvailable: deps.llm ? deps.llm.isAvailable() : false,
      sources: alerts.configuredSources.map((s) => ({ id: s.id, label: s.label, isDemo: s.isDemo })),
    });
  }));

  // system meta — the UI uses this to label data honestly (LIVE vs DEMO)
  router.get("/meta", asyncHandler(async (_req, res) => {
    sendJson(res, 200, metaResponse(cfg));
  }));

  // location search
  router.get("/locations/search", asyncHandler(async (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (!q) return sendJson(res, 400, { error: { code: "invalid_query", message: "Missing ?q=" } });
    const results = await engine.locationService.resolve(q);
    if (!results) return sendJson(res, 200, { data: [], meta: metaResponse(cfg) });
    sendJson(res, 200, { data: [results], meta: metaResponse(cfg) });
  }));

  // dashboard: current + forecast + aqi + alerts + risk for a location
  router.get("/weather", asyncHandler(async (req, res) => {
    const locationInput = resolveLocationInput(req);
    const location = await engine.resolveLocation(locationInput, undefined);
    if (!location) {
      return sendJson(res, 400, { error: { code: "location_unresolved", message: "Could not resolve the requested location." } });
    }
    const data = await engine.gatherData(location, "current_weather");
    sendJson(res, 200, { data, meta: metaResponse(cfg, { location }) });
  }));

  // granular weather endpoints
  router.get("/weather/current", asyncHandler(async (req, res) => {
    const location = await engine.resolveLocation(resolveLocationInput(req), undefined);
    if (!location) return sendJson(res, 400, { error: { code: "location_unresolved", message: "Could not resolve location." } });
    const data = await engine.gatherData(location, "current_weather");
    sendJson(res, 200, { data: { current: data.current, aqi: data.aqi, location, sources: data.sources, mode: data.mode }, meta: metaResponse(cfg, { location }) });
  }));

  router.get("/weather/forecast", asyncHandler(async (req, res) => {
    const location = await engine.resolveLocation(resolveLocationInput(req), undefined);
    if (!location) return sendJson(res, 400, { error: { code: "location_unresolved", message: "Could not resolve location." } });
    const data = await engine.gatherData(location, "forecast");
    sendJson(res, 200, { data: { forecast: data.forecast, location, sources: data.sources, mode: data.mode }, meta: metaResponse(cfg, { location }) });
  }));

  router.get("/weather/hourly", asyncHandler(async (req, res) => {
    const location = await engine.resolveLocation(resolveLocationInput(req), undefined);
    if (!location) return sendJson(res, 400, { error: { code: "location_unresolved", message: "Could not resolve location." } });
    const data = await engine.gatherData(location, "forecast");
    sendJson(res, 200, { data: { hourly: data.forecast?.hourly ?? [], location, sources: data.sources, mode: data.mode }, meta: metaResponse(cfg, { location }) });
  }));

  router.get("/risk", asyncHandler(async (req, res) => {
    const location = await engine.resolveLocation(resolveLocationInput(req), undefined);
    if (!location) return sendJson(res, 400, { error: { code: "location_unresolved", message: "Could not resolve location." } });
    const data = await engine.gatherData(location, "precipitation");
    sendJson(res, 200, { data: { risk: data.risk, alerts: data.alerts, location, sources: data.sources, mode: data.mode }, meta: metaResponse(cfg, { location }) });
  }));

  // lightweight metrics for observability
  router.get("/metrics", asyncHandler(async (_req, res) => {
    const registry = getRegistry();
    const cacheHealth = await cache.ping();
    const dbHealth = await import("./db").then((m) => m.db.health());
    sendJson(res, 200, {
      uptime_seconds: Math.floor(process.uptime()),
      mode: registry.mode,
      weather_provider: registry.weather.id,
      cache_backend: cacheHealth.backend,
      cache_ok: cacheHealth.ok,
      database_ok: dbHealth.ok,
      llm_available: deps.llm ? deps.llm.isAvailable() : false,
      alert_sources: alerts.configuredSources.length,
      official_warnings: alerts.officialWarningsConfigured,
      timestamp: new Date().toISOString(),
    });
  }));

  // voice transcribe — server-side ASR not yet integrated; honest stub
  router.post("/voice/transcribe", asyncHandler(async (_req, res) => {
    sendJson(res, 501, {
      error: {
        code: "not_implemented",
        message: "Server-side voice transcription is not yet available. Use the browser Web Speech API in the web client.",
      },
    });
  }));

  // chat
  router.post("/chat", asyncHandler(async (req, res) => {
    const parsed = chatBody.safeParse(req.body);
    if (!parsed.success) {
      return sendJson(res, 400, { error: { code: "invalid_chat_body", message: parsed.error.issues[0]?.message, requestId: (req as unknown as { requestId?: string }).requestId } });
    }
    const { query, location: locationHint, language: requestedLang } = parsed.data;

    const understanding = understand(query);
    if (requestedLang && /^(en|hi|mr|ta|te|bn|gu|kn)$/.test(requestedLang)) {
      understanding.language = requestedLang;
    }
    const location = await engine.resolveLocation(
      locationHint ?? understanding.locationHint,
      undefined
    );
    if (!location) {
      return sendJson(res, 200, {
        data: {
          understanding,
          location: undefined,
          current: undefined,
          chat: {
            answer:
              understanding.language === "hi"
                ? "मुझे यह स्थान पहचानने में असमर्थ रहा। कृपया शहर का नाम दोहराएँ (उदाहरण: \"पुणे\", \"मुंबई\")।"
                : understanding.language === "mr"
                ? "मला हे ठिकाण ओळखता आले नाही. कृपया शहराचे नाव पुन्हा द्या (उदा. \"पुणे\", \"मुंबई\")."
                : "I could not identify that place. Please retry with a city name (e.g. \"Pune\", \"Mumbai\", \"Delhi\").",
            language: understanding.language,
            severity: "info",
            recommendation: "",
            followUpSuggestions: [],
            statistics: {},
          },
          mode: getRegistry().mode,
          llmUsed: false,
          evidence: [],
          sources: [],
        },
        meta: metaResponse(cfg),
      });
    }

    const data = await engine.gatherData(location, understanding.intent);
    const evidenceCtx = engine.buildEvidence(data);
    const { chat, llmUsed, validationIssues } = await engine.chat(
      understanding,
      data,
      evidenceCtx.evidence,
      evidenceCtx.evidenceContext
    );

    sendJson(res, 200, {
      data: {
        query,
        understanding,
        location,
        current: data.current,
        forecast: data.forecast,
        aqi: data.aqi,
        alerts: data.alerts,
        risk: data.risk,
        chat,
        evidence: evidenceCtx.evidence,
        sources: data.sources,
        mode: data.mode,
        llmUsed,
        validationIssues,
      },
      meta: metaResponse(cfg, { location }),
    });
  }));

  // agriculture advisory
  router.post("/agriculture/advisory", asyncHandler(async (req, res) => {
    const parsed = advisoryBody.safeParse(req.body);
    if (!parsed.success) {
      return sendJson(res, 400, { error: { code: "invalid_advisory_body", message: parsed.error.issues[0]?.message } });
    }
    const { crop, stage, location: locationHint, irrigationAvailable = true } = parsed.data;

    const crops = agricultureEngine.listCrops().map((c) => c.id);
    if (!crops.includes(crop)) {
      return sendJson(res, 400, { error: { code: "unknown_crop", message: `Unknown crop. Supported: ${crops.join(", ")}`, supportedCrops: crops } });
    }

    const location = await engine.resolveLocation(locationHint, undefined);
    if (!location) {
      return sendJson(res, 400, { error: { code: "location_unresolved", message: "Could not resolve the requested location." } });
    }

    const data = await engine.gatherData(location, "agriculture");
    const advisory = agricultureEngine.compute(
      { crop, stage: stage ?? "", location, irrigationAvailable },
      { observation: data.current, forecast: data.forecast }
    );
    if (!advisory) {
      return sendJson(res, 400, { error: { code: "unknown_crop", message: `Unknown crop: ${crop}` } });
    }

    sendJson(res, 200, {
      data: {
        advisory,
        weather: { current: data.current, forecast: data.forecast },
        evidence: engine.buildEvidence(data).evidence,
        sources: data.sources,
        mode: data.mode,
      },
      meta: metaResponse(cfg, { location }),
    });
  }));

  // active alerts (filterable by resolved location)
  router.get("/alerts", asyncHandler(async (req, res) => {
    const locationInput = resolveLocationInput(req);
    const location = locationInput ? await engine.resolveLocation(locationInput, undefined) : undefined;
    const alertsFor = location ? await alerts.getActiveForLocation(location) : await alerts.getAllActive();
    sendJson(res, 200, {
      data: {
        alerts: alertsFor,
        totalActive: alertsFor.length,
        mode: getRegistry().mode,
        officialWarningsConfigured: alerts.officialWarningsConfigured,
      },
      meta: metaResponse(cfg, { location }),
    });
  }));

  // nearby alerts — resolves location from query param and returns alerts
  router.get("/alerts/nearby", asyncHandler(async (req, res) => {
    const locationInput = resolveLocationInput(req);
    if (!locationInput) {
      return sendJson(res, 400, { error: { code: "missing_location", message: "Provide ?location= to find nearby alerts." } });
    }
    const location = await engine.resolveLocation(locationInput, undefined);
    if (!location) {
      return sendJson(res, 400, { error: { code: "location_unresolved", message: "Could not resolve the requested location." } });
    }
    const alertsFor = await alerts.getActiveForLocation(location);
    sendJson(res, 200, {
      data: {
        location,
        alerts: alertsFor,
        totalActive: alertsFor.length,
        mode: getRegistry().mode,
        officialWarningsConfigured: alerts.officialWarningsConfigured,
      },
      meta: metaResponse(cfg, { location }),
    });
  }));

  // data sources registry (transparency)
  router.get("/sources", asyncHandler(async (_req, res) => {
    sendJson(res, 200, {
      data: {
        mode: getRegistry().mode,
        weather: { id: getRegistry().weather.id, label: getRegistry().weather.label, isDemo: getRegistry().weather.isDemo },
        geocoding: { id: getRegistry().geocoding.id, isDemo: getRegistry().geocoding.isDemo },
        alerts: alerts.configuredSources,
        officialWarningsConfigured: alerts.officialWarningsConfigured,
      },
      meta: metaResponse(cfg),
    });
  }));

  // SSE alert stream — pushes new alerts to connected clients
  router.get("/alerts/stream", (req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    // Send initial snapshot
    alerts.getAllActive().then((active) => {
      const payload = JSON.stringify({ type: "snapshot", alerts: active, timestamp: new Date().toISOString() });
      res.write(`data: ${payload}\n\n`);
    }).catch(() => undefined);

    // Heartbeat every 30s to keep connection alive
    const heartbeat = setInterval(() => {
      res.write(`:heartbeat\n\n`);
    }, 30_000);

    // Periodic alert refresh every 60s
    const refresh = setInterval(() => {
      alerts.getAllActive().then((active) => {
        const payload = JSON.stringify({ type: "update", alerts: active, timestamp: new Date().toISOString() });
        res.write(`data: ${payload}\n\n`);
      }).catch(() => undefined);
    }, 60_000);

    req.on("close", () => {
      clearInterval(heartbeat);
      clearInterval(refresh);
    });
  });

  // 404
  router.use((_req, res) => {
    sendJson(res, 404, { error: { code: "not_found", message: "Route not found." } });
  });

  // error sink
  router.use(errorHandler);

  return { router };
}

export type { EngineData };