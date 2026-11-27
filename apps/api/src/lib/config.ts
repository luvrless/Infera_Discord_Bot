import "dotenv/config";
import { getPrisma } from "@infera/database";
import { createCache, loadEnv } from "@infera/shared";
import { createServices, type ServiceContainer } from "@infera/services";

/** Validated environment shared by every API module. */
export const env = loadEnv();

export const db = getPrisma();
export const cache = createCache(env.REDIS_URL);

export const services: ServiceContainer = createServices({
  db,
  cache,
  discordToken: env.DISCORD_TOKEN,
  // The application's own user id is the bot user id.
  botUserId: env.DISCORD_CLIENT_ID,
  // Without Redis the processes share no pub/sub; relay events via the DB.
  realtimeOutbox: !env.REDIS_URL,
});

export const SESSION_COOKIE = "infera_session";
export const STATE_COOKIE = "infera_oauth_state";
/**
 * Sessions are rolling: every use pushes the expiry forward by this window, so
 * an active user is never signed out. Only a session unused for this long ends.
 */
export const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000;
export const BASE_PATH = env.API_BASE_PATH;

export const allowedOrigins = new Set(
  [env.WEB_APP_ORIGIN, ...env.API_CORS_ORIGINS].filter(Boolean),
);

export const apiPort = Number(process.env.API_PORT ?? 3001);
export const apiHost = env.API_HOST === "0.0.0.0" ? "127.0.0.1" : env.API_HOST;
