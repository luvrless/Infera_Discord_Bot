import {
  DiscordPermissions,
  PermissionLevel,
  formatNumber,
  ordinal,
  progressBar,
} from "@infera/shared";
import { embed } from "../core/context";
import type { CommandDefinition } from "../core/types";

const Admin = PermissionLevel.Admin;
const Moderator = PermissionLevel.Moderator;

const leveling: CommandDefinition[] = [
  {
    name: "rank",
    description: "Show your (or another member's) level and XP.",
    category: "leveling",
    aliases: ["level"],
    module: "leveling",
    slash: true,
    slashOptions: [{ name: "member", description: "Member to inspect", type: "member", required: false }],
    async execute(ctx) {
      const guildId = ctx.requireGuild().id;
      const target = ctx.args[0] ? await ctx.resolveMember(ctx.args[0]) : ctx.requireMember();
      const rank = await ctx.services.leveling.getRank(guildId, target.id);
      if (rank.totalXp === 0) return ctx.ok(ctx.t("commands.leveling.no_data"));
      return ctx.reply({
        embeds: [
          embed({
            title: `${target.user.tag}`,
            thumbnail: target.displayAvatarURL({ size: 256 }),
            fields: [
              { name: "Level", value: String(rank.level), inline: true },
              { name: "Rank", value: `#${rank.rank} / ${rank.total}`, inline: true },
              { name: "Prestige", value: String(rank.prestige), inline: true },
              {
                name: "XP",
                value: `${formatNumber(rank.totalXp)} total\n${progressBar(rank.currentLevelXp, rank.requiredXp, 14)} ${formatNumber(rank.currentLevelXp)}/${formatNumber(rank.requiredXp)}`,
              },
            ],
            footer: `${rank.messages} messages · ${rank.voiceMinutes} voice minutes`,
          }),
        ],
      });
    },
  },
  {
    name: "leaderboard",
    description: "Show the server XP leaderboard.",
    category: "leveling",
    aliases: ["lb", "top"],
    module: "leveling",
    slash: true,
    slashOptions: [{ name: "page", description: "Page number", type: "integer", required: false, min: 1 }],
    async execute(ctx) {
      const guildId = ctx.requireGuild().id;
      const page = Math.max(1, Number(ctx.args[0] ?? 1));
      const result = await ctx.services.leveling.getLeaderboard(guildId, { page, pageSize: 10 });
      if (result.total === 0) return ctx.ok(ctx.t("commands.leveling.no_data"));
      const lines = result.items.map(
        (entry, index) =>
          `${ordinal((page - 1) * 10 + index + 1)} · <@${entry.userId}> · level **${entry.level}** · ${formatNumber(entry.totalXp)} XP`,
      );
      return ctx.reply({
        embeds: [
          embed({
            title: "XP Leaderboard",
            description: lines.join("\n"),
            footer: ctx.t("common.page", { page: result.page, pages: result.pages }),
          }),
        ],
      });
    },
  },
  {
    name: "xpadd",
    description: "Add XP to a member.",
    category: "leveling",
    level: Moderator,
    userPermissions: [DiscordPermissions.ManageGuild],
    module: "leveling",
    slash: true,
    slashOptions: [
      { name: "member", description: "Member", type: "member", required: true },
      { name: "amount", description: "XP amount", type: "integer", required: true, min: 1 },
    ],
    async execute(ctx) {
      const guildId = ctx.requireGuild().id;
      const target = await ctx.resolveMember(ctx.args[0]);
      const amount = Math.max(1, Number(ctx.args[1] ?? 0));
      const result = await ctx.services.leveling.addXp(guildId, target.id, amount, "admin", { ignoreCooldown: true });
      return ctx.ok(`Added **${formatNumber(amount)}** XP to **${target.user.tag}**. They now have **${formatNumber(result.totalXp)}** XP (level ${result.level}).`);
    },
  },
  {
    name: "xpremove",
    description: "Remove XP from a member.",
    category: "leveling",
    level: Moderator,
    userPermissions: [DiscordPermissions.ManageGuild],
    module: "leveling",
    slash: true,
    slashOptions: [
      { name: "member", description: "Member", type: "member", required: true },
      { name: "amount", description: "XP amount", type: "integer", required: true, min: 1 },
    ],
    async execute(ctx) {
      const guildId = ctx.requireGuild().id;
      const target = await ctx.resolveMember(ctx.args[0]);
      const rank = await ctx.services.leveling.getRank(guildId, target.id);
      const next = Math.max(0, rank.totalXp - Math.max(1, Number(ctx.args[1] ?? 0)));
      await ctx.services.leveling.setXp(guildId, target.id, next);
      return ctx.ok(`Set **${target.user.tag}** to **${formatNumber(next)}** XP.`);
    },
  },
  {
    name: "xpset",
    description: "Set a member's total XP.",
    category: "leveling",
    level: Moderator,
    userPermissions: [DiscordPermissions.ManageGuild],
    module: "leveling",
    slash: true,
    slashOptions: [
      { name: "member", description: "Member", type: "member", required: true },
      { name: "amount", description: "Total XP", type: "integer", required: true, min: 0 },
    ],
    async execute(ctx) {
      const guildId = ctx.requireGuild().id;
      const target = await ctx.resolveMember(ctx.args[0]);
      await ctx.services.leveling.setXp(guildId, target.id, Math.max(0, Number(ctx.args[1] ?? 0)));
      return ctx.ok(`Set **${target.user.tag}**'s XP to **${formatNumber(Number(ctx.args[1] ?? 0))}**.`);
    },
  },
  {
    name: "xpmultiplier",
    description: "Set the global XP multiplier.",
    category: "leveling",
    level: Admin,
    module: "leveling",
    slash: true,
    slashOptions: [{ name: "multiplier", description: "Multiplier (0.1 - 10)", type: "number", required: true }],
    async execute(ctx) {
      const multiplier = Number(ctx.args[0] ?? 1);
      if (!Number.isFinite(multiplier) || multiplier < 0 || multiplier > 10) {
        return ctx.error("The multiplier must be between 0 and 10.");
      }
      await ctx.services.config.update(ctx.requireGuild().id, { "leveling.xp_multiplier": multiplier }, ctx.user.id);
      return ctx.ok(`XP multiplier set to **${multiplier}x**.`);
    },
  },
  {
    name: "xpconfig",
    description: "Show the leveling configuration.",
    category: "leveling",
    level: Admin,
    module: "leveling",
    slash: true,
    async execute(ctx) {
      const values = await ctx.services.config.getValues(ctx.requireGuild().id);
      return ctx.reply({
        embeds: [
          embed({
            title: "Leveling configuration",
            fields: Object.entries(values)
              .filter(([key]) => key.startsWith("leveling."))
              .map(([key, value]) => ({ name: key, value: String(value), inline: true })),
          }),
        ],
      });
    },
  },
  {
    name: "xptoggle",
    description: "Enable or disable leveling.",
    category: "leveling",
    level: Admin,
    module: "leveling",
    slash: true,
    slashOptions: [{ name: "state", description: "on or off", type: "string", required: true }],
    async execute(ctx) {
      const state = ["on", "true", "enable", "enabled"].includes((ctx.args[0] ?? "").toLowerCase());
      await ctx.services.config.update(ctx.requireGuild().id, { "leveling.enabled": state }, ctx.user.id);
      return ctx.ok(ctx.t(state ? "modules.leveling.enabled" : "modules.leveling.disabled"));
    },
  },
  {
    name: "xpexclude",
    description: "Exclude a channel, role, or user from earning XP.",
    category: "leveling",
    level: Admin,
    module: "leveling",
    usage: "xpexclude <channel|role|user> <id>",
    slash: true,
    slashOptions: [
      { name: "type", description: "channel, role, or user", type: "string", required: true, choices: [{ name: "channel", value: "channel" }, { name: "role", value: "role" }, { name: "user", value: "user" }] },
      { name: "id", description: "Target ID or mention", type: "string", required: true },
    ],
    async execute(ctx) {
      const guildId = ctx.requireGuild().id;
      const type = (ctx.args[0] ?? "").toLowerCase();
      if (!["channel", "role", "user"].includes(type)) return ctx.error("Type must be channel, role, or user.");
      const id = (ctx.args[1] ?? "").match(/\d{17,20}/)?.[0];
      if (!id) return ctx.error("Provide a valid ID or mention.");
      await ctx.services.leveling.addExclusion(guildId, type as "channel" | "role" | "user", id);
      return ctx.ok(`Excluded ${type} \`${id}\` from XP.`);
    },
  },
  {
    name: "xpinclude",
    description: "Remove an XP exclusion.",
    category: "leveling",
    level: Admin,
    module: "leveling",
    slash: true,
    slashOptions: [{ name: "id", description: "Exclusion record ID", type: "string", required: true }],
    async execute(ctx) {
      const guildId = ctx.requireGuild().id;
      await ctx.services.leveling.removeExclusion(guildId, ctx.args[0] ?? "");
      return ctx.ok("Exclusion removed.");
    },
  },
  {
    name: "levelreward",
    description: "Configure or list level role rewards.",
    category: "leveling",
    level: Admin,
    module: "leveling",
    usage: "levelreward <level> <role>",
    slash: true,
    slashOptions: [
      { name: "level", description: "Level", type: "integer", required: false, min: 1 },
      { name: "role", description: "Role to grant", type: "role", required: false },
    ],
    async execute(ctx) {
      const guildId = ctx.requireGuild().id;
      if (!ctx.args[0]) {
        const rewards = await ctx.services.leveling.listRewards(guildId);
        return ctx.ok(rewards.length ? rewards.map((reward) => `Level **${reward.level}** → <@&${reward.roleId}>`).join("\n") : "No level rewards configured.");
      }
      if (!ctx.args[1]) return ctx.error("Provide a level and a role.");
      const reward = await ctx.services.leveling.addReward(guildId, Number(ctx.args[0]), ctx.args[1]);
      return ctx.ok(`Level **${reward.level}** now grants <@&${reward.roleId}>.`);
    },
  },
  {
    name: "levelrewards",
    description: "List configured level rewards.",
    category: "leveling",
    module: "leveling",
    slash: true,
    async execute(ctx) {
      const rewards = await ctx.services.leveling.listRewards(ctx.requireGuild().id);
      return ctx.ok(rewards.length ? rewards.map((reward) => `Level **${reward.level}** → <@&${reward.roleId}>`).join("\n") : "No level rewards configured.");
    },
  },
  {
    name: "levelrewardremove",
    description: "Remove a level reward.",
    category: "leveling",
    level: Admin,
    module: "leveling",
    slash: true,
    slashOptions: [{ name: "id", description: "Reward record ID", type: "string", required: true }],
    async execute(ctx) {
      await ctx.services.leveling.removeReward(ctx.requireGuild().id, ctx.args[0] ?? "");
      return ctx.ok("Level reward removed.");
    },
  },
  {
    name: "prestige",
    description: "Show your prestige level.",
    category: "leveling",
    module: "leveling",
    slash: true,
    async execute(ctx) {
      const rank = await ctx.services.leveling.getRank(ctx.requireGuild().id, ctx.user.id);
      return ctx.ok(`**${ctx.user.tag}** is prestige **${rank.prestige}** at level **${rank.level}**.`);
    },
  },
  {
    name: "resetlevels",
    description: "Reset XP for a member or the whole server.",
    category: "leveling",
    level: Admin,
    module: "leveling",
    slash: true,
    slashOptions: [{ name: "member", description: "Member to reset (omit for everyone)", type: "member", required: false }],
    async execute(ctx) {
      const guildId = ctx.requireGuild().id;
      if (ctx.args[0]) {
        const target = await ctx.resolveMember(ctx.args[0]);
        await ctx.services.leveling.resetUser(guildId, target.id);
        return ctx.ok(`Reset **${target.user.tag}**'s XP.`);
      }
      const count = await ctx.services.leveling.resetGuild(guildId);
      return ctx.ok(`Reset XP for **${formatNumber(count)}** members.`);
    },
  },
];

export default leveling;
