import { registry } from "@infera/commands";
import { createLogger } from "@infera/shared";
import type { InferaClient } from "../client";

const log = createLogger("bot:heartbeat");
const HEARTBEAT_INTERVAL_MS = 60_000;
const RETENTION_MS = 24 * 60 * 60 * 1000;

/**
 * Publishes a liveness row the dashboard API can read across processes. The bot
 * and the API do not share memory, so the database is the only honest source
 * for "is the bot connected right now".
 */
export function startHeartbeat(client: InferaClient): void {
  const beat = async (): Promise<void> => {
    try {
      await client.services.db.systemEvent.create({
        data: {
          source: "bot:heartbeat",
          level: "info",
          message: JSON.stringify({
            user: client.user?.tag ?? null,
            userId: client.user?.id ?? null,
            guilds: client.guilds.cache.size,
            commands: registry.count(),
            uptimeSeconds: Math.round(process.uptime()),
          }),
        },
      });
      await client.services.db.systemEvent.deleteMany({
        where: { source: "bot:heartbeat", createdAt: { lt: new Date(Date.now() - RETENTION_MS) } },
      });
    } catch (error) {
      log.warn({ err: error }, "could not write bot heartbeat");
    }
  };

  void beat();
  const timer = setInterval(() => void beat(), HEARTBEAT_INTERVAL_MS);
  timer.unref();
}
