import { createLogger, truncate } from "@infera/shared";
import { EmbedBuilder, type GuildMember } from "discord.js";
import type { InferaClient } from "../client";
import { resolveSendableChannel } from "./channels";
import { parseColor } from "./embeds";
import { applyPlaceholders } from "./placeholders";
import type { Values } from "./values";

const log = createLogger("bot:boost");
/** One announcement per member per minute, even if Discord reports a boost twice. */
const recent = new Map<string, number>();

export async function sendBoostNotification(client: InferaClient, member: GuildMember, values: Values): Promise<void> {
  if (!values.bool("boost.enabled")) return;
  const key = `${member.guild.id}:${member.id}`;
  const last = recent.get(key) ?? 0;
  if (Date.now() - last < 60_000) return;
  recent.set(key, Date.now());
  if (recent.size > 5000) recent.clear();

  const channel = await resolveSendableChannel(member.guild, values.id("boost.channel_id"));
  if (!channel) return;
  const fill = (text: string) => applyPlaceholders(text, member);
  const message = fill(values.str("boost.message"));

  if (!values.bool("boost.embed.enabled", true)) {
    await channel
      .send({ content: message, allowedMentions: { users: [member.id] } })
      .catch((error: unknown) => log.warn({ err: error, guildId: member.guild.id }, "boost message failed"));
    return;
  }

  const embed = new EmbedBuilder().setColor(parseColor(values.str("boost.embed.color", "#F47FFF"), 0xf47fff));
  const title = fill(values.str("boost.embed.title"));
  if (title) embed.setTitle(truncate(title, 256));
  embed.setDescription(truncate(fill(values.str("boost.embed.description")) || message, 4096));
  if (values.bool("boost.embed.avatar", true)) embed.setThumbnail(member.displayAvatarURL({ size: 256 }));
  const image = values.str("boost.embed.image").trim();
  if (/^https?:\/\//.test(image)) embed.setImage(image);
  const footer = fill(values.str("boost.embed.footer"));
  if (footer) embed.setFooter({ text: truncate(footer, 2048) });
  embed.setTimestamp(new Date());

  const mention = values.bool("boost.mention", true);
  await channel
    .send({
      content: mention ? (message || `<@${member.id}>`) : undefined,
      embeds: [embed],
      allowedMentions: { users: mention ? [member.id] : [] },
    })
    .catch((error: unknown) => log.warn({ err: error, guildId: member.guild.id }, "boost embed failed"));
}
