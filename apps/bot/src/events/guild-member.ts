import { createLogger, truncate } from "@infera/shared";
import type { GuildMember, PartialGuildMember } from "discord.js";
import type { InferaClient } from "../client";
import { enforceAntiRaid } from "../lib/antiraid";
import { ensureGuild, readConfig } from "../lib/guilds";
import { sendLog } from "../lib/logging";
import { sendGoodbye, sendWelcome } from "../lib/welcome";

const log = createLogger("bot:members");

export async function onGuildMemberAdd(
  client: InferaClient,
  member: GuildMember,
): Promise<void> {
  const guild = member.guild;
  await ensureGuild(client, guild);

  await client.services.analytics
    .recordMetric(guild.id, "memberJoins")
    .catch(() => undefined);

  if (await enforceAntiRaid(client, member)) return;

  const values = await readConfig(client, guild.id);
  const configRoles = values?.list("welcome.autoroles") ?? [];
  const storedRoles = await client.services.db.autorole
    .findMany({ where: { guildId: guild.id } })
    .catch(() => []);
  // The dashboard exposes autoroles in two places: the welcome form writes the
  // configuration key, while the roles page writes the Autorole table. Honour
  // both so a role selected in either place is actually granted.
  const roleIds = [...new Set([...configRoles, ...storedRoles.map((role) => role.roleId)])];
  if (roleIds.length > 0) {
    await member.roles
      .add(roleIds, "Autorole")
      .catch((error: unknown) =>
        log.warn({ err: error, guildId: guild.id }, "could not apply autoroles"),
      );
  }

  if (values) await sendWelcome(client, member, values);

  await client.services.realtime
    .publish(guild.id, "member.joined", {
      userId: member.id,
      username: member.user.username,
      memberCount: guild.memberCount,
    })
    .catch(() => undefined);

  await sendLog(client, guild, "member_events", {
    title: "Member joined",
    description: `${member.user.tag} (<@${member.id}>)`,
    fields: [
      { name: "Account created", value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true },
      { name: "Members", value: String(guild.memberCount), inline: true },
    ],
    color: 0x57f287,
  });
}

export async function onGuildMemberRemove(
  client: InferaClient,
  member: GuildMember | PartialGuildMember,
): Promise<void> {
  const guild = member.guild;
  const values = await readConfig(client, guild.id);
  if (!values) return;

  await sendGoodbye(client, member, values);
  await client.services.analytics
    .recordMetric(guild.id, "memberLeaves")
    .catch(() => undefined);

  await client.services.realtime
    .publish(guild.id, "member.left", { userId: member.id })
    .catch(() => undefined);

  await sendLog(client, guild, "member_events", {
    title: "Member left",
    description: `<@${member.id}>`,
    fields: [{ name: "Members", value: String(guild.memberCount), inline: true }],
    color: 0xed4245,
  });
}

export async function onGuildMemberUpdate(
  client: InferaClient,
  oldMember: GuildMember | PartialGuildMember,
  newMember: GuildMember,
): Promise<void> {
  if (!oldMember.partial && oldMember.nickname !== newMember.nickname) {
    await sendLog(client, newMember.guild, "member_events", {
      title: "Nickname changed",
      description: `<@${newMember.id}>`,
      fields: [
        { name: "Before", value: truncate(oldMember.nickname ?? "None", 1024), inline: true },
        { name: "After", value: newMember.nickname ?? "None", inline: true },
      ],
    });
  }

  const before = new Set(oldMember.roles.cache.keys());
  const after = new Set(newMember.roles.cache.keys());
  const added = [...after].filter((roleId) => !before.has(roleId) && roleId !== newMember.guild.id);
  const removed = [...before].filter((roleId) => !after.has(roleId) && roleId !== newMember.guild.id);

  if (added.length === 0 && removed.length === 0) return;

  await sendLog(client, newMember.guild, "member_events", {
    title: "Member roles updated",
    description: `<@${newMember.id}>`,
    fields: [
      ...(added.length ? [{ name: "Added", value: added.map((id) => `<@&${id}>`).join(" ").slice(0, 1024) }] : []),
      ...(removed.length ? [{ name: "Removed", value: removed.map((id) => `<@&${id}>`).join(" ").slice(0, 1024) }] : []),
    ],
  });
}
