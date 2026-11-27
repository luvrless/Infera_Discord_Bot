import { createLogger } from "@infera/shared";
import type { GuildMember } from "discord.js";
import type { InferaClient } from "../client";
import { readConfig } from "./guilds";
import { sendSecurityAlert } from "./logging";

const log = createLogger("bot:antiraid");

const joins = new Map<string, number[]>();
const lastAlert = new Map<string, number>();

/**
 * Gate new joins. Returns true when the member was removed, so the caller can
 * skip welcome messages and autoroles.
 */
export async function enforceAntiRaid(
  client: InferaClient,
  member: GuildMember,
): Promise<boolean> {
  const guild = member.guild;
  const values = await readConfig(client, guild.id);
  if (!values || !values.bool("security.antiraid.enabled")) return false;

  const windowMs = Math.max(3, values.num("security.antiraid.window_seconds", 10)) * 1_000;
  const threshold = Math.max(2, values.num("security.antiraid.join_threshold", 10));
  const minimumAgeDays = values.num("security.antiraid.account_age_days", 7);

  if (minimumAgeDays > 0) {
    const ageMs = Date.now() - member.user.createdTimestamp;
    if (ageMs < minimumAgeDays * 86_400_000) {
      await member
        .kick(`Antiraid: account younger than ${minimumAgeDays} day(s)`)
        .catch((error: unknown) => log.warn({ err: error, userId: member.id }, "antiraid kick failed"));
      await record(client, guild.id, member.id, `Account created ${Math.floor(ageMs / 86_400_000)} day(s) ago`);
      return true;
    }
  }

  const cutoff = Date.now() - windowMs;
  const recent = [...(joins.get(guild.id) ?? []).filter((timestamp) => timestamp >= cutoff), Date.now()];
  joins.set(guild.id, recent);

  if (recent.length > threshold) {
    const last = lastAlert.get(guild.id) ?? 0;
    if (Date.now() - last > 30_000) {
      lastAlert.set(guild.id, Date.now());
      await record(client, guild.id, member.id, `${recent.length} joins within ${windowMs / 1000}s`);
    }
  }

  return false;
}

async function record(
  client: InferaClient,
  guildId: string,
  userId: string,
  detail: string,
): Promise<void> {
  const guild = client.guilds.cache.get(guildId);
  await client.services.db.securityEvent
    .create({
      data: {
        guildId,
        type: "antiraid",
        severity: "high",
        actorId: userId,
        detail: JSON.stringify({ detail }),
      },
    })
    .catch(() => undefined);

  await client.services.realtime
    .publish(guildId, "security.antiraid.triggered", { userId, detail })
    .catch(() => undefined);

  if (guild) {
    await sendSecurityAlert(client, guild, "Antiraid triggered", detail, [
      { name: "Member", value: `<@${userId}>`, inline: true },
    ]);
  }
}
