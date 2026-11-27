import {
  AuditLogEvent,
  type GuildBan,
  type GuildChannel,
  type GuildMember,
  type PartialGuildMember,
  type Role,
} from "discord.js";
import type { InferaClient } from "../client";
import { auditAction } from "../lib/antinuke";

export async function onChannelDeleteForSecurity(
  client: InferaClient,
  channel: GuildChannel,
): Promise<void> {
  await auditAction(client, channel.guild, AuditLogEvent.ChannelDelete, channel.id);
}

export async function onRoleDeleteForSecurity(
  client: InferaClient,
  role: Role,
): Promise<void> {
  await auditAction(client, role.guild, AuditLogEvent.RoleDelete, role.id);
}

export async function onMemberRemoveForSecurity(
  client: InferaClient,
  member: GuildMember | PartialGuildMember,
): Promise<void> {
  await auditAction(client, member.guild, AuditLogEvent.MemberKick, null);
}

export async function onBanAddForSecurity(client: InferaClient, ban: GuildBan): Promise<void> {
  await auditAction(client, ban.guild, AuditLogEvent.MemberBanAdd, ban.user.id);
}

export async function onWebhooksUpdateForSecurity(
  client: InferaClient,
  channel: GuildChannel,
): Promise<void> {
  await auditAction(client, channel.guild, AuditLogEvent.WebhookUpdate, null);
}
