import type {
  Guild,
  NewsChannel,
  StageChannel,
  TextChannel,
  ThreadChannel,
  VoiceChannel,
} from "discord.js";

export type SendableGuildChannel =
  | TextChannel
  | NewsChannel
  | ThreadChannel
  | VoiceChannel
  | StageChannel;

/** Resolve a channel ID to a channel that can carry messages. */
export async function resolveSendableChannel(
  guild: Guild,
  channelId: string | null,
): Promise<SendableGuildChannel | null> {
  if (!channelId) return null;
  const cached = guild.channels.cache.get(channelId);
  const channel = cached ?? (await guild.channels.fetch(channelId).catch(() => null));
  if (!channel || !channel.isTextBased()) return null;
  return channel as SendableGuildChannel;
}
