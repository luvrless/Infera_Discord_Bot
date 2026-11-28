import { ErrorCode, InferaError, isOperator, type PlatformState } from "@infera/shared";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { BASE_PATH, db, services } from "../lib/config";
import { botStatus } from "../lib/auth";
import { readSession } from "../lib/session";
import { ACTION_BY_ID, OPERATOR_ACTIONS } from "../lib/operator-actions";

const P = `${BASE_PATH}/operator`;
const SNOWFLAKE = /^\d{17,20}$/;
const started = Date.now();

function operatorId(request: FastifyRequest): string {
  return (request as FastifyRequest & { operatorId: string }).operatorId;
}

function snowflake(value: unknown, label: string): string {
  if (typeof value !== "string" || !SNOWFLAKE.test(value)) throw new InferaError(`A valid ${label} ID is required`, { code: ErrorCode.VALIDATION_ERROR });
  return value;
}

/**
 * The operator API. Only the hard-coded operator account can reach it; for
 * anyone else every route behaves exactly like a route that doesn't exist.
 */
export const operatorRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("onRequest", async (request, reply) => {
    const session = await readSession(request).catch(() => null);
    if (!session || !isOperator(session.user.id)) {
      return reply.callNotFound();
    }
    (request as FastifyRequest & { operatorId: string }).operatorId = session.user.id;
    reply.header("cache-control", "no-store");
  });

  const audit = (request: FastifyRequest, action: string, targetId: string | null, metadata: Record<string, unknown> = {}) =>
    services.platform.audit(operatorId(request), action, targetId, metadata, request.ip);

  // ------------------------------------------------------------- overview
  app.get(`${P}/me`, async (request) => ({ operator: true, userId: operatorId(request) }));

  app.get(`${P}/overview`, async () => {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [guildsActive, guildsTotal, users, sessions, ticketsOpen, ticketsTotal, configs, commands24h, commandsTotal, applications, blacklisted, bot, platform, members] = await Promise.all([
      db.guild.count({ where: { leftAt: null } }),
      db.guild.count(),
      db.user.count(),
      db.oAuthSession.count({ where: { revokedAt: null, expiresAt: { gt: new Date() } } }),
      db.ticket.count({ where: { status: "open" } }),
      db.ticket.count(),
      db.guildConfig.count(),
      db.commandUsage.count({ where: { createdAt: { gte: since } } }),
      db.commandUsage.count(),
      db.applicationSubmission.count().catch(() => 0),
      db.platformBlacklist.count(),
      botStatus(),
      services.platform.state(),
      db.guild.aggregate({ where: { leftAt: null }, _sum: { memberCount: true } }),
    ]);
    const memory = process.memoryUsage();
    return {
      counts: { guildsActive, guildsTotal, users, sessions, ticketsOpen, ticketsTotal, configs, commands24h, commandsTotal, applications, blacklisted, members: members._sum.memberCount ?? 0 },
      bot,
      platform,
      api: { uptimeSeconds: Math.round((Date.now() - started) / 1000), rssMb: Math.round(memory.rss / 1048576), heapMb: Math.round(memory.heapUsed / 1048576), node: process.version },
    };
  });

  // -------------------------------------------------------------- servers
  app.get(`${P}/guilds`, async (request) => {
    const query = request.query as { q?: string; status?: string };
    const q = (query.q ?? "").trim();
    const rows = await db.guild.findMany({
      where: {
        ...(query.status === "left" ? { leftAt: { not: null } } : query.status === "all" ? {} : { leftAt: null }),
        ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { id: q }, { ownerId: q }] } : {}),
      },
      orderBy: { memberCount: "desc" },
      take: 200,
      select: { id: true, name: true, icon: true, ownerId: true, memberCount: true, joinedAt: true, leftAt: true, premiumTier: true },
    });
    const lists = await db.platformBlacklist.findMany({ where: { type: { in: ["guild", "frozen"] } }, select: { type: true, targetId: true } });
    const blocked = new Set(lists.filter((r) => r.type === "guild").map((r) => r.targetId));
    const frozen = new Set(lists.filter((r) => r.type === "frozen").map((r) => r.targetId));
    return { guilds: rows.map((row) => ({ ...row, blacklisted: blocked.has(row.id), frozen: frozen.has(row.id) })) };
  });

  app.get(`${P}/guilds/:guildId`, async (request) => {
    const guildId = snowflake((request.params as { guildId: string }).guildId, "server");
    const guild = await db.guild.findUnique({ where: { id: guildId } });
    if (!guild) throw new InferaError("Server not found", { code: ErrorCode.NOT_FOUND });
    const [config, modules, tickets, ticketsOpen, usage, backups, audit, owner, blacklisted] = await Promise.all([
      db.guildConfig.findUnique({ where: { guildId } }),
      services.config.getModules(guildId).catch(() => []),
      db.ticket.count({ where: { guildId } }),
      db.ticket.count({ where: { guildId, status: "open" } }),
      db.commandUsage.count({ where: { guildId } }),
      services.platform.backups(guildId),
      db.auditLog.findMany({ where: { guildId }, orderBy: { createdAt: "desc" }, take: 25 }),
      guild.ownerId ? db.user.findUnique({ where: { id: guild.ownerId } }) : null,
      services.platform.isBlacklisted("guild", guildId),
    ]);
    let values: Record<string, unknown> = {};
    try {
      values = config ? (JSON.parse(config.data) as Record<string, unknown>) : {};
    } catch {
      values = {};
    }
    return { guild, owner, config: { version: config?.version ?? 0, updatedAt: config?.updatedAt ?? null, updatedBy: config?.updatedBy ?? null, values }, modules, stats: { tickets, ticketsOpen, commands: usage }, backups, audit, blacklisted };
  });

  app.post(`${P}/guilds/:guildId/reset`, async (request) => {
    const guildId = snowflake((request.params as { guildId: string }).guildId, "server");
    const body = (request.body ?? {}) as { section?: string | null; confirm?: string };
    if (body.confirm !== "RESET") throw new InferaError('Type RESET to confirm', { code: ErrorCode.VALIDATION_ERROR });
    const section = typeof body.section === "string" && /^[a-z_]{2,40}$/.test(body.section) ? body.section : null;
    const backup = await services.platform.backupConfig(guildId, `Before operator reset${section ? ` (${section})` : ""}`, operatorId(request));
    await services.config.reset(guildId, section, operatorId(request));
    await audit(request, "guild.config.reset", guildId, { section, backupId: backup?.id ?? null });
    return { reset: true, backupId: backup?.id ?? null };
  });

  app.post(`${P}/guilds/:guildId/backup`, async (request) => {
    const guildId = snowflake((request.params as { guildId: string }).guildId, "server");
    const backup = await services.platform.backupConfig(guildId, "Manual operator backup", operatorId(request));
    if (!backup) throw new InferaError("This server has no stored configuration", { code: ErrorCode.NOT_FOUND });
    await audit(request, "guild.config.backup", guildId, { backupId: backup.id });
    return { backupId: backup.id };
  });

  app.post(`${P}/guilds/:guildId/restore`, async (request) => {
    const guildId = snowflake((request.params as { guildId: string }).guildId, "server");
    const body = (request.body ?? {}) as { backupId?: string };
    const backup = body.backupId ? await services.platform.backup(body.backupId) : null;
    if (!backup || backup.guildId !== guildId) throw new InferaError("Backup not found", { code: ErrorCode.NOT_FOUND });
    const safety = await services.platform.backupConfig(guildId, "Before operator restore", operatorId(request));
    await services.config.restoreRaw(guildId, backup.data, operatorId(request));
    await audit(request, "guild.config.restore", guildId, { backupId: backup.id, safetyBackupId: safety?.id ?? null });
    return { restored: true };
  });

  app.post(`${P}/guilds/:guildId/leave`, async (request) => {
    const guildId = snowflake((request.params as { guildId: string }).guildId, "server");
    const body = (request.body ?? {}) as { confirm?: string; blacklist?: boolean; reason?: string };
    if (body.confirm !== "LEAVE") throw new InferaError("Type LEAVE to confirm", { code: ErrorCode.VALIDATION_ERROR });
    if (body.blacklist) await services.platform.addBlacklist("guild", guildId, body.reason?.slice(0, 300) ?? null, operatorId(request));
    await services.discord.leaveGuild(guildId).catch(() => undefined);
    await services.config.markLeft(guildId).catch(() => undefined);
    await audit(request, body.blacklist ? "guild.blacklist_leave" : "guild.leave", guildId, { reason: body.reason ?? null });
    return { left: true };
  });

  app.post(`${P}/guilds/:guildId/clear-cache`, async (request) => {
    const guildId = snowflake((request.params as { guildId: string }).guildId, "server");
    const config = await db.guildConfig.findUnique({ where: { guildId } });
    if (config) await services.config.restoreRaw(guildId, config.data, operatorId(request));
    await audit(request, "guild.cache.clear", guildId);
    return { cleared: true };
  });

  // ---------------------------------------------------------------- users
  app.get(`${P}/users`, async (request) => {
    const q = ((request.query as { q?: string }).q ?? "").trim();
    const users = await db.user.findMany({
      where: q ? { OR: [{ username: { contains: q, mode: "insensitive" } }, { globalName: { contains: q, mode: "insensitive" } }, { id: q }] } : {},
      orderBy: { updatedAt: "desc" },
      take: 100,
    });
    const ids = users.map((user) => user.id);
    const [sessions, owned, blocked] = await Promise.all([
      db.oAuthSession.groupBy({ by: ["userId"], where: { userId: { in: ids }, revokedAt: null, expiresAt: { gt: new Date() } }, _count: { userId: true } }),
      db.guild.groupBy({ by: ["ownerId"], where: { ownerId: { in: ids }, leftAt: null }, _count: { ownerId: true } }),
      db.platformBlacklist.findMany({ where: { type: "user", targetId: { in: ids } }, select: { targetId: true } }),
    ]);
    const sessionMap = new Map(sessions.map((row) => [row.userId, row._count.userId]));
    const ownedMap = new Map(owned.map((row) => [row.ownerId, row._count.ownerId]));
    const blockedSet = new Set(blocked.map((row) => row.targetId));
    return {
      users: users.map((user) => ({ ...user, activeSessions: sessionMap.get(user.id) ?? 0, ownedServers: ownedMap.get(user.id) ?? 0, blacklisted: blockedSet.has(user.id), operator: isOperator(user.id) })),
    };
  });

  app.get(`${P}/users/:userId`, async (request) => {
    const userId = snowflake((request.params as { userId: string }).userId, "user");
    const [user, sessions, servers, blacklisted] = await Promise.all([
      db.user.findUnique({ where: { id: userId } }),
      db.oAuthSession.findMany({ where: { userId }, orderBy: { lastUsedAt: "desc" }, take: 20, select: { id: true, userAgent: true, createdAt: true, lastUsedAt: true, expiresAt: true, revokedAt: true } }),
      db.guild.findMany({ where: { ownerId: userId }, select: { id: true, name: true, memberCount: true, leftAt: true } }),
      services.platform.isBlacklisted("user", userId),
    ]);
    return { user, sessions, servers, blacklisted, operator: isOperator(userId) };
  });

  app.post(`${P}/users/:userId/revoke-sessions`, async (request) => {
    const userId = snowflake((request.params as { userId: string }).userId, "user");
    if (userId === operatorId(request)) throw new InferaError("Use Sign out to end your own sessions", { code: ErrorCode.VALIDATION_ERROR });
    const result = await db.oAuthSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    await audit(request, "user.sessions.revoke", userId, { count: result.count });
    return { revoked: result.count };
  });

  app.post(`${P}/users/:userId/dm`, async (request) => {
    const userId = snowflake((request.params as { userId: string }).userId, "user");
    const body = (request.body ?? {}) as { title?: string; message?: string };
    const message = (body.message ?? "").trim();
    if (!message) throw new InferaError("Write a message", { code: ErrorCode.VALIDATION_ERROR });
    await services.discord.sendDm(userId, { embeds: [{ title: (body.title || "Message from the INFERA team").slice(0, 256), description: message.slice(0, 4000), color: 0x3b82f6, footer: { text: "INFERA" }, timestamp: new Date().toISOString() }] });
    await audit(request, "user.dm", userId, { title: body.title ?? null });
    return { sent: true };
  });

  // ------------------------------------------------------------ blacklist
  app.get(`${P}/blacklist`, async () => ({ entries: await services.platform.blacklist() }));

  app.post(`${P}/blacklist`, async (request) => {
    const body = (request.body ?? {}) as { type?: string; targetId?: string; reason?: string };
    const type = (["user", "dashboard", "guild", "frozen"] as const).find((value) => value === body.type);
    if (!type) throw new InferaError("type must be user, dashboard, guild or frozen", { code: ErrorCode.VALIDATION_ERROR });
    const targetId = snowflake(body.targetId, type === "user" || type === "dashboard" ? "user" : "server");
    if ((type === "user" || type === "dashboard") && isOperator(targetId)) throw new InferaError("The operator can't be banned", { code: ErrorCode.VALIDATION_ERROR });
    const entry = await services.platform.addBlacklist(type, targetId, body.reason?.slice(0, 300) || null, operatorId(request));
    if (type === "guild") {
      await services.discord.leaveGuild(targetId).catch(() => undefined);
      await services.config.markLeft(targetId).catch(() => undefined);
    }
    if (type === "dashboard") await db.oAuthSession.updateMany({ where: { userId: targetId, revokedAt: null }, data: { revokedAt: new Date() } });
    await audit(request, `blacklist.add.${type}`, targetId, { reason: body.reason ?? null });
    return { entry };
  });

  app.delete(`${P}/blacklist/:id`, async (request) => {
    const id = (request.params as { id: string }).id;
    await services.platform.removeBlacklist(id);
    await audit(request, "blacklist.remove", id);
    return { removed: true };
  });

  // ------------------------------------------------------------- platform
  app.get(`${P}/platform`, async () => ({ state: await services.platform.state() }));

  app.patch(`${P}/platform`, async (request) => {
    const body = (request.body ?? {}) as Partial<PlatformState>;
    const state = await services.platform.setState(body, operatorId(request));
    await audit(request, "platform.update", null, { keys: Object.keys(body) });
    return { state };
  });

  app.get(`${P}/commands`, async () => {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [definitions, usage, state] = await Promise.all([
      db.commandDefinition.findMany({ orderBy: [{ category: "asc" }, { id: "asc" }], select: { id: true, category: true, description: true } }),
      db.commandUsage.groupBy({ by: ["commandName"], where: { createdAt: { gte: since } }, _count: { commandName: true } }),
      services.platform.state(),
    ]);
    const usageMap = new Map(usage.map((row) => [row.commandName, row._count.commandName]));
    return { commands: definitions.map((row) => ({ ...row, uses7d: usageMap.get(row.id) ?? 0, disabled: state.disabledCommands.includes(row.id) })) };
  });

  app.post(`${P}/sessions/revoke-all`, async (request) => {
    const body = (request.body ?? {}) as { confirm?: string };
    if (body.confirm !== "SIGN OUT EVERYONE") throw new InferaError("Type SIGN OUT EVERYONE to confirm", { code: ErrorCode.VALIDATION_ERROR });
    const result = await db.oAuthSession.updateMany({ where: { revokedAt: null, userId: { not: operatorId(request) } }, data: { revokedAt: new Date() } });
    await audit(request, "sessions.revoke_all", null, { count: result.count });
    return { revoked: result.count };
  });

  // --------------------------------------------------------- announcements
  app.post(`${P}/announce`, async (request) => {
    const body = (request.body ?? {}) as { title?: string; summary?: string; features?: string[]; fixes?: string[]; system?: string[]; downtime?: string; kind?: string; dm?: boolean };
    const title = (body.title ?? "").trim();
    if (!title) throw new InferaError("A title is required", { code: ErrorCode.VALIDATION_ERROR });
    const list = (value: unknown) => (Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && v.trim().length > 0).map((v) => v.trim().slice(0, 300)).slice(0, 20) : []);
    const note = await db.platformNotification.create({
      data: {
        version: `op-${Date.now()}`,
        kind: body.kind === "maintenance" ? "maintenance" : "update",
        title: title.slice(0, 200),
        body: JSON.stringify({ summary: (body.summary ?? "").slice(0, 1000), features: list(body.features), fixes: list(body.fixes), system: list(body.system), downtime: body.downtime?.slice(0, 500) || null }),
      },
    });
    await audit(request, "announce", note.id, { title, dm: Boolean(body.dm) });
    if (body.dm) {
      // DM owners who opted in, in the background, slowly to respect rate limits.
      void (async () => {
        const view = services.platformNotifications.view(note);
        const recipients = await services.platformNotifications.pendingRecipients(note.id);
        for (const userId of recipients) {
          const prefs = await services.platformNotifications.preferences(userId).catch(() => ({ dmNotifications: false }));
          if (!prefs.dmNotifications) continue;
          try {
            await services.discord.sendDm(userId, {
              embeds: [
                {
                  title: `INFERA update · ${view.title}`.slice(0, 256),
                  description: view.summary || undefined,
                  color: view.kind === "maintenance" ? 0xfee75c : 0x3b82f6,
                  fields: [
                    ...(view.features.length ? [{ name: "New features", value: view.features.map((f) => `• ${f}`).join("\n").slice(0, 1024) }] : []),
                    ...(view.fixes.length ? [{ name: "Fixes", value: view.fixes.map((f) => `• ${f}`).join("\n").slice(0, 1024) }] : []),
                    ...(view.system.length ? [{ name: "System changes", value: view.system.map((f) => `• ${f}`).join("\n").slice(0, 1024) }] : []),
                    { name: "Downtime", value: view.downtime ?? "No downtime planned." },
                  ],
                  footer: { text: "Turn these DMs off at infera.wtf/dashboard/notifications" },
                  timestamp: new Date().toISOString(),
                },
              ],
            });
            await services.platformNotifications.recordDelivery(note.id, userId, "sent");
          } catch {
            await services.platformNotifications.recordDelivery(note.id, userId, "failed");
          }
          await new Promise((resolve) => setTimeout(resolve, 1500));
        }
      })();
    }
    return { notification: note };
  });

  app.get(`${P}/announcements`, async () => ({
    notifications: await db.platformNotification.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
  }));

  app.delete(`${P}/announcements/:id`, async (request) => {
    const id = (request.params as { id: string }).id;
    await db.platformNotification.deleteMany({ where: { id } });
    await audit(request, "announce.delete", id);
    return { removed: true };
  });

  // -------------------------------------------------------------- actions
  app.get(`${P}/actions`, async () => ({
    actions: OPERATOR_ACTIONS.map(({ run: _run, ...action }) => action),
    counts: {
      moderation: OPERATOR_ACTIONS.filter((a) => a.group === "moderation").length,
      normal: OPERATOR_ACTIONS.filter((a) => a.group === "normal").length,
      exclusive: OPERATOR_ACTIONS.filter((a) => a.group === "exclusive").length,
    },
  }));

  app.post(`${P}/actions/:actionId`, async (request) => {
    const action = ACTION_BY_ID.get((request.params as { actionId: string }).actionId);
    if (!action) throw new InferaError("Unknown action", { code: ErrorCode.NOT_FOUND });
    const body = (request.body ?? {}) as { params?: Record<string, unknown>; confirm?: string };
    if (action.danger === 2 && body.confirm !== action.id) {
      throw new InferaError(`Type ${action.id} to confirm`, { code: ErrorCode.VALIDATION_ERROR });
    }
    const params = body.params && typeof body.params === "object" ? body.params : {};
    for (const param of action.params) {
      const value = params[param.key];
      if (param.required && (value === undefined || value === null || (typeof value === "string" && !value.trim()))) {
        throw new InferaError(`${param.label} is required`, { code: ErrorCode.VALIDATION_ERROR });
      }
    }
    const result = await action.run({ actorId: operatorId(request), ip: request.ip, params });
    await audit(request, `action.${action.id}`, (params.guildId ?? params.userId ?? params.channelId ?? null) as string | null, { params: Object.fromEntries(Object.entries(params).filter(([key]) => key !== "json")) });
    return result;
  });

  app.get(`${P}/notes`, async (request) => {
    const query = request.query as { guildId?: string; userId?: string };
    const key = query.guildId ? `note:guild:${query.guildId}` : query.userId ? `note:user:${query.userId}` : "note:operator";
    const flags = query.guildId ? await services.platform.getSetting(`flags:guild:${query.guildId}`, {}) : {};
    return { note: await services.platform.getSetting<string>(key, ""), flags };
  });

  // ---------------------------------------------------------------- audit
  app.get(`${P}/audit`, async () => ({ entries: await services.platform.auditLog(300) }));
};
