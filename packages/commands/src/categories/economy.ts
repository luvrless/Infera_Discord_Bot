import { PermissionLevel, formatNumber, ordinal } from "@infera/shared";
import { embed } from "../core/context";
import type { CommandDefinition } from "../core/types";

const Admin = PermissionLevel.Admin;

function amountArg(value: string | undefined): number | "all" {
  if (!value) return 0;
  if (value.toLowerCase() === "all" || value.toLowerCase() === "max") return "all";
  const parsed = Number(value.replace(/[,_]/g, ""));
  return Number.isFinite(parsed) ? Math.floor(parsed) : 0;
}

function money(value: number): string {
  return formatNumber(Math.max(0, Math.floor(value)));
}

const economy: CommandDefinition[] = [
  {
    name: "balance",
    description: "Show your wallet, bank and net worth.",
    category: "economy",
    aliases: ["bal", "wallet"],
    module: "economy",
    slash: true,
    slashOptions: [{ name: "member", description: "Member to inspect", type: "member", required: false }],
    async execute(ctx) {
      const guildId = ctx.requireGuild().id;
      const target = ctx.args[0] ? await ctx.resolveMember(ctx.args[0]) : ctx.requireMember();
      const balance = await ctx.services.economy.getBalance(guildId, target.id);
      return ctx.reply({
        embeds: [
          embed({
            title: `Balance · ${target.user.tag}`,
            thumbnail: target.displayAvatarURL({ size: 128 }),
            fields: [
              { name: "Wallet", value: money(balance.wallet), inline: true },
              { name: "Bank", value: money(balance.bank), inline: true },
              { name: "Net worth", value: money(balance.netWorth), inline: true },
              { name: "Lifetime earned", value: money(balance.lifetime), inline: true },
            ],
            footer: "INFERA economy",
          }),
        ],
      });
    },
  },
  {
    name: "deposit",
    description: "Move money from your wallet into your bank.",
    category: "economy",
    aliases: ["dep"],
    module: "economy",
    slash: true,
    slashOptions: [{ name: "amount", description: "Amount or all", type: "string", required: true }],
    async execute(ctx) {
      const guildId = ctx.requireGuild().id;
      const result = await ctx.services.economy.deposit(guildId, ctx.user.id, amountArg(ctx.args[0]));
      return ctx.ok(`Deposited **${money(result.moved)}**. Wallet: **${money(result.wallet)}** · Bank: **${money(result.bank)}**`);
    },
  },
  {
    name: "withdraw",
    description: "Move money from your bank into your wallet.",
    category: "economy",
    aliases: ["with"],
    module: "economy",
    slash: true,
    slashOptions: [{ name: "amount", description: "Amount or all", type: "string", required: true }],
    async execute(ctx) {
      const guildId = ctx.requireGuild().id;
      const result = await ctx.services.economy.withdraw(guildId, ctx.user.id, amountArg(ctx.args[0]));
      return ctx.ok(`Withdrew **${money(result.moved)}**. Wallet: **${money(result.wallet)}** · Bank: **${money(result.bank)}**`);
    },
  },
  {
    name: "pay",
    description: "Send money from your wallet to another member.",
    category: "economy",
    aliases: ["transfer"],
    module: "economy",
    slash: true,
    slashOptions: [
      { name: "member", description: "Recipient", type: "member", required: true },
      { name: "amount", description: "Amount to send", type: "integer", required: true, min: 1 },
    ],
    async execute(ctx) {
      const guildId = ctx.requireGuild().id;
      const target = await ctx.resolveMember(ctx.args[0]);
      if (target.user.bot) return ctx.error("Bots do not have an economy account.");
      const amount = Number(ctx.args[1] ?? 0);
      if (!Number.isInteger(amount) || amount <= 0) return ctx.error("Provide a positive whole amount.");
      await ctx.services.economy.transfer(guildId, ctx.user.id, target.id, amount, {
        reason: `Paid by ${ctx.user.tag}`,
      });
      return ctx.ok(`Sent **${money(amount)}** to **${target.user.tag}**.`);
    },
  },
  {
    name: "daily",
    description: "Claim your daily reward.",
    category: "economy",
    module: "economy",
    cooldownMs: 5_000,
    slash: true,
    async execute(ctx) {
      const guildId = ctx.requireGuild().id;
      const result = await ctx.services.economy.claimReward(guildId, ctx.user.id, "daily");
      return ctx.ok(`You claimed **${money(result.amount)}**. Next daily available <t:${Math.floor(result.nextAt.getTime() / 1000)}:R>.`);
    },
  },
  {
    name: "weekly",
    description: "Claim your weekly reward.",
    category: "economy",
    module: "economy",
    cooldownMs: 5_000,
    slash: true,
    async execute(ctx) {
      const guildId = ctx.requireGuild().id;
      const result = await ctx.services.economy.claimReward(guildId, ctx.user.id, "weekly");
      return ctx.ok(`You claimed **${money(result.amount)}**. Next weekly available <t:${Math.floor(result.nextAt.getTime() / 1000)}:R>.`);
    },
  },
  {
    name: "monthly",
    description: "Claim your monthly reward.",
    category: "economy",
    module: "economy",
    cooldownMs: 5_000,
    slash: true,
    async execute(ctx) {
      const guildId = ctx.requireGuild().id;
      const result = await ctx.services.economy.claimReward(guildId, ctx.user.id, "monthly");
      return ctx.ok(`You claimed **${money(result.amount)}**. Next monthly available <t:${Math.floor(result.nextAt.getTime() / 1000)}:R>.`);
    },
  },
  {
    name: "work",
    description: "Work a shift for some currency.",
    category: "economy",
    module: "economy",
    cooldownMs: 5_000,
    slash: true,
    async execute(ctx) {
      const guildId = ctx.requireGuild().id;
      const result = await ctx.services.economy.work(guildId, ctx.user.id);
      return ctx.ok(`You earned **${money(result.amount)}**. You can work again <t:${Math.floor(result.nextAt.getTime() / 1000)}:R>.`);
    },
  },
  {
    name: "shop",
    description: "Browse the server shop.",
    category: "economy",
    module: "economy",
    slash: true,
    async execute(ctx) {
      const items = await ctx.services.economy.shopItems(ctx.requireGuild().id);
      if (items.length === 0) return ctx.ok("The shop has no items yet. Staff can add items in the dashboard.");
      return ctx.reply({
        embeds: [
          embed({
            title: "Server shop",
            description: items
              .slice(0, 25)
              .map(
                (item) =>
                  `**${item.name}** — ${money(item.price)}\n${item.description ?? "No description"}${
                    item.stock !== null ? ` · ${item.stock} left` : ""
                  }`,
              )
              .join("\n\n"),
            footer: "Buy an item with /buy <name>",
          }),
        ],
      });
    },
  },
  {
    name: "buy",
    description: "Buy an item from the server shop.",
    category: "economy",
    module: "economy",
    slash: true,
    slashOptions: [{ name: "item", description: "Item name or ID", type: "string", required: true }],
    async execute(ctx) {
      const guildId = ctx.requireGuild().id;
      const query = ctx.args.join(" ").trim().toLowerCase();
      const items = await ctx.services.economy.shopItems(guildId);
      const item =
        items.find((entry) => entry.id === query) ??
        items.find((entry) => entry.name.toLowerCase() === query) ??
        items.find((entry) => entry.name.toLowerCase().includes(query));
      if (!item) return ctx.error("I could not find that item in the shop.");
      const result = await ctx.services.economy.purchaseItem(guildId, ctx.user.id, item.id);
      return ctx.ok(`Purchased **${result.item.name}** for **${money(result.item.price)}**.`);
    },
  },
  {
    name: "sell",
    description: "Sell an item from your inventory back to the shop.",
    category: "economy",
    module: "economy",
    slash: true,
    slashOptions: [
      { name: "item", description: "Item name or ID", type: "string", required: true },
      { name: "quantity", description: "Quantity to sell", type: "integer", required: false, min: 1 },
    ],
    async execute(ctx) {
      const guildId = ctx.requireGuild().id;
      const query = (ctx.args[0] ?? "").toLowerCase();
      const inventory = await ctx.services.economy.getInventory(guildId, ctx.user.id);
      const entry =
        inventory.find((row) => row.itemId === query) ??
        inventory.find((row) => row.name.toLowerCase() === query) ??
        inventory.find((row) => row.name.toLowerCase().includes(query));
      if (!entry) return ctx.error("You do not own that item.");
      const quantity = Math.max(1, Number(ctx.args[1] ?? 1));
      const result = await ctx.services.economy.sellItem(guildId, ctx.user.id, entry.itemId, quantity);
      return ctx.ok(`Sold **${quantity}x ${entry.name}** for **${money(result.refund)}**.`);
    },
  },
  {
    name: "inventory",
    description: "Show the items you own.",
    category: "economy",
    aliases: ["inv"],
    module: "economy",
    slash: true,
    async execute(ctx) {
      const rows = await ctx.services.economy.getInventory(ctx.requireGuild().id, ctx.user.id);
      if (rows.length === 0) return ctx.ok("Your inventory is empty.");
      return ctx.reply({
        embeds: [
          embed({
            title: `Inventory · ${ctx.user.tag}`,
            description: rows
              .map((row) => `**${row.name}** ×${row.quantity}${row.consumable ? " · consumable" : ""}`)
              .join("\n"),
            footer: `${rows.length} item stacks`,
          }),
        ],
      });
    },
  },
  {
    name: "richest",
    description: "Show the server's richest members.",
    category: "economy",
    aliases: ["moneyleaderboard"],
    module: "economy",
    slash: true,
    slashOptions: [{ name: "page", description: "Page", type: "integer", required: false, min: 1 }],
    async execute(ctx) {
      const guildId = ctx.requireGuild().id;
      const page = Math.max(1, Number(ctx.args[0] ?? 1));
      const result = await ctx.services.economy.leaderboard(guildId, { page, pageSize: 10 });
      if (result.total === 0) return ctx.ok("Nobody has an economy account yet.");
      return ctx.reply({
        embeds: [
          embed({
            title: "Richest members",
            description: result.items
              .map(
                (row, index) =>
                  `${ordinal((page - 1) * 10 + index + 1)} · <@${row.userId}> · **${money(row.netWorth)}** net worth`,
              )
              .join("\n"),
            footer: `Page ${result.page}/${result.pages}`,
          }),
        ],
      });
    },
  },
  {
    name: "coinflip",
    description: "Bet currency on a coin flip.",
    category: "economy_games",
    aliases: ["cf"],
    module: "economy",
    slash: true,
    slashOptions: [
      { name: "amount", description: "Amount to bet", type: "integer", required: true, min: 1 },
      { name: "side", description: "heads or tails", type: "string", required: false, choices: [{ name: "heads", value: "heads" }, { name: "tails", value: "tails" }] },
    ],
    async execute(ctx) {
      const guildId = ctx.requireGuild().id;
      const amount = Number(ctx.args[0] ?? 0);
      if (!Number.isInteger(amount) || amount <= 0) return ctx.error("Provide a positive whole bet.");
      const side = (ctx.args[1] ?? "heads").toLowerCase() === "tails" ? "tails" : "heads";
      const enabled = await ctx.services.config.getValue<boolean>(guildId, "economy.gambling_enabled");
      if (!enabled) return ctx.error("Gambling is disabled in this server.");
      const reference = `coinflip:${guildId}:${ctx.user.id}:${Date.now()}`;
      await ctx.services.economy.debit(guildId, ctx.user.id, amount, "gamble_bet", `${reference}:bet`);
      const result = Math.random() < 0.5 ? "heads" : "tails";
      if (result === side) {
        await ctx.services.economy.credit(guildId, ctx.user.id, amount * 2, "gamble_payout", `${reference}:win`);
        return ctx.ok(`The coin landed on **${result}**. You won **${money(amount)}**!`);
      }
      return ctx.error(`The coin landed on **${result}**. You lost **${money(amount)}**.`);
    },
  },
  {
    name: "dice",
    description: "Roll a die and bet on the outcome.",
    category: "economy_games",
    module: "economy",
    slash: true,
    slashOptions: [
      { name: "amount", description: "Amount to bet", type: "integer", required: true, min: 1 },
      { name: "guess", description: "Guess from 1 to 6", type: "integer", required: true, min: 1, max: 6 },
    ],
    async execute(ctx) {
      const guildId = ctx.requireGuild().id;
      const amount = Number(ctx.args[0] ?? 0);
      const guess = Number(ctx.args[1] ?? 0);
      if (!Number.isInteger(amount) || amount <= 0 || guess < 1 || guess > 6) {
        return ctx.error("Provide a positive bet and a guess from 1 to 6.");
      }
      const enabled = await ctx.services.config.getValue<boolean>(guildId, "economy.gambling_enabled");
      if (!enabled) return ctx.error("Gambling is disabled in this server.");
      const reference = `dice:${guildId}:${ctx.user.id}:${Date.now()}`;
      await ctx.services.economy.debit(guildId, ctx.user.id, amount, "gamble_bet", `${reference}:bet`);
      const roll = 1 + Math.floor(Math.random() * 6);
      if (roll === guess) {
        await ctx.services.economy.credit(guildId, ctx.user.id, amount * 6, "gamble_payout", `${reference}:win`);
        return ctx.ok(`You rolled **${roll}** and won **${money(amount * 5)}** profit!`);
      }
      return ctx.error(`You rolled **${roll}**. You lost **${money(amount)}**.`);
    },
  },
  {
    name: "slots",
    description: "Spin the slot machine.",
    category: "economy_games",
    module: "economy",
    slash: true,
    slashOptions: [{ name: "amount", description: "Amount to bet", type: "integer", required: true, min: 1 }],
    async execute(ctx) {
      const guildId = ctx.requireGuild().id;
      const amount = Number(ctx.args[0] ?? 0);
      if (!Number.isInteger(amount) || amount <= 0) return ctx.error("Provide a positive whole bet.");
      const enabled = await ctx.services.config.getValue<boolean>(guildId, "economy.gambling_enabled");
      if (!enabled) return ctx.error("Gambling is disabled in this server.");
      const reference = `slots:${guildId}:${ctx.user.id}:${Date.now()}`;
      await ctx.services.economy.debit(guildId, ctx.user.id, amount, "gamble_bet", `${reference}:bet`);
      const symbols = ["🍒", "🍋", "🔔", "💎", "7️⃣"];
      const roll = Array.from({ length: 3 }, () => symbols[Math.floor(Math.random() * symbols.length)]);
      const unique = new Set(roll).size;
      const multiplier = unique === 1 ? 8 : unique === 2 ? 2 : 0;
      if (multiplier > 0) {
        await ctx.services.economy.credit(guildId, ctx.user.id, amount * multiplier, "gamble_payout", `${reference}:win`);
      }
      return ctx.reply({
        embeds: [
          embed({
            title: "Slot machine",
            description: `**${roll.join(" | ")}**\n\n${multiplier > 0 ? `You won **${money(amount * multiplier)}**!` : `You lost **${money(amount)}**.`}`,
          }),
        ],
      });
    },
  },
  {
    name: "gamble",
    description: "Bet any amount on a 45% chance to double it.",
    category: "economy_games",
    module: "economy",
    cooldownMs: 5_000,
    slash: true,
    slashOptions: [{ name: "amount", description: "Amount to bet", type: "integer", required: true, min: 1 }],
    async execute(ctx) {
      const guildId = ctx.requireGuild().id;
      const amount = Number(ctx.args[0] ?? 0);
      if (!Number.isInteger(amount) || amount <= 0) return ctx.error("Provide a positive whole bet.");
      const enabled = await ctx.services.config.getValue<boolean>(guildId, "economy.gambling_enabled");
      if (!enabled) return ctx.error("Gambling is disabled in this server.");
      const reference = `gamble:${guildId}:${ctx.user.id}:${Date.now()}`;
      await ctx.services.economy.debit(guildId, ctx.user.id, amount, "gamble_bet", `${reference}:bet`);
      if (Math.random() < 0.45) {
        await ctx.services.economy.credit(guildId, ctx.user.id, amount * 2, "gamble_payout", `${reference}:win`);
        return ctx.ok(`You won **${money(amount)}**!`);
      }
      return ctx.error(`You lost **${money(amount)}**.`);
    },
  },
  {
    name: "economyconfig",
    description: "Show the economy configuration.",
    category: "economy",
    level: Admin,
    module: "economy",
    slash: true,
    async execute(ctx) {
      const values = await ctx.services.config.getValues(ctx.requireGuild().id);
      return ctx.reply({
        embeds: [
          embed({
            title: "Economy configuration",
            description: Object.entries(values)
              .filter(([key]) => key.startsWith("economy."))
              .map(([key, value]) => `**${key}** · ${String(value)}`)
              .join("\n"),
            footer: "Edit these in the INFERA dashboard",
          }),
        ],
      });
    },
  },
];

export default economy;
