/**
 * Minimal structured logging + error-reporting hooks (no third-party SDK).
 *
 * - Every message is redacted: emails, phone numbers, API keys, bearer tokens
 *   and JWTs never reach the logs.
 * - In production (or LOG_FORMAT=json) each entry is a single JSON line, which
 *   Vercel's log search can filter by `scope`/`level`.
 * - Errors are also passed to registered reporters. If ERROR_WEBHOOK_URL is
 *   set, errors are POSTed there as JSON (Slack/Discord-style webhooks, a log
 *   drain, or a future Sentry bridge). Reporters can never throw into callers.
 */

export type LogLevel = "info" | "warn" | "error";
export type LogContext = Record<string, unknown>;

export interface LogEntry {
  level: LogLevel;
  scope: string;
  message: string;
  context: LogContext;
  timestamp: string;
}

export type ErrorReporter = (entry: LogEntry) => void | Promise<void>;

const REDACTIONS: [RegExp, string][] = [
  [/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, "<jwt>"],
  [/\b(sk|rk)-[A-Za-z0-9_-]{8,}/g, "$1-***"],
  [/\bsb_(secret|publishable)_[A-Za-z0-9_-]{8,}/g, "sb_$1_***"],
  [/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, "Bearer ***"],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "<email>"],
  [/\+[1-9]\d{7,14}\b/g, "<phone>"],
];

const MAX_STRING = 500;

export function redact(value: string): string {
  let out = value;
  for (const [pattern, replacement] of REDACTIONS) out = out.replace(pattern, replacement);
  return out.length > MAX_STRING ? `${out.slice(0, MAX_STRING)}…` : out;
}

function sanitize(value: unknown, depth = 0): unknown {
  if (value == null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return redact(value);
  if (value instanceof Error) return sanitize(errorInfo(value), depth + 1);
  if (depth > 3) return "[…]";
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => sanitize(v, depth + 1));
  if (typeof value === "object") {
    const out: LogContext = {};
    for (const [k, v] of Object.entries(value as LogContext)) {
      if (/password|secret|token|authorization|api_?key|code_hash/i.test(k)) out[k] = "***";
      else out[k] = sanitize(v, depth + 1);
    }
    return out;
  }
  return String(value);
}

/** Safe, serializable summary of any thrown value. */
export function errorInfo(err: unknown): LogContext {
  if (err && typeof err === "object") {
    const e = err as { name?: string; message?: string; code?: unknown; status?: unknown; digest?: unknown };
    return {
      name: e.name,
      message: typeof e.message === "string" ? e.message : undefined,
      code: e.code,
      status: e.status,
      digest: e.digest,
    };
  }
  return { message: String(err) };
}

const reporters = new Set<ErrorReporter>();

/** Register an error reporter (returns an unregister function). */
export function registerErrorReporter(reporter: ErrorReporter): () => void {
  reporters.add(reporter);
  return () => reporters.delete(reporter);
}

function webhookReporter(): ErrorReporter | null {
  const url = typeof process !== "undefined" ? process.env.ERROR_WEBHOOK_URL?.trim() : undefined;
  if (!url) return null;
  return async (entry) => {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: `[${entry.scope}] ${entry.message}`, ...entry }),
      signal: AbortSignal.timeout(3000),
    });
  };
}

function jsonFormat(): boolean {
  return process.env.LOG_FORMAT === "json" || (process.env.NODE_ENV === "production" && process.env.LOG_FORMAT !== "pretty");
}

export function log(level: LogLevel, scope: string, message: string, context: LogContext = {}): LogEntry {
  const entry: LogEntry = {
    level,
    scope,
    message: redact(message),
    context: sanitize(context) as LogContext,
    timestamp: new Date().toISOString(),
  };
  const write = level === "error" ? console.error : level === "warn" ? console.warn : console.info;
  if (jsonFormat()) write(JSON.stringify({ level, scope, msg: entry.message, ...entry.context, ts: entry.timestamp }));
  else write(`[${scope}] ${entry.message}`, entry.context);

  if (level === "error") {
    const targets = [...reporters];
    const hook = webhookReporter();
    if (hook) targets.push(hook);
    for (const report of targets) {
      try {
        void Promise.resolve(report(entry)).catch(() => {});
      } catch {
        // A broken reporter must never break the request.
      }
    }
  }
  return entry;
}

export const logInfo = (scope: string, message: string, context?: LogContext) => log("info", scope, message, context);
export const logWarn = (scope: string, message: string, context?: LogContext) => log("warn", scope, message, context);
export const logError = (scope: string, message: string, context?: LogContext) => log("error", scope, message, context);
