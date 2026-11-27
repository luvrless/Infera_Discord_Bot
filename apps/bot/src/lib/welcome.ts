import { createLogger } from "@infera/shared";
import type { GuildMember, PartialGuildMember } from "discord.js";
import type { InferaClient } from "../client";
import { resolveSendableChannel } from "./channels";
import { card, parseColor } from "./embeds";
import { applyPlaceholders } from "./placeholders";
import type { Values } from "./values";

const log = createLogger("bot:welcome");

async function deliver(
  client: InferaClient,
  member: GuildMember | PartialGuildMember,
  values: Values,
  prefix: "welcome" | "goodbye",
): Promise<void> {
  const channel = await resolveSendableChannel(
    member.guild,
    values.id(`${prefix}.channel_id`),
  );
  if (!channel) return;

  const message = applyPlaceholders(values.str(`${prefix}.message`), member);

  if (values.bool(`${prefix}.embed.enabled`)) {
    const title = applyPlaceholders(values.str(`${prefix}.embed.title`), member);
    const description = applyPlaceholders(values.str(`${prefix}.embed.description`), member) || message;
    await channel
      .send({
        embeds: [
          card({
            title: title || undefined,
            description,
            color: parseColor(values.str(`${prefix}.embed.color`, "#8B5CF6")),
            thumbnail: member.displayAvatarURL({ size: 256 }),
          }),
        ],
      })
      .catch((error: unknown) => log.warn({ err: error, guildId: member.guild.id }, `${prefix} embed failed`));
    return;
  }

  await channel
    .send({ content: message })
    .catch((error: unknown) => log.warn({ err: error, guildId: member.guild.id }, `${prefix} message failed`));
}

/** Send the guild's welcome message and optional DM. */
export async function sendWelcome(
  client: InferaClient,
  member: GuildMember,
  values: Values,
): Promise<void> {
  if (!values.bool("welcome.enabled")) return;
  await deliver(client, member, values, "welcome");

  if (values.bool("welcome.dm.enabled")) {
    const dm = values.str("welcome.dm.message");
    if (dm.length > 0) {
      await member
        .send({ content: applyPlaceholders(dm, member) })
        .catch(() => undefined);
    }
  }
}

/** Send the guild's goodbye message. */
export async function sendGoodbye(
  client: InferaClient,
  member: GuildMember | PartialGuildMember,
  values: Values,
): Promise<void> {
  if (!values.bool("goodbye.enabled")) return;
  await deliver(client, member, values, "goodbye");
}
