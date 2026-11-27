import { randomUUID } from "node:crypto";
import type { WebSocket } from "ws";

interface Client {
  id: string;
  socket: WebSocket;
  userId: string;
  guilds: Set<string>;
}

/**
 * In-process fan-out for dashboard mutations. The bot also publishes events
 * through the cache; when Redis is configured those can be forwarded here.
 */
class RealtimeHub {
  private readonly clients = new Map<WebSocket, Client>();

  add(socket: WebSocket, userId: string): Client {
    const client: Client = { id: randomUUID(), socket, userId, guilds: new Set() };
    this.clients.set(socket, client);
    return client;
  }

  remove(socket: WebSocket): void {
    this.clients.delete(socket);
  }

  subscribe(client: Client, guildId: string): void {
    client.guilds.add(guildId);
  }

  private readonly seen = new Map<string, number>();

  broadcast(guildId: string, event: string, data: unknown): void {
    this.forward({ event, guildId, timestamp: new Date().toISOString(), data, eventId: randomUUID() });
  }

  /** Relay an envelope produced elsewhere (bot, worker, services). Deduplicated by eventId. */
  forward(envelope: { event: string; guildId: string | null; timestamp: string; data: unknown; eventId: string }): void {
    if (this.seen.has(envelope.eventId)) return;
    const now = Date.now();
    this.seen.set(envelope.eventId, now);
    if (this.seen.size > 5000) {
      for (const [id, at] of this.seen) {
        if (now - at > 10 * 60_000 || this.seen.size > 4000) this.seen.delete(id);
        else break;
      }
    }
    const payload = JSON.stringify(envelope);
    if (!envelope.guildId) {
      // Platform events (bot.ready, shard state) go to every connected client.
      for (const client of this.clients.values()) {
        if (client.socket.readyState === 1) client.socket.send(payload);
      }
      return;
    }
    const guildId = envelope.guildId;
    for (const client of this.clients.values()) {
      if (!client.guilds.has(guildId)) continue;
      if (client.socket.readyState === 1) client.socket.send(payload);
    }
  }

  size(): number {
    return this.clients.size;
  }
}

export const hub = new RealtimeHub();
