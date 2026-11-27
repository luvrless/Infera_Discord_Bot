import { ErrorCode, InferaError, configSchemaDocument, defaultConfig } from "@infera/shared";
import { guildMemberCount } from "@infera/services";
import type { FastifyPluginAsync } from "fastify";
import { BASE_PATH, db, services } from "../lib/config";
import {
  assertGuildAccess,
  botStatus,
  guildListForSession,
  requireConfigAccess,
  type GuildAccess,
} from "../lib/auth";
import { requireSession } from "../lib/session";
import { hub } from "../lib/hub";

const CONFIG_CATEGORIES = ["general", "moderation", "automod", "security", "welcome", "goodbye", "logging", "leveling", "economy", "tickets", "giveaways",   "suggestions", "confessions", "starboard", "voice", "music", "roblox", "social", "permissions"];

function pickValues(values: Record<string, unknown>, prefix: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    if (key === prefix || key.startsWith(`${prefix}.`)) result[key] = value;
  }
  return result;
}

async function applyConfigPatch(
  access: GuildAccess,
  patch: Record<string, unknown>,
  expectedVersion?: unknown,
) {
  requireConfigAccess(access);
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    throw new InferaError("A configuration patch object is required", {
      code: ErrorCode.VALIDATION_ERROR,
    });
  }
  // Optimistic concurrency: reject the write when someone else saved first.
  if (typeof expectedVersion === "number") {
    const current = await services.config.get(access.guildId);
    if (current.version !== expectedVersion) {
      throw new InferaError("This configuration was changed by someone else. Reload and try again.", {
        code: ErrorCode.CONFLICT,
        details: [{ expectedVersion, currentVersion: current.version }],
      });
    }
  }
  const result = await services.config.update(access.guildId, patch, access.session.user.id);
  await services.audit.record({
    guildId: access.guildId,
    actorId: access.session.user.id,
    action: "config.update",
    metadata: { keys: result.changed, version: result.snapshot.version },
  });
  hub.broadcast(access.guildId, "config.updated", {
    keys: result.changed,
    version: result.snapshot.version,
  });
  return result;
}

