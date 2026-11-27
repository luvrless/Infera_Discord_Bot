import { EmbedBuilder, type MessageReaction, type PartialMessageReaction, type PartialUser, type User } from "discord.js";
import { createLogger } from "@infera/shared";
import type { InferaClient } from "../client";
import { resolveSendableChannel } from "../lib/channels";
import { readConfig } from "../lib/guilds";

const log = createLogger("bot:starboard");

async function resolveReaction(
  reaction: MessageReaction | PartialMessageReaction,
): Promise<MessageReaction | null> {
  try {
    const full = reaction.partial ? await reaction.fetch() : reaction;
    if (full.message.partial) await full.message.fetch();
    return full;
  } catch {
    return null;
  }
}

/**
 * Keep a starboard entry in sync with the configured emoji. The source message
 * is never modified; only the starboard post is created or updated.
 */
export async function onReactionChange(
  client: InferaClient,
  reaction: MessageReaction | PartialMessageReaction,
  user: User | PartialUser,
  direction: "add" | "remove",
): Promise<void> {
  if (user.bot) return;
  const full = await resolveReaction(reaction);
  if (!full || !full.message.inGuild()) return;

  const guild = full.message.guild;
  if (!guild) return;

  const values = await readConfig(client, guild.id);
  if (!values || !values.bool("starboard.enabled")) return;

  const emoji = values.str("starboard.emoji", "⭐");
  const matches = full.emoji.name === emoji || full.emoji.toString() === emoji || (emoji === "⭐" && full.emoji.name === "⭐");
  if (!matches) return;
  if (values.bool("starboard.ignore_self_reactions", true) && full.message.author.id === user.id) return;

  const channel = await resolveSendableChannel(guild, values.id("starboard.channel_id"));
  if (!channel) return;

  const threshold = Math.max(1, values.num("starboard.threshold", 3));
  const count = full.count ?? 0;
  const existing = await client.services.db.starboardEntry
    .findUnique({
      where: { guildId_sourceMessageId: { guildId: guild.id, sourceMessageId: full.message.id } },
    })
    .catch(() => null);

  if (direction === "remove" && count < threshold) {
    if (existing?.starboardMessageId) {
      await channel.messages.delete(existing.starboardMessageId).catch(() => undefined);
      await client.services.db.starboardEntry.delete({ where: { id: existing.id } }).catch(() => undefined);
    }
    return;
  }
  if (count < threshold) return;

  const message = full.message;
  const jump = `https://discord.com/channels/${guild.id}/${message.channelId}/${message.id}`;
  const embed = new EmbedBuilder()
    .setColor(0xf5c542)
    .setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL({ size: 128 }) })
    .setDescription(
      `${message.content ? message.content.slice(0, 3500) : "*No text content*"}\n\n[Jump to message](${jump}) · <#${message.channelId}>`,
    )
    .setFooter({ text: `${emoji} ${count} · ${message.id}` })
    .setTimestamp(message.createdAt);
  const attachment = message.attachments.first();
  if (attachment && attachment.contentType?.startsWith("image/")) embed.setImage(attachment.url);

  try {
    if (existing?.starboardMessageId) {
      await channel.messages.edit(existing.starboardMessageId, { embeds: [embed] });
      await client.services.db.starboardEntry.update({
        where: { id: existing.id },
        data: { starCount: count },
      });
    } else {
      const posted = await channel.send({ embeds: [embed] });
      await client.services.db.starboardEntry.create({
        data: {
          guildId: guild.id,
          sourceChannelId: message.channelId,
          sourceMessageId: message.id,
          starboardMessageId: posted.id,
          authorId: message.author.id,
          content: message.content?.slice(0, 3500) ?? null,
          attachmentUrl: attachment?.url ?? null,
          starCount: count,
        },
      });
    }
    await client.services.realtime
      .publish(guild.id, "starboard.updated", { messageId: message.id, count, direction })
      .catch(() => undefined);
  } catch (error) {
    log.warn({ err: error, guildId: guild.id, messageId: message.id }, "starboard update failed");
  }
}
