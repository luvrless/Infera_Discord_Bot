import { createLogger, formatNumber, progressBar, randomInt } from "@infera/shared";
import type { Message } from "discord.js";
import type { InferaClient } from "../client";
import { resolveSendableChannel, type SendableGuildChannel } from "./channels";
import { card, parseColor } from "./embeds";
import { readConfig } from "./guilds";

const log = createLogger("bot:leveling");

/** Grant message XP and announce level ups. Failures never block chat. */
export async function grantMessageXp(client: InferaClient, message: Message): Promise<void> {
  const guild = message.guild;
  if (!guild) return;

  const values = await readConfig(client, guild.id);
  if (!values || !values.bool("leveling.enabled", true)) return;

  const min = Math.max(0, values.num("leveling.message_xp_min", 15));
  const max = Math.max(0, values.num("leveling.message_xp_max", 25));
  const amount = randomInt(Math.min(min, max), Math.max(min, max));
  if (amount <= 0) return;

  const roleIds = message.member?.roles.cache.map((role) => role.id) ?? [];
  const result = await client.services.leveling
    .addXp(guild.id, message.author.id, amount, "message", { channelId: message.channelId, roleIds })
    .catch((error: unknown) => {
      log.warn({ err: error, guildId: guild.id }, "could not grant XP");
      return null;
    });
  if (!result?.leveledUp) return;

  // Announce in the configured channel, or where the member is chatting.
  const channel =
    (await resolveSendableChannel(guild, values.id("leveling.announcement_channel"))) ??
    (message.channel.isTextBased() && "send" in message.channel ? (message.channel as SendableGuildChannel) : null);
  if (!channel) return;

  const template = values.str(
    "leveling.announcement_message",
    "GG {user}, you reached level **{level}**!",
  );
  const text = template
    .split("{user}")
    .join(`<@${message.author.id}>`)
    .split("{level}")
    .join(String(result.level));

  // Level-up card, styled like the rank card.
  const rank = await client.services.leveling.getRank(guild.id, message.author.id).catch(() => null);
  const embed = card({
    title: `Level ${result.level} reached!`,
    description: text,
    color: parseColor(values.str("leveling.rank_card_color", "#8B5CF6")),
    thumbnail: message.member?.displayAvatarURL({ size: 256 }) ?? message.author.displayAvatarURL({ size: 256 }),
    fields: rank
      ? [
          { name: "Level", value: `${result.previousLevel} → **${result.level}**`, inline: true },
          { name: "Rank", value: `#${rank.rank} / ${rank.total}`, inline: true },
          { name: "Total XP", value: formatNumber(rank.totalXp), inline: true },
          {
            name: `Progress to level ${result.level + 1}`,
            value: `${progressBar(rank.currentLevelXp, rank.requiredXp, 14)} ${formatNumber(rank.currentLevelXp)}/${formatNumber(rank.requiredXp)} XP`,
          },
        ]
      : [{ name: "Level", value: `**${result.level}**`, inline: true }],
    footer: message.member?.displayName ?? message.author.username,
  });
  const background = values.str("leveling.rank_card_background", "");
  if (/^https:\/\//.test(background)) embed.setImage(background);

  await channel
    .send({ content: `<@${message.author.id}>`, embeds: [embed], allowedMentions: { users: [message.author.id] } })
    .catch((error: unknown) => log.warn({ err: error }, "level up announcement failed"));
}
