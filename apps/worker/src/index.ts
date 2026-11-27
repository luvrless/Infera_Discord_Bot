import "dotenv/config";
import { connectDatabase, disconnectDatabase, getPrisma } from "@infera/database";
import { createServices } from "@infera/services";
import { createCache, createLogger, loadEnv } from "@infera/shared";

/**
 * Background worker: claims due scheduled tasks (temporary ban expiry, timeout
 * expiry, ...) from the database. Safe to run alongside the bot and other
 * workers because jobs are claimed atomically.
 */
async function main(): Promise<void> {
  const env = loadEnv();
  const log = createLogger("worker");

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

  let running = true;
  let busy = false;

  const tick = async (): Promise<void> => {
    if (busy || !running) return;
    busy = true;
    try {
      const processed = await services.scheduler.processScheduledTasks(50);
      if (processed > 0) log.info({ processed }, "scheduled tasks processed");
    } catch (error) {
      log.error({ err: error }, "scheduled task tick failed");
    } finally {
      busy = false;
    }
  };

  const timer = setInterval(() => {
    void tick();
  }, 15_000);
  void tick();

  const shutdown = async (signal: string): Promise<void> => {
    log.info({ signal }, "stopping worker");
    running = false;
    clearInterval(timer);
    await cache.close().catch(() => undefined);
    await disconnectDatabase().catch(() => undefined);
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  log.info("INFERA worker started");
}

main().catch((error: unknown) => {
  console.error("INFERA worker failed to start:", error);
  process.exitCode = 1;
});
