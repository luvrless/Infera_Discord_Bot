/**
 * Dashboard-specific routes. Each route is a thin, authorised wrapper over an
 * existing INFERA service so the web dashboard can manage the same systems the
 * bot commands use (no duplicated business logic).
 */
import { createHmac, randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { createRobloxServices } from "@infera/integrations";
import type { DiscordMember } from "@infera/services";
import { DiscordPermissions, ErrorCode, InferaError, isValidEventName } from "@infera/shared";
import type { FastifyPluginAsync } from "fastify";
import { BASE_PATH, cache, db, services } from "../lib/config";
import { assertGuildAccess, requireConfigAccess, requireModerator } from "../lib/auth";
import { requireSession } from "../lib/session";
import { intParam, parseJson } from "../lib/http";

const roblox = createRobloxServices({ cache, cacheTtlSeconds: 300 });

function isPrivateIp(ip: string): boolean {
  if (ip === "::1" || ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe80:")) return true;
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return false;
  const [a, b] = parts;
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b !== undefined && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b !== undefined && b >= 64 && b <= 127)
  );
}

async function assertSafeWebhookUrl(rawUrl: string): Promise<URL> {
  const parsed = new URL(rawUrl);
  if (parsed.protocol !== "https:") {
    throw new InferaError("Webhook URLs must use https", { code: ErrorCode.VALIDATION_ERROR });
  }
  const host = parsed.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new InferaError("Private or internal webhook destinations are not allowed", { code: ErrorCode.VALIDATION_ERROR });
  }
  if (isIP(host)) {
    if (isPrivateIp(host)) {
      throw new InferaError("Private IP webhook destinations are not allowed", { code: ErrorCode.VALIDATION_ERROR });
    }
  } else {
    const resolved = await lookup(host, { all: true }).catch(() => []);
    if (resolved.length === 0 || resolved.some((entry) => isPrivateIp(entry.address))) {
      throw new InferaError("Webhook destination resolved to a private or unreachable address", {
        code: ErrorCode.VALIDATION_ERROR,
      });
    }
  }
  return parsed;
}

const SNOWFLAKE = /^\d{17,20}$/;
const USER_TTL = 10 * 60_000;

export interface ResolvedUser {
  id: string;
  username: string;
  globalName: string | null;
  nick: string | null;
  avatarUrl: string;
  bot: boolean;
  inGuild: boolean;
  roles: string[];
  joinedAt: string | null;
  timedOutUntil: string | null;
}

const userCache = new Map<string, { expires: number; value: ResolvedUser | null }>();

function avatarUrl(userId: string, avatar: string | null | undefined, guildAvatar?: string | null, guildId?: string): string {
  if (guildAvatar && guildId) {
    return `https://cdn.discordapp.com/guilds/${guildId}/users/${userId}/avatars/${guildAvatar}.png?size=64`;
  }
  if (avatar) return `https://cdn.discordapp.com/avatars/${userId}/${avatar}.${avatar.startsWith("a_") ? "gif" : "png"}?size=64`;
  let index = 0;
  try {
    index = Number((BigInt(userId) >> 22n) % 6n);
  } catch {
    index = 0;
  }
  return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}

function fromMember(guildId: string, member: DiscordMember): ResolvedUser | null {
  if (!member.user) return null;
  return {
    id: member.user.id,
    username: member.user.username,
    globalName: member.user.global_name ?? null,
    nick: member.nick ?? null,
    avatarUrl: avatarUrl(member.user.id, member.user.avatar, member.avatar, guildId),
    bot: Boolean(member.user.bot),
    inGuild: true,
    roles: member.roles,
    joinedAt: member.joined_at ?? null,
    timedOutUntil: member.communication_disabled_until ?? null,
  };
}

async function resolveUser(guildId: string, userId: string): Promise<ResolvedUser | null> {
  const key = `${guildId}:${userId}`;
  const cached = userCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.value;
  let value: ResolvedUser | null = null;
  try {
    value = fromMember(guildId, await services.discord.getGuildMember(guildId, userId));
  } catch {
    try {
      const user = await services.discord.getUser(userId);
      value = {
        id: user.id,
        username: user.username,
        globalName: user.global_name ?? null,
        nick: null,
        avatarUrl: avatarUrl(user.id, user.avatar),
        bot: Boolean(user.bot),
        inGuild: false,
        roles: [],
        joinedAt: null,
        timedOutUntil: null,
      };
    } catch {
      value = null;
    }
  }
  userCache.set(key, { expires: Date.now() + USER_TTL, value });
  return value;
}

