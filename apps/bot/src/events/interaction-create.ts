import { CommandContext, registry } from "@infera/commands";
import { PermissionLevel, isPlatformOwner, createLogger } from "@infera/shared";
import type { Interaction } from "discord.js";
import type { InferaClient } from "../client";
import { runCommand } from "../lib/command-runner";
import { ensureGuild, readConfig } from "../lib/guilds";
import { toPermissionInput } from "../lib/permissions";
import { collectSlashArgs } from "../lib/slash-options";
import { handleTicketInteraction } from "../lib/ticket-interactions";

const log = createLogger("bot:interactions");

async function handleRoleComponent(
  client: InferaClient,
  interaction: Interaction,
): Promise<void> {
  if (!interaction.isButton() && !interaction.isStringSelectMenu()) return;
  if (!interaction.inCachedGuild()) return;
  const member = interaction.member;
  const me = interaction.guild.members.me;
  if (!me) return;

  const roleIds = interaction.isStringSelectMenu()
    ? interaction.values
    : [interaction.customId.split(":")[3] ?? ""];
  const added: string[] = [];
  const removed: string[] = [];
  const failed: string[] = [];

  for (const roleId of roleIds.filter(Boolean)) {
    const role = interaction.guild.roles.cache.get(roleId);
    if (!role || role.managed || role.id === interaction.guild.id || role.position >= me.roles.highest.position) {
      failed.push(roleId);
      continue;
    }
    try {
      if (member.roles.cache.has(role.id)) {
        await member.roles.remove(role, "Self role panel");
        removed.push(role.name);
      } else {
        await member.roles.add(role, "Self role panel");
        added.push(role.name);
      }
    } catch {
      failed.push(role.name);
    }
  }

  const lines = [
    added.length ? `Added: **${added.join(", ")}**` : "",
    removed.length ? `Removed: **${removed.join(", ")}**` : "",
    failed.length ? `Could not update: ${failed.length} role(s). Check my role position and Manage Roles.` : "",
  ].filter(Boolean);
  await interaction
    .reply({ content: lines.join("\n") || "No role changes were made.", ephemeral: true })
    .catch(() => undefined);
}

async function handleButton(client: InferaClient, interaction: Interaction): Promise<void> {
  if (!interaction.isButton() || !interaction.inCachedGuild()) return;
  const [scope, action, id] = interaction.customId.split(":");
  if (!scope || !action || !id) return;

  try {
    if (scope === "giveaway" && action === "enter") {
      const result = await client.services.giveaways.enter(id, interaction.user.id);
      await interaction.reply({
        content: result.entered
          ? `You are entered. Current entries: **${result.entries}**`
          : "You are already entered in that giveaway.",
        ephemeral: true,
      });
      return;
    }

    if (scope === "suggestion" && (action === "up" || action === "down")) {
      const result = await client.services.suggestions.vote(id, interaction.user.id, action === "up" ? 1 : -1);
      await interaction.reply({
        content: `Vote recorded. 👍 ${result.upvotes} · 👎 ${result.downvotes}`,
        ephemeral: true,
      });
      return;
    }

    if (scope === "ticket" && action === "open") {
      // Published from the dashboard ticket panel builder.
      const panel = await client.services.db.ticketPanel.findFirst({
        where: { id, guildId: interaction.guildId },
      });
      if (!panel) {
        await interaction.reply({ content: "This ticket panel no longer exists.", ephemeral: true });
        return;
      }
      await interaction.deferReply({ ephemeral: true });
      try {
        const ticket = await client.services.tickets.create({
          guildId: interaction.guildId,
          userId: interaction.user.id,
          subject: panel.title,
        });
        await interaction.editReply({ content: `Your ticket is ready: <#${ticket.channelId}>` });
      } catch (error) {
        const message = error instanceof Error ? error.message : "The ticket could not be created.";
        await interaction.editReply({ content: message });
      }
      return;
    }

    if (scope === "ticket" && action === "claim") {
      const ticket = await client.services.tickets.claim(interaction.guildId, id, interaction.user.id);
      await interaction.reply({ content: `Ticket **#${ticket.number}** claimed.`, ephemeral: true });
      return;
    }

    if (scope === "ticket" && action === "close") {
      const ticket = await client.services.tickets.get(interaction.guildId, id);
      const canClose =
        ticket.userId === interaction.user.id ||
        Boolean(interaction.memberPermissions?.has("ManageChannels"));
      if (!canClose) {
        await interaction.reply({ content: "Only the ticket owner or staff can close this ticket.", ephemeral: true });
        return;
      }
      await interaction.reply({ content: `Closing ticket **#${ticket.number}**…`, ephemeral: true });
      await client.services.tickets.close(interaction.guildId, id, interaction.user.id, "Closed with the ticket button");
      return;
    }
  } catch (error) {
    log.warn({ err: error, customId: interaction.customId }, "button interaction failed");
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: "That action could not be completed.", ephemeral: true }).catch(() => undefined);
    }
  }
}

export async function onInteractionCreate(
  client: InferaClient,
  interaction: Interaction,
): Promise<void> {
  if ((interaction.isButton() || interaction.isStringSelectMenu() || interaction.isModalSubmit()) && (await handleTicketInteraction(client, interaction))) {
    return;
  }
  if (interaction.isButton() || interaction.isStringSelectMenu()) {
    if (interaction.customId.startsWith("role:")) {
      await handleRoleComponent(client, interaction);
      return;
    }
  }
  if (interaction.isButton()) {
    await handleButton(client, interaction);
    return;
  }
  if (!interaction.isChatInputCommand()) return;
  if (!interaction.inCachedGuild() && interaction.inGuild()) return;

  const command = registry.get(interaction.commandName);
  if (!command) {
    await interaction
      .reply({ content: "That command is no longer available.", ephemeral: true })
      .catch(() => undefined);
    return;
  }

  const guild = interaction.inCachedGuild() ? interaction.guild : null;
  if (guild) {
    await ensureGuild(client, guild);

    const values = await readConfig(client, guild.id);
    if (values && values.str("general.command_mode", "hybrid") === "prefix" && !isPlatformOwner(interaction.user.id)) {
      await interaction
        .reply({
          content: `This server uses prefix commands. Try \`${values.str("general.prefix", ".")}${command.name}\`.`,
          ephemeral: true,
        })
        .catch(() => undefined);
      return;
    }

    if (!guild.members.cache.has(interaction.user.id)) {
      await guild.members.fetch(interaction.user.id).catch(() => null);
    }
  }

  const member = guild?.members.cache.get(interaction.user.id) ?? null;
  const level =
    guild && member
      ? await client.services.permissions
          .resolveLevel(guild.id, toPermissionInput(member))
          .catch(() => PermissionLevel.Member)
      : PermissionLevel.Member;

  const context = new CommandContext({
    client,
    services: client.services,
    roblox: client.roblox,
    source: "slash",
    interaction,
    args: collectSlashArgs(interaction, command),
    rawArgs: "",
    prefix: "/",
    level,
  });

  log.debug(
    { command: command.name, guildId: interaction.guildId, userId: interaction.user.id },
    "slash command",
  );
  await runCommand(client, command, context, "slash");
}
