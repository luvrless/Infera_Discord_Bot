import { DiscordPermissions, createLogger, truncate } from "@infera/shared";
import type { GuildMember, Message } from "discord.js";
import type { InferaClient } from "../client";
import { readConfig } from "./guilds";
import { sendLog } from "./logging";
import { Values } from "./values";

const log = createLogger("bot:automod");

export type AutomodAction = "delete" | "warn" | "timeout" | "kick" | "ban";

export interface AutomodOutcome {
  rule: string;
  action: AutomodAction;
  reason: string;
}

const INVITE_PATTERN = /(?:discord\.(?:gg|com\/invite)|discordapp\.com\/invite)\/[\w-]+/i;
const LINK_PATTERN = /https?:\/\/[^\s]+/i;
const PHISHING_PATTERN =
  /(steamcommunlty|steamcommunity\.(?:ru|su|gift)|discordgift|discord-gift|free-?nitro|nitro-?gift|gift-?nitro|airdrop-?claim|csgo-?skins?\.|tf2-?gift)/i;
const CUSTOM_EMOJI_PATTERN = /<a?:\w+:\d+>/g;
const UNICODE_EMOJI_PATTERN = /[\u{1f300}-\u{1faff}\u{2600}-\u{27bf}]/gu;

/** Recent message timestamps per guild, user and channel. */
const history = new Map<string, number[]>();

function prune(timestamps: number[], windowMs: number): number[] {
  const cutoff = Date.now() - windowMs;
  return timestamps.filter((timestamp) => timestamp >= cutoff);
}

/** Drop per-member spam history that can no longer contribute to a trigger. */
export function sweepAutomodHistory(): void {
  const cutoff = Date.now() - 10 * 60_000;
  for (const [key, timestamps] of history) {
    const recent = timestamps.filter((timestamp) => timestamp >= cutoff);
    if (recent.length === 0) history.delete(key);
    else history.set(key, recent);
  }
}

function isExempt(values: Values, member: GuildMember, channelId: string | null): boolean {
  if (member.permissions.has(DiscordPermissions.Administrator)) return true;
  if (member.permissions.has(DiscordPermissions.ManageMessages)) return true;
  if (channelId && values.list("automod.exempt_channels").includes(channelId)) return true;
  if (values.list("automod.exempt_roles").some((roleId) => member.roles.cache.has(roleId))) return true;
  return false;
}

function detect(values: Values, message: Message, content: string): AutomodOutcome | null {
  const userId = message.author.id;

  if (values.bool("automod.anti_spam.enabled")) {
    const threshold = values.num("automod.anti_spam.threshold", 5);
    const windowMs = Math.max(1, values.num("automod.anti_spam.window_seconds", 5)) * 1_000;
    const key = `${message.guildId}:${userId}:${message.channelId}`;
    const timestamps = prune([...(history.get(key) ?? []), Date.now()], windowMs);
    history.set(key, timestamps);
    if (timestamps.length >= threshold) {
      return {
        rule: "anti_spam",
        action: readAction(values, "automod.anti_spam.action", "delete"),
        reason: `Sending messages too quickly (${timestamps.length} in ${windowMs / 1000}s)`,
      };
    }
  }

  if (values.bool("automod.anti_phishing.enabled") && PHISHING_PATTERN.test(content)) {
    return {
      rule: "anti_phishing",
      action: "delete",
      reason: "Posting a known phishing or scam link",
    };
  }

  if (values.bool("automod.anti_invite.enabled") && INVITE_PATTERN.test(content)) {
    return {
      rule: "anti_invite",
      action: readAction(values, "automod.anti_invite.action", "delete"),
      reason: "Posting a Discord invite",
    };
  }

  if (values.bool("automod.anti_link.enabled") && LINK_PATTERN.test(content)) {
    return {
      rule: "anti_link",
      action: readAction(values, "automod.anti_link.action", "delete"),
      reason: "Posting an external link",
    };
  }

  if (values.bool("automod.anti_caps.enabled")) {
    const letters = content.replace(/[^a-zA-Z]/g, "");
    if (letters.length >= 10) {
      const capitals = letters.replace(/[^A-Z]/g, "").length;
      const ratio = (capitals / letters.length) * 100;
      const threshold = values.num("automod.anti_caps.threshold", 70);
      if (ratio >= threshold) {
        return { rule: "anti_caps", action: "delete", reason: `Excessive capitalisation (${Math.round(ratio)}%)` };
      }
    }
  }

  if (values.bool("automod.anti_emoji.enabled")) {
    const custom = content.match(CUSTOM_EMOJI_PATTERN)?.length ?? 0;
    const unicode = content.match(UNICODE_EMOJI_PATTERN)?.length ?? 0;
    if (custom + unicode > 8) {
      return { rule: "anti_emoji", action: "delete", reason: "Emoji spam" };
    }
  }

  if (values.bool("automod.anti_mention.enabled")) {
    const mentions = message.mentions.users.size + message.mentions.roles.size;
    if (mentions > 5) {
      return { rule: "anti_mention", action: "delete", reason: `Mass mentions (${mentions})` };
    }
  }

  if (values.bool("automod.bad_words.enabled")) {
    const lower = content.toLowerCase();
    const word = values
      .list("automod.bad_words.list")
      .find((entry) => entry.length > 0 && lower.includes(entry.toLowerCase()));
    if (word) {
      return { rule: "bad_words", action: "delete", reason: "Using a filtered word" };
    }
  }

  if (values.bool("automod.regex.enabled")) {
    for (const pattern of values.list("automod.regex.patterns")) {
      if (pattern.length > 500) continue;
      try {
        if (new RegExp(pattern, "i").test(content)) {
          return { rule: "regex", action: "delete", reason: "Matching a custom filter" };
        }
      } catch {
        // An invalid administrator-supplied pattern is skipped, never thrown.
      }
    }
  }

  return null;
}

