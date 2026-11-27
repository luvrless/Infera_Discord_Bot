import { PermissionLevel, discordTimestamp, truncate } from "@infera/shared";
import { embed } from "../core/context";
import type { CommandDefinition } from "../core/types";

const Moderator = PermissionLevel.Moderator;
const Admin = PermissionLevel.Admin;

function latestGiveawayId(ctx: Parameters<CommandDefinition["execute"]>[0]): string {
  return (ctx.args[0] ?? "").trim();
}

async function currentTicket(ctx: Parameters<CommandDefinition["execute"]>[0]) {
  const guildId = ctx.requireGuild().id;
  const channelId = ctx.channelId;
  if (!channelId) return null;
  return ctx.services.tickets.getByChannel(guildId, channelId);
}

const community: CommandDefinition[] = [
  // ------------------------------------------------------------- confessions
  {
    name: "confess",
    description: "Post an anonymous confession in this server.",
    category: "community",
    cooldownMs: 60_000,
    slash: true,
    slashOptions: [{ name: "text", description: "Your confession", type: "string", required: true }],
    async execute(ctx) {
      const guild = ctx.requireGuild();
      const values = await ctx.services.config.getValues(guild.id);
      if (values["confessions.enabled"] !== true) {
        return ctx.error("Confessions are not enabled in this server.");
      }
      const channelId = values["confessions.channel_id"];
      if (typeof channelId !== "string" || !/^\d{17,20}$/.test(channelId)) {
        return ctx.error("No confession channel has been configured. Ask an administrator to set one in the dashboard.");
      }
      const text = ctx.args.join(" ").trim();
      if (text.length < 3) return ctx.error("Write your confession first.");
      const channel = await ctx.client.channels.fetch(channelId).catch(() => null);
      if (!channel || !channel.isTextBased() || !channel.isSendable()) {
        return ctx.error("The confession channel is missing. Ask an administrator to update it in the dashboard.");
      }
      await channel.send({
        embeds: [
          embed({
            title: "Anonymous confession",
            description: truncate(text, 3900),
            footer: `Confession in ${guild.name}`,
          }),
        ],
        allowedMentions: { parse: [] },
      });
      return ctx.reply({ content: "Your confession was posted anonymously.", ephemeral: true });
    },
  },

  // ------------------------------------------------------------- suggestions
  {
    name: "suggest",
    description: "Submit a suggestion for this server.",
    category: "community",
    module: "suggestions",
    cooldownMs: 10_000,
    slash: true,
    slashOptions: [
      { name: "suggestion", description: "Your suggestion", type: "string", required: true },
      { name: "anonymous", description: "Hide your name", type: "boolean", required: false },
    ],
    async execute(ctx) {
      const guildId = ctx.requireGuild().id;
      const anonymous = ctx.isSlash
        ? (ctx.args[1] ?? "").toLowerCase() === "true"
        : ["true", "yes", "anonymous"].includes((ctx.args[ctx.args.length - 1] ?? "").toLowerCase());
      const content = ctx.isSlash
        ? (ctx.args[0] ?? "").trim()
        : (anonymous ? ctx.args.slice(0, -1) : ctx.args).join(" ").trim();
      if (content.length < 5) return ctx.error("Please write a suggestion first.");
      const suggestion = await ctx.services.suggestions.create({
        guildId,
        userId: ctx.user.id,
        content,
        anonymous,
      });
      return ctx.ok(`Suggestion submitted (ID \`${suggestion.id}\`).`);
    },
  },
  {
    name: "suggestions",
    description: "List suggestions in this server.",
    category: "community",
    module: "suggestions",
    slash: true,
    slashOptions: [{ name: "status", description: "pending, approved or denied", type: "string", required: false }],
    async execute(ctx) {
      const rows = await ctx.services.suggestions.list(ctx.requireGuild().id, ctx.args[0]);
      if (rows.length === 0) return ctx.ok("No suggestions found.");
      return ctx.reply({
        embeds: [
          embed({
            title: "Suggestions",
            description: truncate(
              rows
                .slice(0, 15)
                .map(
                  (row) =>
                    `\`${row.id.slice(0, 8)}\` · **${row.status}** · 👍 ${row.upvotes} / 👎 ${row.downvotes}\n${truncate(row.content, 180)}`,
                )
                .join("\n\n"),
              4096,
            ),
            footer: `${rows.length} suggestion(s)`,
          }),
        ],
      });
    },
  },
  {
    name: "suggestionapprove",
    description: "Approve a suggestion.",
    category: "community",
    level: Moderator,
    module: "suggestions",
    slash: true,
    slashOptions: [
      { name: "id", description: "Suggestion ID", type: "string", required: true },
      { name: "note", description: "Staff note", type: "string", required: false },
    ],
    async execute(ctx) {
      const id = ctx.args[0] ?? "";
      const note = ctx.args.slice(1).join(" ").trim() || undefined;
      const row = await ctx.services.suggestions.review(ctx.requireGuild().id, id, ctx.user.id, "approved", note);
      return ctx.ok(`Suggestion \`${row.id.slice(0, 8)}\` approved.`);
    },
  },
  {
    name: "suggestiondeny",
    description: "Deny a suggestion.",
    category: "community",
    level: Moderator,
    module: "suggestions",
    slash: true,
    slashOptions: [
      { name: "id", description: "Suggestion ID", type: "string", required: true },
      { name: "note", description: "Staff note", type: "string", required: false },
    ],
    async execute(ctx) {
      const id = ctx.args[0] ?? "";
      const note = ctx.args.slice(1).join(" ").trim() || undefined;
      const row = await ctx.services.suggestions.review(ctx.requireGuild().id, id, ctx.user.id, "denied", note);
      return ctx.ok(`Suggestion \`${row.id.slice(0, 8)}\` denied.`);
    },
  },

  // ---------------------------------------------------------------- giveaways
  {
    name: "gstart",
    description: "Start a giveaway in this channel.",
    category: "giveaways",
    level: Admin,
    module: "giveaways",
    slash: true,
    slashOptions: [
      { name: "prize", description: "What are you giving away?", type: "string", required: true },
      { name: "duration", description: "e.g. 10m, 1h, 2d", type: "string", required: true },
      { name: "winners", description: "Number of winners", type: "integer", required: false, min: 1, max: 100 },
    ],
    async execute(ctx) {
      const guild = ctx.requireGuild();
      const channelId = ctx.channelId;
      if (!channelId) return ctx.error("This channel cannot host a giveaway.");
      const prize = (ctx.args[0] ?? "").trim();
      if (!prize) return ctx.error("Provide a prize.");
      const durationSeconds = Math.round(ctx.duration(1) / 1000);
      const winners = Math.max(1, Number(ctx.args[2] ?? 1));
      const giveaway = await ctx.services.giveaways.create({
        guildId: guild.id,
        channelId,
        hostId: ctx.user.id,
        prize,
        winners,
        durationSeconds,
      });
      return ctx.ok(
        `Giveaway started for **${prize}** — ${winners} winner(s), ends ${discordTimestamp(giveaway.endsAt, "R")}.\nID: \`${giveaway.id}\``,
      );
    },
  },
  {
    name: "gend",
    description: "End a giveaway early.",
    category: "giveaways",
    level: Admin,
    module: "giveaways",
    slash: true,
    slashOptions: [{ name: "id", description: "Giveaway ID (blank for the latest)", type: "string", required: false }],
    async execute(ctx) {
      const guildId = ctx.requireGuild().id;
      const id = latestGiveawayId(ctx);
      const giveaway = id
        ? await ctx.services.giveaways.get(guildId, id)
        : (await ctx.services.giveaways.list(guildId, "active"))[0];
      if (!giveaway) return ctx.error("No active giveaway found.");
      const result = await ctx.services.giveaways.end(giveaway.id);
      return ctx.ok(
        result.winners.length
          ? `Giveaway ended. Winners: ${result.winners.map((winner) => `<@${winner}>`).join(", ")}`
          : "Giveaway ended with no valid entries.",
      );
    },
  },
  {
    name: "greroll",
    description: "Reroll a giveaway's winners.",
    category: "giveaways",
    level: Admin,
    module: "giveaways",
    slash: true,
    slashOptions: [
      { name: "id", description: "Giveaway ID", type: "string", required: true },
      { name: "winners", description: "How many winners to draw", type: "integer", required: false, min: 1, max: 100 },
    ],
    async execute(ctx) {
      const guildId = ctx.requireGuild().id;
      const id = ctx.args[0] ?? "";
      if (!id) return ctx.error("Provide the giveaway ID.");
      const winners = await ctx.services.giveaways.reroll(id, ctx.args[1] ? Number(ctx.args[1]) : undefined);
      return ctx.ok(winners.length ? `New winners: ${winners.map((winner) => `<@${winner}>`).join(", ")}` : "No eligible entries to reroll.");
    },
  },
  {
    name: "gcancel",
    description: "Cancel an active giveaway.",
    category: "giveaways",
    level: Admin,
    module: "giveaways",
    slash: true,
    slashOptions: [{ name: "id", description: "Giveaway ID", type: "string", required: true }],
    async execute(ctx) {
      const id = ctx.args[0] ?? "";
      if (!id) return ctx.error("Provide the giveaway ID.");
      await ctx.services.giveaways.cancel(id, ctx.user.id);
      return ctx.ok("Giveaway cancelled.");
    },
  },
  {
    name: "glist",
    description: "List giveaways in this server.",
    category: "giveaways",
    level: Admin,
    module: "giveaways",
    slash: true,
    slashOptions: [{ name: "status", description: "active, ended or cancelled", type: "string", required: false }],
    async execute(ctx) {
      const rows = await ctx.services.giveaways.list(ctx.requireGuild().id, ctx.args[0]);
      if (rows.length === 0) return ctx.ok("No giveaways found.");
      return ctx.reply({
        embeds: [
          embed({
            title: "Giveaways",
            description: rows
              .slice(0, 15)
              .map(
                (row) =>
                  `\`${row.id.slice(0, 8)}\` · **${row.prize}** · ${row.status} · ${row.winners} winner(s) · ends ${discordTimestamp(row.endsAt, "R")}`,
              )
              .join("\n"),
            footer: `${rows.length} giveaway(s)`,
          }),
        ],
      });
    },
  },

  // ------------------------------------------------------------------ tickets
  {
    name: "ticket",
    description: "Open a support ticket.",
    category: "tickets",
    module: "tickets",
    cooldownMs: 20_000,
    slash: true,
    slashOptions: [
      { name: "subject", description: "What do you need help with?", type: "string", required: false },
      { name: "priority", description: "low, normal, high or urgent", type: "string", required: false, choices: [{ name: "low", value: "low" }, { name: "normal", value: "normal" }, { name: "high", value: "high" }, { name: "urgent", value: "urgent" }] },
    ],
    async execute(ctx) {
      await ctx.defer(true);
      const guildId = ctx.requireGuild().id;
      const ticket = await ctx.services.tickets.create({
        guildId,
        userId: ctx.user.id,
        subject: ctx.args[0]?.trim() || undefined,
        priority: (ctx.args[1] as "low" | "normal" | "high" | "urgent" | undefined) || undefined,
      });
      return ctx.ok(`Ticket **#${ticket.number}** opened in <#${ticket.channelId}>.`);
    },
  },
  {
    name: "ticketclose",
    description: "Close the ticket in this channel.",
    category: "tickets",
    module: "tickets",
    slash: true,
    slashOptions: [{ name: "reason", description: "Why are you closing it?", type: "string", required: false }],
    async execute(ctx) {
      const ticket = await currentTicket(ctx);
      if (!ticket) return ctx.error("This channel is not a ticket.");
      if (ticket.userId !== ctx.user.id && ctx.level < Moderator) {
        return ctx.error("Only the ticket owner or staff can close this ticket.");
      }
      await ctx.defer();
      const reason = ctx.args.join(" ").trim() || undefined;
      await ctx.services.tickets.close(ticket.guildId, ticket.id, ctx.user.id, reason);
      return ctx.ok(`Ticket **#${ticket.number}** closed.`);
    },
  },
  {
    name: "ticketclaim",
    description: "Claim the ticket in this channel.",
    category: "tickets",
    level: Moderator,
    module: "tickets",
    slash: true,
    async execute(ctx) {
      const ticket = await currentTicket(ctx);
      if (!ticket) return ctx.error("This channel is not a ticket.");
      const updated = await ctx.services.tickets.claim(ticket.guildId, ticket.id, ctx.user.id);
      return ctx.ok(`Ticket **#${updated.number}** is now claimed by you.`);
    },
  },
  {
    name: "ticketadd",
    description: "Add a member to the current ticket.",
    category: "tickets",
    level: Moderator,
    module: "tickets",
    slash: true,
    slashOptions: [{ name: "member", description: "Member to add", type: "member", required: true }],
    async execute(ctx) {
      const ticket = await currentTicket(ctx);
      if (!ticket) return ctx.error("This channel is not a ticket.");
      const member = await ctx.resolveMember(ctx.args[0]);
      await ctx.services.tickets.addUser(ticket.guildId, ticket.id, member.id);
      return ctx.ok(`Added **${member.user.tag}** to the ticket.`);
    },
  },
  {
    name: "ticketremove",
    description: "Remove a member from the current ticket.",
    category: "tickets",
    level: Moderator,
    module: "tickets",
    slash: true,
    slashOptions: [{ name: "member", description: "Member to remove", type: "member", required: true }],
    async execute(ctx) {
      const ticket = await currentTicket(ctx);
      if (!ticket) return ctx.error("This channel is not a ticket.");
      const member = await ctx.resolveMember(ctx.args[0]);
      await ctx.services.tickets.removeUser(ticket.guildId, ticket.id, member.id);
      return ctx.ok(`Removed **${member.user.tag}** from the ticket.`);
    },
  },
  {
    name: "ticketpriority",
    description: "Change the current ticket's priority.",
    category: "tickets",
    level: Moderator,
    module: "tickets",
    slash: true,
    slashOptions: [{ name: "priority", description: "low, normal, high or urgent", type: "string", required: true }],
    async execute(ctx) {
      const ticket = await currentTicket(ctx);
      if (!ticket) return ctx.error("This channel is not a ticket.");
      const updated = await ctx.services.tickets.setPriority(ticket.guildId, ticket.id, ctx.args[0] ?? "normal");
      return ctx.ok(`Ticket **#${updated.number}** priority set to **${updated.priority}**.`);
    },
  },
  {
    name: "ticketrename",
    description: "Rename the current ticket channel.",
    category: "tickets",
    level: Moderator,
    module: "tickets",
    slash: true,
    slashOptions: [{ name: "name", description: "New channel name", type: "string", required: true }],
    async execute(ctx) {
      const ticket = await currentTicket(ctx);
      if (!ticket) return ctx.error("This channel is not a ticket.");
      await ctx.services.tickets.rename(ticket.guildId, ticket.id, ctx.args.join("-").toLowerCase());
      return ctx.ok("Ticket renamed.");
    },
  },
  {
    name: "ticketinfo",
    description: "Show information about the current ticket.",
    category: "tickets",
    level: Moderator,
    module: "tickets",
    slash: true,
    async execute(ctx) {
      const ticket = await currentTicket(ctx);
      if (!ticket) return ctx.error("This channel is not a ticket.");
      return ctx.reply({
        embeds: [
          embed({
            title: `Ticket #${ticket.number}`,
            fields: [
              { name: "Status", value: ticket.status, inline: true },
              { name: "Priority", value: ticket.priority, inline: true },
              { name: "Opened by", value: `<@${ticket.userId}>`, inline: true },
              { name: "Claimed by", value: ticket.claimedBy ? `<@${ticket.claimedBy}>` : "Unclaimed", inline: true },
              { name: "Opened", value: discordTimestamp(ticket.createdAt, "F"), inline: true },
              { name: "Subject", value: truncate(ticket.subject ?? "No subject", 1024) },
            ],
          }),
        ],
      });
    },
  },
  {
    name: "ticketstats",
    description: "Show ticket statistics for this server.",
    category: "tickets",
    level: Moderator,
    module: "tickets",
    slash: true,
    async execute(ctx) {
      const stats = await ctx.services.tickets.stats(ctx.requireGuild().id);
      return ctx.reply({
        embeds: [
          embed({
            title: "Ticket statistics",
            fields: [
              { name: "Open", value: String(stats.open), inline: true },
              { name: "Closed", value: String(stats.closed), inline: true },
              { name: "Total", value: String(stats.total), inline: true },
            ],
          }),
        ],
      });
    },
  },
  {
    name: "ticketlist",
    description: "List recent tickets in this server.",
    category: "tickets",
    level: Moderator,
    module: "tickets",
    slash: true,
    slashOptions: [{ name: "status", description: "open or closed", type: "string", required: false }],
    async execute(ctx) {
      const rows = await ctx.services.tickets.list(ctx.requireGuild().id, ctx.args[0]);
      if (rows.length === 0) return ctx.ok("No tickets found.");
      return ctx.reply({
        embeds: [
          embed({
            title: "Tickets",
            description: rows
              .slice(0, 15)
              .map(
                (row) =>
                  `**#${row.number}** · ${row.status} · ${row.priority} · <@${row.userId}> · ${discordTimestamp(row.createdAt, "R")}${
                    row.claimedBy ? ` · claimed by <@${row.claimedBy}>` : ""
                  }`,
              )
              .join("\n"),
            footer: `${rows.length} ticket(s)`,
          }),
        ],
      });
    },
  },
  {
    name: "dashboard",
    description: "Get the link to the INFERA dashboard for this server.",
    category: "configuration",
    aliases: ["setup"],
    slash: true,
    async execute(ctx) {
      const base = process.env.WEB_APP_URL ?? "https://infera.wtf";
      const guildId = ctx.guildId ? `?server=${ctx.guildId}` : "";
      return ctx.reply({
        embeds: [
          embed({
            title: "INFERA dashboard",
            description: `All server setup — welcome, logging, autoroles, leveling, tickets, automod and security — is configured in the dashboard, not with setup commands.\n\n[Open the dashboard](${base}/dashboard${guildId})`,
            footer: "Changes apply only to the server you select.",
          }),
        ],
      });
    },
  },
];

export default community;
