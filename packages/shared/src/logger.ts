import pino, { type Logger } from "pino";
import { getEnv } from "./env";

const REDACT_PATHS = [
  "token",
  "*.token",
  "DISCORD_TOKEN",
  "password",
  "*.password",
  "secret",
  "*.secret",
  "clientSecret",
  "authorization",
  "headers.authorization",
  "headers.cookie",
  "req.headers.authorization",
  "req.headers.cookie",
];

let rootLogger: Logger | null = null;

export function getLogger(): Logger {
  if (rootLogger) return rootLogger;
  const env = getEnv();
  rootLogger = pino({
    level: env.LOG_LEVEL,
    base: { service: "infera", env: env.NODE_ENV },
    redact: { paths: REDACT_PATHS, censor: "[redacted]" },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level(label) {
        return { level: label };
      },
    },
  });
  return rootLogger;
}

/** Create a namespaced child logger, e.g. `createLogger("bot:commands")`. */
export function createLogger(scope: string, bindings: Record<string, unknown> = {}): Logger {
  return getLogger().child({ scope, ...bindings });
}

export type { Logger };
