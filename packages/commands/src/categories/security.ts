import {
  DiscordPermissions,
  PermissionLevel,
  formatNumber,
  truncate,
} from "@infera/shared";
import { embed } from "../core/context";
import type { CommandDefinition } from "../core/types";

const Admin = PermissionLevel.Admin;

function truthy(value: string | undefined): boolean | null {
  if (!value) return null;
  if (["on", "true", "yes", "enable", "enabled", "1"].includes(value.toLowerCase())) return true;
  if (["off", "false", "no", "disable", "disabled", "0"].includes(value.toLowerCase())) return false;
  return null;
}

const security: CommandDefinition[] = [
  {
    name: "antinuke",
    description: "Configure antinuke protection.",
    category: "security",
    level: Admin,
    userPermissions: [DiscordPermissions.Administrator],
    slash: true,
    slashOptions: [
      { name: "state", description: "on or off", type: "string", required: false },
      { name: "threshold", description: "Actions allowed in the window", type: "integer", required: false, min: 1, max: 50 },
      { name: "window", description: "Window in seconds", type: "integer", required: false, min: 3, max: 600 },
    ],
    async execute(ctx) {
      const guildId = ctx.requireGuild().id;
      const state = truthy(ctx.args[0]);
      if (state === null) {
        const values = await ctx.services.config.getValues(guildId);
        return ctx.reply({
          embeds: [
            embed({
              title: "Antinuke",
              description: values["security.antinuke.enabled"] ? "Antinuke is **enabled**." : "Antinuke is **disabled**.",
              fields: [
                { name: "Threshold", value: String(values["security.antinuke.threshold"]), inline: true },
                { name: "Window", value: `${values["security.antinuke.window_seconds"]}s`, inline: true },
                { name: "Action", value: String(values["security.antinuke.action"]), inline: true },
              ],
            }),
          ],
        });
      }
      const patch: Record<string, unknown> = { "security.antinuke.enabled": state };
      if (ctx.args[1]) patch["security.antinuke.threshold"] = Number(ctx.args[1]);
      if (ctx.args[2]) patch["security.antinuke.window_seconds"] = Number(ctx.args[2]);
      await ctx.services.config.update(guildId, patch, ctx.user.id);
      return ctx.ok(`Antinuke is now **${state ? "enabled" : "disabled"}**.`);
    },
  },
  {
    name: "antinukeconfig",
    description: "Show the antinuke configuration.",
    category: "security",
    level: Admin,
    slash: true,
    async execute(ctx) {
      const values = await ctx.services.config.getValues(ctx.requireGuild().id);
      return ctx.reply({
        embeds: [
          embed({
            title: "Antinuke configuration",
            fields: Object.entries(values)
              .filter(([key]) => key.startsWith("security.antinuke"))
              .map(([key, value]) => ({ name: key, value: String(value), inline: true })),
          }),
        ],
      });
    },
  },
  {
    name: "antiraid",
    description: "Configure antiraid protection.",
    category: "security",
    level: Admin,
    userPermissions: [DiscordPermissions.Administrator],
    slash: true,
    slashOptions: [
      { name: "state", description: "on or off", type: "string", required: false },
      { name: "threshold", description: "Joins allowed in the window", type: "integer", required: false, min: 2, max: 500 },
      { name: "window", description: "Window in seconds", type: "integer", required: false, min: 3, max: 600 },
      { name: "age", description: "Minimum account age in days", type: "integer", required: false, min: 0, max: 365 },
    ],
    async execute(ctx) {
      const guildId = ctx.requireGuild().id;
      const state = truthy(ctx.args[0]);
      if (state === null) {
        const values = await ctx.services.config.getValues(guildId);
        return ctx.reply({
          embeds: [
            embed({
              title: "Antiraid",
              description: values["security.antiraid.enabled"] ? "Antiraid is **enabled**." : "Antiraid is **disabled**.",
              fields: [
                { name: "Join threshold", value: String(values["security.antiraid.join_threshold"]), inline: true },
                { name: "Window", value: `${values["security.antiraid.window_seconds"]}s`, inline: true },
                { name: "Account age", value: `${values["security.antiraid.account_age_days"]}d`, inline: true },
              ],
            }),
          ],
        });
      }
      const patch: Record<string, unknown> = { "security.antiraid.enabled": state };
      if (ctx.args[1]) patch["security.antiraid.join_threshold"] = Number(ctx.args[1]);
      if (ctx.args[2]) patch["security.antiraid.window_seconds"] = Number(ctx.args[2]);
      if (ctx.args[3]) patch["security.antiraid.account_age_days"] = Number(ctx.args[3]);
      await ctx.services.config.update(guildId, patch, ctx.user.id);
      return ctx.ok(`Antiraid is now **${state ? "enabled" : "disabled"}**.`);
    },
  },
  {
    name: "antiraidconfig",
    description: "Show the antiraid configuration.",
    category: "security",
    level: Admin,
    slash: true,
    async execute(ctx) {
      const values = await ctx.services.config.getValues(ctx.requireGuild().id);
      return ctx.reply({
        embeds: [
          embed({
            title: "Antiraid configuration",
            fields: Object.entries(values)
              .filter(([key]) => key.startsWith("security.antiraid"))
              .map(([key, value]) => ({ name: key, value: String(value), inline: true })),
          }),
        ],
      });
    },
  },
  {
    name: "lockdown",
    description: "Lock every text channel in the server.",
    category: "security",
    level: Admin,
    userPermissions: [DiscordPermissions.Administrator],
    botPermissions: [DiscordPermissions.ManageChannels],
    slash: true,
    async execute(ctx) {
      await ctx.defer();
      const guild = ctx.requireGuild();
      const channels = guild.channels.cache.filter((channel) => channel.isTextBased() && !channel.isDMBased());
      let locked = 0;
      for (const channel of channels.values()) {
        try {
          await ctx.services.discord.setChannelPermission(
            channel.id,
            guild.id,
            { type: 0, deny: DiscordPermissions.SendMessages.toString() },
            `Lockdown by ${ctx.user.tag}`,
          );
          locked += 1;
        } catch {
          // Skip channels the bot cannot edit.
        }
      }
      await ctx.services.cache.set(`infera:guild:${guild.id}:lockdown`, true, 86_400);
      await ctx.services.realtime.publish(guild.id, "security.lockdown.created", { actorId: ctx.user.id });
      await ctx.services.audit.record({ guildId: guild.id, actorId: ctx.user.id, action: "security.lockdown", metadata: { locked } });
      return ctx.ok(ctx.t("security.lockdown.enabled", { user: ctx.user.tag }) + ` Locked **${locked}** channels.`);
    },
  },
  {
    name: "unlockdown",
    description: "Lift the server lockdown.",
    category: "security",
    level: Admin,
    userPermissions: [DiscordPermissions.Administrator],
    botPermissions: [DiscordPermissions.ManageChannels],
    slash: true,
    async execute(ctx) {
      await ctx.defer();
      const guild = ctx.requireGuild();
      const channels = guild.channels.cache.filter((channel) => channel.isTextBased() && !channel.isDMBased());
      let unlocked = 0;
      for (const channel of channels.values()) {
        try {
          await ctx.services.discord.setChannelPermission(
            channel.id,
            guild.id,
            { type: 0, allow: DiscordPermissions.SendMessages.toString() },
            `Lockdown lifted by ${ctx.user.tag}`,
          );
          unlocked += 1;
        } catch {
          // Skip channels the bot cannot edit.
        }
      }
      await ctx.services.cache.del(`infera:guild:${guild.id}:lockdown`);
      await ctx.services.realtime.publish(guild.id, "security.lockdown.removed", { actorId: ctx.user.id });
      await ctx.services.audit.record({ guildId: guild.id, actorId: ctx.user.id, action: "security.unlockdown", metadata: { unlocked } });
      return ctx.ok(ctx.t("security.lockdown.disabled", { user: ctx.user.tag }) + ` Unlocked **${unlocked}** channels.`);
    },
  },
  {
    name: "whitelist",
    description: "Manage users exempt from antinuke enforcement.",
    category: "security",
    level: Admin,
    usage: "whitelist <add|remove|list> [user]",
    slash: true,
    slashOptions: [
      { name: "action", description: "add, remove, or list", type: "string", required: true, choices: [{ name: "add", value: "add" }, { name: "remove", value: "remove" }, { name: "list", value: "list" }] },
      { name: "user", description: "User", type: "user", required: false },
    ],
    async execute(ctx) {
      const guildId = ctx.requireGuild().id;
      const action = (ctx.args[0] ?? "list").toLowerCase();
      const current = await ctx.services.config.getValue<string[]>(guildId, "security.whitelist");
      if (action === "list" || !ctx.args[1]) {
        return ctx.ok(current.length ? current.map((id) => `<@${id}>`).join(" ") : "The security whitelist is empty.");
      }
      const userId = (ctx.args[1].match(/\d{17,20}/) ?? [ctx.args[1]])[0]!;
      const next =
        action === "add"
          ? [...new Set([...current, userId])]
          : current.filter((id) => id !== userId);
      await ctx.services.config.update(guildId, { "security.whitelist": next }, ctx.user.id);
      return ctx.ok(`${action === "add" ? "Added" : "Removed"} <@${userId}> ${action === "add" ? "to" : "from"} the security whitelist.`);
    },
  },
  {
    name: "trust",
    description: "Manage trusted roles exempt from antinuke enforcement.",
    category: "security",
    level: Admin,
    usage: "trust <add|remove|list> [role]",
    slash: true,
    slashOptions: [
      { name: "action", description: "add, remove, or list", type: "string", required: true, choices: [{ name: "add", value: "add" }, { name: "remove", value: "remove" }, { name: "list", value: "list" }] },
      { name: "role", description: "Role", type: "role", required: false },
    ],
    async execute(ctx) {
      const guildId = ctx.requireGuild().id;
      const action = (ctx.args[0] ?? "list").toLowerCase();
      const current = await ctx.services.config.getValue<string[]>(guildId, "security.trusted_roles");
      if (action === "list" || !ctx.args[1]) {
        return ctx.ok(current.length ? current.map((id) => `<@&${id}>`).join(" ") : "No trusted roles are configured.");
      }
      const roleId = (ctx.args[1].match(/\d{17,20}/) ?? [ctx.args[1]])[0]!;
      const next = action === "add" ? [...new Set([...current, roleId])] : current.filter((id) => id !== roleId);
      await ctx.services.config.update(guildId, { "security.trusted_roles": next }, ctx.user.id);
      return ctx.ok(`${action === "add" ? "Added" : "Removed"} <@&${roleId}> ${action === "add" ? "to" : "from"} trusted roles.`);
    },
  },
  {
    name: "securitylog",
    description: "Set the security alert channel.",
    category: "security",
    level: Admin,
    slash: true,
    slashOptions: [{ name: "channel", description: "Alert channel", type: "channel", required: true }],
    async execute(ctx) {
      const channelId = (ctx.args[0] ?? "").replace(/[<#>]/g, "");
      if (!/^\d{17,20}$/.test(channelId)) return ctx.error("Provide a channel mention or ID.");
      await ctx.services.config.update(ctx.requireGuild().id, { "security.alert_channel": channelId }, ctx.user.id);
      return ctx.ok(`Security alerts will be sent to <#${channelId}>.`);
    },
  },
  {
    name: "securityscan",
    description: "Scan the server for dangerous permissions and risky configuration.",
    category: "security",
    level: Admin,
    userPermissions: [DiscordPermissions.Administrator],
    slash: true,
    async execute(ctx) {
      await ctx.defer();
      const guild = ctx.requireGuild();
      const adminRoles = guild.roles.cache.filter(
        (role) => role.id !== guild.id && role.permissions.has(DiscordPermissions.Administrator),
      );
      const adminMembers = guild.members.cache.filter(
        (member) => !member.user.bot && member.permissions.has(DiscordPermissions.Administrator),
      );
      const bots = guild.members.cache.filter((member) => member.user.bot);
      const webhooks = await guild.fetchWebhooks().catch(() => null);
      const findings: string[] = [];
      if (adminRoles.size > 3) findings.push(`⚠️ ${adminRoles.size} roles have Administrator.`);
      if (adminMembers.size > 3) findings.push(`⚠️ ${adminMembers.size} human members have Administrator.`);
      if (bots.size > 5) findings.push(`⚠️ ${bots.size} bots are present.`);
      if (webhooks && webhooks.size > 0) findings.push(`⚠️ ${webhooks.size} webhooks are configured.`);
      if (findings.length === 0) findings.push("✅ No obvious risks detected.");

      return ctx.reply({
        embeds: [
          embed({
            title: "Security scan",
            description: findings.join("\n"),
            fields: [
              {
                name: `Administrator roles (${adminRoles.size})`,
                value: truncate(adminRoles.map((role) => `<@&${role.id}>`).join(" ") || "None", 1024),
              },
              {
                name: `Administrator members (${adminMembers.size})`,
                value: truncate(adminMembers.map((member) => `<@${member.id}>`).join(" ") || "None", 1024),
              },
              { name: "Bots", value: formatNumber(bots.size), inline: true },
              { name: "Webhooks", value: formatNumber(webhooks?.size ?? 0), inline: true },
            ],
            footer: "Audit-log correlation is applied by the live antinuke engine",
          }),
        ],
      });
    },
  },
  {
    name: "verification",
    description: "Configure the verification role gate.",
    category: "security",
    level: Admin,
    slash: true,
    slashOptions: [
      { name: "state", description: "on or off", type: "string", required: true },
      { name: "role", description: "Role granted on verification", type: "role", required: false },
    ],
    async execute(ctx) {
      const guildId = ctx.requireGuild().id;
      const state = truthy(ctx.args[0]);
      if (state === null) return ctx.error("Use `on` or `off`.");
      const patch: Record<string, unknown> = { "security.verification_enabled": state };
      if (ctx.args[1]) patch["security.verification_role"] = ctx.args[1];
      await ctx.services.config.update(guildId, patch, ctx.user.id);
      return ctx.ok(`Verification is now **${state ? "enabled" : "disabled"}**.`);
    },
  },
  {
    name: "verify",
    description: "Verify yourself and receive the verification role.",
    category: "security",
    slash: true,
    async execute(ctx) {
      const guildId = ctx.requireGuild().id;
      const enabled = await ctx.services.config.getValue<boolean>(guildId, "security.verification_enabled");
      if (!enabled) return ctx.error("Verification is not enabled in this server.");
      const roleId = await ctx.services.config.getValue<string | null>(guildId, "security.verification_role");
      if (!roleId) return ctx.error("No verification role is configured.");
      const member = ctx.requireMember();
      await member.roles.add(roleId, "Verified");
      return ctx.ok("You are now verified. Welcome!");
    },
  },
  {
    name: "unverify",
    description: "Remove the verification role from a member.",
    category: "security",
    level: Admin,
    slash: true,
    slashOptions: [{ name: "member", description: "Member", type: "member", required: true }],
    async execute(ctx) {
      const guildId = ctx.requireGuild().id;
      const roleId = await ctx.services.config.getValue<string | null>(guildId, "security.verification_role");
      if (!roleId) return ctx.error("No verification role is configured.");
      const target = await ctx.resolveMember(ctx.args[0]);
      await target.roles.remove(roleId, `Unverified by ${ctx.user.tag}`);
      return ctx.ok(`Removed verification from **${target.user.tag}**.`);
    },
  },
];

export default security;
