import { ErrorCode, InferaError } from "@infera/shared";
import type { FastifyPluginAsync } from "fastify";
import { BASE_PATH, db, services } from "../lib/config";
import { assertGuildAccess, requireConfigAccess, requireModerator } from "../lib/auth";
import { requireSession } from "../lib/session";
import { pagination, stringQuery } from "../lib/http";
import { hub } from "../lib/hub";

const MOD_ACTIONS = ["ban", "unban", "kick", "timeout", "untimeout", "warn", "softban"] as const;
type ModAction = (typeof MOD_ACTIONS)[number];

const AUTOMOD_ACTIONS = ["delete", "warn", "timeout", "kick", "ban"] as const;

const AUTOMOD_RULES = [
  {
    type: "anti_spam",
    label: "Anti-spam",
    description: "Detect repeated messages inside a short window.",
    enabled: "automod.anti_spam.enabled",
    action: "automod.anti_spam.action",
    threshold: "automod.anti_spam.threshold",
    window: "automod.anti_spam.window_seconds",
  },
  {
    type: "anti_link",
    label: "Anti-link",
    description: "Block external links.",
    enabled: "automod.anti_link.enabled",
    action: "automod.anti_link.action",
  },
  {
    type: "anti_invite",
    label: "Anti-invite",
    description: "Block Discord invite links.",
    enabled: "automod.anti_invite.enabled",
    action: "automod.anti_invite.action",
  },
  {
    type: "anti_caps",
    label: "Anti-caps",
    description: "Block messages dominated by capital letters.",
    enabled: "automod.anti_caps.enabled",
    threshold: "automod.anti_caps.threshold",
  },
  {
    type: "anti_emoji",
    label: "Anti-emoji",
    description: "Limit emoji spam.",
    enabled: "automod.anti_emoji.enabled",
  },
  {
    type: "anti_mention",
    label: "Anti-mention",
    description: "Limit mass mentions.",
    enabled: "automod.anti_mention.enabled",
  },
  {
    type: "anti_phishing",
    label: "Anti-phishing",
    description: "Block known scam patterns.",
    enabled: "automod.anti_phishing.enabled",
  },
  {
    type: "bad_words",
    label: "Bad words",
    description: "Filter configured words and phrases.",
    enabled: "automod.bad_words.enabled",
    list: "automod.bad_words.list",
  },
  {
    type: "regex",
    label: "Regex filters",
    description: "Custom regular expression filters.",
    enabled: "automod.regex.enabled",
    list: "automod.regex.patterns",
  },
] as const;

const RULE_BY_TYPE = new Map<string, (typeof AUTOMOD_RULES)[number]>(
  AUTOMOD_RULES.map((rule) => [rule.type, rule]),
);

function emojiCount(content: string): number {
  return Array.from(content.matchAll(/\p{Extended_Pictographic}/gu)).length;
}

function capsRatio(content: string): number {
  const letters = content.replace(/[^a-zA-Z]/g, "");
  if (letters.length < 8) return 0;
  return (content.replace(/[^A-Z]/g, "").length / letters.length) * 100;
}

