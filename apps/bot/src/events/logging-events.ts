import { truncate } from "@infera/shared";
import type {
  GuildBan,
  GuildChannel,
  Message,
  PartialMessage,
  Role,
  VoiceState,
} from "discord.js";
import type { InferaClient } from "../client";
import { sendLog } from "../lib/logging";

export async function onMessageDelete(
  client: InferaClient,
  message: Message | PartialMessage,
): Promise<void> {
  const guild = message.guild;
  if (!guild) return;

  const fields: Array<{ name: string; value: string; inline?: boolean }> = [];
  if (message.author) fields.push({ name: "Author", value: `<@${message.author.id}>`, inline: true });
  fields.push({ name: "Channel", value: `<#${message.channelId}>`, inline: true });
  fields.push({
    name: "Content",
    value: truncate(message.content || (message.partial ? "(not cached)" : "(no content)"), 1024),
  });

  await sendLog(client, guild, "message_events", {
    title: "Message deleted",
    fields,
    color: 0xed4245,
  });
}

export async function onMessageUpdate(
  client: InferaClient,
  oldMessage: Message | PartialMessage,
  newMessage: Message | PartialMessage,
): Promise<void> {
  const guild = newMessage.guild;
  if (!guild || newMessage.author?.bot) return;
  if (oldMessage.partial || newMessage.partial) return;
  if (oldMessage.content === newMessage.content) return;

  await sendLog(client, guild, "message_events", {
    title: "Message edited",
    fields: [
      { name: "Author", value: `<@${newMessage.author.id}>`, inline: true },
      { name: "Channel", value: `<#${newMessage.channelId}>`, inline: true },
      { name: "Before", value: truncate(oldMessage.content || "(empty)", 1024) },
      { name: "After", value: truncate(newMessage.content || "(empty)", 1024) },
    ],
    color: 0xfee75c,
  });
}

export async function onChannelChange(
  client: InferaClient,
  channel: GuildChannel,
  action: "created" | "deleted" | "updated",
): Promise<void> {
  await sendLog(client, channel.guild, "channel_events", {
    title: `Channel ${action}`,
    description: `${channel.name} \`${channel.id}\``,
    color: action === "deleted" ? 0xed4245 : action === "created" ? 0x57f287 : 0x5865f2,
  });
}

export async function onRoleChange(
  client: InferaClient,
  role: Role,
  action: "created" | "deleted" | "updated",
): Promise<void> {
  await sendLog(client, role.guild, "role_events", {
    title: `Role ${action}`,
    description: `${role.name} <@&${role.id}>`,
    color: action === "deleted" ? 0xed4245 : action === "created" ? 0x57f287 : 0x5865f2,
  });
}

export async function onVoiceStateUpdate(
  client: InferaClient,
  oldState: VoiceState,
  newState: VoiceState,
): Promise<void> {
  const guild = newState.guild;
  const member = newState.member ?? oldState.member;
  if (!member || member.user.bot) return;
  if (oldState.channelId === newState.channelId) return;

  const fields: Array<{ name: string; value: string; inline?: boolean }> = [
    { name: "Member", value: `<@${member.id}>`, inline: true },
  ];

  if (!oldState.channelId && newState.channelId) {
    fields.push({ name: "Joined", value: `<#${newState.channelId}>`, inline: true });
  } else if (oldState.channelId && !newState.channelId) {
    fields.push({ name: "Left", value: `<#${oldState.channelId}>`, inline: true });
  } else {
    if (oldState.channelId) fields.push({ name: "From", value: `<#${oldState.channelId}>`, inline: true });
    if (newState.channelId) fields.push({ name: "To", value: `<#${newState.channelId}>`, inline: true });
  }

  await sendLog(client, guild, "voice_events", { title: "Voice activity", fields });
}

export async function onGuildBanAdd(client: InferaClient, ban: GuildBan): Promise<void> {
  await sendLog(client, ban.guild, "moderation_events", {
    title: "Member banned",
    description: `<@${ban.user.id}>`,
    color: 0xed4245,
  });
}

export async function onGuildBanRemove(client: InferaClient, ban: GuildBan): Promise<void> {
  await sendLog(client, ban.guild, "moderation_events", {
    title: "Member unbanned",
    description: `<@${ban.user.id}>`,
    color: 0x57f287,
  });
}
