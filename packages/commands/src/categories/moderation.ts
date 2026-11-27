import {
  DiscordPermissions,
  PermissionLevel,
  discordTimestamp,
  formatDuration,
  formatNumber,
  truncate,
} from "@infera/shared";
import { embed } from "../core/context";
import type { CommandDefinition } from "../core/types";

const Moderator = PermissionLevel.Moderator;

function reasonFrom(ctx: { args: string[] }, start = 1): string {
  return ctx.args.slice(start).join(" ").trim() || "No reason provided";
}

const moderation: CommandDefinition[] = [
  {
    name: "ban",
    description: "Ban a member from the server.",
    category: "moderation",
    level: Moderator,
    userPermissions: [DiscordPermissions.BanMembers],
    botPermissions: [DiscordPermissions.BanMembers],
    module: "moderation",
    usage: "ban <member> [reason]",
    examples: ["ban @user breaking the rules"],
    slash: true,
    slashOptions: [
      { name: "member", description: "Member to ban", type: "member", required: true },
      { name: "reason", description: "Reason for the ban", type: "string", required: false },
    ],
    async execute(ctx) {
      await ctx.defer();
      const guildId = ctx.requireGuild().id;
      const target = await ctx.resolveMember(ctx.args[0]);
      await ctx.checkHierarchy(target);
      await ctx.requireBotPermissions(DiscordPermissions.BanMembers);
      const reason = reasonFrom(ctx);
      const record = await ctx.services.moderation.ban(guildId, ctx.user.id, target.id, { reason });
      return ctx.ok(
        `${ctx.t("commands.moderation.ban.success", { user: target.user.tag })}\nCase **#${record.caseNumber}**`,
      );
    },
  },
  {
    name: "unban",
    description: "Remove a ban from a user.",
    category: "moderation",
    level: Moderator,
    userPermissions: [DiscordPermissions.BanMembers],
    botPermissions: [DiscordPermissions.BanMembers],
    module: "moderation",
    usage: "unban <userId> [reason]",
    slash: true,
    slashOptions: [
      { name: "user", description: "User ID to unban", type: "string", required: true },
      { name: "reason", description: "Reason", type: "string", required: false },
    ],
    async execute(ctx) {
      await ctx.defer();
      const guildId = ctx.requireGuild().id;
      const user = await ctx.resolveUser(ctx.args[0]);
      const reason = reasonFrom(ctx);
      const record = await ctx.services.moderation.unban(guildId, ctx.user.id, user.id, reason);
      return ctx.ok(`${ctx.t("commands.moderation.unban.success", { user: user.tag })}\nCase **#${record.caseNumber}**`);
    },
  },
  {
    name: "kick",
    description: "Kick a member from the server.",
    category: "moderation",
    level: Moderator,
    userPermissions: [DiscordPermissions.KickMembers],
    botPermissions: [DiscordPermissions.KickMembers],
    module: "moderation",
    usage: "kick <member> [reason]",
    slash: true,
    slashOptions: [
      { name: "member", description: "Member to kick", type: "member", required: true },
      { name: "reason", description: "Reason", type: "string", required: false },
    ],
    async execute(ctx) {
      await ctx.defer();
      const guildId = ctx.requireGuild().id;
      const target = await ctx.resolveMember(ctx.args[0]);
      await ctx.checkHierarchy(target);
      await ctx.requireBotPermissions(DiscordPermissions.KickMembers);
      const record = await ctx.services.moderation.kick(guildId, ctx.user.id, target.id, { reason: reasonFrom(ctx) });
      return ctx.ok(`${ctx.t("commands.moderation.kick.success", { user: target.user.tag })}\nCase **#${record.caseNumber}**`);
    },
  },
  {
    name: "softban",
    description: "Ban and immediately unban a member to delete their messages.",
    category: "moderation",
    level: Moderator,
    userPermissions: [DiscordPermissions.BanMembers],
    botPermissions: [DiscordPermissions.BanMembers],
    module: "moderation",
    usage: "softban <member> [reason]",
    slash: true,
    slashOptions: [
      { name: "member", description: "Member to softban", type: "member", required: true },
      { name: "reason", description: "Reason", type: "string", required: false },
    ],
    async execute(ctx) {
      await ctx.defer();
      const guildId = ctx.requireGuild().id;
      const target = await ctx.resolveMember(ctx.args[0]);
      await ctx.checkHierarchy(target);
      const record = await ctx.services.moderation.softban(guildId, ctx.user.id, target.id, {
        reason: reasonFrom(ctx),
      });
      return ctx.ok(`${ctx.t("commands.moderation.softban.success", { user: target.user.tag })}\nCase **#${record.caseNumber}**`);
    },
  },
  {
    name: "tempban",
    description: "Ban a member for a limited time.",
    category: "moderation",
    level: Moderator,
    userPermissions: [DiscordPermissions.BanMembers],
    botPermissions: [DiscordPermissions.BanMembers],
    module: "moderation",
    usage: "tempban <member> <duration> [reason]",
    examples: ["tempban @user 1d spamming"],
    slash: true,
    slashOptions: [
      { name: "member", description: "Member to ban", type: "member", required: true },
      { name: "duration", description: "Duration, e.g. 1h, 7d", type: "string", required: true },
      { name: "reason", description: "Reason", type: "string", required: false },
    ],
    async execute(ctx) {
      await ctx.defer();
      const guildId = ctx.requireGuild().id;
      const target = await ctx.resolveMember(ctx.args[0]);
      await ctx.checkHierarchy(target);
      const durationMs = ctx.duration(1);
      const record = await ctx.services.moderation.ban(guildId, ctx.user.id, target.id, {
        durationMs,
        reason: reasonFrom(ctx, 2),
      });
      return ctx.ok(
        `Banned **${target.user.tag}** for **${formatDuration(durationMs)}**.\nCase **#${record.caseNumber}**`,
      );
    },
  },
  {
    name: "massban",
    description: "Ban multiple users by ID.",
    category: "moderation",
    level: Moderator,
    userPermissions: [DiscordPermissions.BanMembers],
    botPermissions: [DiscordPermissions.BanMembers],
    module: "moderation",
    usage: "massban <id,id,id> [reason]",
    slash: true,
    slashOptions: [
      { name: "ids", description: "Comma-separated user IDs", type: "string", required: true },
      { name: "reason", description: "Reason", type: "string", required: false },
    ],
    async execute(ctx) {
      await ctx.defer();
      const guildId = ctx.requireGuild().id;
      const ids = (ctx.args[0] ?? "").split(/[,\s]+/).filter(Boolean).slice(0, 50);
      const reason = reasonFrom(ctx);
      const results: string[] = [];
      for (const id of ids) {
        try {
          await ctx.services.moderation.ban(guildId, ctx.user.id, id, { reason });
          results.push(`✅ ${id}`);
        } catch {
          results.push(`❌ ${id}`);
        }
      }
      return ctx.ok(truncate(results.join("\n"), 4000), "Mass ban results");
    },
  },
  {
    name: "timeout",
    description: "Time out a member.",
    category: "moderation",
    level: Moderator,
    userPermissions: [DiscordPermissions.ModerateMembers],
    botPermissions: [DiscordPermissions.ModerateMembers],
    module: "moderation",
    usage: "timeout <member> <duration> [reason]",
    examples: ["timeout @user 10m cool down"],
    slash: true,
    slashOptions: [
      { name: "member", description: "Member to time out", type: "member", required: true },
      { name: "duration", description: "Duration, e.g. 10m, 1h", type: "string", required: true },
      { name: "reason", description: "Reason", type: "string", required: false },
    ],
    async execute(ctx) {
      await ctx.defer();
      const guildId = ctx.requireGuild().id;
      const target = await ctx.resolveMember(ctx.args[0]);
      await ctx.checkHierarchy(target);
      const durationMs = ctx.duration(1);
      const record = await ctx.services.moderation.timeout(guildId, ctx.user.id, target.id, {
        durationMs,
        reason: reasonFrom(ctx, 2),
      });
      return ctx.ok(
        ctx.t("commands.moderation.timeout.success", {
          user: target.user.tag,
          duration: formatDuration(durationMs),
        }) + `\nCase **#${record.caseNumber}**`,
      );
    },
  },
  {
    name: "untimeout",
    description: "Remove a member's timeout.",
    category: "moderation",
    level: Moderator,
    userPermissions: [DiscordPermissions.ModerateMembers],
    botPermissions: [DiscordPermissions.ModerateMembers],
    module: "moderation",
    usage: "untimeout <member> [reason]",
    slash: true,
    slashOptions: [
      { name: "member", description: "Member to untimeout", type: "member", required: true },
      { name: "reason", description: "Reason", type: "string", required: false },
    ],
    async execute(ctx) {
      const guildId = ctx.requireGuild().id;
      const target = await ctx.resolveMember(ctx.args[0]);
      await ctx.services.moderation.untimeout(guildId, ctx.user.id, target.id, reasonFrom(ctx));
      return ctx.ok(ctx.t("commands.moderation.untimeout.success", { user: target.user.tag }));
    },
  },
  {
    name: "warn",
    description: "Warn a member and record a case.",
    category: "moderation",
    level: Moderator,
    userPermissions: [DiscordPermissions.ModerateMembers],
    module: "moderation",
    usage: "warn <member> <reason>",
    slash: true,
    slashOptions: [
      { name: "member", description: "Member to warn", type: "member", required: true },
      { name: "reason", description: "Reason", type: "string", required: true },
    ],
    async execute(ctx) {
      const guildId = ctx.requireGuild().id;
      const target = await ctx.resolveMember(ctx.args[0]);
      await ctx.checkHierarchy(target);
      const reason = ctx.args.slice(1).join(" ").trim();
      if (!reason) return ctx.error("A reason is required to warn a member.");
      const result = await ctx.services.moderation.warn(guildId, ctx.user.id, target.id, reason);
      return ctx.ok(
        ctx.t("commands.moderation.warn.success", { user: target.user.tag, count: result.count }) +
          (result.escalation ? `\nAutomatic escalation: **${result.escalation}**` : ""),
      );
    },
  },
  {
    name: "warnings",
    description: "List a member's active warnings.",
    category: "moderation",
    level: Moderator,
    module: "moderation",
    usage: "warnings [member]",
    slash: true,
    slashOptions: [{ name: "member", description: "Member to inspect", type: "member", required: false }],
    async execute(ctx) {
      const guildId = ctx.requireGuild().id;
      const target = ctx.args[0] ? await ctx.resolveMember(ctx.args[0]) : ctx.requireMember();
      const warnings = await ctx.services.moderation.listWarnings(guildId, target.id, true);
      if (warnings.length === 0) return ctx.ok(`**${target.user.tag}** has no active warnings.`);
      return ctx.reply({
        embeds: [
          embed({
            title: `Warnings · ${target.user.tag}`,
            description: truncate(
              warnings
                .map(
                  (warning, index) =>
                    `${index + 1}. ${warning.reason} — <@${warning.moderatorId}> · ${discordTimestamp(warning.createdAt, "R")}`,
                )
                .join("\n"),
              4096,
            ),
            footer: `${warnings.length} active warnings`,
          }),
        ],
      });
    },
  },
  {
    name: "clearwarnings",
    description: "Remove all active warnings from a member.",
    category: "moderation",
    level: Moderator,
    userPermissions: [DiscordPermissions.ModerateMembers],
    module: "moderation",
    usage: "clearwarnings <member>",
    slash: true,
    slashOptions: [{ name: "member", description: "Member whose warnings to clear", type: "member", required: true }],
    async execute(ctx) {
      const guildId = ctx.requireGuild().id;
      const target = await ctx.resolveMember(ctx.args[0]);
      const warnings = await ctx.services.moderation.listWarnings(guildId, target.id, true);
      for (const warning of warnings) {
        await ctx.services.moderation.removeWarning(guildId, ctx.user.id, warning.id);
      }
      return ctx.ok(`Cleared **${warnings.length}** warning(s) from **${target.user.tag}**.`);
    },
  },
  {
    name: "purge",
    description: "Bulk delete recent messages in this channel.",
    category: "moderation",
    level: Moderator,
    userPermissions: [DiscordPermissions.ManageMessages],
    botPermissions: [DiscordPermissions.ManageMessages],
    module: "moderation",
    usage: "purge <count> [member]",
    slash: true,
    slashOptions: [
      { name: "count", description: "Number of messages (1-1000)", type: "integer", required: true, min: 1, max: 1000 },
      { name: "member", description: "Only delete this member's messages", type: "member", required: false },
    ],
    async execute(ctx) {
      await ctx.defer();
      const guild = ctx.requireGuild();
      const channelId = ctx.channelId;
      if (!channelId) return ctx.error("This channel cannot be purged.");
      const count = Math.min(1000, Math.max(1, Number(ctx.args[0] ?? 10)));
      const filterMember = ctx.args[1] ? await ctx.resolveMember(ctx.args[1]) : null;
      const deleted = await ctx.services.moderation.purge(guild.id, channelId, ctx.user.id, count, filterMember?.id);
      return ctx.ok(ctx.t("commands.moderation.purge.success", { count: deleted }));
    },
  },
  {
    name: "slowmode",
    description: "Set slowmode for this channel.",
    category: "moderation",
    level: Moderator,
    userPermissions: [DiscordPermissions.ManageChannels],
    botPermissions: [DiscordPermissions.ManageChannels],
    module: "moderation",
    usage: "slowmode <duration|off>",
    slash: true,
    slashOptions: [{ name: "duration", description: "e.g. 10s, 1m, or off", type: "string", required: true }],
    async execute(ctx) {
      const guildId = ctx.requireGuild().id;
      const channelId = ctx.channelId;
      if (!channelId) return ctx.error("This channel cannot be modified.");
      const raw = (ctx.args[0] ?? "").toLowerCase();
      const seconds = raw === "off" || raw === "0" ? 0 : Math.round(ctx.duration(0) / 1000);
      await ctx.services.moderation.setSlowmode(guildId, channelId, seconds, ctx.user.id);
      return ctx.ok(
        seconds === 0
          ? "Slowmode disabled."
          : ctx.t("commands.moderation.slowmode.success", { duration: formatDuration(seconds * 1000), channel: `<#${channelId}>` }),
      );
    },
  },
  {
    name: "lock",
    description: "Lock this channel so members cannot send messages.",
    category: "moderation",
    level: Moderator,
    userPermissions: [DiscordPermissions.ManageChannels],
    botPermissions: [DiscordPermissions.ManageChannels],
    module: "moderation",
    slash: true,
    async execute(ctx) {
      const guildId = ctx.requireGuild().id;
      const channelId = ctx.channelId;
      if (!channelId) return ctx.error("This channel cannot be locked.");
      await ctx.services.moderation.setChannelLocked(guildId, channelId, true, ctx.user.id);
      return ctx.ok(ctx.t("commands.moderation.lock.success", { channel: `<#${channelId}>` }));
    },
  },
  {
    name: "unlock",
    description: "Unlock this channel.",
    category: "moderation",
    level: Moderator,
    userPermissions: [DiscordPermissions.ManageChannels],
    botPermissions: [DiscordPermissions.ManageChannels],
    module: "moderation",
    slash: true,
    async execute(ctx) {
      const guildId = ctx.requireGuild().id;
      const channelId = ctx.channelId;
      if (!channelId) return ctx.error("This channel cannot be unlocked.");
      await ctx.services.moderation.setChannelLocked(guildId, channelId, false, ctx.user.id);
      return ctx.ok(ctx.t("commands.moderation.unlock.success", { channel: `<#${channelId}>` }));
    },
  },
  {
    name: "hide",
    description: "Hide this channel from @everyone.",
    category: "moderation",
    level: Moderator,
    userPermissions: [DiscordPermissions.ManageChannels],
    botPermissions: [DiscordPermissions.ManageChannels],
    module: "moderation",
    slash: true,
    async execute(ctx) {
      const guildId = ctx.requireGuild().id;
      const channelId = ctx.channelId;
      if (!channelId) return ctx.error("This channel cannot be hidden.");
      await ctx.services.discord.setChannelPermission(channelId, guildId, {
        type: 0,
        deny: DiscordPermissions.ViewChannel.toString(),
      }, "Channel hidden");
      return ctx.ok(`Hid <#${channelId}>.`);
    },
  },
  {
    name: "unhide",
    description: "Make this channel visible to @everyone.",
    category: "moderation",
    level: Moderator,
    userPermissions: [DiscordPermissions.ManageChannels],
    botPermissions: [DiscordPermissions.ManageChannels],
    module: "moderation",
    slash: true,
    async execute(ctx) {
      const guildId = ctx.requireGuild().id;
      const channelId = ctx.channelId;
      if (!channelId) return ctx.error("This channel cannot be unhidden.");
      await ctx.services.discord.setChannelPermission(channelId, guildId, {
        type: 0,
        allow: DiscordPermissions.ViewChannel.toString(),
      }, "Channel unhidden");
      return ctx.ok(`Unhid <#${channelId}>.`);
    },
  },
  {
    name: "nickname",
    description: "Change a member's nickname.",
    category: "moderation",
    level: Moderator,
    userPermissions: [DiscordPermissions.ManageNicknames],
    botPermissions: [DiscordPermissions.ManageNicknames],
    module: "moderation",
    usage: "nickname <member> <name>",
    slash: true,
    slashOptions: [
      { name: "member", description: "Member to rename", type: "member", required: true },
      { name: "name", description: "New nickname", type: "string", required: true },
    ],
    async execute(ctx) {
      const guild = ctx.requireGuild();
      const target = await ctx.resolveMember(ctx.args[0]);
      await ctx.checkHierarchy(target);
      const name = ctx.args.slice(1).join(" ").slice(0, 32);
      await target.setNickname(name, `Changed by ${ctx.user.tag}`).catch(async () => {
        await ctx.services.discord.setNickname(guild.id, target.id, name, `Changed by ${ctx.user.tag}`);
      });
      return ctx.ok(`Renamed **${target.user.tag}** to **${name}**.`);
    },
  },
  {
    name: "resetnick",
    description: "Reset a member's nickname.",
    category: "moderation",
    level: Moderator,
    userPermissions: [DiscordPermissions.ManageNicknames],
    botPermissions: [DiscordPermissions.ManageNicknames],
    module: "moderation",
    slash: true,
    slashOptions: [{ name: "member", description: "Member to reset", type: "member", required: true }],
    async execute(ctx) {
      const target = await ctx.resolveMember(ctx.args[0]);
      await ctx.checkHierarchy(target);
      await target.setNickname(null, `Reset by ${ctx.user.tag}`);
      return ctx.ok(`Reset **${target.user.tag}**'s nickname.`);
    },
  },
  {
    name: "roleadd",
    description: "Add a role to a member.",
    category: "moderation",
    level: Moderator,
    userPermissions: [DiscordPermissions.ManageRoles],
    botPermissions: [DiscordPermissions.ManageRoles],
    module: "moderation",
    usage: "roleadd <member> <role>",
    slash: true,
    slashOptions: [
      { name: "member", description: "Member", type: "member", required: true },
      { name: "role", description: "Role to add", type: "role", required: true },
    ],
    async execute(ctx) {
      const target = await ctx.resolveMember(ctx.args[0]);
      const role = ctx.requireGuild().roles.cache.get(ctx.args[1] ?? "");
      if (!role) return ctx.error("Role not found.");
      const me = ctx.requireGuild().members.me;
      if (me && role.position >= me.roles.highest.position) return ctx.error("That role is higher than my highest role.");
      await target.roles.add(role, `Added by ${ctx.user.tag}`);
      return ctx.ok(`Added **${role.name}** to **${target.user.tag}**.`);
    },
  },
  {
    name: "roleremove",
    description: "Remove a role from a member.",
    category: "moderation",
    level: Moderator,
    userPermissions: [DiscordPermissions.ManageRoles],
    botPermissions: [DiscordPermissions.ManageRoles],
    module: "moderation",
    usage: "roleremove <member> <role>",
    slash: true,
    slashOptions: [
      { name: "member", description: "Member", type: "member", required: true },
      { name: "role", description: "Role to remove", type: "role", required: true },
    ],
    async execute(ctx) {
      const target = await ctx.resolveMember(ctx.args[0]);
      const role = ctx.requireGuild().roles.cache.get(ctx.args[1] ?? "");
      if (!role) return ctx.error("Role not found.");
      await target.roles.remove(role, `Removed by ${ctx.user.tag}`);
      return ctx.ok(`Removed **${role.name}** from **${target.user.tag}**.`);
    },
  },
  {
    name: "deafen",
    description: "Server-deafen a member in voice.",
    category: "moderation",
    level: Moderator,
    userPermissions: [DiscordPermissions.DeafenMembers],
    botPermissions: [DiscordPermissions.DeafenMembers],
    module: "moderation",
    slash: true,
    slashOptions: [{ name: "member", description: "Member", type: "member", required: true }],
    async execute(ctx) {
      const guildId = ctx.requireGuild().id;
      const target = await ctx.resolveMember(ctx.args[0]);
      await ctx.services.discord.setVoiceDeaf(guildId, target.id, true, `Deafened by ${ctx.user.tag}`);
      return ctx.ok(`Server-deafened **${target.user.tag}**.`);
    },
  },
  {
    name: "undeafen",
    description: "Remove a server deafen.",
    category: "moderation",
    level: Moderator,
    userPermissions: [DiscordPermissions.DeafenMembers],
    botPermissions: [DiscordPermissions.DeafenMembers],
    module: "moderation",
    slash: true,
    slashOptions: [{ name: "member", description: "Member", type: "member", required: true }],
    async execute(ctx) {
      const guildId = ctx.requireGuild().id;
      const target = await ctx.resolveMember(ctx.args[0]);
      await ctx.services.discord.setVoiceDeaf(guildId, target.id, false, `Undeafened by ${ctx.user.tag}`);
      return ctx.ok(`Undeafened **${target.user.tag}**.`);
    },
  },
  {
    name: "move",
    description: "Move a member to another voice channel.",
    category: "moderation",
    level: Moderator,
    userPermissions: [DiscordPermissions.MoveMembers],
    botPermissions: [DiscordPermissions.MoveMembers],
    module: "moderation",
    slash: true,
    slashOptions: [
      { name: "member", description: "Member", type: "member", required: true },
      { name: "channel", description: "Destination voice channel", type: "channel", required: true },
    ],
    async execute(ctx) {
      const guild = ctx.requireGuild();
      const target = await ctx.resolveMember(ctx.args[0]);
      const channel = guild.channels.cache.get(ctx.args[1] ?? "");
      if (!channel || !channel.isVoiceBased()) return ctx.error("Destination voice channel not found.");
      await ctx.services.discord.moveMember(guild.id, target.id, channel.id);
      return ctx.ok(`Moved **${target.user.tag}** to **${channel.name}**.`);
    },
  },
  {
    name: "disconnect",
    description: "Disconnect a member from voice.",
    category: "moderation",
    level: Moderator,
    userPermissions: [DiscordPermissions.MoveMembers],
    botPermissions: [DiscordPermissions.MoveMembers],
    module: "moderation",
    slash: true,
    slashOptions: [{ name: "member", description: "Member", type: "member", required: true }],
    async execute(ctx) {
      const guildId = ctx.requireGuild().id;
      const target = await ctx.resolveMember(ctx.args[0]);
      await ctx.services.discord.moveMember(guildId, target.id, null);
      return ctx.ok(`Disconnected **${target.user.tag}** from voice.`);
    },
  },
  {
    name: "modhistory",
    description: "Show a member's moderation history.",
    category: "moderation",
    level: Moderator,
    module: "moderation",
    slash: true,
    slashOptions: [{ name: "member", description: "Member", type: "member", required: true }],
    async execute(ctx) {
      const guildId = ctx.requireGuild().id;
      const target = await ctx.resolveMember(ctx.args[0]);
      const { cases, warnings } = await ctx.services.moderation.history(guildId, target.id);
      return ctx.reply({
        embeds: [
          embed({
            title: `Moderation history · ${target.user.tag}`,
            fields: [
              {
                name: `Cases (${cases.length})`,
                value: truncate(
                  cases
                    .slice(0, 15)
                    .map((record) => `#${record.caseNumber} ${record.type} — ${discordTimestamp(record.createdAt, "R")}`)
                    .join("\n") || "None",
                  1024,
                ),
              },
              {
                name: `Warnings (${warnings.length})`,
                value: truncate(
                  warnings
                    .slice(0, 15)
                    .map((warning) => `${warning.active ? "🟡" : "⚪"} ${warning.reason}`)
                    .join("\n") || "None",
                  1024,
                ),
              },
            ],
          }),
        ],
      });
    },
  },
  {
    name: "modstats",
    description: "Show moderation statistics for this server.",
    category: "moderation",
    level: Moderator,
    module: "moderation",
    slash: true,
    async execute(ctx) {
      const guildId = ctx.requireGuild().id;
      const stats = await ctx.services.moderation.stats(guildId);
      return ctx.reply({
        embeds: [
          embed({
            title: "Moderation statistics",
            fields: [
              { name: "Total cases", value: formatNumber(stats.total), inline: true },
              { name: "Last 30 days", value: formatNumber(stats.last30Days), inline: true },
              {
                name: "By type",
                value: stats.byType.map((row) => `${row.type}: ${row.count}`).join("\n") || "None",
              },
              {
                name: "Top moderators",
                value: stats.byModerator.map((row) => `<@${row.moderatorId}>: ${row.count}`).join("\n") || "None",
              },
            ],
          }),
        ],
      });
    },
  },
  {
    name: "case",
    description: "View a moderation case by number or ID.",
    category: "moderation",
    level: Moderator,
    module: "moderation",
    usage: "case <number>",
    slash: true,
    slashOptions: [{ name: "case", description: "Case number or ID", type: "string", required: true }],
    async execute(ctx) {
      const guildId = ctx.requireGuild().id;
      const record = await ctx.services.moderation.getCase(guildId, ctx.args[0] ?? "");
      return ctx.reply({
        embeds: [
          embed({
            title: `Case #${record.caseNumber}`,
            description: record.reason ?? "No reason provided",
            fields: [
              { name: "Type", value: record.type, inline: true },
              { name: "Target", value: `<@${record.targetId}>`, inline: true },
              { name: "Moderator", value: `<@${record.moderatorId}>`, inline: true },
              { name: "Status", value: record.status, inline: true },
              { name: "Created", value: discordTimestamp(record.createdAt, "F"), inline: true },
              ...(record.expiresAt ? [{ name: "Expires", value: discordTimestamp(record.expiresAt, "F"), inline: true }] : []),
            ],
          }),
        ],
      });
    },
  },
  {
    name: "cases",
    description: "List recent moderation cases.",
    category: "moderation",
    level: Moderator,
    module: "moderation",
    slash: true,
    slashOptions: [
      { name: "page", description: "Page number", type: "integer", required: false, min: 1 },
      { name: "type", description: "Filter by case type", type: "string", required: false },
    ],
    async execute(ctx) {
      const guildId = ctx.requireGuild().id;
      const page = Math.max(1, Number(ctx.args[0] ?? 1));
      const type = ctx.args[1];
      const result = await ctx.services.moderation.listCases(guildId, { page, pageSize: 10, ...(type ? { type } : {}) });
      return ctx.reply({
        embeds: [
          embed({
            title: "Moderation cases",
            description: truncate(
              result.rows
                .map(
                  (record) =>
                    `**#${record.caseNumber}** · ${record.type} · <@${record.targetId}> · ${discordTimestamp(record.createdAt, "R")}`,
                )
                .join("\n") || "No cases found.",
              4096,
            ),
            footer: `Page ${page} · ${result.total} total`,
          }),
        ],
      });
    },
  },
  {
    name: "casereason",
    description: "Update the reason on a moderation case.",
    category: "moderation",
    level: Moderator,
    module: "moderation",
    slash: true,
    slashOptions: [
      { name: "case", description: "Case number or ID", type: "string", required: true },
      { name: "reason", description: "New reason", type: "string", required: true },
    ],
    async execute(ctx) {
      const guildId = ctx.requireGuild().id;
      const record = await ctx.services.moderation.getCase(guildId, ctx.args[0] ?? "");
      const reason = ctx.args.slice(1).join(" ");
      await ctx.services.moderation.editCase(guildId, record.id, ctx.user.id, { reason });
      return ctx.ok(`Updated the reason for case **#${record.caseNumber}**.`);
    },
  },
  {
    name: "casevoid",
    description: "Void a moderation case.",
    category: "moderation",
    level: Moderator,
    module: "moderation",
    slash: true,
    slashOptions: [
      { name: "case", description: "Case number or ID", type: "string", required: true },
      { name: "reason", description: "Why the case is voided", type: "string", required: false },
    ],
    async execute(ctx) {
      const guildId = ctx.requireGuild().id;
      const record = await ctx.services.moderation.getCase(guildId, ctx.args[0] ?? "");
      await ctx.services.moderation.voidCase(guildId, record.id, ctx.user.id, ctx.args.slice(1).join(" "));
      return ctx.ok(ctx.t("commands.moderation.case.voided", { caseId: record.caseNumber }));
    },
  },
  {
    name: "modlog",
    description: "Set or view the moderation log channel.",
    category: "moderation",
    level: Moderator,
    module: "moderation",
    slash: true,
    slashOptions: [{ name: "channel", description: "Log channel", type: "channel", required: false }],
    async execute(ctx) {
      const guildId = ctx.requireGuild().id;
      if (!ctx.args[0]) {
        const current = await ctx.services.config.getValue<string | null>(guildId, "moderation.log_channel");
        return ctx.ok(current ? `Moderation logs go to <#${current}>.` : "No moderation log channel is set.");
      }
      const channelId = ctx.args[0].replace(/[<#>]/g, "");
      await ctx.services.config.update(guildId, { "moderation.log_channel": channelId }, ctx.user.id);
      return ctx.ok(`Moderation logs will be sent to <#${channelId}>.`);
    },
  },
];

export default moderation;
