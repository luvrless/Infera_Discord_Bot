/**
 * Mirrors packages/shared/src/events.ts (REALTIME_EVENTS). Used for webhook
 * subscriptions and realtime cache invalidation.
 */
export const REALTIME_EVENTS: Record<string, string[]> = {
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
  leveling: ["leveling.xp.updated", "leveling.level.up", "leveling.reward.granted", "leveling.leaderboard.updated"],
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
  analytics: ["analytics.updated", "analytics.snapshot.created", "command.executed", "command.failed"],
  system: [
    "bot.ready",
    "bot.shard.ready",
    "bot.shard.disconnected",
    "bot.shard.reconnected",
    "worker.started",
    "worker.failed",
    "api.health.changed",
  ],
};

export const ALL_EVENTS = Object.values(REALTIME_EVENTS).flat();

export function eventLabel(name: string): string {
  return name.replace(/\./g, " · ").replace(/_/g, " ");
}

export function eventTone(name: string): "danger" | "warning" | "success" | "info" | "neutral" {
  if (name.startsWith("security.")) return "danger";
  if (name.startsWith("moderation.") || name.startsWith("automod.")) return "warning";
  if (name === "member.joined" || name.endsWith(".created") || name === "bot.ready") return "success";
  if (name.startsWith("config.") || name.startsWith("module.") || name.startsWith("command.")) return "info";
  return "neutral";
}
