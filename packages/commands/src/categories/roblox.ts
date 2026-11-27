import { PermissionLevel } from "@infera/shared";
import { embed } from "../core/context";
import type { CommandDefinition } from "../core/types";

const roblox: CommandDefinition[] = [
  {
    name: "robloxfriends",
    description: "List a Roblox player's friends.",
    category: "roblox",
    aliases: ["rfriends"],
    module: "integrations.roblox",
    usage: "robloxfriends <username|id>",
    cooldownMs: 5_000,
    slash: true,
    slashOptions: [{ name: "query", description: "Roblox username or user ID", type: "string", required: true }],
    async execute(ctx) {
      const query = ctx.args.join(" ").trim();
      if (!query) return ctx.error("Provide a Roblox username or user ID.");
      try {
        const profile = await ctx.roblox.users.profile(query);
        const list = profile.friends.slice(0, 20).map((f) => `• **${f.displayName}** (@${f.name}) \`${f.id}\``);
        return ctx.reply({
          embeds: [
            embed({
              title: `${profile.user.name}'s friends (${profile.friends.length})`,
              description: list.length ? list.join("\n") : "No friends found.",
            }),
          ],
        });
      } catch (error) {
        return ctx.error(error instanceof Error ? error.message : "Could not fetch Roblox friends.");
      }
    },
  },
  {
    name: "robloxbadges",
    description: "Show a Roblox player's official Roblox badges.",
    category: "roblox",
    aliases: ["rbadges"],
    module: "integrations.roblox",
    usage: "robloxbadges <username|id>",
    cooldownMs: 5_000,
    slash: true,
    slashOptions: [{ name: "query", description: "Roblox username or user ID", type: "string", required: true }],
    async execute(ctx) {
      const query = ctx.args.join(" ").trim();
      if (!query) return ctx.error("Provide a Roblox username or user ID.");
      try {
        const profile = await ctx.roblox.users.profile(query);
        const list = profile.badges.slice(0, 20).map((b) => `• **${b.name}**`);
        return ctx.reply({
          embeds: [
            embed({
              title: `${profile.user.name}'s Roblox badges (${profile.badges.length})`,
              description: list.length ? list.join("\n") : "No Roblox badges found.",
            }),
          ],
        });
      } catch (error) {
        return ctx.error(error instanceof Error ? error.message : "Could not fetch Roblox badges.");
      }
    },
  },
  {
    name: "robloxconfig",
    description: "Show Roblox integration settings for this server.",
    category: "roblox",
    level: PermissionLevel.Admin,
    module: "integrations.roblox",
    slash: true,
    async execute(ctx) {
      const values = await ctx.services.config.getValues(ctx.requireGuild().id);
      return ctx.reply({
        embeds: [
          embed({
            title: "Roblox integration",
            description: Object.entries(values)
              .filter(([key]) => key.startsWith("integrations.roblox."))
              .map(([key, value]) => `**${key}** · ${String(value)}`)
              .join("\n"),
            footer: "Configure in the INFERA dashboard",
          }),
        ],
      });
    },
  },
];

export default roblox;
