import { ChannelType, type GuildMember } from "discord.js";
import { PermissionLevel, discordTimestamp, formatNumber, truncate } from "@infera/shared";
import { embed } from "../core/context";
import type { CommandDefinition } from "../core/types";

const responses = {
  eightBall: [
    "It is certain.",
    "Without a doubt.",
    "Most likely.",
    "Yes.",
    "Ask again later.",
    "Cannot predict now.",
    "Do not count on it.",
    "My sources say no.",
    "Very doubtful.",
  ],
  compliments: [
    "You make this server a better place.",
    "Your ideas are genuinely useful.",
    "You have excellent taste in communities.",
    "You are doing better than you think.",
    "Your presence is appreciated here.",
  ],
  roasts: [
    "You bring everyone so much joy — when you leave the room.",
    "Your keyboard deserves hazard pay.",
    "You are proof that even autocorrect gives up sometimes.",
    "You have the confidence of someone who has never read the room.",
    "Your best quality is how easy you are to mute.",
  ],
  colors: ["#8B5CF6", "#22D3EE", "#F472B6", "#34D399", "#FBBF24", "#F87171", "#A78BFA", "#60A5FA"],
};

function random<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

function safeCalculate(expression: string): number | null {
  if (!/^[\d+\-*/().%\s]+$/.test(expression) || expression.length > 120) return null;
  try {
    // The character allowlist above excludes identifiers and property access.
    const value = Function(`"use strict"; return (${expression});`)() as unknown;
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

const utility: CommandDefinition[] = [
  {
    name: "serverstats",
    description: "Show a compact overview of this server.",
    category: "general",
    slash: true,
    async execute(ctx) {
      const guild = ctx.requireGuild();
      const online = guild.members.cache.filter((member) => member.presence?.status && member.presence.status !== "offline").size;
      return ctx.reply({
        embeds: [
          embed({
            title: `Server stats · ${guild.name}`,
            thumbnail: guild.iconURL({ size: 128 }) ?? undefined,
            fields: [
              { name: "Members", value: formatNumber(guild.memberCount), inline: true },
              { name: "Online", value: formatNumber(online), inline: true },
              { name: "Channels", value: formatNumber(guild.channels.cache.size), inline: true },
              { name: "Roles", value: formatNumber(guild.roles.cache.size), inline: true },
              { name: "Boosts", value: `${guild.premiumSubscriptionCount ?? 0} (Tier ${guild.premiumTier})`, inline: true },
              { name: "Created", value: discordTimestamp(guild.createdAt, "D"), inline: true },
            ],
          }),
        ],
      });
    },
  },
  {
    name: "channelinfo",
    description: "Show information about a channel.",
    category: "general",
    slash: true,
    slashOptions: [{ name: "channel", description: "Channel to inspect", type: "channel", required: false }],
    async execute(ctx) {
      const guild = ctx.requireGuild();
      const channel = ctx.args[0]
        ? guild.channels.cache.get(ctx.args[0])
        : guild.channels.cache.get(ctx.channelId ?? "");
      if (!channel) return ctx.error("Channel not found.");
      const lines = [
        `**Name** · ${channel.name}`,
        `**ID** · \`${channel.id}\``,
        `**Type** · ${ChannelType[channel.type] ?? channel.type}`,
        `**Category** · ${channel.parent?.name ?? "None"}`,
        `**Created** · ${channel.createdAt ? discordTimestamp(channel.createdAt, "F") : "Unknown"}`,
      ];
      if (channel.isTextBased() && "topic" in channel) lines.push(`**Topic** · ${truncate(channel.topic ?? "None", 500)}`);
      if (channel.isVoiceBased()) lines.push(`**Members connected** · ${channel.members.size}`);
      return ctx.reply({ embeds: [embed({ title: `#${channel.name}`, description: lines.join("\n") })] });
    },
  },
  {
    name: "roleinfo",
    description: "Show information about a role.",
    category: "roles",
    slash: true,
    slashOptions: [{ name: "role", description: "Role to inspect", type: "role", required: true }],
    async execute(ctx) {
      const guild = ctx.requireGuild();
      const role = guild.roles.cache.get(ctx.args[0] ?? "");
      if (!role) return ctx.error("Role not found.");
      return ctx.reply({
        embeds: [
          embed({
            title: role.name,
            color: role.color || undefined,
            fields: [
              { name: "ID", value: `\`${role.id}\``, inline: true },
              { name: "Members", value: String(role.members.size), inline: true },
              { name: "Position", value: String(role.position), inline: true },
              { name: "Colour", value: role.hexColor, inline: true },
              { name: "Mentionable", value: role.mentionable ? "Yes" : "No", inline: true },
              { name: "Hoisted", value: role.hoist ? "Yes" : "No", inline: true },
              { name: "Permissions", value: truncate(role.permissions.toArray().join(", ") || "None", 1024) },
            ],
          }),
        ],
      });
    },
  },
  {
    name: "rolelist",
    description: "List this server's roles.",
    category: "roles",
    slash: true,
    async execute(ctx) {
      const guild = ctx.requireGuild();
      const roles = [...guild.roles.cache.values()]
        .filter((role) => role.id !== guild.id)
        .sort((a, b) => b.position - a.position);
      return ctx.reply({
        embeds: [
          embed({
            title: `Roles · ${guild.name}`,
            description: truncate(roles.map((role) => `<@&${role.id}> · ${role.members.size}`).join("\n") || "No roles", 4096),
            footer: `${roles.length} roles`,
          }),
        ],
      });
    },
  },
  {
    name: "timestamp",
    description: "Render a Discord timestamp for a date or Unix time.",
    category: "utility",
    slash: true,
    slashOptions: [
      { name: "time", description: "Unix seconds or an ISO date", type: "string", required: true },
      { name: "style", description: "F, f, D, d, t, T or R", type: "string", required: false },
    ],
    async execute(ctx) {
      const raw = ctx.args[0] ?? "";
      const date = /^\d{9,13}$/.test(raw)
        ? new Date(Number(raw.length === 10 ? `${raw}000` : raw))
        : new Date(raw);
      if (Number.isNaN(date.getTime())) return ctx.error("That is not a valid date or Unix timestamp.");
      const style = ["F", "f", "D", "d", "t", "T", "R"].includes(ctx.args[1] ?? "") ? ctx.args[1] : "F";
      return ctx.ok(`<t:${Math.floor(date.getTime() / 1000)}:${style}> · \`<t:${Math.floor(date.getTime() / 1000)}:${style}>\``);
    },
  },
  {
    name: "remind",
    description: "Set a reminder for yourself.",
    category: "utility",
    slash: true,
    slashOptions: [
      { name: "duration", description: "e.g. 10m, 2h, 1d", type: "string", required: true },
      { name: "text", description: "What should I remind you about?", type: "string", required: true },
    ],
    async execute(ctx) {
      const duration = ctx.duration(0);
      const content = ctx.args.slice(1).join(" ").trim();
      if (!content) return ctx.error("Tell me what to remind you about.");
      const reminder = await ctx.services.reminders.create({
        guildId: ctx.guildId,
        userId: ctx.user.id,
        channelId: ctx.channelId,
        content,
        dueAt: new Date(Date.now() + duration),
      });
      return ctx.ok(`Reminder set for <t:${Math.floor(reminder.dueAt.getTime() / 1000)}:R> (ID \`${reminder.id}\`).`);
    },
  },
  {
    name: "reminders",
    description: "List your active reminders.",
    category: "utility",
    slash: true,
    async execute(ctx) {
      const rows = await ctx.services.reminders.list(ctx.user.id);
      if (rows.length === 0) return ctx.ok("You have no active reminders.");
      return ctx.reply({
        embeds: [
          embed({
            title: "Your reminders",
            description: rows
              .map((row) => `\`${row.id.slice(0, 8)}\` · <t:${Math.floor(row.dueAt.getTime() / 1000)}:R> · ${truncate(row.content, 200)}`)
              .join("\n"),
          }),
        ],
      });
    },
  },
  {
    name: "reminderdelete",
    description: "Delete one of your reminders.",
    category: "utility",
    slash: true,
    slashOptions: [{ name: "id", description: "Reminder ID", type: "string", required: true }],
    async execute(ctx) {
      await ctx.services.reminders.delete(ctx.user.id, ctx.args[0] ?? "");
      return ctx.ok("Reminder deleted.");
    },
  },
  {
    name: "schedule",
    description: "Schedule a message to be sent later.",
    category: "utility",
    level: PermissionLevel.Moderator,
    slash: true,
    slashOptions: [
      { name: "duration", description: "e.g. 30m, 2h, 1d", type: "string", required: true },
      { name: "message", description: "Message to send", type: "string", required: true },
      { name: "channel", description: "Where to send it (defaults to this channel)", type: "channel", required: false },
    ],
    async execute(ctx) {
      const guild = ctx.requireGuild();
      const delay = ctx.duration(0);
      if (delay < 60_000) return ctx.error("Schedule the message at least one minute from now.");
      if (delay > 365 * 24 * 60 * 60 * 1000) return ctx.error("Schedules cannot be more than a year away.");
      const rawChannel = (ctx.args[2] ?? "").replace(/[<#>]/g, "");
      const channelId = rawChannel && guild.channels.cache.has(rawChannel) ? rawChannel : ctx.channelId;
      if (!channelId) return ctx.error("Choose a channel for the message.");
      const content = ctx.args.slice(1, rawChannel ? -1 : undefined).join(" ").trim();
      if (!content) return ctx.error("Write the message to schedule.");
      const task = await ctx.services.scheduler.schedule({
        guildId: guild.id,
        type: "message",
        payload: { channelId, content, userId: ctx.user.id },
        runAt: new Date(Date.now() + delay),
      });
      return ctx.ok(
        `Message scheduled in <#${channelId}> for <t:${Math.floor((task.runAt?.getTime() ?? Date.now()) / 1000)}:R>.\nID: \`${task.id}\``,
      );
    },
  },
  {
    name: "scheduled",
    description: "List scheduled messages in this server.",
    category: "utility",
    level: PermissionLevel.Moderator,
    slash: true,
    async execute(ctx) {
      const rows = await ctx.services.scheduler.listMessageTasks(ctx.requireGuild().id);
      if (rows.length === 0) return ctx.ok("There are no scheduled messages.");
      return ctx.reply({
        embeds: [
          embed({
            title: "Scheduled messages",
            description: rows
              .slice(0, 20)
              .map(
                (row) =>
                  `\`${row.id.slice(0, 8)}\` · <#${row.channelId}> · <t:${Math.floor((row.runAt?.getTime() ?? 0) / 1000)}:R>\n${truncate(row.content, 120)}`,
              )
              .join("\n\n"),
            footer: `${rows.length} pending`,
          }),
        ],
      });
    },
  },
  {
    name: "cancelschedule",
    description: "Cancel a scheduled message.",
    category: "utility",
    level: PermissionLevel.Moderator,
    slash: true,
    slashOptions: [{ name: "id", description: "Scheduled message ID", type: "string", required: true }],
    async execute(ctx) {
      const id = (ctx.args[0] ?? "").trim();
      if (!id) return ctx.error("Provide the scheduled message ID.");
      const removed = await ctx.services.scheduler.cancelMessageTask(ctx.requireGuild().id, id);
      return removed ? ctx.ok("Scheduled message cancelled.") : ctx.error("That scheduled message was not found.");
    },
  },
  {
    name: "calculator",
    description: "Calculate a simple arithmetic expression.",
    category: "utility",
    aliases: ["calc", "math"],
    slash: true,
    slashOptions: [{ name: "expression", description: "e.g. (12 + 8) * 3", type: "string", required: true }],
    async execute(ctx) {
      const expression = ctx.args.join(" ");
      const result = safeCalculate(expression);
      if (result === null) return ctx.error("That expression is not valid. Use numbers and + - * / ( ).");
      return ctx.ok(`\`${expression}\` = **${formatNumber(result)}**`);
    },
  },
  {
    name: "choose",
    description: "Choose one option from a list.",
    category: "fun",
    slash: true,
    slashOptions: [{ name: "options", description: "Comma-separated options", type: "string", required: true }],
    async execute(ctx) {
      const options = ctx.args.join(" ").split(/,|\|/).map((entry) => entry.trim()).filter(Boolean);
      if (options.length < 2) return ctx.error("Provide at least two comma-separated options.");
      return ctx.ok(`I choose **${random(options).slice(0, 500)}**.`);
    },
  },
  {
    name: "8ball",
    description: "Ask the magic 8-ball a question.",
    category: "fun",
    aliases: ["eightball"],
    slash: true,
    slashOptions: [{ name: "question", description: "Your question", type: "string", required: true }],
    async execute(ctx) {
      return ctx.reply({
        embeds: [
          embed({
            title: "🎱 The 8-ball says",
            description: `> ${truncate(ctx.args.join(" "), 500)}\n\n**${random(responses.eightBall)}**`,
          }),
        ],
      });
    },
  },
  {
    name: "randomnumber",
    description: "Generate a random number in a range.",
    category: "fun",
    slash: true,
    slashOptions: [
      { name: "min", description: "Minimum", type: "integer", required: false },
      { name: "max", description: "Maximum", type: "integer", required: false },
    ],
    async execute(ctx) {
      const min = Math.trunc(Number(ctx.args[0] ?? 1));
      const max = Math.trunc(Number(ctx.args[1] ?? 100));
      if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) return ctx.error("Minimum must be less than maximum.");
      const value = min + Math.floor(Math.random() * (max - min + 1));
      return ctx.ok(`🎲 **${formatNumber(value)}**`);
    },
  },
  {
    name: "randomcolor",
    description: "Generate a random colour.",
    category: "fun",
    slash: true,
    async execute(ctx) {
      const color = random(responses.colors);
      return ctx.reply({ embeds: [embed({ title: color.toUpperCase(), color: parseInt(color.slice(1), 16) })] });
    },
  },
  {
    name: "poll",
    description: "Create a quick yes/no poll.",
    category: "utility",
    slash: true,
    slashOptions: [{ name: "question", description: "Poll question", type: "string", required: true }],
    async execute(ctx) {
      const question = ctx.args.join(" ").trim();
      if (!question) return ctx.error("Provide a poll question.");
      const channel = ctx.guild?.channels.cache.get(ctx.channelId ?? "");
      if (!channel || !channel.isTextBased()) return ctx.error("This channel cannot host a poll.");
      const message = await channel.send({
        embeds: [embed({ title: "📊 Poll", description: truncate(question, 2000), footer: `Asked by ${ctx.user.tag}` })],
      });
      await message.react("✅").catch(() => undefined);
      await message.react("❌").catch(() => undefined);
      return ctx.ok("Poll created.");
    },
  },
  {
    name: "rps",
    description: "Play rock-paper-scissors against INFERA.",
    category: "fun",
    slash: true,
    slashOptions: [{ name: "choice", description: "rock, paper or scissors", type: "string", required: true }],
    async execute(ctx: any) {
      const choice = (ctx.args[0] ?? "").toLowerCase();
      const options = ["rock", "paper", "scissors"] as const;
      if (!options.includes(choice as (typeof options)[number])) return ctx.error("Choose rock, paper or scissors.");
      const bot = random(options);
      const won =
        (choice === "rock" && bot === "scissors") ||
        (choice === "paper" && bot === "rock") ||
        (choice === "scissors" && bot === "paper");
      const result = choice === bot ? "It's a tie." : won ? "You win!" : "I win.";
      return ctx.ok(`You chose **${choice}**, I chose **${bot}**. ${result}`);
    },
  },
  {
    name: "ship",
    description: "Measure the compatibility of two members.",
    category: "fun",
    slash: true,
    slashOptions: [
      { name: "first", description: "First member", type: "member", required: true },
      { name: "second", description: "Second member", type: "member", required: true },
    ],
    async execute(ctx) {
      const first = await ctx.resolveMember(ctx.args[0]);
      const second = await ctx.resolveMember(ctx.args[1]);
      const key = [first.id, second.id].sort().join("");
      let hash = 0;
      for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
      const score = hash % 101;
      return ctx.ok(`${first.user.tag} + ${second.user.tag} = **${score}%** ${score >= 70 ? "💞" : score >= 40 ? "💛" : "💔"}`);
    },
  },
  {
    name: "robloxuser",
    description: "Look up a Roblox profile.",
    category: "roblox",
    aliases: ["roblox"],
    module: "roblox",
    slash: true,
    slashOptions: [{ name: "username", description: "Roblox username or ID", type: "string", required: true }],
    async execute(ctx) {
      const profile = await ctx.roblox.users.profile(ctx.args[0] ?? "");
      return ctx.reply({
        embeds: [
          embed({
            title: `${profile.user.displayName} (@${profile.user.name})`,
            description: truncate(profile.user.description ?? "No profile description.", 2000),
            thumbnail: profile.avatar ?? profile.headshot ?? undefined,
            fields: [
              { name: "User ID", value: String(profile.user.id), inline: true },
              { name: "Created", value: profile.user.created ? discordTimestamp(new Date(profile.user.created), "D") : "Unknown", inline: true },
              { name: "Verified", value: profile.user.hasVerifiedBadge ? "Yes" : "No", inline: true },
              { name: "Followers", value: formatNumber(profile.followers.followers), inline: true },
              { name: "Following", value: formatNumber(profile.followers.following), inline: true },
              { name: "Friends", value: formatNumber(profile.friends.length), inline: true },
              { name: "Groups", value: truncate(profile.groups.slice(0, 10).map((entry) => entry.group.name).join(", ") || "None", 1024) },
            ],
            footer: "Roblox",
          }),
        ],
      });
    },
  },
  {
    name: "robloxavatar",
    description: "Show a Roblox avatar.",
    category: "roblox",
    module: "roblox",
    slash: true,
    slashOptions: [{ name: "username", description: "Roblox username or ID", type: "string", required: true }],
    async execute(ctx) {
      const user = await ctx.roblox.users.resolve(ctx.args[0] ?? "");
      const avatar = await ctx.roblox.avatars.avatar(user.id, "420x420");
      if (!avatar) return ctx.error("I could not load that avatar.");
      return ctx.reply({
        embeds: [embed({ title: `${user.displayName}'s avatar`, image: avatar.imageUrl, footer: "Roblox" })],
      });
    },
  },
  {
    name: "robloxgame",
    description: "Look up a Roblox game by universe ID.",
    category: "roblox",
    module: "roblox",
    slash: true,
    slashOptions: [{ name: "universe", description: "Roblox universe ID", type: "string", required: true }],
    async execute(ctx) {
      const id = Number(ctx.args[0]);
      if (!Number.isInteger(id) || id <= 0) return ctx.error("Provide a numeric universe ID.");
      const game = await ctx.roblox.games.game(id);
      const icon = await ctx.roblox.games.icon(id).catch(() => null);
      return ctx.reply({
        embeds: [
          embed({
            title: game.name,
            description: truncate(game.description ?? "No description.", 2000),
            thumbnail: icon ?? undefined,
            fields: [
              { name: "Universe", value: String(game.id), inline: true },
              { name: "Creator", value: game.creator?.name ?? "Unknown", inline: true },
              { name: "Playing", value: formatNumber(game.playing ?? 0), inline: true },
              { name: "Visits", value: formatNumber(game.visits ?? 0), inline: true },
              { name: "Favourites", value: formatNumber(game.favoritedCount ?? 0), inline: true },
              { name: "Max players", value: String(game.maxPlayers ?? "Unknown"), inline: true },
            ],
            footer: "Roblox",
          }),
        ],
      });
    },
  },
  {
    name: "robloxgroup",
    description: "Look up a Roblox group.",
    category: "roblox",
    module: "roblox",
    slash: true,
    slashOptions: [{ name: "group", description: "Roblox group ID", type: "string", required: true }],
    async execute(ctx) {
      const id = Number(ctx.args[0]);
      if (!Number.isInteger(id) || id <= 0) return ctx.error("Provide a numeric group ID.");
      const [group, roles, icon] = await Promise.all([
        ctx.roblox.groups.group(id),
        ctx.roblox.groups.roles(id).catch(() => []),
        ctx.roblox.groups.icon(id).catch(() => null),
      ]);
      return ctx.reply({
        embeds: [
          embed({
            title: group.name,
            description: truncate(group.description ?? "No description.", 2000),
            thumbnail: icon ?? undefined,
            fields: [
              { name: "Group ID", value: String(group.id), inline: true },
              { name: "Members", value: formatNumber(group.memberCount ?? 0), inline: true },
              { name: "Owner", value: group.owner?.name ?? "Unknown", inline: true },
              { name: "Roles", value: truncate(roles.slice(0, 15).map((role) => `${role.name} (${role.rank})`).join(", ") || "None", 1024) },
            ],
            footer: "Roblox",
          }),
        ],
      });
    },
  },
  {
    name: "robloxsearch",
    description: "Search Roblox games.",
    category: "roblox",
    module: "roblox",
    slash: true,
    slashOptions: [{ name: "query", description: "Search terms", type: "string", required: true }],
    async execute(ctx) {
      const games = await ctx.roblox.games.search(ctx.args.join(" "), 10);
      if (games.length === 0) return ctx.ok("No games found.");
      return ctx.reply({
        embeds: [
          embed({
            title: "Roblox game search",
            description: truncate(
              games.map((game) => `**${game.name}** · universe \`${game.id}\` · ${formatNumber(game.playing ?? 0)} playing`).join("\n"),
              4096,
            ),
            footer: "Roblox",
          }),
        ],
      });
    },
  },
  {
    name: "discorduser",
    description: "Look up a Discord user by ID.",
    category: "discord",
    slash: true,
    slashOptions: [{ name: "id", description: "Discord user ID", type: "string", required: true }],
    async execute(ctx) {
      const user = await ctx.resolveUser(ctx.args[0]);
      const fetched = await user.fetch(true).catch(() => user);
      return ctx.reply({
        embeds: [
          embed({
            title: fetched.tag,
            thumbnail: fetched.displayAvatarURL({ size: 256 }),
            fields: [
              { name: "ID", value: fetched.id, inline: true },
              { name: "Bot", value: fetched.bot ? "Yes" : "No", inline: true },
              { name: "Created", value: discordTimestamp(fetched.createdAt, "F"), inline: true },
              { name: "Banner", value: fetched.bannerURL() ? "Available" : "None", inline: true },
            ],
          }),
        ],
      });
    },
  },
  {
    name: "accountage",
    description: "Show how old a Discord account is.",
    category: "discord",
    slash: true,
    slashOptions: [{ name: "member", description: "Member to inspect", type: "member", required: false }],
    async execute(ctx) {
      const member: GuildMember = ctx.args[0] ? await ctx.resolveMember(ctx.args[0]) : ctx.requireMember();
      return ctx.ok(`**${member.user.tag}** created their account ${discordTimestamp(member.user.createdAt, "R")} (${discordTimestamp(member.user.createdAt, "F")}).`);
    },
  },
  {
    name: "discordinvite",
    description: "Inspect a Discord invite.",
    category: "discord",
    slash: true,
    slashOptions: [{ name: "code", description: "Invite code or URL", type: "string", required: true }],
    async execute(ctx) {
      const code = (ctx.args[0] ?? "").replace(/^https?:\/\/(?:discord\.gg|discord\.com\/invite)\//i, "");
      const invite = await ctx.client.fetchInvite(code).catch(() => null);
      if (!invite) return ctx.error("That invite is invalid or expired.");
      return ctx.reply({
        embeds: [
          embed({
            title: `Invite · ${invite.guild?.name ?? "Unknown server"}`,
            thumbnail: invite.guild?.iconURL({ size: 128 }) ?? undefined,
            fields: [
              { name: "Channel", value: invite.channel?.name ? `#${invite.channel.name}` : "Unknown", inline: true },
              { name: "Members", value: invite.memberCount ? formatNumber(invite.memberCount) : "Unknown", inline: true },
              { name: "Expires", value: invite.expiresAt ? discordTimestamp(invite.expiresAt, "R") : "Never", inline: true },
            ],
          }),
        ],
      });
    },
  },
];

export default utility;
