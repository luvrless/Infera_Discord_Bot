import { toJson, type EconomyAccount, type Prisma, type PrismaClient } from "@infera/database";
import { ErrorCode, InferaError, formatNumber, type Cache } from "@infera/shared";
import type { GuildConfigService } from "./config-service";
import type { RealtimeService } from "./realtime-service";
import type { AnalyticsService } from "./analytics-service";
import { paginationArgs, type Paginated } from "./types";

export type TransactionType =
  | "starting_balance"
  | "transfer"
  | "daily"
  | "weekly"
  | "monthly"
  | "work"
  | "gamble_bet"
  | "gamble_payout"
  | "purchase"
  | "sale"
  | "admin_credit"
  | "admin_debit"
  | "trade";

export class EconomyService {
  constructor(
    private readonly db: PrismaClient,
    private readonly config: GuildConfigService,
    private readonly realtime: RealtimeService,
    private readonly analytics: AnalyticsService,
    private readonly cache: Cache,
  ) {}

  private async assertEnabled(guildId: string): Promise<void> {
    const enabled = await this.config.getValue<boolean>(guildId, "economy.enabled");
    if (!enabled) {
      throw new InferaError("The economy is disabled", {
        code: ErrorCode.FEATURE_DISABLED,
        messageKey: "commands.economy.disabled",
      });
    }
  }

