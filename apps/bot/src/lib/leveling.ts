import { createLogger, randomInt } from "@infera/shared";
import type { Message } from "discord.js";
import type { InferaClient } from "../client";
import { resolveSendableChannel } from "./channels";
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

  const channel = await resolveSendableChannel(guild, values.id("leveling.announcement_channel"));
  if (!channel) return;

  const template = values.str(
    "leveling.announcement_message",
    "GG {user}, you reached level **{level}**!",
  );
  const content = template
    .split("{user}")
    .join(`<@${message.author.id}>`)
    .split("{level}")
    .join(String(result.level));

  await channel
    .send({ content, allowedMentions: { users: [message.author.id] } })
    .catch((error: unknown) => log.warn({ err: error }, "level up announcement failed"));
}