export const moderationRoutes: FastifyPluginAsync = async (app) => {
  // ------------------------------------------------------------ moderation
  app.get(`${BASE_PATH}/guilds/:guildId/moderation/stats`, async (request) => {
    const session = await requireSession(request);
    const { guildId } = request.params as { guildId: string };
    const access = await assertGuildAccess(session, guildId, { requireBot: true });
    requireModerator(access);
    const [stats, warnings, appeals] = await Promise.all([
      services.moderation.stats(guildId),
      db.moderationWarning.count({ where: { guildId, active: true } }),
      db.moderationAppeal.count({ where: { guildId, status: "pending" } }),
    ]);
    return { ...stats, activeWarnings: warnings, pendingAppeals: appeals };
  });

  app.get(`${BASE_PATH}/guilds/:guildId/moderation/cases`, async (request) => {
    const session = await requireSession(request);
    const { guildId } = request.params as { guildId: string };
    const access = await assertGuildAccess(session, guildId, { requireBot: true });
    requireModerator(access);
    const query = request.query as Record<string, unknown>;
    const { page, pageSize } = pagination(query);
    return services.moderation.listCases(guildId, {
      page,
      pageSize,
      ...(stringQuery(query.type) ? { type: stringQuery(query.type) } : {}),
      ...(stringQuery(query.userId) ? { targetId: stringQuery(query.userId) } : {}),
      ...(stringQuery(query.moderatorId) ? { moderatorId: stringQuery(query.moderatorId) } : {}),
    });
  });

  app.get(`${BASE_PATH}/guilds/:guildId/moderation/cases/:caseId`, async (request) => {
    const session = await requireSession(request);
    const { guildId, caseId } = request.params as { guildId: string; caseId: string };
    const access = await assertGuildAccess(session, guildId, { requireBot: true });
    requireModerator(access);
    return { case: await services.moderation.getCase(guildId, caseId) };
  });

  app.post(`${BASE_PATH}/guilds/:guildId/moderation/actions`, async (request) => {
    const session = await requireSession(request);
    const { guildId } = request.params as { guildId: string };
    const access = await assertGuildAccess(session, guildId, { requireBot: true });
    requireModerator(access);
    const body = (request.body ?? {}) as {
      action?: string;
      targetId?: string;
      reason?: string;
      durationSeconds?: number;
      deleteMessageSeconds?: number;
    };
    const action = body.action as ModAction | undefined;
    if (!action || !MOD_ACTIONS.includes(action)) {
      throw new InferaError(`action must be one of ${MOD_ACTIONS.join(", ")}`, {
        code: ErrorCode.VALIDATION_ERROR,
      });
    }
    if (!body.targetId || !/^\d{17,20}$/.test(body.targetId)) {
      throw new InferaError("A valid Discord user ID is required", { code: ErrorCode.VALIDATION_ERROR });
    }
    if ((action === "ban" || action === "kick") && access.session.user.id === body.targetId) {
      throw new InferaError("You cannot moderate yourself", { code: ErrorCode.VALIDATION_ERROR });
    }
    const actorId = access.session.user.id;
    const options = {
      reason: body.reason?.slice(0, 500),
      durationMs: body.durationSeconds ? Math.max(1, body.durationSeconds) * 1000 : undefined,
      deleteMessageSeconds: body.deleteMessageSeconds,
    };
    const record =
      action === "ban"
        ? await services.moderation.ban(guildId, actorId, body.targetId, options)
        : action === "unban"
          ? await services.moderation.unban(guildId, actorId, body.targetId, options.reason)
          : action === "kick"
            ? await services.moderation.kick(guildId, actorId, body.targetId, options)
            : action === "timeout"
              ? await services.moderation.timeout(guildId, actorId, body.targetId, options)
              : action === "untimeout"
                ? await services.moderation.untimeout(guildId, actorId, body.targetId, options.reason)
                : action === "softban"
                  ? await services.moderation.softban(guildId, actorId, body.targetId, options)
                  : await services.moderation.warn(
                      guildId,
                      actorId,
                      body.targetId,
                      options.reason ?? "No reason provided",
                    );
    hub.broadcast(guildId, "moderation.case.created", { type: action, targetId: body.targetId });
    return { case: "case" in record ? record.case : record, ...(("count" in record) ? { count: record.count } : {}) };
  });

  app.get(`${BASE_PATH}/guilds/:guildId/moderation/warnings`, async (request) => {
    const session = await requireSession(request);
    const { guildId } = request.params as { guildId: string };
    const access = await assertGuildAccess(session, guildId, { requireBot: true });
    requireModerator(access);
    const query = request.query as Record<string, unknown>;
    return {
      warnings: await services.moderation.listWarnings(
        guildId,
        stringQuery(query.userId),
        query.active !== "false",
      ),
    };
  });

  app.delete(`${BASE_PATH}/guilds/:guildId/moderation/warnings/:warningId`, async (request) => {
    const session = await requireSession(request);
    const { guildId, warningId } = request.params as { guildId: string; warningId: string };
    const access = await assertGuildAccess(session, guildId, { requireBot: true });
    requireModerator(access);
    await services.moderation.removeWarning(guildId, access.session.user.id, warningId);
    return { removed: true };
  });

  app.get(`${BASE_PATH}/guilds/:guildId/moderation/appeals`, async (request) => {
    const session = await requireSession(request);
    const { guildId } = request.params as { guildId: string };
    const access = await assertGuildAccess(session, guildId, { requireBot: true });
    requireModerator(access);
    const status = stringQuery((request.query as Record<string, unknown>).status);
    return {
      appeals: await db.moderationAppeal.findMany({
        where: { guildId, ...(status ? { status } : {}) },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
    };
  });

  app.post(`${BASE_PATH}/guilds/:guildId/moderation/appeals/:appealId/review`, async (request) => {
    const session = await requireSession(request);
    const { guildId, appealId } = request.params as { guildId: string; appealId: string };
    const access = await assertGuildAccess(session, guildId, { requireBot: true });
    requireModerator(access);
    const body = (request.body ?? {}) as { status?: string; notes?: string };
    if (body.status !== "approved" && body.status !== "rejected") {
      throw new InferaError("status must be approved or rejected", { code: ErrorCode.VALIDATION_ERROR });
    }
    const existing = await db.moderationAppeal.findFirst({ where: { id: appealId, guildId } });
    if (!existing) throw new InferaError("Appeal not found", { code: ErrorCode.NOT_FOUND });
    const updated = await db.moderationAppeal.update({
      where: { id: appealId },
      data: {
        status: body.status,
        reviewerId: access.session.user.id,
        reviewNotes: body.notes?.slice(0, 2000) ?? null,
      },
    });
    await services.audit.record({
      guildId,
      actorId: access.session.user.id,
      action: "moderation.appeal.review",
      targetId: appealId,
      metadata: { status: body.status },
    });
    hub.broadcast(guildId, "moderation.appeal.updated", { appealId, status: body.status });
    return { appeal: updated };
  });

  app.post(`${BASE_PATH}/guilds/:guildId/moderation/purge`, async (request) => {
    const session = await requireSession(request);
    const { guildId } = request.params as { guildId: string };
    const access = await assertGuildAccess(session, guildId, { requireBot: true });
    requireModerator(access);
    const body = (request.body ?? {}) as { channelId?: string; count?: number; userId?: string };
    if (!body.channelId) throw new InferaError("channelId is required", { code: ErrorCode.VALIDATION_ERROR });
    const deleted = await services.moderation.purge(
      guildId,
      body.channelId,
      access.session.user.id,
      Math.min(Math.max(body.count ?? 10, 1), 1000),
      body.userId,
    );
    return { deleted };
  });

  // -------------------------------------------------------------- automod
  app.get(`${BASE_PATH}/guilds/:guildId/automod`, async (request) => {
    const session = await requireSession(request);
    const { guildId } = request.params as { guildId: string };
    const access = await assertGuildAccess(session, guildId, { requireBot: true });
    const values = await services.config.getValues(guildId);
    return {
      enabled: Boolean(values["automod.enabled"]),
      rules: AUTOMOD_RULES.map((rule) => ({
        type: rule.type,
        label: rule.label,
        description: rule.description,
        enabled: Boolean(values[rule.enabled]),
        action: "action" in rule ? (values[rule.action] as string) ?? "delete" : null,
        threshold: "threshold" in rule ? (values[rule.threshold] as number) ?? null : null,
        windowSeconds: "window" in rule ? (values[rule.window] as number) ?? null : null,
        list: "list" in rule ? ((values[rule.list] as string[]) ?? []) : null,
        supports: {
          action: "action" in rule,
          threshold: "threshold" in rule,
          window: "window" in rule,
          list: "list" in rule,
        },
      })),
      exemptions: {
        roles: values["automod.exempt_roles"] ?? [],
        channels: values["automod.exempt_channels"] ?? [],
        badWords: values["automod.bad_words.list"] ?? [],
        regex: values["automod.regex.patterns"] ?? [],
      },
      actions: AUTOMOD_ACTIONS,
    };
  });

  app.patch(`${BASE_PATH}/guilds/:guildId/automod/rules/:type`, async (request) => {
    const session = await requireSession(request);
    const { guildId, type } = request.params as { guildId: string; type: string };
    const access = await assertGuildAccess(session, guildId, { requireBot: true });
    requireConfigAccess(access);
    const rule = RULE_BY_TYPE.get(type);
    if (!rule) throw new InferaError(`Unknown automod rule: ${type}`, { code: ErrorCode.VALIDATION_ERROR });
    const body = (request.body ?? {}) as {
      enabled?: boolean;
      action?: string;
      threshold?: number;
      windowSeconds?: number;
      list?: string[];
    };
    const patch: Record<string, unknown> = {};
    if (typeof body.enabled === "boolean") patch[rule.enabled] = body.enabled;
    if ("action" in rule && body.action) {
      if (!AUTOMOD_ACTIONS.includes(body.action as (typeof AUTOMOD_ACTIONS)[number])) {
        throw new InferaError("Invalid automod action", { code: ErrorCode.VALIDATION_ERROR });
      }
      patch[rule.action] = body.action;
    }
    if ("threshold" in rule && typeof body.threshold === "number") patch[rule.threshold] = body.threshold;
    if ("window" in rule && typeof body.windowSeconds === "number") patch[rule.window] = body.windowSeconds;
    if ("list" in rule && Array.isArray(body.list)) patch[rule.list] = body.list.map((entry) => String(entry).slice(0, 200));
    if (Object.keys(patch).length === 0) {
      throw new InferaError("No automod values were provided", { code: ErrorCode.VALIDATION_ERROR });
    }
    await services.config.update(guildId, patch, access.session.user.id);
    await services.audit.record({
      guildId,
      actorId: access.session.user.id,
      action: "automod.rule.update",
      targetId: type,
      metadata: patch,
    });
    hub.broadcast(guildId, "automod.rule.updated", { type });
    return { updated: true, patch };
  });

  app.post(`${BASE_PATH}/guilds/:guildId/automod/test`, async (request) => {
    const session = await requireSession(request);
    const { guildId } = request.params as { guildId: string };
    const access = await assertGuildAccess(session, guildId, { requireBot: true });
    requireConfigAccess(access);
    const body = (request.body ?? {}) as { content?: string };
    const content = body.content ?? "";
    if (!content.trim()) throw new InferaError("Enter sample content to test", { code: ErrorCode.VALIDATION_ERROR });
    const values = await services.config.getValues(guildId);
    const matches: Array<{ rule: string; label: string; action: string; reason: string }> = [];
    if (values["automod.anti_link.enabled"] && /https?:\/\//i.test(content)) {
      matches.push({ rule: "anti_link", label: "Anti-link", action: values["automod.anti_link.action"] as string, reason: "Contains an external link" });
    }
    if (values["automod.anti_invite.enabled"] && /(discord\.gg|discord(?:app)?\.com\/invite)\//i.test(content)) {
      matches.push({ rule: "anti_invite", label: "Anti-invite", action: values["automod.anti_invite.action"] as string, reason: "Contains a Discord invite" });
    }
    if (values["automod.anti_caps.enabled"] && capsRatio(content) > Number(values["automod.anti_caps.threshold"] ?? 70)) {
      matches.push({ rule: "anti_caps", label: "Anti-caps", action: "delete", reason: "Too many capital letters" });
    }
    if (values["automod.anti_emoji.enabled"] && emojiCount(content) > 8) {
      matches.push({ rule: "anti_emoji", label: "Anti-emoji", action: "delete", reason: "Too many emoji" });
    }
    if (values["automod.anti_mention.enabled"] && (content.match(/<@!?\d+>/g) ?? []).length > 5) {
      matches.push({ rule: "anti_mention", label: "Anti-mention", action: "delete", reason: "Mass mentions" });
    }
    if (values["automod.anti_phishing.enabled"] && /(free\s+nitro|steamcommunity|discord-gift|claim\s+your|@everyone.*gift)/i.test(content)) {
      matches.push({ rule: "anti_phishing", label: "Anti-phishing", action: "delete", reason: "Matches known scam patterns" });
    }
    const words = (values["automod.bad_words.list"] as string[]) ?? [];
    if (values["automod.bad_words.enabled"]) {
      const lowered = content.toLowerCase();
      const hit = words.find((word) => word && lowered.includes(word.toLowerCase()));
      if (hit) matches.push({ rule: "bad_words", label: "Bad words", action: "delete", reason: `Contains blocked word: ${hit}` });
    }
    if (values["automod.regex.enabled"]) {
      for (const pattern of (values["automod.regex.patterns"] as string[]) ?? []) {
        try {
          if (new RegExp(pattern, "i").test(content)) {
            matches.push({ rule: "regex", label: "Regex filters", action: "delete", reason: `Matched pattern: ${pattern}` });
            break;
          }
        } catch {
          matches.push({ rule: "regex", label: "Regex filters", action: "delete", reason: `Invalid pattern: ${pattern}` });
        }
      }
    }
    return { matches, tested: content.length };
  });

  // --------------------------------------------------------------- security
  app.get(`${BASE_PATH}/guilds/:guildId/security`, async (request) => {
    const session = await requireSession(request);
    const { guildId } = request.params as { guildId: string };
    const access = await assertGuildAccess(session, guildId, { requireBot: true });
    const [values, events, whitelist] = await Promise.all([
      services.config.getValues(guildId),
      db.securityEvent.findMany({ where: { guildId }, orderBy: { createdAt: "desc" }, take: 50 }),
      db.securityWhitelist.findMany({ where: { guildId }, orderBy: { createdAt: "desc" } }),
    ]);
    const securityValues: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(values)) {
      if (key.startsWith("security.")) securityValues[key] = value;
    }
    return { values: securityValues, events, whitelist };
  });

  app.post(`${BASE_PATH}/guilds/:guildId/security/whitelist`, async (request) => {
    const session = await requireSession(request);
    const { guildId } = request.params as { guildId: string };
    const access = await assertGuildAccess(session, guildId, { requireBot: true });
    requireConfigAccess(access);
    const body = (request.body ?? {}) as { targetId?: string; targetType?: string };
    if (!body.targetId || !/^\d{17,20}$/.test(body.targetId)) {
      throw new InferaError("A valid Discord ID is required", { code: ErrorCode.VALIDATION_ERROR });
    }
    const targetType = body.targetType === "role" ? "role" : "user";
    const key = targetType === "role" ? "security.trusted_roles" : "security.whitelist";
    const values = await services.config.getValues(guildId);
    const current = (values[key] as string[]) ?? [];
    if (!current.includes(body.targetId)) {
      await services.config.update(guildId, { [key]: [...current, body.targetId] }, access.session.user.id);
    }
    const row = await db.securityWhitelist.upsert({
      where: { guildId_targetId_targetType: { guildId, targetId: body.targetId, targetType } },
      create: { guildId, targetId: body.targetId, targetType, addedBy: access.session.user.id },
      update: {},
    });
    await services.audit.record({
      guildId,
      actorId: access.session.user.id,
      action: "security.whitelist.add",
      targetId: body.targetId,
      metadata: { targetType },
    });
    return { entry: row };
  });

  app.delete(`${BASE_PATH}/guilds/:guildId/security/whitelist/:entryId`, async (request) => {
    const session = await requireSession(request);
    const { guildId, entryId } = request.params as { guildId: string; entryId: string };
    const access = await assertGuildAccess(session, guildId, { requireBot: true });
    requireConfigAccess(access);
    const row = await db.securityWhitelist.findFirst({ where: { id: entryId, guildId } });
    if (!row) throw new InferaError("Whitelist entry not found", { code: ErrorCode.NOT_FOUND });
    const key = row.targetType === "role" ? "security.trusted_roles" : "security.whitelist";
    const values = await services.config.getValues(guildId);
    const current = ((values[key] as string[]) ?? []).filter((id) => id !== row.targetId);
    await services.config.update(guildId, { [key]: current }, access.session.user.id);
    await db.securityWhitelist.delete({ where: { id: entryId } });
    await services.audit.record({
      guildId,
      actorId: access.session.user.id,
      action: "security.whitelist.remove",
      targetId: row.targetId,
    });
    return { removed: true };
  });

  app.post(`${BASE_PATH}/guilds/:guildId/security/events/:eventId/resolve`, async (request) => {
    const session = await requireSession(request);
    const { guildId, eventId } = request.params as { guildId: string; eventId: string };
    const access = await assertGuildAccess(session, guildId, { requireBot: true });
    requireConfigAccess(access);
    const result = await db.securityEvent.updateMany({ where: { id: eventId, guildId }, data: { resolved: true } });
    if (result.count === 0) throw new InferaError("Security event not found", { code: ErrorCode.NOT_FOUND });
    return { resolved: true };
  });
};