  async ensureAccount(guildId: string, userId: string): Promise<EconomyAccount> {
    const existing = await this.db.economyAccount.findUnique({ where: { guildId_userId: { guildId, userId } } });
    if (existing) return existing;

    const starting = await this.config.getValue<number>(guildId, "economy.starting_balance");
    try {
      return await this.db.$transaction(async (tx) => {
        const account = await tx.economyAccount.create({
          data: { guildId, userId, wallet: starting, lifetime: starting },
        });
        if (starting > 0) {
          await tx.economyTransaction.create({
            data: {
              guildId,
              toId: userId,
              amount: starting,
              type: "starting_balance",
              reference: `starting:${guildId}:${userId}`,
              metadata: toJson({ starting }),
            },
          });
        }
        return account;
      });
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") {
        const account = await this.db.economyAccount.findUnique({ where: { guildId_userId: { guildId, userId } } });
        if (account) return account;
      }
      throw error;
    }
  }

  async getBalance(guildId: string, userId: string) {
    const account = await this.ensureAccount(guildId, userId);
    return {
      wallet: account.wallet,
      bank: account.bank,
      netWorth: account.wallet + account.bank,
      lifetime: account.lifetime,
    };
  }

  private async ledger(
    tx: Prisma.TransactionClient,
    input: {
      guildId: string;
      fromId?: string | null;
      toId?: string | null;
      amount: number;
      type: TransactionType;
      reference?: string | null;
      metadata?: unknown;
    },
  ): Promise<void> {
    await tx.economyTransaction.create({
      data: {
        guildId: input.guildId,
        fromId: input.fromId ?? null,
        toId: input.toId ?? null,
        amount: input.amount,
        type: input.type,
        reference: input.reference ?? null,
        metadata: toJson(input.metadata ?? {}),
      },
    });
  }

  private async publishBalance(guildId: string, userId: string): Promise<void> {
    const account = await this.db.economyAccount.findUnique({ where: { guildId_userId: { guildId, userId } } });
    await this.realtime.publish(guildId, "economy.balance.updated", {
      userId,
      wallet: account?.wallet ?? 0,
      bank: account?.bank ?? 0,
    });
    await this.analytics.recordMetric(guildId, "economy");
    await this.cache.del(`infera:guild:${guildId}:leaderboard:money`);
  }

  /** Move money between two accounts atomically. Idempotent by reference. */
  async transfer(
    guildId: string,
    fromUserId: string,
    toUserId: string,
    amount: number,
    options: { reference?: string; type?: TransactionType; reason?: string } = {},
  ) {
    await this.assertEnabled(guildId);
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new InferaError("Amount must be a positive whole number", { code: ErrorCode.VALIDATION_ERROR });
    }
    if (fromUserId === toUserId) {
      throw new InferaError("You cannot transfer to yourself", { code: ErrorCode.VALIDATION_ERROR });
    }
    const limit = await this.config.getValue<number>(guildId, "economy.transfer_limit");
    if (amount > limit) {
      throw new InferaError(`Transfers are limited to ${formatNumber(limit)}`, { code: ErrorCode.VALIDATION_ERROR });
    }

    await this.ensureAccount(guildId, fromUserId);
    await this.ensureAccount(guildId, toUserId);

    if (options.reference) {
      const existing = await this.db.economyTransaction.findFirst({
        where: { guildId, reference: options.reference },
      });
      if (existing) return { duplicate: true, transactionId: existing.id };
    }

    const result = await this.db.$transaction(async (tx) => {
      const debited = await tx.economyAccount.updateMany({
        where: { guildId, userId: fromUserId, wallet: { gte: amount } },
        data: { wallet: { decrement: amount } },
      });
      if (debited.count === 0) {
        throw new InferaError("You do not have enough funds", {
          code: ErrorCode.INSUFFICIENT_FUNDS,
          messageKey: "commands.economy.insufficient_funds",
        });
      }
      await tx.economyAccount.update({
        where: { guildId_userId: { guildId, userId: toUserId } },
        data: { wallet: { increment: amount }, lifetime: { increment: amount } },
      });
      const ledger = await tx.economyTransaction.create({
        data: {
          guildId,
          fromId: fromUserId,
          toId: toUserId,
          amount,
          type: options.type ?? "transfer",
          reference: options.reference ?? null,
          metadata: toJson({ reason: options.reason ?? null }),
        },
      });
      return ledger;
    });

    await this.realtime.publish(guildId, "economy.transaction.created", {
      fromId: fromUserId,
      toId: toUserId,
      amount,
      transactionId: result.id,
      type: result.type,
    });
    await this.publishBalance(guildId, fromUserId);
    await this.publishBalance(guildId, toUserId);
    return { duplicate: false, transactionId: result.id };
  }

  async credit(
    guildId: string,
    userId: string,
    amount: number,
    type: TransactionType,
    reference?: string,
  ): Promise<void> {
    if (amount <= 0) return;
    await this.ensureAccount(guildId, userId);
    await this.db.$transaction(async (tx) => {
      await tx.economyAccount.update({
        where: { guildId_userId: { guildId, userId } },
        data: { wallet: { increment: amount }, lifetime: { increment: amount } },
      });
      await this.ledger(tx, { guildId, toId: userId, amount, type, reference });
    });
    await this.publishBalance(guildId, userId);
  }

  async debit(
    guildId: string,
    userId: string,
    amount: number,
    type: TransactionType,
    reference?: string,
  ): Promise<void> {
    if (amount <= 0) return;
    await this.ensureAccount(guildId, userId);
    await this.db.$transaction(async (tx) => {
      const debited = await tx.economyAccount.updateMany({
        where: { guildId, userId, wallet: { gte: amount } },
        data: { wallet: { decrement: amount } },
      });
      if (debited.count === 0) {
        throw new InferaError("You do not have enough funds", {
          code: ErrorCode.INSUFFICIENT_FUNDS,
          messageKey: "commands.economy.insufficient_funds",
        });
      }
      await this.ledger(tx, { guildId, fromId: userId, amount, type, reference });
    });
    await this.publishBalance(guildId, userId);
  }

  async claimReward(
    guildId: string,
    userId: string,
    kind: "daily" | "weekly" | "monthly",
  ): Promise<{ amount: number; nextAt: Date }> {
    await this.assertEnabled(guildId);
    const account = await this.ensureAccount(guildId, userId);
    const now = Date.now();
    const configKey =
      kind === "daily" ? "economy.daily_reward" : kind === "weekly" ? "economy.weekly_reward" : "economy.daily_reward";
    const cooldownMs = kind === "daily" ? 86_400_000 : kind === "weekly" ? 604_800_000 : 2_592_000_000;
    const field = kind === "daily" ? "lastDailyAt" : kind === "weekly" ? "lastWeeklyAt" : "lastMonthlyAt";
    const last = account[field] ?? null;

    if (last && now - last.getTime() < cooldownMs) {
      throw new InferaError("You already claimed that reward", {
        code: ErrorCode.COOLDOWN,
        messageKey: "commands.economy.daily.cooldown",
        details: [{ nextAt: new Date(last.getTime() + cooldownMs).toISOString() }],
      });
    }

    const base = await this.config.getValue<number>(guildId, configKey);
    const amount = kind === "monthly" ? base * 10 : base;
    const nextAt = new Date(now + cooldownMs);

    await this.db.$transaction(async (tx) => {
      await tx.economyAccount.update({
        where: { guildId_userId: { guildId, userId } },
        data: {
          wallet: { increment: amount },
          lifetime: { increment: amount },
          [field]: new Date(now),
        } as Prisma.EconomyAccountUpdateInput,
      });
      await this.ledger(tx, { guildId, toId: userId, amount, type: kind });
    });
    await this.publishBalance(guildId, userId);
    return { amount, nextAt };
  }

  async work(guildId: string, userId: string): Promise<{ amount: number; nextAt: Date }> {
    await this.assertEnabled(guildId);
    const account = await this.ensureAccount(guildId, userId);
    const cooldownSeconds = await this.config.getValue<number>(guildId, "economy.work_cooldown");
    const now = Date.now();
    if (account.lastWorkAt && now - account.lastWorkAt.getTime() < cooldownSeconds * 1000) {
      throw new InferaError("You are still on work cooldown", {
        code: ErrorCode.COOLDOWN,
        details: [{ nextAt: new Date(account.lastWorkAt.getTime() + cooldownSeconds * 1000).toISOString() }],
      });
    }
    const amount = 50 + Math.floor(Math.random() * 100);
    await this.db.$transaction(async (tx) => {
      await tx.economyAccount.update({
        where: { guildId_userId: { guildId, userId } },
        data: { wallet: { increment: amount }, lifetime: { increment: amount }, lastWorkAt: new Date(now) },
      });
      await this.ledger(tx, { guildId, toId: userId, amount, type: "work" });
    });
    await this.publishBalance(guildId, userId);
    return { amount, nextAt: new Date(now + cooldownSeconds * 1000) };
  }

  async deposit(guildId: string, userId: string, amount: number | "all"): Promise<{ moved: number; wallet: number; bank: number }> {
    await this.assertEnabled(guildId);
    const account = await this.ensureAccount(guildId, userId);
    const moved = amount === "all" ? account.wallet : Math.min(account.wallet, Math.max(0, amount));
    if (moved <= 0) throw new InferaError("You have nothing to deposit", { code: ErrorCode.VALIDATION_ERROR });
    const updated = await this.db.economyAccount.update({
      where: { guildId_userId: { guildId, userId } },
      data: { wallet: { decrement: moved }, bank: { increment: moved } },
    });
    await this.publishBalance(guildId, userId);
    return { moved, wallet: updated.wallet, bank: updated.bank };
  }

  async withdraw(guildId: string, userId: string, amount: number | "all"): Promise<{ moved: number; wallet: number; bank: number }> {
    await this.assertEnabled(guildId);
    const account = await this.ensureAccount(guildId, userId);
    const moved = amount === "all" ? account.bank : Math.min(account.bank, Math.max(0, amount));
    if (moved <= 0) throw new InferaError("You have nothing to withdraw", { code: ErrorCode.VALIDATION_ERROR });
    const updated = await this.db.economyAccount.update({
      where: { guildId_userId: { guildId, userId } },
      data: { bank: { decrement: moved }, wallet: { increment: moved } },
    });
    await this.publishBalance(guildId, userId);
    return { moved, wallet: updated.wallet, bank: updated.bank };
  }

  async sellItem(guildId: string, userId: string, itemId: string, quantity = 1): Promise<{ refund: number }> {
    await this.assertEnabled(guildId);
    const inventory = await this.db.economyInventory.findUnique({
      where: { guildId_userId_itemId: { guildId, userId, itemId } },
      include: { item: true },
    });
    if (!inventory || inventory.quantity < quantity) {
      throw new InferaError("You do not own that many of that item", { code: ErrorCode.NOT_FOUND });
    }
    const refund = Math.floor(inventory.item.price * 0.5) * quantity;
    await this.db.$transaction(async (tx) => {
      if (inventory.quantity === quantity) {
        await tx.economyInventory.delete({ where: { id: inventory.id } });
      } else {
        await tx.economyInventory.update({
          where: { id: inventory.id },
          data: { quantity: { decrement: quantity } },
        });
      }
      await tx.economyAccount.update({
        where: { guildId_userId: { guildId, userId } },
        data: { wallet: { increment: refund } },
      });
      await this.ledger(tx, {
        guildId,
        toId: userId,
        amount: refund,
        type: "sale",
        metadata: { itemId, quantity },
      });
    });
    await this.publishBalance(guildId, userId);
    return { refund };
  }

  async purchaseItem(guildId: string, userId: string, itemId: string) {
    await this.assertEnabled(guildId);
    const shopEnabled = await this.config.getValue<boolean>(guildId, "economy.shop_enabled");
    if (!shopEnabled) throw new InferaError("The shop is disabled", { code: ErrorCode.FEATURE_DISABLED });
    const item = await this.db.economyItem.findFirst({ where: { id: itemId, guildId, enabled: true } });
    if (!item) throw new InferaError("Item not found", { code: ErrorCode.NOT_FOUND });
    await this.ensureAccount(guildId, userId);

    const result = await this.db.$transaction(async (tx) => {
      if (item.stock !== null && item.stock <= 0) {
        throw new InferaError("That item is out of stock", { code: ErrorCode.CONFLICT });
      }
      const debited = await tx.economyAccount.updateMany({
        where: { guildId, userId, wallet: { gte: item.price } },
        data: { wallet: { decrement: item.price } },
      });
      if (debited.count === 0) {
        throw new InferaError("You do not have enough funds", {
          code: ErrorCode.INSUFFICIENT_FUNDS,
          messageKey: "commands.economy.insufficient_funds",
        });
      }
      if (item.stock !== null) {
        await tx.economyItem.update({ where: { id: item.id }, data: { stock: { decrement: 1 } } });
      }
      const inventory = await tx.economyInventory.upsert({
        where: { guildId_userId_itemId: { guildId, userId, itemId: item.id } },
        create: { guildId, userId, itemId: item.id, quantity: 1 },
        update: { quantity: { increment: 1 } },
      });
      await this.ledger(tx, {
        guildId,
        fromId: userId,
        amount: item.price,
        type: "purchase",
        metadata: { itemId: item.id, name: item.name },
      });
      return inventory;
    });

    await this.publishBalance(guildId, userId);
    await this.realtime.publish(guildId, "economy.item.purchased", {
      userId,
      itemId: item.id,
      name: item.name,
      price: item.price,
    });
    return { item, inventory: result };
  }

  async getInventory(guildId: string, userId: string) {
    const rows = await this.db.economyInventory.findMany({
      where: { guildId, userId },
      include: { item: true },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((row) => ({
      itemId: row.itemId,
      name: row.item.name,
      description: row.item.description,
      quantity: row.quantity,
      consumable: row.item.consumable,
      roleId: row.item.roleId,
    }));
  }

  async listTransactions(guildId: string, options: { page: number; pageSize: number; userId?: string }) {
    const where = {
      guildId,
      ...(options.userId ? { OR: [{ fromId: options.userId }, { toId: options.userId }] } : {}),
    };
    const { skip, take } = paginationArgs(options.page, options.pageSize);
    const [total, rows] = await this.db.$transaction([
      this.db.economyTransaction.count({ where }),
      this.db.economyTransaction.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
    ]);
    return { total, rows };
  }

  async leaderboard(
    guildId: string,
    options: { page: number; pageSize: number } = { page: 1, pageSize: 10 },
  ): Promise<Paginated<{ userId: string; wallet: number; bank: number; netWorth: number }>> {
    const { skip, take } = paginationArgs(options.page, options.pageSize);
    const total = await this.db.economyAccount.count({ where: { guildId } });
    const rows = await this.db.economyAccount.findMany({
      where: { guildId },
      orderBy: [{ wallet: "desc" }, { bank: "desc" }],
      skip,
      take,
    });
    return {
      items: rows.map((row) => ({
        userId: row.userId,
        wallet: row.wallet,
        bank: row.bank,
        netWorth: row.wallet + row.bank,
      })),
      total,
      page: Math.max(1, options.page),
      pageSize: take,
      pages: Math.max(1, Math.ceil(total / take)),
    };
  }

  async shopItems(guildId: string) {
    return this.db.economyItem.findMany({ where: { guildId, enabled: true }, orderBy: { price: "asc" } });
  }

  async createShopItem(
    guildId: string,
    input: { name: string; description?: string; price: number; category?: string; stock?: number | null; roleId?: string | null; consumable?: boolean },
  ) {
    return this.db.economyItem.create({
      data: {
        guildId,
        name: input.name,
        description: input.description ?? null,
        price: input.price,
        category: input.category ?? "misc",
        stock: input.stock ?? null,
        roleId: input.roleId ?? null,
        consumable: input.consumable ?? false,
      },
    });
  }
}
