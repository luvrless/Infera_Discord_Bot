import { randomBytes } from "node:crypto";
import { ErrorCode, InferaError, isValidEventName } from "@infera/shared";
import type { FastifyPluginAsync } from "fastify";
import { BASE_PATH, db, services } from "../lib/config";
import { assertGuildAccess, requireConfigAccess, requireModerator } from "../lib/auth";
import { requireSession } from "../lib/session";
import { intParam, pagination, parseJson, stringQuery } from "../lib/http";
import { hub } from "../lib/hub";

const PROVIDERS = ["roblox", "youtube", "twitch", "twitter", "instagram", "tiktok", "reddit"] as const;

function providerConfigKey(provider: string): string | null {
  if (provider === "roblox") return "integrations.roblox.enabled";
  if ((PROVIDERS as readonly string[]).includes(provider)) return `social.${provider}.enabled`;
  return null;
}

export const communityRoutes: FastifyPluginAsync = async (app) => {
  // --------------------------------------------------------------- leveling
  app.get(`${BASE_PATH}/guilds/:guildId/leveling/stats`, async (request) => {
    const session = await requireSession(request);
    const { guildId } = request.params as { guildId: string };
    await assertGuildAccess(session, guildId, { requireBot: true });
    const [aggregate, top, rewards, exclusions] = await Promise.all([
      db.levelingUser.aggregate({
        where: { guildId },
        _count: { id: true },
        _sum: { totalXp: true, messageCount: true },
        _max: { level: true },
      }),
      db.levelingUser.findMany({ where: { guildId }, orderBy: { totalXp: "desc" }, take: 5 }),
      db.levelReward.count({ where: { guildId } }),
      db.levelExclusion.count({ where: { guildId } }),
    ]);
    return {
      members: aggregate._count.id,
      totalXp: aggregate._sum.totalXp ?? 0,
      messages: aggregate._sum.messageCount ?? 0,
      highestLevel: aggregate._max.level ?? 0,
      rewards,
      exclusions,
      top: top.map((row) => ({
        userId: row.userId,
        totalXp: row.totalXp,
        level: row.level,
        messages: row.messageCount,
      })),
    };
  });

  app.get(`${BASE_PATH}/guilds/:guildId/leveling/leaderboard`, async (request) => {
    const session = await requireSession(request);
    const { guildId } = request.params as { guildId: string };
    await assertGuildAccess(session, guildId, { requireBot: true });
    const query = request.query as Record<string, unknown>;
    const { page, pageSize } = pagination(query);
    const type = stringQuery(query.type);
    return services.leveling.getLeaderboard(guildId, {
      page,
      pageSize,
      ...(type === "messages" || type === "voice" || type === "xp" ? { type } : {}),
    });
  });

  app.get(`${BASE_PATH}/guilds/:guildId/leveling/rewards`, async (request) => {
    const session = await requireSession(request);
    const { guildId } = request.params as { guildId: string };
    await assertGuildAccess(session, guildId, { requireBot: true });
    return { rewards: await services.leveling.listRewards(guildId) };
  });

  app.post(`${BASE_PATH}/guilds/:guildId/leveling/rewards`, async (request) => {
    const session = await requireSession(request);
    const { guildId } = request.params as { guildId: string };
    const access = await assertGuildAccess(session, guildId, { requireBot: true });
    requireConfigAccess(access);
    const body = (request.body ?? {}) as { level?: number; roleId?: string };
    if (!body.roleId || !/^\d{17,20}$/.test(body.roleId)) {
      throw new InferaError("Select a role", { code: ErrorCode.VALIDATION_ERROR });
    }
    const level = intParam(body.level, 1, 1, 10_000);
    const reward = await services.leveling.addReward(guildId, level, body.roleId);
    await services.audit.record({ guildId, actorId: access.session.user.id, action: "leveling.reward.add", targetId: body.roleId, metadata: { level } });
    return { reward };
  });

  app.delete(`${BASE_PATH}/guilds/:guildId/leveling/rewards/:rewardId`, async (request) => {
    const session = await requireSession(request);
    const { guildId, rewardId } = request.params as { guildId: string; rewardId: string };
    const access = await assertGuildAccess(session, guildId, { requireBot: true });
    requireConfigAccess(access);
    await services.leveling.removeReward(guildId, rewardId);
    return { removed: true };
  });

  app.get(`${BASE_PATH}/guilds/:guildId/leveling/exclusions`, async (request) => {
    const session = await requireSession(request);
    const { guildId } = request.params as { guildId: string };
    await assertGuildAccess(session, guildId, { requireBot: true });
    return { exclusions: await services.leveling.listExclusions(guildId) };
  });

  app.post(`${BASE_PATH}/guilds/:guildId/leveling/exclusions`, async (request) => {
    const session = await requireSession(request);
    const { guildId } = request.params as { guildId: string };
    const access = await assertGuildAccess(session, guildId, { requireBot: true });
    requireConfigAccess(access);
    const body = (request.body ?? {}) as { targetId?: string; targetType?: string };
    if (!body.targetId || !/^\d{17,20}$/.test(body.targetId)) {
      throw new InferaError("A valid Discord ID is required", { code: ErrorCode.VALIDATION_ERROR });
    }
    const targetType =
      body.targetType === "channel" || body.targetType === "role" ? body.targetType : "user";
    const exclusion = await services.leveling.addExclusion(guildId, targetType, body.targetId);
    return { exclusion };
  });

  app.patch(`${BASE_PATH}/guilds/:guildId/leveling/rewards/:rewardId`, async (request) => {
    const session = await requireSession(request);
    const { guildId, rewardId } = request.params as { guildId: string; rewardId: string };
    const access = await assertGuildAccess(session, guildId, { requireBot: true });
    requireConfigAccess(access);
    const existing = await db.levelReward.findFirst({ where: { id: rewardId, guildId } });
    if (!existing) throw new InferaError("Level reward not found", { code: ErrorCode.NOT_FOUND });
    const body = (request.body ?? {}) as { level?: number; roleId?: string };
    const reward = await db.levelReward.update({
      where: { id: existing.id },
      data: {
        level: typeof body.level === "number" ? intParam(body.level, existing.level, 1, 10_000) : undefined,
        roleId: typeof body.roleId === "string" && /^\d{17,20}$/.test(body.roleId) ? body.roleId : undefined,
      },
    });
    return { reward };
  });

  app.delete(`${BASE_PATH}/guilds/:guildId/leveling/exclusions/:exclusionId`, async (request) => {
    const session = await requireSession(request);
    const { guildId, exclusionId } = request.params as { guildId: string; exclusionId: string };
    const access = await assertGuildAccess(session, guildId, { requireBot: true });
    requireConfigAccess(access);
    await services.leveling.removeExclusion(guildId, exclusionId);
    return { removed: true };
  });

  app.post(`${BASE_PATH}/guilds/:guildId/leveling/reset`, async (request) => {
    const session = await requireSession(request);
    const { guildId } = request.params as { guildId: string };
    const access = await assertGuildAccess(session, guildId, { requireBot: true });
    requireConfigAccess(access);
    const body = (request.body ?? {}) as { scope?: string; userId?: string };
    if (body.scope === "user") {
      if (!body.userId) throw new InferaError("userId is required", { code: ErrorCode.VALIDATION_ERROR });
      await services.leveling.resetUser(guildId, body.userId);
      await services.audit.record({ guildId, actorId: access.session.user.id, action: "leveling.reset.user", targetId: body.userId });
      return { reset: 1 };
    }
    const count = await services.leveling.resetGuild(guildId);
    await services.audit.record({ guildId, actorId: access.session.user.id, action: "leveling.reset.guild" });
    return { reset: count };
  });

  // ---------------------------------------------------------------- economy
  app.get(`${BASE_PATH}/guilds/:guildId/economy/overview`, async (request) => {
    const session = await requireSession(request);
    const { guildId } = request.params as { guildId: string };
    await assertGuildAccess(session, guildId, { requireBot: true });
    const [aggregate, accounts, richest, transactions, items] = await Promise.all([
      db.economyAccount.aggregate({ where: { guildId }, _count: { id: true }, _sum: { wallet: true, bank: true, lifetime: true } }),
      db.economyAccount.count({ where: { guildId } }),
      db.economyAccount.findMany({ where: { guildId }, orderBy: { wallet: "desc" }, take: 10 }),
      db.economyTransaction.findMany({ where: { guildId }, orderBy: { createdAt: "desc" }, take: 20 }),
      db.economyItem.findMany({ where: { guildId }, orderBy: { price: "asc" } }),
    ]);
    return {
      accounts,
      wallet: aggregate._sum.wallet ?? 0,
      bank: aggregate._sum.bank ?? 0,
      lifetime: aggregate._sum.lifetime ?? 0,
      richest: richest.map((row) => ({ userId: row.userId, wallet: row.wallet, bank: row.bank })),
      transactions,
      items,
    };
  });

  app.post(`${BASE_PATH}/guilds/:guildId/economy/items`, async (request) => {
    const session = await requireSession(request);
    const { guildId } = request.params as { guildId: string };
    const access = await assertGuildAccess(session, guildId, { requireBot: true });
    requireConfigAccess(access);
    const body = (request.body ?? {}) as Record<string, unknown>;
    const name = String(body.name ?? "").trim();
    if (!name) throw new InferaError("An item name is required", { code: ErrorCode.VALIDATION_ERROR });
    const item = await db.economyItem.create({
      data: {
        guildId,
        name: name.slice(0, 80),
        description: body.description ? String(body.description).slice(0, 500) : null,
        category: body.category ? String(body.category).slice(0, 40) : "misc",
        price: intParam(body.price, 100, 0, 100_000_000),
        stock: body.stock === null || body.stock === undefined ? null : intParam(body.stock, 0, 0, 1_000_000),
        roleId: typeof body.roleId === "string" && /^\d{17,20}$/.test(body.roleId) ? body.roleId : null,
        consumable: Boolean(body.consumable),
        enabled: body.enabled !== false,
      },
    });
    return { item };
  });

  app.patch(`${BASE_PATH}/guilds/:guildId/economy/items/:itemId`, async (request) => {
    const session = await requireSession(request);
    const { guildId, itemId } = request.params as { guildId: string; itemId: string };
    const access = await assertGuildAccess(session, guildId, { requireBot: true });
    requireConfigAccess(access);
    const body = (request.body ?? {}) as Record<string, unknown>;
    const existing = await db.economyItem.findFirst({ where: { id: itemId, guildId } });
    if (!existing) throw new InferaError("Item not found", { code: ErrorCode.NOT_FOUND });
    const item = await db.economyItem.update({
      where: { id: itemId },
      data: {
        ...(typeof body.name === "string" && body.name.trim() ? { name: body.name.trim().slice(0, 80) } : {}),
        ...(typeof body.description === "string" ? { description: body.description.slice(0, 500) } : {}),
        ...(typeof body.price === "number" ? { price: intParam(body.price, existing.price, 0, 100_000_000) } : {}),
        ...(typeof body.stock === "number" ? { stock: intParam(body.stock, 0, 0, 1_000_000) } : {}),
        ...(typeof body.enabled === "boolean" ? { enabled: body.enabled } : {}),
        ...(typeof body.consumable === "boolean" ? { consumable: body.consumable } : {}),
      },
    });
    return { item };
  });

  app.delete(`${BASE_PATH}/guilds/:guildId/economy/items/:itemId`, async (request) => {
    const session = await requireSession(request);
    const { guildId, itemId } = request.params as { guildId: string; itemId: string };
    const access = await assertGuildAccess(session, guildId, { requireBot: true });
    requireConfigAccess(access);
    const result = await db.economyItem.deleteMany({ where: { id: itemId, guildId } });
    if (result.count === 0) throw new InferaError("Item not found", { code: ErrorCode.NOT_FOUND });
    return { removed: true };
  });

  app.get(`${BASE_PATH}/guilds/:guildId/economy/transactions`, async (request) => {
    const session = await requireSession(request);
    const { guildId } = request.params as { guildId: string };
    const access = await assertGuildAccess(session, guildId, { requireBot: true });
    requireModerator(access);
    const { page, pageSize } = pagination(request.query as Record<string, unknown>);
    const [total, rows] = await db.$transaction([
      db.economyTransaction.count({ where: { guildId } }),
      db.economyTransaction.findMany({
        where: { guildId },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { total, page, pageSize, transactions: rows };
  });

  // ---------------------------------------------------------------- tickets
  app.get(`${BASE_PATH}/guilds/:guildId/tickets`, async (request) => {
    const session = await requireSession(request);
    const { guildId } = request.params as { guildId: string };
    const access = await assertGuildAccess(session, guildId, { requireBot: true });
    requireModerator(access);
    const status = stringQuery((request.query as Record<string, unknown>).status);
    const [tickets, stats, panels] = await Promise.all([
      services.tickets.list(guildId, status),
      services.tickets.stats(guildId),
      services.tickets.panels(guildId),
    ]);
    return { tickets, stats, panels };
  });

  app.post(`${BASE_PATH}/guilds/:guildId/tickets/:ticketId/:action`, async (request) => {
    const session = await requireSession(request);
    const { guildId, ticketId, action } = request.params as {
      guildId: string;
      ticketId: string;
      action: string;
    };
    const access = await assertGuildAccess(session, guildId, { requireBot: true });
    requireModerator(access);
    if (action === "claim") {
      return { ticket: await services.tickets.claim(guildId, ticketId, access.session.user.id) };
    }
    if (action === "close") {
      const body = (request.body ?? {}) as { reason?: string };
      return { ticket: await services.tickets.close(guildId, ticketId, access.session.user.id, body.reason) };
    }
    if (action === "reopen") {
      return { ticket: await services.tickets.reopen(guildId, ticketId, access.session.user.id) };
    }
    if (action === "priority") {
      const body = (request.body ?? {}) as { priority?: string };
      return { ticket: await services.tickets.setPriority(guildId, ticketId, body.priority ?? "normal") };
    }
    throw new InferaError("Unsupported ticket action", { code: ErrorCode.VALIDATION_ERROR });
  });

  app.post(`${BASE_PATH}/guilds/:guildId/tickets/panels`, async (request) => {
    const session = await requireSession(request);
    const { guildId } = request.params as { guildId: string };
    const access = await assertGuildAccess(session, guildId, { requireBot: true });
    requireConfigAccess(access);
    const body = (request.body ?? {}) as { title?: string; description?: string; channelId?: string; categoryId?: string };
    if (!body.title?.trim()) throw new InferaError("A panel title is required", { code: ErrorCode.VALIDATION_ERROR });
    const panel = await services.tickets.createPanel(guildId, {
      title: body.title.trim().slice(0, 120),
      description: body.description?.slice(0, 2000),
      channelId: body.channelId,
      categoryId: body.categoryId,
    });
    return { panel };
  });

  app.delete(`${BASE_PATH}/guilds/:guildId/tickets/panels/:panelId`, async (request) => {
    const session = await requireSession(request);
    const { guildId, panelId } = request.params as { guildId: string; panelId: string };
    const access = await assertGuildAccess(session, guildId, { requireBot: true });
    requireConfigAccess(access);
    await services.tickets.deletePanel(guildId, panelId);
    return { removed: true };
  });

  // -------------------------------------------------------------- giveaways
  app.get(`${BASE_PATH}/guilds/:guildId/giveaways`, async (request) => {
    const session = await requireSession(request);
    const { guildId } = request.params as { guildId: string };
    const access = await assertGuildAccess(session, guildId, { requireBot: true });
    requireModerator(access);
    const status = stringQuery((request.query as Record<string, unknown>).status);
    const giveaways = await db.giveaway.findMany({
      where: { guildId, ...(status ? { status } : {}) },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { entries: { select: { userId: true, won: true } } },
    });
    return { giveaways };
  });

  app.post(`${BASE_PATH}/guilds/:guildId/giveaways`, async (request) => {
    const session = await requireSession(request);
    const { guildId } = request.params as { guildId: string };
    const access = await assertGuildAccess(session, guildId, { requireBot: true });
    requireModerator(access);
    const body = (request.body ?? {}) as {
      channelId?: string;
      prize?: string;
      winners?: number;
      durationSeconds?: number;
      requiredRoles?: string[];
      excludedRoles?: string[];
    };
    if (!body.channelId || !body.prize?.trim()) {
      throw new InferaError("A channel and prize are required", { code: ErrorCode.VALIDATION_ERROR });
    }
    const giveaway = await services.giveaways.create({
      guildId,
      channelId: body.channelId,
      hostId: access.session.user.id,
      prize: body.prize.trim().slice(0, 200),
      winners: body.winners ? intParam(body.winners, 1, 1, 100) : undefined,
      durationSeconds: body.durationSeconds ? intParam(body.durationSeconds, 86_400, 10, 2_592_000) : undefined,
      requiredRoles: body.requiredRoles,
      excludedRoles: body.excludedRoles,
    });
    return { giveaway };
  });

  app.post(`${BASE_PATH}/guilds/:guildId/giveaways/:giveawayId/:action`, async (request) => {
    const session = await requireSession(request);
    const { guildId, giveawayId, action } = request.params as { guildId: string; giveawayId: string; action: string };
    const access = await assertGuildAccess(session, guildId, { requireBot: true });
    requireModerator(access);
    const existing = await db.giveaway.findFirst({ where: { id: giveawayId, guildId } });
    if (!existing) throw new InferaError("Giveaway not found", { code: ErrorCode.NOT_FOUND });
    if (action === "end") return { result: await services.giveaways.end(giveawayId) };
    if (action === "cancel") {
      await services.giveaways.cancel(giveawayId, access.session.user.id);
      return { cancelled: true };
    }
    if (action === "reroll") return { winners: await services.giveaways.reroll(giveawayId) };
    throw new InferaError("Unsupported giveaway action", { code: ErrorCode.VALIDATION_ERROR });
  });

  // ------------------------------------------------------------ suggestions
  app.get(`${BASE_PATH}/guilds/:guildId/suggestions`, async (request) => {
    const session = await requireSession(request);
    const { guildId } = request.params as { guildId: string };
    const access = await assertGuildAccess(session, guildId, { requireBot: true });
    const status = stringQuery((request.query as Record<string, unknown>).status);
    const suggestions = await services.suggestions.list(guildId, status);
    // Anonymous authors are only visible to administrators.
    const canSeeAnonymous = access.level >= 3;
    return {
      suggestions: suggestions.map((suggestion) =>
        suggestion.anonymous && !canSeeAnonymous ? { ...suggestion, userId: null } : suggestion,
      ),
    };
  });

  app.post(`${BASE_PATH}/guilds/:guildId/suggestions/:suggestionId/review`, async (request) => {
    const session = await requireSession(request);
    const { guildId, suggestionId } = request.params as { guildId: string; suggestionId: string };
    const access = await assertGuildAccess(session, guildId, { requireBot: true });
    requireModerator(access);
    const body = (request.body ?? {}) as { decision?: string; note?: string };
    if (body.decision !== "approved" && body.decision !== "denied") {
      throw new InferaError("decision must be approved or denied", { code: ErrorCode.VALIDATION_ERROR });
    }
    const suggestion = await services.suggestions.review(
      guildId,
      suggestionId,
      access.session.user.id,
      body.decision,
      body.note,
    );
    return { suggestion };
  });

  // ------------------------------------------------------------ roles/panels
  app.get(`${BASE_PATH}/guilds/:guildId/roles/autoroles`, async (request) => {
    const session = await requireSession(request);
    const { guildId } = request.params as { guildId: string };
    await assertGuildAccess(session, guildId, { requireBot: true });
    const values = await services.config.getValues(guildId);
    return { roleIds: values["welcome.autoroles"] ?? [] };
  });

  app.put(`${BASE_PATH}/guilds/:guildId/roles/autoroles`, async (request) => {
    const session = await requireSession(request);
    const { guildId } = request.params as { guildId: string };
    const access = await assertGuildAccess(session, guildId, { requireBot: true });
    requireConfigAccess(access);
    const body = (request.body ?? {}) as { roleIds?: unknown };
    if (!Array.isArray(body.roleIds)) throw new InferaError("roleIds must be an array", { code: ErrorCode.VALIDATION_ERROR });
    const roleIds = body.roleIds.filter((id): id is string => typeof id === "string" && /^\d{17,20}$/.test(id)).slice(0, 50);
    await services.config.update(guildId, { "welcome.autoroles": roleIds }, access.session.user.id);
    await services.audit.record({ guildId, actorId: access.session.user.id, action: "roles.autoroles.update", metadata: { roleIds } });
    return { roleIds };
  });

  app.get(`${BASE_PATH}/guilds/:guildId/roles/panels`, async (request) => {
    const session = await requireSession(request);
    const { guildId } = request.params as { guildId: string };
    await assertGuildAccess(session, guildId, { requireBot: true });
    return {
      panels: await db.rolePanel.findMany({
        where: { guildId },
        include: { options: { orderBy: { position: "asc" } } },
        orderBy: { createdAt: "desc" },
      }),
    };
  });

  app.post(`${BASE_PATH}/guilds/:guildId/roles/panels`, async (request) => {
    const session = await requireSession(request);
    const { guildId } = request.params as { guildId: string };
    const access = await assertGuildAccess(session, guildId, { requireBot: true });
    requireConfigAccess(access);
    const body = (request.body ?? {}) as {
      title?: string;
      description?: string;
      mode?: string;
      channelId?: string;
      options?: Array<{ roleId?: string; label?: string; emoji?: string }>;
    };
    if (!body.title?.trim()) throw new InferaError("A panel title is required", { code: ErrorCode.VALIDATION_ERROR });
    const options = (body.options ?? [])
      .filter((option) => option.roleId && /^\d{17,20}$/.test(option.roleId))
      .slice(0, 25)
      .map((option, index) => ({
        roleId: option.roleId as string,
        label: (option.label ?? "Role").slice(0, 80),
        emoji: option.emoji?.slice(0, 64) ?? null,
        position: index,
      }));
    const panel = await db.rolePanel.create({
      data: {
        guildId,
        title: body.title.trim().slice(0, 120),
        description: body.description?.slice(0, 2000) ?? null,
        mode: body.mode === "select" ? "select" : "button",
        channelId: body.channelId ?? null,
        options: { create: options },
      },
      include: { options: true },
    });
    await services.audit.record({ guildId, actorId: access.session.user.id, action: "roles.panel.create", targetId: panel.id });
    return { panel };
  });

  app.post(`${BASE_PATH}/guilds/:guildId/roles/panels/:panelId/publish`, async (request) => {
    const session = await requireSession(request);
    const { guildId, panelId } = request.params as { guildId: string; panelId: string };
    const access = await assertGuildAccess(session, guildId, { requireBot: true });
    requireConfigAccess(access);
    const body = (request.body ?? {}) as { channelId?: string };
    const panel = await db.rolePanel.findFirst({
      where: { id: panelId, guildId },
      include: { options: { orderBy: { position: "asc" } } },
    });
    if (!panel) throw new InferaError("Panel not found", { code: ErrorCode.NOT_FOUND });
    if (panel.options.length === 0) {
      throw new InferaError("Add at least one role before publishing", { code: ErrorCode.VALIDATION_ERROR });
    }
    const channelId = body.channelId ?? panel.channelId;
    if (!channelId || !/^\d{17,20}$/.test(channelId)) {
      throw new InferaError("Choose a channel for this panel first", { code: ErrorCode.VALIDATION_ERROR });
    }

    const components =
      panel.mode === "select"
        ? [
            {
              type: 1,
              components: [
                {
                  type: 3,
                  custom_id: `role:select:${panel.id}`,
                  placeholder: "Choose your roles",
                  min_values: 0,
                  max_values: Math.min(25, panel.options.length),
                  options: panel.options.slice(0, 25).map((option) => ({
                    label: option.label,
                    value: option.roleId,
                    ...(option.emoji ? { emoji: { name: option.emoji } } : {}),
                  })),
                },
              ],
            },
          ]
        : Array.from({ length: Math.ceil(Math.min(25, panel.options.length) / 5) }, (_, row) => ({
            type: 1,
            components: panel.options.slice(row * 5, row * 5 + 5).map((option) => ({
              type: 2,
              style: 2,
              label: option.label.slice(0, 80),
              custom_id: `role:panel:${panel.id}:${option.roleId}`,
              ...(option.emoji ? { emoji: { name: option.emoji } } : {}),
            })),
          }));

    const message = await services.discord.sendMessage(channelId, {
      embeds: [
        {
          title: panel.title.slice(0, 256),
          description: panel.description?.slice(0, 4096) || "Choose the roles you want below.",
          color: 0x8b5cf6,
          footer: { text: "INFERA self roles" },
        },
      ],
      components,
    });
    await services.audit.record({
      guildId,
      actorId: access.session.user.id,
      action: "roles.panel.publish",
      targetId: panel.id,
      metadata: { channelId, messageId: message.id },
    });
    return { messageId: message.id, channelId };
  });

  app.delete(`${BASE_PATH}/guilds/:guildId/roles/panels/:panelId`, async (request) => {
    const session = await requireSession(request);
    const { guildId, panelId } = request.params as { guildId: string; panelId: string };
    const access = await assertGuildAccess(session, guildId, { requireBot: true });
    requireConfigAccess(access);
    const result = await db.rolePanel.deleteMany({ where: { id: panelId, guildId } });
    if (result.count === 0) throw new InferaError("Panel not found", { code: ErrorCode.NOT_FOUND });
    return { removed: true };
  });

  // ------------------------------------------------------------ integrations
  app.get(`${BASE_PATH}/guilds/:guildId/integrations`, async (request) => {
    const session = await requireSession(request);
    const { guildId } = request.params as { guildId: string };
    const access = await assertGuildAccess(session, guildId, { requireBot: true });
    const [values, socialFeeds, webhooks, status] = await Promise.all([
      services.config.getValues(guildId),
      db.socialFeed.findMany({ where: { guildId }, orderBy: { createdAt: "desc" } }),
      db.webhookSubscription.findMany({ where: { guildId }, orderBy: { createdAt: "desc" } }),
      Promise.resolve(access.botInstalled),
    ]);
    return {
      providers: PROVIDERS.map((provider) => ({
        id: provider,
        enabled: Boolean(values[providerConfigKey(provider) ?? ""]),
        configKey: providerConfigKey(provider),
      })),
      roblox: {
        enabled: Boolean(values["integrations.roblox.enabled"]),
        cacheTtl: values["integrations.roblox.cache_ttl"],
        profileFormat: values["integrations.roblox.default_profile_format"],
      },
      socialFeeds,
      webhooks: webhooks.map((webhook) => ({
        id: webhook.id,
        url: webhook.url,
        events: parseJson<string[]>(webhook.events, []),
        enabled: webhook.enabled,
        failures: webhook.failures,
        createdAt: webhook.createdAt,
      })),
      botInstalled: status,
    };
  });

  app.patch(`${BASE_PATH}/guilds/:guildId/integrations/:provider`, async (request) => {
    const session = await requireSession(request);
    const { guildId, provider } = request.params as { guildId: string; provider: string };
    const access = await assertGuildAccess(session, guildId, { requireBot: true });
    requireConfigAccess(access);
    const key = providerConfigKey(provider);
    if (!key) throw new InferaError(`Unknown integration: ${provider}`, { code: ErrorCode.VALIDATION_ERROR });
    const body = (request.body ?? {}) as { enabled?: boolean };
    if (typeof body.enabled !== "boolean") {
      throw new InferaError("enabled must be a boolean", { code: ErrorCode.VALIDATION_ERROR });
    }
    await services.config.update(guildId, { [key]: body.enabled }, access.session.user.id);
    await services.audit.record({ guildId, actorId: access.session.user.id, action: "integration.toggle", targetId: provider, metadata: { enabled: body.enabled } });
    return { provider, enabled: body.enabled };
  });

  app.get(`${BASE_PATH}/guilds/:guildId/social-feeds`, async (request) => {
    const session = await requireSession(request);
    const { guildId } = request.params as { guildId: string };
    await assertGuildAccess(session, guildId, { requireBot: true });
    return { feeds: await db.socialFeed.findMany({ where: { guildId } }) };
  });

  app.post(`${BASE_PATH}/guilds/:guildId/social-feeds`, async (request) => {
    const session = await requireSession(request);
    const { guildId } = request.params as { guildId: string };
    const access = await assertGuildAccess(session, guildId, { requireBot: true });
    requireConfigAccess(access);
    const body = (request.body ?? {}) as { provider?: string; sourceId?: string; channelId?: string };
    if (!body.provider || !(PROVIDERS as readonly string[]).includes(body.provider)) {
      throw new InferaError("Choose a supported provider", { code: ErrorCode.VALIDATION_ERROR });
    }
    if (!body.sourceId?.trim() || !body.channelId) {
      throw new InferaError("A source and channel are required", { code: ErrorCode.VALIDATION_ERROR });
    }
    const feed = await db.socialFeed.upsert({
      where: {
        guildId_provider_sourceId: {
          guildId,
          provider: body.provider,
          sourceId: body.sourceId.trim().slice(0, 200),
        },
      },
      create: {
        guildId,
        provider: body.provider,
        sourceId: body.sourceId.trim().slice(0, 200),
        channelId: body.channelId,
      },
      update: { channelId: body.channelId, enabled: true },
    });
    return { feed };
  });

  app.delete(`${BASE_PATH}/guilds/:guildId/social-feeds/:feedId`, async (request) => {
    const session = await requireSession(request);
    const { guildId, feedId } = request.params as { guildId: string; feedId: string };
    const access = await assertGuildAccess(session, guildId, { requireBot: true });
    requireConfigAccess(access);
    await db.socialFeed.deleteMany({ where: { id: feedId, guildId } });
    return { removed: true };
  });

  app.post(`${BASE_PATH}/guilds/:guildId/webhooks`, async (request) => {
    const session = await requireSession(request);
    const { guildId } = request.params as { guildId: string };
    const access = await assertGuildAccess(session, guildId, { requireBot: true });
    requireConfigAccess(access);
    const body = (request.body ?? {}) as { url?: string; events?: string[] };
    let parsed: URL;
    try {
      parsed = new URL(body.url ?? "");
    } catch {
      throw new InferaError("Enter a valid https webhook URL", { code: ErrorCode.VALIDATION_ERROR });
    }
    if (parsed.protocol !== "https:") {
      throw new InferaError("Webhook URLs must use https", { code: ErrorCode.VALIDATION_ERROR });
    }
    const events = (body.events ?? []).filter((event) => isValidEventName(event)).slice(0, 100);
    const secret = `whsec_${randomBytes(24).toString("hex")}`;
    const webhook = await db.webhookSubscription.create({
      data: { guildId, url: parsed.toString(), secret, events: JSON.stringify(events) },
    });
    await services.audit.record({ guildId, actorId: access.session.user.id, action: "webhook.create", targetId: webhook.id });
    return {
      webhook: { id: webhook.id, url: webhook.url, events, enabled: webhook.enabled },
      // Shown exactly once so the operator can store it.
      secret,
    };
  });

  app.delete(`${BASE_PATH}/guilds/:guildId/webhooks/:webhookId`, async (request) => {
    const session = await requireSession(request);
    const { guildId, webhookId } = request.params as { guildId: string; webhookId: string };
    const access = await assertGuildAccess(session, guildId, { requireBot: true });
    requireConfigAccess(access);
    await db.webhookSubscription.deleteMany({ where: { id: webhookId, guildId } });
    return { removed: true };
  });
};
