import { REALTIME_OUTBOX_SOURCE } from "@infera/services";
import type { RealtimeEnvelope } from "@infera/shared";
import { db, env, services } from "./config";
import { hub } from "./hub";

const POLL_MS = 2000;
const RETENTION_MS = 10 * 60_000;

/**
 * Relays realtime envelopes published by the bot, worker and shared services
 * to dashboard WebSocket clients.
 *
 * - With Redis: subscribe to the platform pub/sub channel.
 * - Without Redis: the in-process cache already delivers this process's own
 *   events; other processes write to the SystemEvent outbox, which is polled.
 */
export function startRealtimeBridge(log: { warn: (obj: unknown, msg: string) => void }): () => void {
  void services.realtime.subscribePlatform((envelope: RealtimeEnvelope) => {
    hub.forward(envelope);
  });

  if (env.REDIS_URL) return () => undefined;

  let cursor = new Date();
  let busy = false;
  let lastCleanup = 0;
  const ownOrigin = services.realtime.origin;

  const tick = async (): Promise<void> => {
    if (busy) return;
    busy = true;
    try {
      const rows = await db.systemEvent.findMany({
        where: { source: REALTIME_OUTBOX_SOURCE, createdAt: { gt: cursor } },
        orderBy: { createdAt: "asc" },
        take: 200,
      });
      for (const row of rows) {
        cursor = row.createdAt;
        let origin: string | undefined;
        try {
          origin = (JSON.parse(row.metadata) as { origin?: string }).origin;
        } catch {
          origin = undefined;
        }
        if (origin === ownOrigin) continue;
        try {
          hub.forward(JSON.parse(row.message) as RealtimeEnvelope);
        } catch {
          // malformed row
        }
      }
      if (Date.now() - lastCleanup > 60_000) {
        lastCleanup = Date.now();
        await db.systemEvent.deleteMany({
          where: { source: REALTIME_OUTBOX_SOURCE, createdAt: { lt: new Date(Date.now() - RETENTION_MS) } },
        });
      }
    } catch (error) {
      log.warn({ err: error }, "realtime outbox poll failed");
    } finally {
      busy = false;
    }
  };

  const timer = setInterval(() => void tick(), POLL_MS);
  timer.unref();
  return () => clearInterval(timer);
}
