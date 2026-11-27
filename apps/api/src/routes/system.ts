import { ErrorCode, InferaError } from "@infera/shared";
import type { FastifyPluginAsync } from "fastify";
import { BASE_PATH, db, services } from "../lib/config";
import { assertGuildAccess, requireConfigAccess } from "../lib/auth";
import { requireSession } from "../lib/session";
import { intParam, pagination, parseJson, stringQuery } from "../lib/http";
import { hub } from "../lib/hub";

export const systemRoutes: FastifyPluginAsync = async (app) => {
  // --------------------------------------------------------------- commands
  app.get(`${BASE_PATH}/commands`, async () => {
    const rows = await db.commandDefinition.findMany({ orderBy: [{ category: "asc" }, { id: "asc" }] });
    return {
      commands: rows.map((row) => ({
        name: row.id,
        description: row.description,
        category: row.category,
        aliases: parseJson<string[]>(row.aliases, []),
        defaultLevel: row.defaultLevel,
        cooldownMs: row.cooldownMs,
        guildOnly: row.guildOnly,
        enabled: row.enabled,
      })),
      total: rows.length,
    };
  });

  app.get(`${BASE_PATH}/commands/categories`, async () => {
    const rows = await db.commandDefinition.groupBy({ by: ["category"], _count: { category: true } });
    return {
      categories: rows
        .map((row) => ({ id: row.category, name: row.category, count: row._count.category }))
        .sort((a, b) => b.count - a.count),
    };
  });

  app.get(`${BASE_PATH}/guilds/:guildId/commands`, async (request) => {
    const session = await requireSession(request);
    const { guildId } = request.params as { guildId: string };
    const access = await assertGuildAccess(session, guildId, { requireBot: true });
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [definitions, overrides, usage] = await Promise.all([
      db.commandDefinition.findMany({ orderBy: [{ category: "asc" }, { id: "asc" }] }),
      db.commandOverride.findMany({ where: { guildId } }),
      db.commandUsage.groupBy({
        by: ["commandName", "success"],
        where: { guildId, createdAt: { gte: since } },
        _count: { commandName: true },
      }),
    ]);
    const overrideMap = new Map(overrides.map((row) => [row.commandName, row]));
    const usageMap = new Map<string, { uses: number; failures: number }>();
    for (const row of usage) {
      const entry = usageMap.get(row.commandName) ?? { uses: 0, failures: 0 };
      entry.uses += row._count.commandName;
      if (!row.success) entry.failures += row._count.commandName;
      usageMap.set(row.commandName, entry);
    }
    return {
      level: access.level,
      commands: definitions.map((row) => {
        const override = overrideMap.get(row.id);
        return {
          name: row.id,
          description: row.description,
          category: row.category,
          aliases: parseJson<string[]>(row.aliases, []),
          defaultLevel: row.defaultLevel,
          cooldownMs: row.cooldownMs,
          enabled: override?.enabled ?? row.enabled,
          level: override?.level ?? row.defaultLevel,
          effectiveCooldownMs: override?.cooldownMs ?? row.cooldownMs,
          overridden: Boolean(override),
          usage: usageMap.get(row.id) ?? { uses: 0, failures: 0 },
        };
      }),
    };
  });

  app.patch(`${BASE_PATH}/guilds/:guildId/commands/:commandName`, async (request) => {
    const session = await requireSession(request);
    const { guildId, commandName } = request.params as { guildId: string; commandName: string };
    const access = await assertGuildAccess(session, guildId, { requireBot: true });
    requireConfigAccess(access);
    const definition = await db.commandDefinition.findUnique({ where: { id: commandName } });
    if (!definition) throw new InferaError(`Unknown command: ${commandName}`, { code: ErrorCode.NOT_FOUND });
    const body = (request.body ?? {}) as { enabled?: boolean; level?: number; cooldownMs?: number };
    const data = {
      ...(typeof body.enabled === "boolean" ? { enabled: body.enabled } : {}),
      ...(typeof body.level === "number" ? { level: intParam(body.level, definition.defaultLevel, 0, 5) } : {}),
      ...(typeof body.cooldownMs === "number" ? { cooldownMs: intParam(body.cooldownMs, definition.cooldownMs, 0, 600_000) } : {}),
    };
    if (Object.keys(data).length === 0) {
      throw new InferaError("No command changes were provided", { code: ErrorCode.VALIDATION_ERROR });
    }
    const override = await db.commandOverride.upsert({
      where: { guildId_commandName: { guildId, commandName } },
      create: { guildId, commandName, ...data },
      update: data,
    });
    // The bot reads overrides through this cache; drop it so the change applies now.
    await services.config.invalidateCommandOverrides(guildId).catch(() => undefined);
    await services.audit.record({
      guildId,
      actorId: access.session.user.id,
      action: body.enabled === false ? "command.disable" : "command.update",
      targetId: commandName,
      metadata: data,
    });
    hub.broadcast(guildId, body.enabled === false ? "command.disabled" : "command.enabled", {
      command: commandName,
    });
    return { override };
  });

  // -------------------------------------------------------------- analytics
  app.get(`${BASE_PATH}/guilds/:guildId/analytics`, async (request) => {
    const session = await requireSession(request);
    const { guildId } = request.params as { guildId: string };
    await assertGuildAccess(session, guildId, { requireBot: true });
    const days = intParam((request.query as Record<string, unknown>).days, 30, 1, 365);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const [overview, usage, modules] = await Promise.all([
      services.analytics.overview(guildId, days),
      services.analytics.commandUsage(guildId, since),
      services.config.getModules(guildId),
    ]);
    const history = (overview.history as Array<Record<string, unknown>>).filter(
      (entry) => new Date(String(entry.date)).getTime() >= since.getTime(),
    );
    const metrics = [
      "memberJoins",
      "memberLeaves",
      "messages",
      "commands",
      "commandFails",
      "moderation",
      "automod",
      "tickets",
      "economy",
      "voiceMinutes",
    ] as const;
    const totals = Object.fromEntries(
      metrics.map((metric) => [
        metric,
        history.reduce((sum, entry) => sum + Number(entry[metric] ?? 0), 0),
      ]),
    );
    return {
      days,
      since: since.toISOString(),
      totals,
      current: overview.current,
      topCommands: usage.slice(0, 10),
      usage,
      history,
      dataAvailable: history.length > 0,
      enabledModules: modules.filter((module) => module.enabled).length,
      totalModules: modules.length,
      modules,
    };
  });

  // ------------------------------------------------------------------ audit
  app.get(`${BASE_PATH}/guilds/:guildId/audit`, async (request) => {
    const session = await requireSession(request);
    const { guildId } = request.params as { guildId: string };
    const access = await assertGuildAccess(session, guildId, { requireBot: true });
    if (access.level < 3) {
      throw new InferaError("Administrator access is required to read the audit log", {
        code: ErrorCode.MISSING_PERMISSION,
      });
    }
    const query = request.query as Record<string, unknown>;
    const { page, pageSize } = pagination(query);
    const action = stringQuery(query.action);
    const actorId = stringQuery(query.actorId);
    const result = await services.audit.list(guildId, {
      page,
      pageSize,
      ...(action ? { action, actionPrefix: query.prefix === "true" } : {}),
      ...(actorId && /^\d{17,20}$/.test(actorId) ? { actorId } : {}),
    });
    return {
      ...result,
      entries: result.rows.map((row) => ({
        id: row.id,
        actorId: row.actorId,
        action: row.action,
        targetId: row.targetId,
        metadata: parseJson<Record<string, unknown>>(row.metadata, {}),
        ip: row.ip,
        createdAt: row.createdAt,
      })),
    };
  });
};
