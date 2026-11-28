/**
 * Complete realtime event catalogue. The dashboard subscribes to these names
 * over the WebSocket API and webhooks deliver the same names.
 */
export const REALTIME_EVENTS = {
  discord: [
    "guild.created",
    "guild.updated",
    "guild.removed",
    "member.joined",
    "member.left",
    "member.updated",
    "member.banned",
    "member.unbanned",
    "message.created",
    "message.deleted",
    "message.updated",
    "message.bulk_deleted",
    "role.created",
    "role.updated",
    "role.deleted",
    "channel.created",
    "channel.updated",
    "channel.deleted",
    "voice.joined",
    "voice.left",
    "voice.moved",
  ],
  moderation: [
    "moderation.case.created",
    "moderation.case.updated",
    "moderation.case.deleted",
    "moderation.warning.created",
    "moderation.warning.removed",
    "moderation.ban.created",
    "moderation.ban.removed",
    "moderation.timeout.created",
    "moderation.timeout.removed",
    "moderation.appeal.created",
    "moderation.appeal.updated",
  ],
  security: [
    "security.alert.created",
    "security.antinuke.triggered",
    "security.antiraid.triggered",
    "security.lockdown.created",
    "security.lockdown.removed",
  ],
  automod: ["automod.rule.triggered", "automod.action.executed", "automod.rule.updated"],
  leveling: [
    "leveling.xp.updated",
    "leveling.level.up",
    "leveling.reward.granted",
    "leveling.leaderboard.updated",
  ],
  economy: [
    "economy.transaction.created",
    "economy.balance.updated",
    "economy.item.purchased",
    "economy.trade.created",
    "economy.trade.completed",
  ],
  community: [
    "ticket.created",
    "ticket.claimed",
    "ticket.closed",
    "ticket.reopened",
    "ticket.unclaimed",
    "ticket.deleted",
    "ticket.transferred",
    "giveaway.created",
    "giveaway.ended",
    "suggestion.created",
    "suggestion.updated",
    "confession.created",
    "starboard.updated",
    "voice.channel.created",
    "voice.channel.deleted",
  ],
  configuration: [
    "config.updated",
    "module.enabled",
    "module.disabled",
    "command.enabled",
    "command.disabled",
    "prefix.updated",
    "integration.connected",
    "integration.disconnected",
  ],
  analytics: [
    "analytics.updated",
    "analytics.snapshot.created",
    "command.executed",
    "command.failed",
  ],
  system: [
    "bot.ready",
    "bot.shard.ready",
    "bot.shard.disconnected",
    "bot.shard.reconnected",
    "worker.started",
    "worker.failed",
    "api.health.changed",
  ],
} as const;

export type EventCategory = keyof typeof REALTIME_EVENTS;
export type RealtimeEventName = (typeof REALTIME_EVENTS)[EventCategory][number];

export const ALL_REALTIME_EVENTS: RealtimeEventName[] = Object.values(REALTIME_EVENTS).flat() as
  RealtimeEventName[];

export function isValidEventName(name: string): name is RealtimeEventName {
  return (ALL_REALTIME_EVENTS as string[]).includes(name);
}

export interface RealtimeEnvelope<T = unknown> {
  event: RealtimeEventName;
  guildId: string | null;
  timestamp: string;
  data: T;
  eventId: string;
  sequence?: number;
}

/** Webhook payload envelope (identical to realtime, signed via HMAC). */
export type WebhookEnvelope<T = unknown> = RealtimeEnvelope<T>;

export const WEBHOOK_HEADERS = {
  event: "X-Infera-Event",
  delivery: "X-Infera-Delivery",
  timestamp: "X-Infera-Timestamp",
  signature: "X-Infera-Signature",
} as const;
