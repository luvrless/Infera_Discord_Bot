import { ChannelType, PermissionFlagsBits, type VoiceState } from "discord.js";
import { createLogger } from "@infera/shared";
import type { InferaClient } from "../client";
import { readConfig } from "../lib/guilds";

const log = createLogger("bot:voice");

/**
 * Join-to-create temporary voice channels. A channel created here is tracked in
 * the database so it is only deleted once it is empty and never touches normal
 * voice channels.
 */
export async function onTempVoice(client: InferaClient, oldState: VoiceState, newState: VoiceState): Promise<void> {
  if (!newState.guild || !newState.member || newState.member.user.bot) return;
  const guild = newState.guild;
  const values = await readConfig(client, guild.id);
  if (!values || !values.bool("voice.enabled")) return;
  const lobbyId = values.id("voice.lobby_channel_id");

  if (lobbyId && newState.channelId === lobbyId && oldState.channelId !== lobbyId) {
    const lobby = newState.channel;
    if (!lobby) return;
    try {
      const channel = await guild.channels.create({
        name: `${newState.member.user.username}'s channel`.slice(0, 100),
        type: ChannelType.GuildVoice,
        parent: values.id("voice.category_id") ?? lobby.parentId ?? undefined,
        userLimit: values.num("voice.default_limit", 0),
        bitrate: Math.min(guild.maximumBitrate, Math.max(8000, values.num("voice.default_bitrate", 64_000))),
        permissionOverwrites: values.bool("voice.allow_user_control", true)
          ? [
              {
                id: newState.member.id,
                allow: [PermissionFlagsBits.ManageChannels, PermissionFlagsBits.MoveMembers, PermissionFlagsBits.Connect],
              },
            ]
          : [],
        reason: `Temporary voice channel for ${newState.member.user.tag}`,
      });
      await client.services.db.voiceChannel
        .create({
          data: { guildId: guild.id, channelId: channel.id, ownerId: newState.member.id, limit: values.num("voice.default_limit", 0) },
        })
        .catch(() => undefined);
      await newState.member.voice.setChannel(channel, "Temporary voice channel").catch(() => undefined);
      await client.services.realtime
        .publish(guild.id, "voice.channel.created", { channelId: channel.id, ownerId: newState.member.id })
        .catch(() => undefined);
    } catch (error) {
      log.warn({ err: error, guildId: guild.id }, "could not create temporary voice channel");
    }
    return;
  }

  const leftId = oldState.channelId;
  if (!leftId || leftId === lobbyId) return;
  const left = oldState.channel;
  if (!left || left.type !== ChannelType.GuildVoice || left.members.size > 0) return;
  const tracked = await client.services.db.voiceChannel.findUnique({ where: { channelId: leftId } }).catch(() => null);
  if (!tracked) return;
  await left.delete("Temporary voice channel is empty").catch(() => undefined);
  await client.services.db.voiceChannel.delete({ where: { id: tracked.id } }).catch(() => undefined);
  await client.services.realtime
    .publish(guild.id, "voice.channel.deleted", { channelId: leftId })
    .catch(() => undefined);
}
