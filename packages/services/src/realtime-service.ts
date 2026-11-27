import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@infera/database";
import type { Cache, RealtimeEnvelope, RealtimeEventName } from "@infera/shared";

export interface RealtimeOptions {
  /**
   * When the cache is in-process (no REDIS_URL) the bot, worker and API do not
   * share pub/sub. In that mode every envelope is also written to the
   * `SystemEvent` table (source `realtime`) so the API can relay it to
   * dashboard WebSocket clients. Leave undefined when Redis is configured.
   */
  outbox?: PrismaClient;
  /** Identifies the publishing process so the API can skip its own rows. */
  origin?: string;
}

export const REALTIME_OUTBOX_SOURCE = "realtime";

/**
 * Publishes guild-scoped realtime events. The API subscribes to these channels
 * and fans them out to authorised dashboard WebSocket clients; webhook
 * deliveries consume the same envelopes.
 */
export class RealtimeService {
  readonly origin: string;

  constructor(
    private readonly cache: Cache,
    private readonly options: RealtimeOptions = {},
  ) {
    this.origin = options.origin ?? `${process.pid}-${randomUUID().slice(0, 8)}`;
  }

  async publish(guildId: string | null, event: RealtimeEventName, data: unknown): Promise<void> {
    const envelope: RealtimeEnvelope = {
      event,
      guildId,
      timestamp: new Date().toISOString(),
      data,
      eventId: randomUUID(),
    };
    const payload = JSON.stringify(envelope);
    if (guildId) {
      await this.cache.publish(`infera:events:guild:${guildId}`, payload);
    }
    await this.cache.publish("infera:events:platform", payload);

    if (this.options.outbox) {
      await this.options.outbox.systemEvent
        .create({
          data: {
            guildId,
            source: REALTIME_OUTBOX_SOURCE,
            level: "info",
            message: payload,
            metadata: JSON.stringify({ origin: this.origin }),
          },
        })
        .catch(() => undefined);
    }
  }

  /** Subscribe to a single guild's event stream. */
  async subscribeGuild(guildId: string, handler: (envelope: RealtimeEnvelope) => void): Promise<void> {
    await this.cache.subscribe(`infera:events:guild:${guildId}`, (payload) => {
      try {
        handler(JSON.parse(payload) as RealtimeEnvelope);
      } catch {
        // ignore malformed payloads
      }
    });
  }

  /** Subscribe to every guild's event stream (platform operators only). */
  async subscribePlatform(handler: (envelope: RealtimeEnvelope) => void): Promise<void> {
    await this.cache.subscribe("infera:events:platform", (payload) => {
      try {
        handler(JSON.parse(payload) as RealtimeEnvelope);
      } catch {
        // ignore malformed payloads
      }
    });
  }
}