export const guildRoutes: FastifyPluginAsync = async (app) => {
  // ------------------------------------------------------------------ guilds
  app.get(`${BASE_PATH}/guilds`, async (request) => {
    const session = await requireSession(request);
    return { guilds: await guildListForSession(session), bot: await botStatus() };
  });

  app.get(`${BASE_PATH}/guilds/:guildId`, async (request) => {
    const session = await requireSession(request);
    const { guildId } = request.params as { guildId: string };
    const access = await assertGuildAccess(session, guildId);
    const status = await botStatus();
    const botGuild = access.botGuild;
    return {
      guild: {
        id: guildId,
        name: botGuild?.name ?? access.userGuild.name,
        icon: botGuild?.icon ?? access.userGuild.icon,
        banner: botGuild?.banner ?? null,
        description: botGuild?.description ?? null,
        ownerId: botGuild?.owner_id ?? null,
        memberCount: guildMemberCount(botGuild) ?? 0,
        premiumTier: botGuild?.premium_tier ?? 0,
        createdAt: new Date(Number(BigInt(guildId) >> 22n) + 1_420_070_400_000).toISOString(),
        botInstalled: access.botInstalled,
        botOnline: access.botInstalled && status.online,
        userIsOwner: access.userGuild.owner,
      },
      level: access.level,
      scopes: access.scopes,
      bot: status,
    };
  });

  app.get(`${BASE_PATH}/guilds/:guildId/channels`, async (request) => {
    const session = await requireSession(request);
    const { guildId } = request.params as { guildId: string };
    const access = await assertGuildAccess(session, guildId, { requireBot: true });
    const channels = await services.discord.getGuildChannels(guildId);
    return {
      channels: channels
        .filter((channel) => channel.type === 0 || channel.type === 2 || channel.type === 4 || channel.type === 5)
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
        .map((channel) => ({
          id: channel.id,
          name: channel.name ?? "unknown",
          type: channel.type,
          parentId: channel.parent_id ?? null,
        })),
      level: access.level,
    };
  });

  app.get(`${BASE_PATH}/guilds/:guildId/roles`, async (request) => {
    const session = await requireSession(request);
    const { guildId } = request.params as { guildId: string };
    const access = await assertGuildAccess(session, guildId, { requireBot: true });
    const roles = await services.discord.getGuildRoles(guildId);
    return {
      roles: roles
        .filter((role) => role.id !== guildId)
        .sort((a, b) => b.position - a.position)
        .map((role) => ({
          id: role.id,
          name: role.name,
          color: role.color,
          position: role.position,
          managed: role.managed,
        })),
    };
  });

  // ------------------------------------------------------------- overview
  app.get(`${BASE_PATH}/guilds/:guildId/overview`, async (request) => {
    const session = await requireSession(request);
    const { guildId } = request.params as { guildId: string };
    const access = await assertGuildAccess(session, guildId, { requireBot: true });
    const [analytics, modules, levelingUsers, ticketsOpen, giveawaysActive, cases, recentAudit, status] =
      await Promise.all([
        services.analytics.overview(guildId),
        services.config.getModules(guildId),
        db.levelingUser.count({ where: { guildId } }),
        db.ticket.count({ where: { guildId, status: "open" } }),
        db.giveaway.count({ where: { guildId, status: "active" } }),
        db.moderationCase.count({ where: { guildId } }),
        db.auditLog.findMany({ where: { guildId }, orderBy: { createdAt: "desc" }, take: 6 }),
        botStatus(),
      ]);
    return {
      analytics,
      modules,
      stats: {
        members: guildMemberCount(access.botGuild) ?? 0,
        levelingUsers,
        openTickets: ticketsOpen,
        activeGiveaways: giveawaysActive,
        moderationCases: cases,
        enabledModules: modules.filter((module) => module.enabled).length,
      },
      bot: status,
      recentAudit: recentAudit.map((row) => ({
        id: row.id,
        action: row.action,
        actorId: row.actorId,
        targetId: row.targetId,
        createdAt: row.createdAt,
      })),
    };
  });

  // --------------------------------------------------------------- config
  app.get(`${BASE_PATH}/guilds/:guildId/settings`, async (request) => {
    const session = await requireSession(request);
    const { guildId } = request.params as { guildId: string };
    const access = await assertGuildAccess(session, guildId, { requireBot: true });
    const [snapshot, modules] = await Promise.all([
      services.config.get(guildId),
      services.config.getModules(guildId),
    ]);
    return {
      values: snapshot.values,
      version: snapshot.version,
      updatedAt: snapshot.updatedAt,
      modules,
      level: access.level,
      scopes: access.scopes,
    };
  });

  app.patch(`${BASE_PATH}/guilds/:guildId/settings`, async (request) => {
    const session = await requireSession(request);
    const { guildId } = request.params as { guildId: string };
    const access = await assertGuildAccess(session, guildId, { requireBot: true });
    const body = (request.body ?? {}) as { patch?: Record<string, unknown>; values?: Record<string, unknown> };
    const result = await applyConfigPatch(access, body.patch ?? body.values ?? (body as Record<string, unknown>));
    return { changed: result.changed, snapshot: result.snapshot };
  });

  app.get(`${BASE_PATH}/guilds/:guildId/config`, async (request) => {
    const session = await requireSession(request);
    const { guildId } = request.params as { guildId: string };
    const access = await assertGuildAccess(session, guildId, { requireBot: true });
    const snapshot = await services.config.get(guildId);
    return { ...snapshot, level: access.level };
  });

  app.patch(`${BASE_PATH}/guilds/:guildId/config`, async (request) => {
    const session = await requireSession(request);
    const { guildId } = request.params as { guildId: string };
    const access = await assertGuildAccess(session, guildId, { requireBot: true });
    const body = (request.body ?? {}) as { patch?: Record<string, unknown>; expectedVersion?: number };
    const result = await applyConfigPatch(access, body.patch ?? {}, body.expectedVersion);
    return { changed: result.changed, snapshot: result.snapshot };
  });

  app.post(`${BASE_PATH}/guilds/:guildId/config/reset`, async (request) => {
    const session = await requireSession(request);
    const { guildId } = request.params as { guildId: string };
    const access = await assertGuildAccess(session, guildId, { requireBot: true });
    requireConfigAccess(access);
    const body = (request.body ?? {}) as { section?: string | null };
    const section = body.section ?? null;
    if (section && !CONFIG_CATEGORIES.includes(section)) {
      throw new InferaError(`Unknown configuration section: ${section}`, {
        code: ErrorCode.VALIDATION_ERROR,
      });
    }
    const snapshot = await services.config.reset(guildId, section, access.session.user.id);
    await services.audit.record({
      guildId,
      actorId: access.session.user.id,
      action: "config.reset",
      metadata: { section },
    });
    hub.broadcast(guildId, "config.updated", { section: section ?? "all", version: snapshot.version });
    return { snapshot };
  });

  app.get(`${BASE_PATH}/config/schema`, async () => ({ schema: configSchemaDocument() }));

  // -------------------------------------------------------------- modules
  app.get(`${BASE_PATH}/guilds/:guildId/modules`, async (request) => {
    const session = await requireSession(request);
    const { guildId } = request.params as { guildId: string };
    await assertGuildAccess(session, guildId);
    return { modules: await services.config.getModules(guildId) };
  });

  app.patch(`${BASE_PATH}/guilds/:guildId/modules/:moduleId`, async (request) => {
    const session = await requireSession(request);
    const { guildId, moduleId } = request.params as { guildId: string; moduleId: string };
    const access = await assertGuildAccess(session, guildId, { requireBot: true });
    requireConfigAccess(access);
    const body = (request.body ?? {}) as { enabled?: boolean };
    if (typeof body.enabled !== "boolean") {
      throw new InferaError("enabled must be a boolean", { code: ErrorCode.VALIDATION_ERROR });
    }
    const module = await services.config.setModule(guildId, moduleId, body.enabled, access.session.user.id);
    await services.audit.record({
      guildId,
      actorId: access.session.user.id,
      action: body.enabled ? "module.enable" : "module.disable",
      targetId: moduleId,
    });
    hub.broadcast(guildId, body.enabled ? "module.enabled" : "module.disabled", { module: moduleId });
    return { module };
  });

  // -------------------------------------------------------------- welcome
  app.get(`${BASE_PATH}/guilds/:guildId/welcome`, async (request) => {
    const session = await requireSession(request);
    const { guildId } = request.params as { guildId: string };
    await assertGuildAccess(session, guildId, { requireBot: true });
    const values = await services.config.getValues(guildId);
    return {
      values: { ...pickValues(values, "welcome"), ...pickValues(values, "goodbye") },
      // Must match WELCOME_PLACEHOLDERS in apps/bot/src/lib/placeholders.ts.
      placeholders: ["{user}", "{username}", "{user_id}", "{server}", "{server_name}", "{member_count}", "{server_icon}", "{created_at}", "{joined_at}"],
    };
  });

  app.post(`${BASE_PATH}/guilds/:guildId/test-message`, async (request) => {
    const session = await requireSession(request);
    const { guildId } = request.params as { guildId: string };
    const access = await assertGuildAccess(session, guildId, { requireBot: true });
    requireConfigAccess(access);
    const body = (request.body ?? {}) as {
      channelId?: string;
      message?: string;
      embed?: { enabled?: boolean; title?: string; description?: string; color?: string };
    };
    if (!body.channelId) {
      throw new InferaError("Select a channel to send the test to", { code: ErrorCode.VALIDATION_ERROR });
    }
    const values = await services.config.getValues(guildId);
    const replace = (input: string) =>
      input
        .replaceAll("{user}", `<@${access.session.user.id}>`)
        .replaceAll("{username}", access.session.user.username)
        .replaceAll("{user_id}", access.session.user.id)
        .replaceAll("{server}", access.botGuild?.name ?? "")
        .replaceAll("{server_name}", access.botGuild?.name ?? "")
        .replaceAll("{member_count}", String(guildMemberCount(access.botGuild) ?? 0))
        .replaceAll("{server_icon}", access.botGuild?.icon ? `https://cdn.discordapp.com/icons/${guildId}/${access.botGuild.icon}.png` : "")
        .replaceAll("{created_at}", new Date(Number(BigInt(access.session.user.id) >> 22n) + 1_420_070_400_000).toISOString().slice(0, 10))
        .replaceAll("{joined_at}", new Date().toISOString().slice(0, 10))
        .replaceAll("{user.name}", access.session.user.username)
        .replaceAll("{user.id}", access.session.user.id)
        .replaceAll("{memberCount}", String(guildMemberCount(access.botGuild) ?? 0));
    const content = replace(body.message ?? (values["welcome.message"] as string) ?? "");
    const embedEnabled = body.embed?.enabled ?? false;
    let messageId: string | null = null;
    try {
      const message = await services.discord.sendMessage(body.channelId, {
        ...(content ? { content } : {}),
        ...(embedEnabled
          ? {
              embeds: [
                {
                  title: replace(body.embed?.title ?? "").slice(0, 256) || undefined,
                  description: replace(body.embed?.description ?? content).slice(0, 4000),
                  color: Number.parseInt((body.embed?.color ?? "#8B5CF6").replace("#", ""), 16) || 0x8b5cf6,
                  thumbnail: { url: access.session.user.avatar ? `https://cdn.discordapp.com/avatars/${access.session.user.id}/${access.session.user.avatar}.png` : "" },
                },
              ],
            }
          : {}),
      });
      messageId = message.id;
    } catch (error) {
      throw new InferaError("Discord rejected the test message", {
        code: ErrorCode.EXTERNAL_API_UNAVAILABLE,
        details: [String((error as Error).message ?? error)],
      });
    }
    return { sent: true, messageId };
  });

  // ----------------------------------------------------------- notifications
  app.get(`${BASE_PATH}/guilds/:guildId/notifications`, async (request) => {
    const session = await requireSession(request);
    const { guildId } = request.params as { guildId: string };
    const access = await assertGuildAccess(session, guildId);
    const [status, values, events, pendingAppeals, unreadCases] = await Promise.all([
      botStatus(),
      access.botInstalled ? services.config.getValues(guildId) : Promise.resolve(defaultConfig()),
      access.botInstalled
        ? db.securityEvent.findMany({ where: { guildId, resolved: false }, orderBy: { createdAt: "desc" }, take: 10 })
        : Promise.resolve([]),
      access.botInstalled ? db.moderationAppeal.count({ where: { guildId, status: "pending" } }) : 0,
      access.botInstalled
        ? db.moderationCase.count({ where: { guildId, status: "active" } })
        : 0,
    ]);
    const alerts: Array<Record<string, unknown>> = [];
    if (access.botInstalled && !status.online) {
      alerts.push({
        id: `${guildId}:bot-offline`,
        type: "bot",
        severity: "critical",
        title: "INFERA is offline",
        description: "The bot has not sent a heartbeat in the last 3 minutes.",
        createdAt: status.lastSeenAt,
      });
    }
    for (const event of events) {
      alerts.push({
        id: `security:${event.id}`,
        type: "security",
        severity: event.severity,
        title: event.type.replaceAll(".", " "),
        description: `Unresolved security event (${event.severity}).`,
        createdAt: event.createdAt.toISOString(),
      });
    }
    if (pendingAppeals > 0) {
      alerts.push({
        id: `${guildId}:appeals`,
        type: "moderation",
        severity: "warning",
        title: `${pendingAppeals} pending appeal${pendingAppeals === 1 ? "" : "s"}`,
        description: "Moderation appeals are waiting for a review.",
        createdAt: null,
      });
    }
    const issues: Array<[string, string]> = [];
    if (values["welcome.enabled"] && !values["welcome.channel_id"]) issues.push(["welcome", "Welcome is enabled but no channel is set."]);
    if (values["goodbye.enabled"] && !values["goodbye.channel_id"]) issues.push(["goodbye", "Goodbye messages are enabled without a channel."]);
    if (values["logging.enabled"] && !values["logging.channel_id"]) issues.push(["logging", "Logging is enabled without a destination channel."]);
    if (values["tickets.enabled"] && !values["tickets.category_id"]) issues.push(["tickets", "Tickets are enabled without a category."]);
    if (values["suggestions.enabled"] && !values["suggestions.channel_id"]) issues.push(["suggestions", "Suggestions are enabled without a channel."]);
    if (values["starboard.enabled"] && !values["starboard.channel_id"]) issues.push(["starboard", "Starboard is enabled without a channel."]);
    for (const [module, description] of issues) {
      alerts.push({
        id: `${guildId}:config:${module}`,
        type: "configuration",
        severity: "warning",
        title: "Configuration incomplete",
        description,
        createdAt: null,
      });
    }
    return { alerts, unreadCases };
  });

  // ---------------------------------------------------------- account-level
  app.get(`${BASE_PATH}/notifications`, async (request) => {
    const session = await requireSession(request);
    const [guilds, status] = await Promise.all([guildListForSession(session), botStatus()]);
    const installed = guilds.filter((guild) => guild.botInstalled);
    const alerts: Array<Record<string, unknown>> = [];
    if (!status.online) {
      alerts.push({
        id: "platform:bot-offline",
        type: "bot",
        severity: "critical",
        title: "INFERA is offline",
        description: "The bot has not reported a heartbeat recently. Changes will not apply until it reconnects.",
        guildId: null,
        guildName: null,
        createdAt: status.lastSeenAt,
      });
    }
    if (installed.length > 0) {
      const events = await db.securityEvent.findMany({
        where: { guildId: { in: installed.map((guild) => guild.id) }, resolved: false },
        orderBy: { createdAt: "desc" },
        take: 20,
      });
      const nameById = new Map(installed.map((guild) => [guild.id, guild.name]));
      for (const event of events) {
        alerts.push({
          id: `security:${event.id}`,
          type: "security",
          severity: event.severity,
          title: event.type.replaceAll(".", " "),
          description: "Unresolved security event.",
          guildId: event.guildId,
          guildName: nameById.get(event.guildId) ?? event.guildId,
          createdAt: event.createdAt.toISOString(),
        });
      }
    }
    return { alerts, bot: status, guilds: guilds.length };
  });

  app.get(`${BASE_PATH}/status`, async () => {
    const status = await botStatus();
    let database = true;
    try {
      await db.$queryRaw`SELECT 1`;
    } catch {
      database = false;
    }
    return {
      status: status.online && database ? "operational" : "degraded",
      components: [
        { id: "api", name: "Dashboard API", status: "operational" },
        { id: "database", name: "Database", status: database ? "operational" : "down" },
        { id: "bot", name: "Discord bot", status: status.online ? "operational" : "offline" },
      ],
      bot: status,
      checkedAt: new Date().toISOString(),
      version: "1.0.0",
    };
  });
};
