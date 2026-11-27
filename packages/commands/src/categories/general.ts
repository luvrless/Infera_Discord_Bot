import { ChannelType, version as djsVersion } from "discord.js";
import {
  BRAND_COLOR,
  DISCORD_PERMISSION_NAMES,
  INFERA_NAME,
  INFERA_SUPPORT_SERVER,
  INFERA_WEBSITE,
  PermissionLevel,
  discordTimestamp,
  formatNumber,
  truncate,
} from "@infera/shared";
import { embed } from "../core/context";
import { registry } from "../core/registry";
import type { CommandDefinition } from "../core/types";

const general: CommandDefinition[] = [
  {
    name: "help",
    description: "Browse the command directory or inspect a single command.",
    category: "general",
    aliases: ["h", "commands"],
    usage: "help [command]",
    examples: ["help", "help ban"],
    slash: true,
    slashOptions: [{ name: "command", description: "Command to inspect", type: "string", required: false }],
    async execute(ctx) {
      const query = ctx.args[0]?.toLowerCase();
      if (query) {
        const command = registry.get(query);
        if (!command) {
          return ctx.error(ctx.t("commands.general.help.not_found", { name: query }));
        }
        return ctx.reply({
          embeds: [
            embed({
              title: `\`${ctx.prefix}${command.name}\``,
              description: command.description,
              fields: [
                { name: "Category", value: command.category, inline: true },
                { name: "Aliases", value: command.aliases?.length ? command.aliases.map((a) => `\`${a}\``).join(", ") : "None", inline: true },
                { name: "Usage", value: `\`${ctx.prefix}${command.usage ?? command.name}\`` },
                ...(command.examples?.length
                  ? [{ name: "Examples", value: command.examples.map((example) => `\`${ctx.prefix}${example}\``).join("\n") }]
                  : []),
                { name: "Required level", value: `Level ${command.level ?? 0}`, inline: true },
                { name: "Cooldown", value: `${((command.cooldownMs ?? 3000) / 1000).toFixed(1)}s`, inline: true },
              ],
              footer: `${INFERA_NAME} · ${registry.count()} commands`,
            }),
          ],
        });
      }

      const categories = registry.byCategory();
      const fields = Object.entries(categories)
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(0, 25)
        .map(([category, commands]) => ({
          name: `${category} (${commands.length})`,
          value: truncate(commands.slice(0, 20).map((command) => `\`${command.name}\``).join(" "), 1024),
        }));

      return ctx.reply({
        embeds: [
          embed({
            title: ctx.t("commands.general.help.title"),
            description: `${ctx.t("commands.general.help.description", { prefix: ctx.prefix })}\n**${registry.count()}** canonical commands · **${registry.aliasCount()}** aliases`,
            fields: [
              ...fields,
              {
                name: "Server setup",
                value: `Welcome, logging, autoroles, leveling, tickets, automod and security are configured per server in the [INFERA dashboard](${(process.env.WEB_APP_URL ?? INFERA_WEBSITE).replace(/\/$/, "")}/dashboard).`,
              },
            ],
            footer: `${INFERA_NAME} · ${INFERA_WEBSITE}`,
          }),
        ],
      });
    },
  },
  {
    name: "ping",
    description: "Check the bot's gateway and round-trip latency.",
    category: "general",
    aliases: ["latency"],
    slash: true,
    cooldownMs: 2000,
    async execute(ctx) {
      const started = Date.now();
      await ctx.reply({ content: "Pinging…" });
      const roundtrip = Date.now() - started;
      const gateway = Math.round(ctx.client.ws.ping);
      await ctx.reply({
        embeds: [
          embed({
            description: ctx.t("commands.general.ping.response", { gateway, roundtrip }),
            footer: INFERA_NAME,
          }),
        ],
      });
    },
  },
  {
    name: "uptime",
    description: "Show how long the bot has been online.",
    category: "general",
    slash: true,
    async execute(ctx) {
      const ms = ctx.client.uptime ?? 0;
      const seconds = Math.floor(ms / 1000);
      const days = Math.floor(seconds / 86400);
      const hours = Math.floor((seconds % 86400) / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      return ctx.ok(
        ctx.t("commands.general.uptime.response", { uptime: `${days}d ${hours}h ${minutes}m` }),
        "Uptime",
      );
    },
  },
  {
    name: "botinfo",
    description: "Display information about the INFERA bot.",
    category: "general",
    aliases: ["info", "stats"],
    slash: true,
    async execute(ctx) {
      const client = ctx.client;
      const guilds = client.guilds.cache.size;
      const users = client.guilds.cache.reduce((acc, guild) => acc + (guild.memberCount ?? 0), 0);
      const memory = process.memoryUsage().heapUsed / 1024 / 1024;
      return ctx.reply({
        embeds: [
          embed({
            title: `${INFERA_NAME} · Bot Information`,
            thumbnail: client.user?.displayAvatarURL({ size: 256 }),
            fields: [
              { name: "Servers", value: formatNumber(guilds), inline: true },
              { name: "Members", value: formatNumber(users), inline: true },
              { name: "Commands", value: formatNumber(registry.count()), inline: true },
              { name: "Gateway", value: `${Math.round(client.ws.ping)}ms`, inline: true },
              { name: "Uptime", value: `${Math.floor((client.uptime ?? 0) / 3600000)}h`, inline: true },
              { name: "Memory", value: `${memory.toFixed(1)} MiB`, inline: true },
              { name: "discord.js", value: djsVersion, inline: true },
              { name: "Node.js", value: process.version, inline: true },
            ],
            footer: `${INFERA_NAME} · ${INFERA_WEBSITE}`,
          }),
        ],
      });
    },
  },
  {
    name: "invite",
    description: "Get the link to invite INFERA to your server.",
    category: "general",
    aliases: ["add"],
    slash: true,
    async execute(ctx) {
      const id = ctx.client.user?.id ?? "";
      const url = `https://discord.com/oauth2/authorize?client_id=${id}&permissions=8&scope=bot%20applications.commands`;
      return ctx.reply({
        embeds: [embed({ description: ctx.t("commands.general.invite.response", { url }), title: "Invite INFERA" })],
      });
    },
  },
  {
    name: "support",
    description: "Join the INFERA support server.",
    category: "general",
    aliases: ["supportserver", "discord"],
    slash: true,
    async execute(ctx) {
      return ctx.reply({
        embeds: [embed({ description: ctx.t("commands.general.support.response", { url: INFERA_SUPPORT_SERVER }) })],
      });
    },
  },
  {
    name: "serverinfo",
    description: "Display detailed information about this server.",
    category: "general",
    slash: true,
    async execute(ctx) {
      const guild = ctx.requireGuild();
      const owner = await guild.fetchOwner().catch(() => null);
      const channels = guild.channels.cache.size;
      const roles = guild.roles.cache.size;
      const emojis = guild.emojis.cache.size;
      return ctx.reply({
        embeds: [
          embed({
            title: guild.name,
            thumbnail: guild.iconURL({ size: 256 }) ?? undefined,
            image: guild.bannerURL({ size: 1024 }) ?? undefined,
            fields: [
              { name: "Owner", value: owner ? `${owner.user.tag}` : guild.ownerId, inline: true },
              { name: "ID", value: guild.id, inline: true },
              { name: "Created", value: discordTimestamp(guild.createdAt, "D"), inline: true },
              { name: "Members", value: formatNumber(guild.memberCount), inline: true },
              { name: "Channels", value: formatNumber(channels), inline: true },
              { name: "Roles", value: formatNumber(roles), inline: true },
              { name: "Emojis", value: formatNumber(emojis), inline: true },
              { name: "Boosts", value: `${guild.premiumSubscriptionCount ?? 0} (Tier ${guild.premiumTier})`, inline: true },
              { name: "Verification", value: String(guild.verificationLevel), inline: true },
            ],
            footer: INFERA_NAME,
          }),
        ],
      });
    },
  },
  {
    name: "servericon",
    description: "Show the server icon.",
    category: "general",
    slash: true,
    async execute(ctx) {
      const guild = ctx.requireGuild();
      const url = guild.iconURL({ size: 1024 });
      if (!url) return ctx.error("This server has no icon.");
      return ctx.reply({ embeds: [embed({ title: `${guild.name} icon`, image: url })] });
    },
  },
  {
    name: "serverbanner",
    description: "Show the server banner.",
    category: "general",
    slash: true,
    async execute(ctx) {
      const guild = ctx.requireGuild();
      const url = guild.bannerURL({ size: 2048 });
      if (!url) return ctx.error("This server has no banner.");
      return ctx.reply({ embeds: [embed({ title: `${guild.name} banner`, image: url })] });
    },
  },
  {
    name: "serverroles",
    description: "List the roles in this server.",
    category: "general",
    slash: true,
    async execute(ctx) {
      const guild = ctx.requireGuild();
      const roles = [...guild.roles.cache.values()]
        .filter((role) => role.id !== guild.id)
        .sort((a, b) => b.position - a.position)
        .slice(0, 40);
      return ctx.reply({
        embeds: [
          embed({
            title: `Roles · ${guild.name}`,
            description: truncate(
              roles.map((role) => `<@&${role.id}> · ${role.members.size} members`).join("\n"),
              4096,
            ),
            footer: `${guild.roles.cache.size - 1} roles total`,
          }),
        ],
      });
    },
  },
  {
    name: "serverchannels",
    description: "List the channels in this server.",
    category: "general",
    slash: true,
    async execute(ctx) {
      const guild = ctx.requireGuild();
      const groups = new Map<string, string[]>();
      for (const channel of guild.channels.cache.values()) {
        if (channel.type === ChannelType.GuildCategory) continue;
        const parent = channel.parent?.name ?? "No category";
        const list = groups.get(parent) ?? [];
        list.push(`<#${channel.id}>`);
        groups.set(parent, list);
      }
      const fields = [...groups.entries()].slice(0, 20).map(([name, channels]) => ({
        name: truncate(name, 256),
        value: truncate(channels.join(" "), 1024),
      }));
      return ctx.reply({
        embeds: [embed({ title: `Channels · ${guild.name}`, fields, footer: `${guild.channels.cache.size} channels` })],
      });
    },
  },
  {
    name: "serveremojis",
    description: "List the custom emojis in this server.",
    category: "general",
    slash: true,
    async execute(ctx) {
      const guild = ctx.requireGuild();
      const emojis = [...guild.emojis.cache.values()].slice(0, 50);
      if (emojis.length === 0) return ctx.error("This server has no custom emojis.");
      return ctx.reply({
        embeds: [
          embed({
            title: `Emojis · ${guild.name}`,
            description: truncate(emojis.map((emoji) => `${emoji} \`:${emoji.name}:\``).join(" "), 4096),
            footer: `${guild.emojis.cache.size} emojis`,
          }),
        ],
      });
    },
  },
  {
    name: "serverboost",
    description: "Show this server's boost status.",
    category: "general",
    aliases: ["boost", "boosts"],
    slash: true,
    async execute(ctx) {
      const guild = ctx.requireGuild();
      return ctx.reply({
        embeds: [
          embed({
            title: `Boost status · ${guild.name}`,
            thumbnail: guild.iconURL({ size: 256 }) ?? undefined,
            fields: [
              { name: "Level", value: `Tier ${guild.premiumTier}`, inline: true },
              { name: "Boosts", value: String(guild.premiumSubscriptionCount ?? 0), inline: true },
              { name: "Boosters", value: String(guild.members.cache.filter((member) => member.premiumSince).size), inline: true },
            ],
          }),
        ],
      });
    },
  },
  {
    name: "membercount",
    description: "Show the member count of this server.",
    category: "general",
    aliases: ["members"],
    slash: true,
    async execute(ctx) {
      const guild = ctx.requireGuild();
      const bots = guild.members.cache.filter((member) => member.user.bot).size;
      return ctx.reply({
        embeds: [
          embed({
            title: `Members · ${guild.name}`,
            fields: [
              { name: "Total", value: formatNumber(guild.memberCount), inline: true },
              { name: "Humans", value: formatNumber(guild.memberCount - bots), inline: true },
              { name: "Bots", value: formatNumber(bots), inline: true },
            ],
          }),
        ],
      });
    },
  },
  {
    name: "userinfo",
    description: "Display information about a member.",
    category: "general",
    aliases: ["whois", "memberinfo"],
    usage: "userinfo [member]",
    slash: true,
    slashOptions: [{ name: "member", description: "Member to inspect", type: "member", required: false }],
    async execute(ctx) {
      const member = ctx.args[0] ? await ctx.resolveMember(ctx.args[0]) : ctx.requireMember();
      const user = member.user;
      return ctx.reply({
        embeds: [
          embed({
            title: user.tag,
            thumbnail: user.displayAvatarURL({ size: 256 }),
            fields: [
              { name: "ID", value: user.id, inline: true },
              { name: "Bot", value: user.bot ? "Yes" : "No", inline: true },
              { name: "Created", value: discordTimestamp(user.createdAt, "D"), inline: true },
              { name: "Joined", value: member.joinedAt ? discordTimestamp(member.joinedAt, "D") : "Unknown", inline: true },
              { name: "Nickname", value: member.nickname ?? "None", inline: true },
              { name: "Roles", value: truncate(member.roles.cache.filter((role) => role.id !== ctx.guildId).map((role) => `<@&${role.id}>`).join(" ") || "None", 1024) },
            ],
          }),
        ],
      });
    },
  },
  {
    name: "avatar",
    description: "Show a member's avatar.",
    category: "general",
    aliases: ["av"],
    slash: true,
    slashOptions: [{ name: "member", description: "Member whose avatar to show", type: "member", required: false }],
    async execute(ctx) {
      const member = ctx.args[0] ? await ctx.resolveMember(ctx.args[0]) : ctx.requireMember();
      return ctx.reply({
        embeds: [
          embed({
            title: `${member.user.tag}'s avatar`,
            image: member.displayAvatarURL({ size: 1024 }),
          }),
        ],
      });
    },
  },
  {
    name: "banner",
    description: "Show a user's profile banner.",
    category: "general",
    slash: true,
    slashOptions: [{ name: "user", description: "User whose banner to show", type: "user", required: false }],
    async execute(ctx) {
      const user = ctx.args[0] ? await ctx.resolveUser(ctx.args[0]) : ctx.user;
      const fetched = await user.fetch(true).catch(() => user);
      const url = fetched.bannerURL({ size: 1024 });
      if (!url) return ctx.error("That user has no banner.");
      return ctx.reply({ embeds: [embed({ title: `${fetched.tag}'s banner`, image: url })] });
    },
  },
  {
    name: "permissions",
    description: "Show the permissions a member holds.",
    category: "general",
    aliases: ["perms"],
    slash: true,
    slashOptions: [{ name: "member", description: "Member to inspect", type: "member", required: false }],
    async execute(ctx) {
      const member = ctx.args[0] ? await ctx.resolveMember(ctx.args[0]) : ctx.requireMember();
      const names = Object.entries(DISCORD_PERMISSION_NAMES)
        .filter(([, flag]) => member.permissions.has(flag))
        .map(([name]) => name);
      return ctx.reply({
        embeds: [
          embed({
            title: `Permissions · ${member.user.tag}`,
            description: truncate(names.join(", ") || "No permissions", 4096),
            footer: `${names.length} permissions`,
            color: BRAND_COLOR,
          }),
        ],
      });
    },
  },
];

export default general;