function readAction(values: Values, key: string, fallback: AutomodAction): AutomodAction {
  const value = values.str(key, fallback);
  return ["delete", "warn", "timeout", "kick", "ban"].includes(value)
    ? (value as AutomodAction)
    : fallback;
}

async function apply(
  client: InferaClient,
  message: Message,
  outcome: AutomodOutcome,
): Promise<void> {
  const guild = message.guild;
  if (!guild) return;
  const actorId = client.user?.id ?? "0";

  await message.delete().catch(() => undefined);

  if (outcome.action !== "delete" && actorId !== "0") {
    try {
      switch (outcome.action) {
        case "warn":
          await client.services.moderation.warn(guild.id, actorId, message.author.id, outcome.reason);
          break;
        case "timeout":
          await client.services.moderation.timeout(guild.id, actorId, message.author.id, {
            durationMs: 10 * 60 * 1_000,
            reason: outcome.reason,
          });
          break;
        case "kick":
          await client.services.moderation.kick(guild.id, actorId, message.author.id, {
            reason: outcome.reason,
          });
          break;
        case "ban":
          await client.services.moderation.ban(guild.id, actorId, message.author.id, {
            reason: outcome.reason,
          });
          break;
        default:
          break;
      }
    } catch (error) {
      log.warn(
        { err: error, rule: outcome.rule, guildId: guild.id, userId: message.author.id },
        "automod action failed",
      );
    }
  }

  await client.services.realtime
    .publish(guild.id, "automod.rule.triggered", {
      rule: outcome.rule,
      action: outcome.action,
      userId: message.author.id,
      channelId: message.channelId,
    })
    .catch(() => undefined);
  await client.services.analytics.recordMetric(guild.id, "automod").catch(() => undefined);

  await sendLog(client, guild, "moderation_events", {
    title: `Automod · ${outcome.rule}`,
    description: truncate(outcome.reason, 1000),
    fields: [
      { name: "Member", value: `<@${message.author.id}>`, inline: true },
      { name: "Channel", value: `<#${message.channelId}>`, inline: true },
      { name: "Action", value: outcome.action, inline: true },
      { name: "Message", value: truncate(message.content || "(no content)", 1024) },
    ],
    color: 0xed4245,
  });
}

/**
 * Evaluate a message against every enabled automod rule. Returns the outcome
 * when a rule fired, otherwise null.
 */
export async function runAutomod(
  client: InferaClient,
  message: Message,
): Promise<AutomodOutcome | null> {
  const guild = message.guild;
  const member = message.member;
  if (!guild || !member) return null;

  const values = await readConfig(client, guild.id);
  if (!values || !values.bool("automod.enabled")) return null;
  if (isExempt(values, member, message.channelId)) return null;

  const content = message.content ?? "";
  if (!content) return null;

  const outcome = detect(values, message, content);
  if (!outcome) return null;

  await apply(client, message, outcome);
  return outcome;
}
