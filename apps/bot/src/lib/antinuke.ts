import { DiscordPermissions, createLogger, isPlatformOwner } from "@infera/shared";
import { AuditLogEvent, type Guild, type GuildMember } from "discord.js";
import type { InferaClient } from "../client";
import { readConfig } from "./guilds";
import { sendSecurityAlert } from "./logging";

const log = createLogger("bot:antinuke");

type AntinukeAction = "alert" | "remove_permissions" | "kick" | "ban";

const counters = new Map<string, number[]>();

function targetIdOf(target: unknown): string | null {
  if (!target || typeof target !== "object") return null;
  const id = (target as { id?: unknown }).id;
  return typeof id === "string" ? id : null;
}

/**
 * Correlate an audit-log entry with the actor and count destructive actions.
 * When the configured threshold is crossed the response is applied once.
 */
export async function auditAction(
  client: InferaClient,
  guild: Guild,
  type: AuditLogEvent,
  targetId: string | null,
): Promise<void> {
  const values = await readConfig(client, guild.id);
  if (!values || !values.bool("security.antinuke.enabled")) return;

  const logs = await guild.fetchAuditLogs({ type, limit: 6 }).catch(() => null);
  if (!logs) return;

  const entry = logs.entries.find(
    (row) =>
      Date.now() - row.createdTimestamp < 20_000 &&
      (targetId === null || targetIdOf(row.target) === targetId),
  );
  const executorId = entry?.executorId ?? entry?.executor?.id ?? null;
  if (!executorId) return;
  if (executorId === client.user?.id) return;
  if (executorId === guild.ownerId) return;
  if (isPlatformOwner(executorId)) return;
  if (values.list("security.whitelist").includes(executorId)) return;

  const member = await guild.members.fetch(executorId).catch(() => null);
  const trustedRoles = values.list("security.trusted_roles");
  if (member && trustedRoles.some((roleId) => member.roles.cache.has(roleId))) return;

  const windowMs = Math.max(3, values.num("security.antinuke.window_seconds", 10)) * 1_000;
  const threshold = Math.max(1, values.num("security.antinuke.threshold", 3));
  const key = `${guild.id}:${executorId}`;
  const cutoff = Date.now() - windowMs;
  const recent = [...(counters.get(key) ?? []).filter((timestamp) => timestamp >= cutoff), Date.now()];
  counters.set(key, recent);

  if (recent.length <= threshold) return;
  counters.delete(key);

  const action = values.str("security.antinuke.action", "alert") as AntinukeAction;
  await respond(client, guild, executorId, member, action, `${type} × ${recent.length}`);
}

async function respond(
  client: InferaClient,
  guild: Guild,
  executorId: string,
  member: GuildMember | null,
  action: AntinukeAction,
  detail: string,
): Promise<void> {
  await client.services.db.securityEvent
    .create({
      data: {
        guildId: guild.id,
        type: "antinuke",
        severity: "critical",
        actorId: executorId,
        detail: JSON.stringify({ detail, action }),
      },
    })
    .catch(() => undefined);

  await client.services.realtime
    .publish(guild.id, "security.antinuke.triggered", { executorId, detail, action })
    .catch(() => undefined);

  await client.services.audit
    .record({ guildId: guild.id, actorId: executorId, action: "security.antinuke", metadata: { detail } })
    .catch(() => undefined);

  await sendSecurityAlert(client, guild, "Antinuke triggered", detail, [
    { name: "Actor", value: `<@${executorId}>`, inline: true },
    { name: "Response", value: action, inline: true },
  ]);

  if (!member) return;

  try {
    if (action === "remove_permissions") {
      const dangerous = member.roles.cache.filter(
        (role) =>
          role.id !== guild.id &&
          !role.managed &&
          (role.permissions.has(DiscordPermissions.Administrator) ||
            role.permissions.has(DiscordPermissions.ManageGuild) ||
            role.permissions.has(DiscordPermissions.ManageRoles) ||
            role.permissions.has(DiscordPermissions.ManageChannels) ||
            role.permissions.has(DiscordPermissions.BanMembers) ||
            role.permissions.has(DiscordPermissions.KickMembers)),
      );
      if (dangerous.size > 0) {
        await member.roles.remove([...dangerous.values()], `Antinuke: ${detail}`);
      }
    } else if (action === "kick") {
      await member.kick(`Antinuke: ${detail}`);
    } else if (action === "ban") {
      await member.ban({ reason: `Antinuke: ${detail}` });
    }
  } catch (error) {
    log.warn({ err: error, guildId: guild.id, executorId }, "antinuke response failed");
  }
}
