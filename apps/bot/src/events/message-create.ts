import { CommandContext, registry, tokenize } from "@infera/commands";
import { PermissionLevel, createLogger } from "@infera/shared";
import { EmbedBuilder, MessageType, type Guild, type Message } from "discord.js";
import type { InferaClient } from "../client";
import { runAutomod } from "../lib/automod";
import { runCommand } from "../lib/command-runner";
import { ensureGuild, readConfig } from "../lib/guilds";
import { sendBoostNotification } from "../lib/boost";
import { grantMessageXp } from "../lib/leveling";
import { toPermissionInput } from "../lib/permissions";

const log = createLogger("bot:messages");

function render(template: string, message: Message): string {
  return template
    .replaceAll("{user}", `<@${message.author.id}>`)
    .replaceAll("{username}", message.author.username)
    .replaceAll("{server}", message.guild?.name ?? "this server")
    .replaceAll("{channel}", `<#${message.channelId}>`);
}

async function runCustomCommand(
  client: InferaClient,
  message: Message,
  guild: Guild,
  name: string,
  level: PermissionLevel,
): Promise<boolean> {
  const command = await client.services.db.customCommand
    .findUnique({ where: { guildId_name: { guildId: guild.id, name } } })
    .catch(() => null);
  if (!command || !command.enabled) return false;
  if (level < command.level) return false;
  const text = render(command.response, message).slice(0, 2000);
  try {
    if (command.embed && message.channel.isSendable()) {
      await message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0x8b5cf6)
            .setDescription(text)
            .setFooter({ text: `/ ${command.name}` }),
        ],
      });
    } else {
      await message.reply({ content: text, allowedMentions: { repliedUser: false } });
    }
    void client.services.db.customCommand
      .update({ where: { id: command.id }, data: { uses: { increment: 1 } } })
      .catch(() => undefined);
  } catch (error) {
    log.warn({ err: error, guildId: guild.id, command: command.name }, "custom command reply failed");
  }
  return true;
}

async function runAutoresponders(client: InferaClient, message: Message, guild: Guild): Promise<void> {
  if (!message.content) return;
  const rows = await client.services.db.autoresponder
    .findMany({ where: { guildId: guild.id, enabled: true }, orderBy: { createdAt: "asc" } })
    .catch(() => []);
  if (rows.length === 0) return;
  const content = message.content.toLowerCase();
  const hit = rows.find((row) => {
    const trigger = row.trigger.toLowerCase();
    if (row.matchType === "exact") return content === trigger;
    if (row.matchType === "starts_with") return content.startsWith(trigger);
    return content.includes(trigger);
  });
  if (!hit) return;
  try {
    await message.reply({
      content: render(hit.response, message).slice(0, 2000),
      allowedMentions: { repliedUser: false },
    });
    void client.services.db.autoresponder
      .update({ where: { id: hit.id }, data: { uses: { increment: 1 } } })
      .catch(() => undefined);
  } catch (error) {
    log.warn({ err: error, guildId: guild.id, autoresponder: hit.id }, "autoresponder reply failed");
  }
}

const BOOST_TYPES = new Set<MessageType>([
  MessageType.GuildBoost,
  MessageType.GuildBoostTier1,
  MessageType.GuildBoostTier2,
  MessageType.GuildBoostTier3,
]);

export async function onMessageCreate(client: InferaClient, message: Message): Promise<void> {
  // Discord's own "X just boosted" system message also covers repeat boosts,
  // which don't change the member's premiumSince. Duplicates are suppressed.
  if (message.inGuild() && BOOST_TYPES.has(message.type) && message.member) {
    const values = await readConfig(client, message.guild.id).catch(() => null);
    if (values) await sendBoostNotification(client, message.member, values);
    return;
  }
  if (!message.inGuild() || message.author.bot || message.system) return;

  const guild = message.guild;
  await ensureGuild(client, guild);

  const outcome = await runAutomod(client, message);
  if (outcome) return;

  // Record ticket conversations so /ticketclose can produce a real transcript.
  if (
    message.channel.isTextBased() &&
    "name" in message.channel &&
    (message.channel.name?.startsWith("ticket-") || ("topic" in message.channel && message.channel.topic?.startsWith("Ticket for ")))
  ) {
    const ticket = await client.services.tickets.getByChannel(guild.id, message.channelId).catch(() => null);
    if (ticket) {
      await client.services.tickets
        .recordMessage(ticket.id, message.author.id, message.content)
        .catch(() => undefined);
    }
  }

  if (!message.author.bot) await grantMessageXp(client, message);

  const handled = await handlePrefixCommand(client, message, guild);
  if (!handled) await runAutoresponders(client, message, guild);
}

function stripPrefix(client: InferaClient, content: string, prefix: string): string | null {
  const botId = client.user?.id;
  if (botId) {
    for (const mention of [`<@${botId}>`, `<@!${botId}>`]) {
      if (content.startsWith(mention)) return content.slice(mention.length).trim();
    }
  }
  if (prefix.length > 0 && content.startsWith(prefix)) {
    return content.slice(prefix.length).trim();
  }
  return null;
}

async function handlePrefixCommand(
  client: InferaClient,
  message: Message,
  guild: Guild,
): Promise<boolean> {
  if (!message.content) return false;

  const values = await readConfig(client, guild.id);
  if (!values) return false;

  const mode = values.str("general.command_mode", "hybrid");
  if (mode === "slash") return false;

  const prefix = values.str("general.prefix", ".");
  const body = stripPrefix(client, message.content, prefix);
  if (body === null || body.length === 0) return false;

  const tokens = tokenize(body);
  const name = tokens.shift();
  if (!name) return false;

  const member = message.member ?? (await guild.members.fetch(message.author.id).catch(() => null));
  if (!member) return false;

  const level = await client.services.permissions
    .resolveLevel(guild.id, toPermissionInput(member))
    .catch(() => PermissionLevel.Member);

  const command = registry.get(name);
  if (!command) {
    await runCustomCommand(client, message, guild, name.toLowerCase(), level);
    return true;
  }

  const context = new CommandContext({
    client,
    services: client.services,
    roblox: client.roblox,
    source: "prefix",
    message,
    args: tokens,
    rawArgs: tokens.join(" "),
    prefix,
    level,
  });

  log.debug({ command: command.name, guildId: guild.id, userId: message.author.id }, "prefix command");
  await runCommand(client, command, context, "prefix");
  return true;
}
