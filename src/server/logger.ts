/**
 * WeatherGPT — structured logger.
 * Every log line is JSON with corrrelation metadata so it can be traced
 * through the request pipeline.
 */
import { randomUUID } from "node:crypto";

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_RANK: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

let minLevel: LogLevel = "info";

export function setLogLevel(level: LogLevel) {
  minLevel = level;
}

export interface LogContext {
  requestId?: string;
  userId?: string;
  endpoint?: string;
  [key: string]: unknown;
}

interface LogEntry {
  ts: string;
  level: LogLevel;
  msg: string;
  requestId?: string;
  userId?: string;
  [key: string]: unknown;
}

function write(level: LogLevel, msg: string, context: LogContext = {}) {
  if (LEVEL_RANK[level] < LEVEL_RANK[minLevel]) return;
  const { requestId, userId, endpoint, ...rest } = context;
  const entry: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    msg,
  };
  if (requestId) entry.requestId = requestId;
  if (userId) entry.userId = userId;
  if (endpoint) entry.endpoint = endpoint;
  Object.assign(entry, rest);
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (msg: string, ctx?: LogContext) => write("debug", msg, ctx),
  info: (msg: string, ctx?: LogContext) => write("info", msg, ctx),
  warn: (msg: string, ctx?: LogContext) => write("warn", msg, ctx),
  error: (msg: string, ctx?: LogContext) => write("error", msg, ctx),
  child: (base: LogContext) => ({
    debug: (msg: string, ctx?: LogContext) => write("debug", msg, { ...base, ...ctx }),
    info: (msg: string, ctx?: LogContext) => write("info", msg, { ...base, ...ctx }),
    warn: (msg: string, ctx?: LogContext) => write("warn", msg, { ...base, ...ctx }),
    error: (msg: string, ctx?: LogContext) => write("error", msg, { ...base, ...ctx }),
  }),
};

export function newRequestId(): string {
  return randomUUID();
}