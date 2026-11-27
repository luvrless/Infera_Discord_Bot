import "dotenv/config";
import { registry } from "@infera/commands";
import { connectDatabase, disconnectDatabase, getPrisma } from "@infera/database";
import { createRobloxServices } from "@infera/integrations";
import { createServices } from "@infera/services";
import { createCache, createLogger, loadEnv } from "@infera/shared";
import { InferaClient } from "./client";
import { registerEvents } from "./events";
import { startScheduler } from "./lib/scheduler";

async function main(): Promise<void> {
  const env = loadEnv();
  const log = createLogger("bot");

  await connectDatabase();
  const cache = createCache(env.REDIS_URL);
  const services = createServices({
    db: getPrisma(),
    cache,
    discordToken: env.DISCORD_TOKEN,
    botUserId: env.DISCORD_CLIENT_ID,
    // Without Redis the processes share no pub/sub; relay events via the DB.
    realtimeOutbox: !env.REDIS_URL,
  });
  const roblox = createRobloxServices({ cache, cacheTtlSeconds: 300 });

  // discord.js reads SHARD_COUNT from the environment and only accepts a
  // number, so its "auto" would become NaN. Prisma re-reads .env while
  // connecting, so this must run after the database is ready. The validated
  // value lives on `env` and is passed to the client explicitly.
  delete process.env.SHARD_COUNT;
  delete process.env.SHARDS;

  const client = new InferaClient(env, services, roblox);

  registerEvents(client);

  let scheduler: NodeJS.Timeout | null = null;
  let shuttingDown = false;

  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info({ signal }, "shutting down");
    if (scheduler) clearInterval(scheduler);
    await client.destroy().catch(() => undefined);
    await cache.close().catch(() => undefined);
    await disconnectDatabase().catch(() => undefined);
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("unhandledRejection", (reason) => {
    log.error({ err: reason }, "unhandled rejection");
  });
  process.on("uncaughtException", (error) => {
    log.fatal({ err: error }, "uncaught exception");
  });

  await client.login(env.DISCORD_TOKEN);
  scheduler = startScheduler(client);
  log.info({ commands: registry.count() }, "INFERA bot started");
}

main().catch((error: unknown) => {
  // The logger needs a valid environment, so failures here print directly.
  console.error("INFERA failed to start:", error);
  process.exitCode = 1;
});
