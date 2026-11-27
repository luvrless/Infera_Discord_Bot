import { createLogger } from "@infera/shared";
import { EmbedBuilder, type Guild } from "discord.js";
import type { InferaClient } from "../client";
import { resolveSendableChannel } from "./channels";
import { Colors, parseColor } from "./embeds";
import { readConfig } from "./guilds";

const log = createLogger("bot:logging");

export type LogCategory =
  | "message_events"
  | "member_events"
  | "role_events"
  | "channel_events"
  | "voice_events"
  | "moderation_events"
  | "security_events"
  | "integration_events";

export interface LogPayload {
  title: string;
  description?: string;
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
  color?: number;
}

/** Deliver an entry to the guild's log channel, honouring every toggle. */
export async function sendLog(
  client: InferaClient,
  guild: Guild,
  category: LogCategory,
  payload: LogPayload,
): Promise<void> {
  const values = await readConfig(client, guild.id);
  if (!values) return;
  if (!values.bool("logging.enabled")) return;
  if (!values.bool(`logging.${category}`, true)) return;

  const channel = await resolveSendableChannel(guild, values.id("logging.channel_id"));
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setColor(payload.color ?? Colors.brand)
    .setTitle(payload.title.slice(0, 256))
    .setTimestamp(new Date());
  if (payload.description) embed.setDescription(payload.description.slice(0, 4096));
  if (payload.fields?.length) embed.addFields(payload.fields.slice(0, 25));

  await channel
    .send({ embeds: [embed] })
    .catch((error: unknown) => log.warn({ err: error, guildId: guild.id }, "log delivery failed"));
}

/** Security alerts use their own channel setting so they survive log changes. */
export async function sendSecurityAlert(
  client: InferaClient,
  guild: Guild,
  title: string,
  description: string,
  fields: Array<{ name: string; value: string; inline?: boolean }> = [],
): Promise<void> {
  const values = await readConfig(client, guild.id);
  if (!values) return;
  const channel = await resolveSendableChannel(guild, values.id("security.alert_channel"));
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setColor(Colors.danger)
    .setTitle(title.slice(0, 256))
    .setDescription(description.slice(0, 4096))
    .setTimestamp(new Date());
  if (fields.length) embed.addFields(fields.slice(0, 25));

  await channel
    .send({ embeds: [embed] })
    .catch((error: unknown) => log.warn({ err: error, guildId: guild.id }, "security alert failed"));

  await sendLog(client, guild, "security_events", {
    title,
    description,
    fields,
    color: parseColor("#ED4245"),
  });
}
