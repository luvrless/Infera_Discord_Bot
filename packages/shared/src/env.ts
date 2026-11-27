import { z } from "zod";

const csvList = z
  .string()
  .optional()
  .default("")
  .transform((value) =>
    value
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0),
  );

const booleanish = z
  .string()
  .optional()
  .default("false")
  .transform((value) => value.toLowerCase() === "true" || value === "1");

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  // 0 means "let the OS choose a port"; the bot and worker never bind one.
  PORT: z.coerce.number().int().nonnegative().default(3001),
  API_HOST: z.string().default("0.0.0.0"),
  API_PUBLIC_URL: z.string().url().default("http://localhost:3001"),
  WEB_APP_URL: z.string().url().default("http://localhost:3000"),
  API_BASE_PATH: z
    .string()
    .default("/v1")
    .transform((value) => (value.startsWith("/") ? value : `/${value}`)),

  DISCORD_TOKEN: z.string().min(20, "DISCORD_TOKEN is required"),
  DISCORD_CLIENT_ID: z.string().regex(/^\d{17,20}$/, "DISCORD_CLIENT_ID must be a snowflake"),
  DISCORD_CLIENT_SECRET: z.string().min(10, "DISCORD_CLIENT_SECRET is required"),
  DISCORD_REDIRECT_URI: z
    .string()
    .url()
    .default("http://localhost:3001/v1/auth/discord/callback"),

  INFERA_OWNER_IDS: csvList,
  INFERA_DEFAULT_PREFIX: z.string().min(1).max(5).default("."),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z
    .string()
    .optional()
    .transform((value) => (value && value.trim().length > 0 ? value : null)),

  SESSION_SECRET: z.string().min(16, "SESSION_SECRET must be at least 16 characters"),
  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 characters"),
  ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, "ENCRYPTION_KEY must be 32 bytes encoded as hex"),
  WEBHOOK_SIGNING_SECRET: z.string().min(16).default(""),

  WEB_APP_ORIGIN: z.string().default("http://localhost:3000"),
  API_CORS_ORIGINS: csvList,

  ROBLOX_API_BASE_URL: z.string().url().default("https://users.roblox.com"),

  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  SENTRY_DSN: z
    .string()
    .optional()
    .transform((value) => (value && value.trim().length > 0 ? value : null)),

  SHARD_COUNT: z.string().default("auto"),
  SHARD_MODE: z.enum(["auto", "process", "worker"]).default("auto"),

  /** When true the bot skips connecting to the Discord gateway (API/worker only). */
  DISABLE_GATEWAY: booleanish,
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

/**
 * Parse and validate the process environment. Fails fast with a readable
 * aggregated error so a bad deployment never starts half-configured.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  cached = result.data;
  return result.data;
}

/** Returns the already validated environment. */
export function getEnv(): Env {
  if (!cached) cached = loadEnv();
  return cached;
}

export function isProduction(): boolean {
  return getEnv().NODE_ENV === "production";
}

export function isPlatformOwner(userId: string): boolean {
  return getEnv().INFERA_OWNER_IDS.includes(userId);
}
