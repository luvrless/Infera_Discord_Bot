import { PermissionLevel, formatNumber, truncate } from "@infera/shared";
import { embed } from "../core/context";
import type { CommandDefinition } from "../core/types";

const Admin = PermissionLevel.Admin;

function truthy(value: string | undefined): boolean | null {
  if (!value) return null;
  if (["on", "true", "yes", "enable", "enabled", "1"].includes(value.toLowerCase())) return true;
  if (["off", "false", "no", "disable", "disabled", "0"].includes(value.toLowerCase())) return false;
  return null;
}

async function setValue(ctx: Parameters<CommandDefinition["execute"]>[0], key: string, value: unknown) {
  const guildId = ctx.requireGuild().id;
  await ctx.services.config.update(guildId, { [key]: value }, ctx.user.id);
  return guildId;
}

function configFields(values: Record<string, unknown>, prefix: string) {
  return Object.entries(values)
    .filter(([key]) => key.startsWith(prefix))
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(0, 25)
    .map(([key, value]) => ({
      name: key,
      value: truncate(typeof value === "object" ? JSON.stringify(value) : String(value), 1024) || "—",
      inline: true,
    }));
}

const configuration: CommandDefinition[] = [
  {
    name: "prefix",
    description: "View or change the command prefix.",
    category: "configuration",
    level: Admin,
    usage: "prefix [new prefix]",
    slash: true,
    slashOptions: [{ name: "prefix", description: "New prefix (max 5 characters)", type: "string", required: false }],
    async execute(ctx) {
      const guildId = ctx.requireGuild().id;
      const next = ctx.args[0];
      if (!next) {
        const current = await ctx.services.config.getValue<string>(guildId, "general.prefix");
        return ctx.ok(`The current prefix is \`${current}\`.`);
      }
      if (next.length > 5 || /\s/.test(next)) return ctx.error("The prefix must be 1-5 characters with no spaces.");
      await ctx.services.config.update(guildId, { "general.prefix": next }, ctx.user.id);
      return ctx.ok(ctx.t("config.prefix.updated", { prefix: next }));
    },
  },
  {
    name: "language",
    description: "View or change the server language.",
    category: "configuration",
    level: Admin,
    slash: true,
    slashOptions: [{ name: "language", description: "Language code", type: "string", required: false }],
    async execute(ctx) {
      const guildId = ctx.requireGuild().id;
      if (!ctx.args[0]) {
        const language = await ctx.services.config.getValue<string>(guildId, "general.language");
        return ctx.ok(`The current language is **${language}**.`);
      }
      await ctx.services.config.update(guildId, { "general.language": ctx.args[0] }, ctx.user.id);
      return ctx.ok(ctx.t("config.language.updated", { language: ctx.args[0] }));
    },
  },
  {
    name: "timezone",
    description: "View or change the server timezone.",
    category: "configuration",
    level: Admin,
    slash: true,
    slashOptions: [{ name: "timezone", description: "IANA timezone, e.g. Europe/London", type: "string", required: false }],
    async execute(ctx) {
      const guildId = ctx.requireGuild().id;
      const next = ctx.args[0];
      if (!next) {
        const timezone = await ctx.services.config.getValue<string>(guildId, "general.timezone");
        return ctx.ok(`The current timezone is **${timezone}**.`);
      }
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: next });
      } catch {
        return ctx.error("That is not a valid IANA timezone.");
      }
      await ctx.services.config.update(guildId, { "general.timezone": next }, ctx.user.id);
      return ctx.ok(ctx.t("config.timezone.updated", { timezone: next }));
    },
  },
  {
    name: "serverconfig",
    description: "Show the server's core configuration.",
    category: "configuration",
    level: Admin,
    slash: true,
    async execute(ctx) {
      const guildId = ctx.requireGuild().id;
      const values = await ctx.services.config.getValues(guildId);
      return ctx.reply({
        embeds: [
          embed({
            title: "Server configuration",
            fields: [
              { name: "Prefix", value: `\`${values["general.prefix"]}\``, inline: true },
              { name: "Language", value: String(values["general.language"]), inline: true },
              { name: "Timezone", value: String(values["general.timezone"]), inline: true },
              { name: "Command mode", value: String(values["general.command_mode"]), inline: true },
              { name: "Moderation", value: values["moderation.enabled"] ? "Enabled" : "Disabled", inline: true },
              { name: "Automod", value: values["automod.enabled"] ? "Enabled" : "Disabled", inline: true },
              { name: "Leveling", value: values["leveling.enabled"] ? "Enabled" : "Disabled", inline: true },
              { name: "Economy", value: values["economy.enabled"] ? "Enabled" : "Disabled", inline: true },
              { name: "Tickets", value: values["tickets.enabled"] ? "Enabled" : "Disabled", inline: true },
            ],
            footer: "Use the dashboard API for the full configuration",
          }),
        ],
      });
    },
  },
  {
    name: "serverreset",
    description: "Reset a configuration section to defaults.",
    category: "configuration",
    level: Admin,
    slash: true,
    slashOptions: [{ name: "section", description: "Section to reset, e.g. welcome", type: "string", required: false }],
    async execute(ctx) {
      const guildId = ctx.requireGuild().id;
      const section = ctx.args[0] ?? null;
      await ctx.services.config.reset(guildId, section, ctx.user.id);
      return ctx.ok(ctx.t("config.reset"));
    },
  },
  {
    name: "module",
    description: "Enable or disable a module.",
    category: "configuration",
    level: Admin,
    usage: "module <module> <on|off>",
    slash: true,
    slashOptions: [
      { name: "module", description: "Module id", type: "string", required: true },
      { name: "state", description: "Enable or disable", type: "string", required: true, choices: [{ name: "on", value: "on" }, { name: "off", value: "off" }] },
    ],
    async execute(ctx) {
      const guildId = ctx.requireGuild().id;
      const moduleId = (ctx.args[0] ?? "").toLowerCase();
      const state = truthy(ctx.args[1]);
      if (state === null) return ctx.error("Use `on` or `off`.");
      const module = await ctx.services.config.setModule(guildId, moduleId, state, ctx.user.id);
      return ctx.ok(`The **${module.name}** module is now **${state ? "enabled" : "disabled"}**.`);
    },
  },
  {
    name: "modules",
    description: "List every module and its status.",
    category: "configuration",
    slash: true,
    async execute(ctx) {
      const guildId = ctx.requireGuild().id;
      const modules = await ctx.services.config.getModules(guildId);
      return ctx.reply({
        embeds: [
          embed({
            title: "Modules",
            description: modules
              .map((module) => `${module.enabled ? "🟢" : "🔴"} **${module.name}** \`${module.id}\``)
              .join("\n"),
            footer: `${modules.filter((module) => module.enabled).length}/${modules.length} enabled`,
          }),
        ],
      });
    },
  },
  {
    name: "logs",
    description: "Set or disable the logging channel.",
    category: "configuration",
    level: Admin,
    slash: true,
    slashOptions: [{ name: "channel", description: "Log channel, or 'off'", type: "string", required: true }],
    async execute(ctx) {
      const guildId = ctx.requireGuild().id;
      const raw = ctx.args[0] ?? "";
      if (raw.toLowerCase() === "off") {
        await ctx.services.config.update(guildId, { "logging.enabled": false }, ctx.user.id);
        return ctx.ok("Logging disabled.");
      }
      const channelId = raw.replace(/[<#>]/g, "");
      if (!/^\d{17,20}$/.test(channelId)) return ctx.error("Provide a channel mention or ID.");
      await ctx.services.config.update(guildId, { "logging.enabled": true, "logging.channel_id": channelId }, ctx.user.id);
      return ctx.ok(`Logs will be sent to <#${channelId}>.`);
    },
  },
  {
    name: "logconfig",
    description: "Show which events are logged.",
    category: "configuration",
    level: Admin,
    slash: true,
    async execute(ctx) {
      const guildId = ctx.requireGuild().id;
      const values = await ctx.services.config.getValues(guildId);
      return ctx.reply({ embeds: [embed({ title: "Logging configuration", fields: configFields(values, "logging.") })] });
    },
  },
  {
    name: "welcome",
    description: "Set the welcome channel or disable welcome messages.",
    category: "configuration",
    level: Admin,
    slash: true,
    slashOptions: [{ name: "channel", description: "Welcome channel, or 'off'", type: "string", required: true }],
    async execute(ctx) {
      const guildId = ctx.requireGuild().id;
      const raw = ctx.args[0] ?? "";
      if (raw.toLowerCase() === "off") {
        await ctx.services.config.update(guildId, { "welcome.enabled": false }, ctx.user.id);
        return ctx.ok("Welcome messages disabled.");
      }
      const channelId = raw.replace(/[<#>]/g, "");
      if (!/^\d{17,20}$/.test(channelId)) return ctx.error("Provide a channel mention or ID.");
      await ctx.services.config.update(
        guildId,
        { "welcome.enabled": true, "welcome.channel_id": channelId },
        ctx.user.id,
      );
      return ctx.ok(`Welcome messages will be sent to <#${channelId}>.`);
    },
  },
  {
    name: "welcomeconfig",
    description: "Show the welcome configuration.",
    category: "configuration",
    level: Admin,
    slash: true,
    async execute(ctx) {
      const guildId = ctx.requireGuild().id;
      const values = await ctx.services.config.getValues(guildId);
      return ctx.reply({ embeds: [embed({ title: "Welcome configuration", fields: configFields(values, "welcome.") })] });
    },
  },
  {
    name: "goodbye",
    description: "Set the goodbye channel or disable goodbye messages.",
    category: "configuration",
    level: Admin,
    slash: true,
    slashOptions: [{ name: "channel", description: "Goodbye channel, or 'off'", type: "string", required: true }],
    async execute(ctx) {
      const guildId = ctx.requireGuild().id;
      const raw = ctx.args[0] ?? "";
      if (raw.toLowerCase() === "off") {
        await ctx.services.config.update(guildId, { "goodbye.enabled": false }, ctx.user.id);
        return ctx.ok("Goodbye messages disabled.");
      }
      const channelId = raw.replace(/[<#>]/g, "");
      if (!/^\d{17,20}$/.test(channelId)) return ctx.error("Provide a channel mention or ID.");
      await ctx.services.config.update(
        guildId,
        { "goodbye.enabled": true, "goodbye.channel_id": channelId },
        ctx.user.id,
      );
      return ctx.ok(`Goodbye messages will be sent to <#${channelId}>.`);
    },
  },
  {
    name: "goodbyeconfig",
    description: "Show the goodbye configuration.",
    category: "configuration",
    level: Admin,
    slash: true,
    async execute(ctx) {
      const guildId = ctx.requireGuild().id;
      const values = await ctx.services.config.getValues(guildId);
      return ctx.reply({ embeds: [embed({ title: "Goodbye configuration", fields: configFields(values, "goodbye.") })] });
    },
  },
  {
    name: "autorole",
    description: "Manage roles granted automatically on join.",
    category: "configuration",
    level: Admin,
    usage: "autorole <add|remove|list> [role]",
    slash: true,
    slashOptions: [
      { name: "action", description: "add, remove, or list", type: "string", required: true, choices: [{ name: "add", value: "add" }, { name: "remove", value: "remove" }, { name: "list", value: "list" }] },
      { name: "role", description: "Role", type: "role", required: false },
    ],
    async execute(ctx) {
      const guildId = ctx.requireGuild().id;
      const action = (ctx.args[0] ?? "list").toLowerCase();
      const roleId = ctx.args[1];
      if (action === "list" || !roleId) {
        const roles = await ctx.services.db.autorole.findMany({ where: { guildId } });
        return ctx.ok(roles.length ? roles.map((role) => `<@&${role.roleId}>`).join(" ") : "No autoroles configured.");
      }
      if (action === "add") {
        await ctx.services.db.autorole.upsert({
          where: { guildId_roleId: { guildId, roleId } },
          create: { guildId, roleId, createdBy: ctx.user.id },
          update: {},
        });
        return ctx.ok(`Added <@&${roleId}> as an autorole.`);
      }
      if (action === "remove") {
        await ctx.services.db.autorole.deleteMany({ where: { guildId, roleId } });
        return ctx.ok(`Removed <@&${roleId}> from autoroles.`);
      }
      return ctx.error("Unknown action.");
    },
  },
  {
    name: "automod",
    description: "Enable, disable, or inspect automod.",
    category: "configuration",
    level: Admin,
    slash: true,
    slashOptions: [{ name: "state", description: "on or off", type: "string", required: false }],
    async execute(ctx) {
      const guildId = ctx.requireGuild().id;
      const state = truthy(ctx.args[0]);
      if (state === null) {
        const values = await ctx.services.config.getValues(guildId);
        return ctx.reply({
          embeds: [
            embed({
              title: "Automod",
              description: `Automod is **${values["automod.enabled"] ? "enabled" : "disabled"}**.`,
              fields: [
                { name: "Anti-spam", value: values["automod.anti_spam.enabled"] ? "on" : "off", inline: true },
                { name: "Anti-link", value: values["automod.anti_link.enabled"] ? "on" : "off", inline: true },
                { name: "Anti-invite", value: values["automod.anti_invite.enabled"] ? "on" : "off", inline: true },
                { name: "Anti-caps", value: values["automod.anti_caps.enabled"] ? "on" : "off", inline: true },
                { name: "Anti-mention", value: values["automod.anti_mention.enabled"] ? "on" : "off", inline: true },
                { name: "Bad words", value: values["automod.bad_words.enabled"] ? "on" : "off", inline: true },
              ],
            }),
          ],
        });
      }
      await setValue(ctx, "automod.enabled", state);
      return ctx.ok(`Automod is now **${state ? "enabled" : "disabled"}**.`);
    },
  },
  {
    name: "antispam",
    description: "Configure anti-spam detection.",
    category: "configuration",
    level: Admin,
    slash: true,
    slashOptions: [
      { name: "state", description: "on or off", type: "string", required: true },
      { name: "threshold", description: "Messages allowed in the window", type: "integer", required: false, min: 2, max: 50 },
      { name: "window", description: "Window in seconds", type: "integer", required: false, min: 1, max: 300 },
    ],
    async execute(ctx) {
      const state = truthy(ctx.args[0]);
      if (state === null) return ctx.error("Use `on` or `off`.");
      const patch: Record<string, unknown> = { "automod.anti_spam.enabled": state };
      if (ctx.args[1]) patch["automod.anti_spam.threshold"] = Number(ctx.args[1]);
      if (ctx.args[2]) patch["automod.anti_spam.window_seconds"] = Number(ctx.args[2]);
      await ctx.services.config.update(ctx.requireGuild().id, patch, ctx.user.id);
      return ctx.ok(`Anti-spam is now **${state ? "enabled" : "disabled"}**.`);
    },
  },
  {
    name: "antilink",
    description: "Enable or disable the external link filter.",
    category: "configuration",
    level: Admin,
    slash: true,
    slashOptions: [{ name: "state", description: "on or off", type: "string", required: true }],
    async execute(ctx) {
      const state = truthy(ctx.args[0]);
      if (state === null) return ctx.error("Use `on` or `off`.");
      await setValue(ctx, "automod.anti_link.enabled", state);
      return ctx.ok(`Anti-link is now **${state ? "enabled" : "disabled"}**.`);
    },
  },
  {
    name: "antiinvite",
    description: "Enable or disable the Discord invite filter.",
    category: "configuration",
    level: Admin,
    slash: true,
    slashOptions: [{ name: "state", description: "on or off", type: "string", required: true }],
    async execute(ctx) {
      const state = truthy(ctx.args[0]);
      if (state === null) return ctx.error("Use `on` or `off`.");
      await setValue(ctx, "automod.anti_invite.enabled", state);
      return ctx.ok(`Anti-invite is now **${state ? "enabled" : "disabled"}**.`);
    },
  },
  {
    name: "anticaps",
    description: "Configure excessive capitalisation detection.",
    category: "configuration",
    level: Admin,
    slash: true,
    slashOptions: [
      { name: "state", description: "on or off", type: "string", required: true },
      { name: "threshold", description: "Minimum percent caps", type: "integer", required: false, min: 10, max: 100 },
    ],
    async execute(ctx) {
      const state = truthy(ctx.args[0]);
      if (state === null) return ctx.error("Use `on` or `off`.");
      const patch: Record<string, unknown> = { "automod.anti_caps.enabled": state };
      if (ctx.args[1]) patch["automod.anti_caps.threshold"] = Number(ctx.args[1]);
      await ctx.services.config.update(ctx.requireGuild().id, patch, ctx.user.id);
      return ctx.ok(`Anti-caps is now **${state ? "enabled" : "disabled"}**.`);
    },
  },
  {
    name: "antimention",
    description: "Enable or disable excessive mention detection.",
    category: "configuration",
    level: Admin,
    slash: true,
    slashOptions: [{ name: "state", description: "on or off", type: "string", required: true }],
    async execute(ctx) {
      const state = truthy(ctx.args[0]);
      if (state === null) return ctx.error("Use `on` or `off`.");
      await setValue(ctx, "automod.anti_mention.enabled", state);
      return ctx.ok(`Anti-mention is now **${state ? "enabled" : "disabled"}**.`);
    },
  },
  {
    name: "badwords",
    description: "Enable or disable the bad word filter.",
    category: "configuration",
    level: Admin,
    slash: true,
    slashOptions: [{ name: "state", description: "on or off", type: "string", required: true }],
    async execute(ctx) {
      const state = truthy(ctx.args[0]);
      if (state === null) return ctx.error("Use `on` or `off`.");
      await setValue(ctx, "automod.bad_words.enabled", state);
      return ctx.ok(`The bad word filter is now **${state ? "enabled" : "disabled"}**.`);
    },
  },
  {
    name: "badwordadd",
    description: "Add words to the bad word filter.",
    category: "configuration",
    level: Admin,
    slash: true,
    slashOptions: [{ name: "words", description: "Comma-separated words", type: "string", required: true }],
    async execute(ctx) {
      const guildId = ctx.requireGuild().id;
      const words = (ctx.args[0] ?? "").split(",").map((word) => word.trim().toLowerCase()).filter(Boolean);
      if (words.length === 0) return ctx.error("Provide at least one word.");
      const current = await ctx.services.config.getValue<string[]>(guildId, "automod.bad_words.list");
      const merged = [...new Set([...current, ...words])].slice(0, 500);
      await ctx.services.config.update(guildId, { "automod.bad_words.list": merged }, ctx.user.id);
      return ctx.ok(`Added **${words.length}** word(s). The filter now contains **${merged.length}**.`);
    },
  },
  {
    name: "badwordremove",
    description: "Remove words from the bad word filter.",
    category: "configuration",
    level: Admin,
    slash: true,
    slashOptions: [{ name: "words", description: "Comma-separated words", type: "string", required: true }],
    async execute(ctx) {
      const guildId = ctx.requireGuild().id;
      const words = (ctx.args[0] ?? "").split(",").map((word) => word.trim().toLowerCase()).filter(Boolean);
      const current = await ctx.services.config.getValue<string[]>(guildId, "automod.bad_words.list");
      const next = current.filter((word) => !words.includes(word));
      await ctx.services.config.update(guildId, { "automod.bad_words.list": next }, ctx.user.id);
      return ctx.ok(`Removed **${current.length - next.length}** word(s).`);
    },
  },
  {
    name: "badwordlist",
    description: "List the filtered words.",
    category: "configuration",
    level: Admin,
    slash: true,
    async execute(ctx) {
      const guildId = ctx.requireGuild().id;
      const words = await ctx.services.config.getValue<string[]>(guildId, "automod.bad_words.list");
      return ctx.ok(words.length ? truncate(words.join(", "), 4000) : "The bad word list is empty.");
    },
  },
];

export default configuration;