async function lockdownState(guildId: string) {
  const last = await db.auditLog.findFirst({
    where: { guildId, action: { in: ["security.lockdown", "security.unlockdown"] } },
    orderBy: { createdAt: "desc" },
  });
  const metadata = parseJson<Record<string, unknown>>(last?.metadata, {});
  return {
    active: last?.action === "security.lockdown",
    since: last?.createdAt ?? null,
    actorId: last?.actorId ?? null,
    reason: typeof metadata.reason === "string" ? metadata.reason : null,
    channels: Array.isArray(metadata.channelIds) ? (metadata.channelIds as string[]) : [],
    lockedCount: typeof metadata.locked === "number" ? metadata.locked : null,
    source: typeof metadata.source === "string" ? metadata.source : "discord",
  };
}

export const dashboardRoutes: FastifyPluginAsync = async (app) => {
  // ------------------------------------------------------------ members
  app.get(`${BASE_PATH}/guilds/:guildId/members/search`, async (request) => {
    const session = await requireSession(request);
    const { guildId } = request.params as { guildId: string };
    await assertGuildAccess(session, guildId, { requireBot: true });
    const query = String((request.query as Record<string, unknown>).q ?? "").trim();
    if (!query) return { members: [] };
    if (SNOWFLAKE.test(query)) {
      const user = await resolveUser(guildId, query);
      return { members: user ? [user] : [] };
    }
    const members = await services.discord.searchGuildMembers(guildId, query.slice(0, 64), 25);
    const resolved = members
      .map((member) => fromMember(guildId, member))
      .filter((member): member is ResolvedUser => Boolean(member));
    for (const member of resolved) {
      userCache.set(`${guildId}:${member.id}`, { expires: Date.now() + USER_TTL, value: member });
    }
    return { members: resolved };
  });

  app.get(`${BASE_PATH}/guilds/:guildId/users`, async (request) => {
    const session = await requireSession(request);
    const { guildId } = request.params as { guildId: string };
    await assertGuildAccess(session, guildId, { requireBot: true });
    const raw = String((request.query as Record<string, unknown>).ids ?? "");
    const ids = Array.from(new Set(raw.split(",").map((id) => id.trim()).filter((id) => SNOWFLAKE.test(id)))).slice(0, 50);
    const users: Record<string, ResolvedUser | null> = {};
    // Sequential to stay friendly with Discord rate limits; results are cached.
    for (const id of ids) users[id] = await resolveUser(guildId, id);
    return { users };
  });

  // ---------------------------------------------------------- moderation
  app.patch(`${BASE_PATH}/guilds/:guildId/moderation/cases/:caseId`, async (request) => {
    const session = await requireSession(request);
    const { guildId, caseId } = request.params as { guildId: string; caseId: string };
    const access = await assertGuildAccess(session, guildId, { requireBot: true });
    requireModerator(access);
    const body = (request.body ?? {}) as { reason?: string; evidenceUrl?: string };
    const changes: { reason?: string; evidenceUrl?: string } = {};
    if (typeof body.reason === "string") changes.reason = body.reason.slice(0, 500);
    if (typeof body.evidenceUrl === "string" && body.evidenceUrl.trim()) {
      let url: URL;
      try {
        url = new URL(body.evidenceUrl.trim());
      } catch {
        throw new InferaError("Evidence must be a valid URL", { code: ErrorCode.VALIDATION_ERROR });
      }
      if (url.protocol !== "https:") {
        throw new InferaError("Evidence URLs must use https", { code: ErrorCode.VALIDATION_ERROR });
      }
      changes.evidenceUrl = url.toString().slice(0, 1000);
    }
    if (Object.keys(changes).length === 0) {
      throw new InferaError("Provide a reason or an evidence URL", { code: ErrorCode.VALIDATION_ERROR });
    }
    const updated = await services.moderation.editCase(guildId, caseId, access.session.user.id, changes);
    return { case: updated };
  });

  app.post(`${BASE_PATH}/guilds/:guildId/moderation/cases/:caseId/void`, async (request) => {
    const session = await requireSession(request);
    const { guildId, caseId } = request.params as { guildId: string; caseId: string };
    const access = await assertGuildAccess(session, guildId, { requireBot: true });
    requireConfigAccess(access);
    const body = (request.body ?? {}) as { reason?: string };
    const updated = await services.moderation.voidCase(guildId, caseId, access.session.user.id, body.reason?.slice(0, 500));
    return { case: updated };
  });

  app.get(`${BASE_PATH}/guilds/:guildId/moderation/history/:userId`, async (request) => {
    const session = await requireSession(request);
    const { guildId, userId } = request.params as { guildId: string; userId: string };
    const access = await assertGuildAccess(session, guildId, { requireBot: true });
    requireModerator(access);
    if (!SNOWFLAKE.test(userId)) throw new InferaError("A valid user ID is required", { code: ErrorCode.VALIDATION_ERROR });
    return services.moderation.history(guildId, userId);
  });

  // ------------------------------------------------------------ lockdown
  app.get(`${BASE_PATH}/guilds/:guildId/security/lockdown`, async (request) => {
    const session = await requireSession(request);
    const { guildId } = request.params as { guildId: string };
    await assertGuildAccess(session, guildId, { requireBot: true });
    return { lockdown: await lockdownState(guildId) };
  });

  const setLockdown = async (guildId: string, actorId: string, locked: boolean, reason?: string) => {
    const channels = await services.discord.getGuildChannels(guildId);
    // Text (0) and announcement (5) channels, matching the bot's lockdown command.
    const targets = channels.filter((channel) => channel.type === 0 || channel.type === 5);
    let changed = 0;
    const channelIds: string[] = [];
    const failed: string[] = [];
    for (const channel of targets) {
      try {
        await services.discord.setChannelPermission(
          channel.id,
          guildId,
          locked
            ? { type: 0, deny: DiscordPermissions.SendMessages.toString() }
            : { type: 0, allow: DiscordPermissions.SendMessages.toString() },
          `${locked ? "Lockdown" : "Lockdown lifted"} from the INFERA dashboard`,
        );
        changed += 1;
        channelIds.push(channel.id);
      } catch {
        failed.push(channel.id);
      }
    }
    await services.audit.record({
      guildId,
      actorId,
      action: locked ? "security.lockdown" : "security.unlockdown",
      metadata: { locked: changed, channelIds, failed, reason: reason ?? null, source: "dashboard" },
    });
    await services.realtime.publish(guildId, locked ? "security.lockdown.created" : "security.lockdown.removed", {
      actorId,
      channels: changed,
    });
    return { changed, failed: failed.length, total: targets.length };
  };

  app.post(`${BASE_PATH}/guilds/:guildId/security/lockdown`, async (request) => {
    const session = await requireSession(request);
    const { guildId } = request.params as { guildId: string };
    const access = await assertGuildAccess(session, guildId, { requireBot: true });
    requireConfigAccess(access);
    const body = (request.body ?? {}) as { reason?: string };
    const result = await setLockdown(guildId, access.session.user.id, true, body.reason?.slice(0, 300));
    return { ...result, lockdown: await lockdownState(guildId) };
  });

  app.post(`${BASE_PATH}/guilds/:guildId/security/unlockdown`, async (request) => {
    const session = await requireSession(request);
    const { guildId } = request.params as { guildId: string };
    const access = await assertGuildAccess(session, guildId, { requireBot: true });
    requireConfigAccess(access);
    const result = await setLockdown(guildId, access.session.user.id, false);
    return { ...result, lockdown: await lockdownState(guildId) };
  });

  // ------------------------------------------------------------- tickets
  app.post(`${BASE_PATH}/guilds/:guildId/tickets/:ticketId/manage`, async (request) => {
    const session = await requireSession(request);
    const { guildId, ticketId } = request.params as { guildId: string; ticketId: string };
    const access = await assertGuildAccess(session, guildId, { requireBot: true });
    requireModerator(access);
    const body = (request.body ?? {}) as { action?: string; name?: string; userId?: string };
    if (body.action === "rename") {
      const name = (body.name ?? "").trim();
      if (!name) throw new InferaError("Enter a channel name", { code: ErrorCode.VALIDATION_ERROR });
      await services.tickets.rename(guildId, ticketId, name);
    } else if (body.action === "add" || body.action === "remove") {
      if (!body.userId || !SNOWFLAKE.test(body.userId)) {
        throw new InferaError("Choose a member", { code: ErrorCode.VALIDATION_ERROR });
      }
      if (body.action === "add") await services.tickets.addUser(guildId, ticketId, body.userId);
      else await services.tickets.removeUser(guildId, ticketId, body.userId);
    } else {
      throw new InferaError("action must be rename, add or remove", { code: ErrorCode.VALIDATION_ERROR });
    }
    await services.audit.record({
      guildId,
      actorId: access.session.user.id,
      action: `ticket.${body.action}`,
      targetId: ticketId,
      metadata: { name: body.name ?? null, userId: body.userId ?? null },
    });
    return { ok: true };
  });

  app.post(`${BASE_PATH}/guilds/:guildId/tickets/panels/:panelId/publish`, async (request) => {
    const session = await requireSession(request);
    const { guildId, panelId } = request.params as { guildId: string; panelId: string };
    const access = await assertGuildAccess(session, guildId, { requireBot: true });
    requireConfigAccess(access);
    const body = (request.body ?? {}) as { channelId?: string; buttonLabel?: string; color?: string };
    const panel = await db.ticketPanel.findFirst({ where: { id: panelId, guildId } });
    if (!panel) throw new InferaError("Panel not found", { code: ErrorCode.NOT_FOUND });
    const channelId = body.channelId ?? panel.channelId;
    if (!channelId || !SNOWFLAKE.test(channelId)) {
      throw new InferaError("Choose a channel for this panel first", { code: ErrorCode.VALIDATION_ERROR });
    }
    const values = await services.config.getValues(guildId);
    if (!values["tickets.enabled"]) {
      throw new InferaError("Enable the ticket system before publishing a panel", { code: ErrorCode.FEATURE_DISABLED });
    }
    const color = /^#[0-9a-f]{6}$/i.test(body.color ?? "") ? Number.parseInt(body.color!.slice(1), 16) : 0x8b5cf6;
    const message = await services.discord.sendMessage(channelId, {
      embeds: [
        {
          title: panel.title.slice(0, 256),
          description: panel.description?.slice(0, 4096) || "Press the button below to open a ticket.",
          color,
          footer: { text: "INFERA tickets" },
        },
      ],
      components: [
        {
          type: 1,
          components: [
            {
              type: 2,
              style: 1,
              label: (body.buttonLabel ?? "Open ticket").slice(0, 80) || "Open ticket",
              custom_id: `ticket:open:${panel.id}`,
            },
          ],
        },
      ],
    });
    await db.ticketPanel.update({ where: { id: panel.id }, data: { channelId, messageId: message.id } });
    await services.audit.record({
      guildId,
      actorId: access.session.user.id,
      action: "tickets.panel.publish",
      targetId: panel.id,
      metadata: { channelId, messageId: message.id },
    });
    return { channelId, messageId: message.id };
  });

  // ------------------------------------------------------------- economy
  app.post(`${BASE_PATH}/guilds/:guildId/economy/users/:userId/adjust`, async (request) => {
    const session = await requireSession(request);
    const { guildId, userId } = request.params as { guildId: string; userId: string };
    const access = await assertGuildAccess(session, guildId, { requireBot: true });
    requireConfigAccess(access);
    if (!SNOWFLAKE.test(userId)) throw new InferaError("A valid user ID is required", { code: ErrorCode.VALIDATION_ERROR });
    const body = (request.body ?? {}) as { amount?: number; reason?: string };
    const amount = Math.trunc(Number(body.amount));
    if (!Number.isFinite(amount) || amount === 0 || Math.abs(amount) > 100_000_000) {
      throw new InferaError("Enter a non-zero amount up to 100,000,000", { code: ErrorCode.VALIDATION_ERROR });
    }
    const reason = (body.reason ?? "").trim().slice(0, 200);
    if (!reason) throw new InferaError("A reason is required for balance adjustments", { code: ErrorCode.VALIDATION_ERROR });
    const reference = `dashboard:${access.session.user.id}`;
    if (amount > 0) await services.economy.credit(guildId, userId, amount, "admin_credit", reference);
    else await services.economy.debit(guildId, userId, Math.abs(amount), "admin_debit", reference);
    await services.audit.record({
      guildId,
      actorId: access.session.user.id,
      action: amount > 0 ? "economy.admin_credit" : "economy.admin_debit",
      targetId: userId,
      metadata: { amount, reason },
    });
    return { balance: await services.economy.getBalance(guildId, userId) };
  });

  app.get(`${BASE_PATH}/guilds/:guildId/economy/users/:userId`, async (request) => {
    const session = await requireSession(request);
    const { guildId, userId } = request.params as { guildId: string; userId: string };
    const access = await assertGuildAccess(session, guildId, { requireBot: true });
    requireModerator(access);
    if (!SNOWFLAKE.test(userId)) throw new InferaError("A valid user ID is required", { code: ErrorCode.VALIDATION_ERROR });
    const [account, inventory] = await Promise.all([
      db.economyAccount.findFirst({ where: { guildId, userId } }),
      services.economy.getInventory(guildId, userId),
    ]);
    return { account, inventory };
  });

  // -------------------------------------------------- feeds and webhooks
  app.patch(`${BASE_PATH}/guilds/:guildId/social-feeds/:feedId`, async (request) => {
    const session = await requireSession(request);
    const { guildId, feedId } = request.params as { guildId: string; feedId: string };
    const access = await assertGuildAccess(session, guildId, { requireBot: true });
    requireConfigAccess(access);
    const body = (request.body ?? {}) as { enabled?: boolean; channelId?: string };
    const data = {
      ...(typeof body.enabled === "boolean" ? { enabled: body.enabled } : {}),
      ...(body.channelId && SNOWFLAKE.test(body.channelId) ? { channelId: body.channelId } : {}),
    };
    if (Object.keys(data).length === 0) throw new InferaError("Nothing to update", { code: ErrorCode.VALIDATION_ERROR });
    const result = await db.socialFeed.updateMany({ where: { id: feedId, guildId }, data });
    if (result.count === 0) throw new InferaError("Feed not found", { code: ErrorCode.NOT_FOUND });
    return { feed: await db.socialFeed.findFirst({ where: { id: feedId, guildId } }) };
  });

  app.patch(`${BASE_PATH}/guilds/:guildId/webhooks/:webhookId`, async (request) => {
    const session = await requireSession(request);
    const { guildId, webhookId } = request.params as { guildId: string; webhookId: string };
    const access = await assertGuildAccess(session, guildId, { requireBot: true });
    requireConfigAccess(access);
    const body = (request.body ?? {}) as { enabled?: boolean; events?: string[] };
    const data = {
      ...(typeof body.enabled === "boolean" ? { enabled: body.enabled } : {}),
      ...(Array.isArray(body.events)
        ? { events: JSON.stringify(body.events.filter((event) => isValidEventName(event)).slice(0, 100)) }
        : {}),
    };
    if (Object.keys(data).length === 0) throw new InferaError("Nothing to update", { code: ErrorCode.VALIDATION_ERROR });
    const result = await db.webhookSubscription.updateMany({ where: { id: webhookId, guildId }, data });
    if (result.count === 0) throw new InferaError("Webhook not found", { code: ErrorCode.NOT_FOUND });
    await services.audit.record({ guildId, actorId: access.session.user.id, action: "webhook.update", targetId: webhookId, metadata: data });
    const row = await db.webhookSubscription.findFirst({ where: { id: webhookId, guildId } });
    return {
      webhook: row
        ? { id: row.id, url: row.url, events: parseJson<string[]>(row.events, []), enabled: row.enabled, failures: row.failures, createdAt: row.createdAt }
        : null,
    };
  });

  // ------------------------------------------------------- activity feed
  app.get(`${BASE_PATH}/guilds/:guildId/activity`, async (request) => {
    const session = await requireSession(request);
    const { guildId } = request.params as { guildId: string };
    const access = await assertGuildAccess(session, guildId, { requireBot: true });
    requireModerator(access);
    const take = intParam((request.query as Record<string, unknown>).limit, 30, 1, 100);
    const [cases, security, audit] = await Promise.all([
      db.moderationCase.findMany({ where: { guildId }, orderBy: { createdAt: "desc" }, take }),
      db.securityEvent.findMany({ where: { guildId }, orderBy: { createdAt: "desc" }, take }),
      db.auditLog.findMany({ where: { guildId }, orderBy: { createdAt: "desc" }, take }),
    ]);
    const items = [
      ...cases.map((row) => ({
        id: `case:${row.id}`,
        kind: "moderation" as const,
        title: `Case #${row.caseNumber} · ${row.type}`,
        actorId: row.moderatorId,
        targetId: row.targetId,
        detail: row.reason,
        createdAt: row.createdAt,
      })),
      ...security.map((row) => ({
        id: `security:${row.id}`,
        kind: "security" as const,
        title: row.type,
        actorId: row.actorId,
        targetId: null,
        detail: row.severity,
        createdAt: row.createdAt,
      })),
      ...audit.map((row) => ({
        id: `audit:${row.id}`,
        kind: "audit" as const,
        title: row.action,
        actorId: row.actorId,
        targetId: row.targetId,
        detail: null,
        createdAt: row.createdAt,
      })),
    ]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, take);
    return { items };
  });

  // ------------------------------------------------------- webhook test & history
  app.post(`${BASE_PATH}/guilds/:guildId/webhooks/:webhookId/test`, async (request) => {
    const session = await requireSession(request);
    const { guildId, webhookId } = request.params as { guildId: string; webhookId: string };
    const access = await assertGuildAccess(session, guildId, { requireBot: true });
    requireConfigAccess(access);
    const webhook = await db.webhookSubscription.findFirst({ where: { id: webhookId, guildId } });
    if (!webhook) throw new InferaError("Webhook not found", { code: ErrorCode.NOT_FOUND });

    await assertSafeWebhookUrl(webhook.url);
    const deliveryId = randomUUID();
    const timestamp = new Date().toISOString();
    const body = JSON.stringify({
      event: "webhook.test",
      guildId,
      timestamp,
      eventId: deliveryId,
      data: { message: "INFERA webhook test delivery", actorId: access.session.user.id },
    });
    const signature = createHmac("sha256", webhook.secret).update(`${timestamp}.${body}`).digest("hex");

    let responseStatus: number | null = null;
    let status = "delivered";
    let lastError: string | null = null;
    try {
      const res = await fetch(webhook.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-infera-event": "webhook.test",
          "x-infera-delivery": deliveryId,
          "x-infera-timestamp": timestamp,
          "x-infera-signature": `sha256=${signature}`,
        },
        body,
        signal: AbortSignal.timeout(8_000),
      });
      responseStatus = res.status;
      if (!res.ok) {
        status = "failed";
        lastError = `HTTP ${res.status}`;
      }
    } catch (error) {
      status = "failed";
      lastError = error instanceof Error ? error.message.slice(0, 250) : "Request failed";
    }

    const delivery = await db.webhookDelivery.create({
      data: {
        subscriptionId: webhook.id,
        event: "webhook.test",
        payload: body,
        status,
        attempts: 1,
        responseStatus,
        lastError,
        deliveredAt: status === "delivered" ? new Date() : null,
      },
    });
    return { delivery };
  });

  app.get(`${BASE_PATH}/guilds/:guildId/webhooks/:webhookId/deliveries`, async (request) => {
    const session = await requireSession(request);
    const { guildId, webhookId } = request.params as { guildId: string; webhookId: string };
    await assertGuildAccess(session, guildId, { requireBot: true });
    const webhook = await db.webhookSubscription.findFirst({ where: { id: webhookId, guildId } });
    if (!webhook) throw new InferaError("Webhook not found", { code: ErrorCode.NOT_FOUND });
    const deliveries = await db.webhookDelivery.findMany({
      where: { subscriptionId: webhook.id },
      orderBy: { createdAt: "desc" },
      take: 30,
    });
    return { deliveries };
  });

  // ------------------------------------------------------- ticket panel edit
  app.patch(`${BASE_PATH}/guilds/:guildId/tickets/panels/:panelId`, async (request) => {
    const session = await requireSession(request);
    const { guildId, panelId } = request.params as { guildId: string; panelId: string };
    const access = await assertGuildAccess(session, guildId, { requireBot: true });
    requireConfigAccess(access);
    const existing = await db.ticketPanel.findFirst({ where: { id: panelId, guildId } });
    if (!existing) throw new InferaError("Ticket panel not found", { code: ErrorCode.NOT_FOUND });
    const body = (request.body ?? {}) as { title?: string; description?: string | null; channelId?: string | null; categoryId?: string | null };
    const panel = await db.ticketPanel.update({
      where: { id: existing.id },
      data: {
        title: typeof body.title === "string" && body.title.trim() ? body.title.trim().slice(0, 120) : undefined,
        description: body.description === undefined ? undefined : body.description ? body.description.slice(0, 1000) : null,
        channelId: body.channelId === undefined ? undefined : body.channelId && SNOWFLAKE.test(body.channelId) ? body.channelId : null,
        categoryId: body.categoryId === undefined ? undefined : body.categoryId && SNOWFLAKE.test(body.categoryId) ? body.categoryId : null,
      },
    });
    return { panel };
  });

  // ------------------------------------------------------- command permissions
  app.get(`${BASE_PATH}/guilds/:guildId/command-permissions`, async (request) => {
    const session = await requireSession(request);
    const { guildId } = request.params as { guildId: string };
    await assertGuildAccess(session, guildId, { requireBot: true });
    const permissions = await db.guildPermission.findMany({ where: { guildId }, orderBy: { createdAt: "desc" } });
    return { permissions };
  });

  app.put(`${BASE_PATH}/guilds/:guildId/command-permissions`, async (request) => {
    const session = await requireSession(request);
    const { guildId } = request.params as { guildId: string };
    const access = await assertGuildAccess(session, guildId, { requireBot: true });
    requireConfigAccess(access);
    const body = (request.body ?? {}) as { targetType?: string; targetId?: string; level?: number };
    const targetType = body.targetType === "role" || body.targetType === "user" || body.targetType === "channel" ? body.targetType : null;
    if (!targetType || !body.targetId || !SNOWFLAKE.test(body.targetId)) {
      throw new InferaError("Valid targetType and Discord ID are required", { code: ErrorCode.VALIDATION_ERROR });
    }
    const level = intParam(body.level, 0, 0, 5);
    const permission = await db.guildPermission.upsert({
      where: { guildId_targetType_targetId: { guildId, targetType, targetId: body.targetId } },
      create: { guildId, targetType, targetId: body.targetId, level },
      update: { level },
    });
    await services.audit.record({
      guildId,
      actorId: access.session.user.id,
      action: "permissions.update",
      targetId: body.targetId,
      metadata: { targetType, level },
    });
    return { permission };
  });

  // ------------------------------------------------------- roblox integration
  app.post(`${BASE_PATH}/guilds/:guildId/integrations/roblox/test`, async (request) => {
    const session = await requireSession(request);
    const { guildId } = request.params as { guildId: string };
    await assertGuildAccess(session, guildId, { requireBot: true });
    const user = await roblox.users.resolve("Builderman");
    return { ok: true, sampleUser: { id: user.id, name: user.name, displayName: user.displayName } };
  });

  app.get(`${BASE_PATH}/integrations/roblox/users/:username`, async (request) => {
    await requireSession(request);
    const { username } = request.params as { username: string };
    return { profile: await roblox.users.profile(username) };
  });

  app.get(`${BASE_PATH}/integrations/roblox/users/id/:userId`, async (request) => {
    await requireSession(request);
    const { userId } = request.params as { userId: string };
    return { profile: await roblox.users.profile(userId) };
  });

  app.get(`${BASE_PATH}/integrations/roblox/games/:universeId`, async (request) => {
    await requireSession(request);
    const { universeId } = request.params as { universeId: string };
    const id = Number(universeId);
    if (!Number.isInteger(id) || id <= 0) throw new InferaError("Valid universeId required", { code: ErrorCode.VALIDATION_ERROR });
    return { game: await roblox.games.game(id) };
  });

  app.get(`${BASE_PATH}/integrations/roblox/groups/:groupId`, async (request) => {
    await requireSession(request);
    const { groupId } = request.params as { groupId: string };
    const id = Number(groupId);
    if (!Number.isInteger(id) || id <= 0) throw new InferaError("Valid groupId required", { code: ErrorCode.VALIDATION_ERROR });
    const [group, roles] = await Promise.all([roblox.groups.group(id), roblox.groups.roles(id).catch(() => [])]);
    return { group, roles };
  });

  app.get(`${BASE_PATH}/integrations/roblox/search/games`, async (request) => {
    await requireSession(request);
    const q = String((request.query as Record<string, unknown>).q ?? "").trim();
    if (!q) throw new InferaError("Search query q is required", { code: ErrorCode.VALIDATION_ERROR });
    return { games: await roblox.games.search(q, 10) };
  });

};
