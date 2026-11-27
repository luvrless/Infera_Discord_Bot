import { ErrorCode, InferaError } from "@infera/shared";
import type { FastifyPluginAsync } from "fastify";
import { BASE_PATH, db, services } from "../lib/config";
import { assertGuildAccess, requireConfigAccess } from "../lib/auth";
import { requireSession } from "../lib/session";

const NAME = /^[\w-]{1,32}$/;
const MATCH_TYPES = new Set(["contains", "exact", "starts_with"]);

function cleanResponse(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new InferaError("A response is required", { code: ErrorCode.VALIDATION_ERROR });
  }
  return value.trim().slice(0, 2000);
}

export const automationRoutes: FastifyPluginAsync = async (app) => {
  // ----------------------------------------------------- custom commands
  app.get(`${BASE_PATH}/guilds/:guildId/custom-commands`, async (request) => {
    const session = await requireSession(request);
    const { guildId } = request.params as { guildId: string };
    await assertGuildAccess(session, guildId, { requireBot: true });
    return {
      commands: await db.customCommand.findMany({ where: { guildId }, orderBy: { name: "asc" } }),
    };
  });

  app.post(`${BASE_PATH}/guilds/:guildId/custom-commands`, async (request) => {
    const session = await requireSession(request);
    const { guildId } = request.params as { guildId: string };
    const access = await assertGuildAccess(session, guildId, { requireBot: true });
    requireConfigAccess(access);
    const body = (request.body ?? {}) as Record<string, unknown>;
    const name = typeof body.name === "string" ? body.name.trim().toLowerCase() : "";
    if (!NAME.test(name)) {
      throw new InferaError("Use 1-32 letters, numbers, dashes or underscores for the name", {
        code: ErrorCode.VALIDATION_ERROR,
      });
    }
    const existing = await db.customCommand.findUnique({ where: { guildId_name: { guildId, name } } });
    if (existing) {
      throw new InferaError("A custom command with that name already exists", { code: ErrorCode.CONFLICT });
    }
    const command = await db.customCommand.create({
      data: {
        guildId,
        name,
        description: typeof body.description === "string" ? body.description.slice(0, 200) : null,
        response: cleanResponse(body.response),
        embed: body.embed === true,
        level: Math.max(0, Math.min(5, Number(body.level) || 0)),
        enabled: body.enabled !== false,
        createdBy: access.session.user.id,
      },
    });
    await services.audit.record({
      guildId,
      actorId: access.session.user.id,
      action: "custom-command.create",
      targetId: command.id,
    });
    return { command };
  });

  app.patch(`${BASE_PATH}/guilds/:guildId/custom-commands/:commandId`, async (request) => {
    const session = await requireSession(request);
    const { guildId, commandId } = request.params as { guildId: string; commandId: string };
    const access = await assertGuildAccess(session, guildId, { requireBot: true });
    requireConfigAccess(access);
    const body = (request.body ?? {}) as Record<string, unknown>;
    const existing = await db.customCommand.findFirst({ where: { id: commandId, guildId } });
    if (!existing) throw new InferaError("Custom command not found", { code: ErrorCode.NOT_FOUND });
    const command = await db.customCommand.update({
      where: { id: existing.id },
      data: {
        response: body.response === undefined ? undefined : cleanResponse(body.response),
        description:
          body.description === undefined
            ? undefined
            : typeof body.description === "string"
              ? body.description.slice(0, 200)
              : null,
        embed: typeof body.embed === "boolean" ? body.embed : undefined,
        level: body.level === undefined ? undefined : Math.max(0, Math.min(5, Number(body.level) || 0)),
        enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
      },
    });
    return { command };
  });

  app.delete(`${BASE_PATH}/guilds/:guildId/custom-commands/:commandId`, async (request) => {
    const session = await requireSession(request);
    const { guildId, commandId } = request.params as { guildId: string; commandId: string };
    const access = await assertGuildAccess(session, guildId, { requireBot: true });
    requireConfigAccess(access);
    const result = await db.customCommand.deleteMany({ where: { id: commandId, guildId } });
    if (result.count === 0) throw new InferaError("Custom command not found", { code: ErrorCode.NOT_FOUND });
    return { removed: true };
  });

  // ------------------------------------------------------ scheduled messages
  app.get(`${BASE_PATH}/guilds/:guildId/scheduled-messages`, async (request) => {
    const session = await requireSession(request);
    const { guildId } = request.params as { guildId: string };
    await assertGuildAccess(session, guildId, { requireBot: true });
    return { messages: await services.scheduler.listMessageTasks(guildId) };
  });

  app.post(`${BASE_PATH}/guilds/:guildId/scheduled-messages`, async (request) => {
    const session = await requireSession(request);
    const { guildId } = request.params as { guildId: string };
    const access = await assertGuildAccess(session, guildId, { requireBot: true });
    requireConfigAccess(access);
    const body = (request.body ?? {}) as Record<string, unknown>;
    const channelId = typeof body.channelId === "string" ? body.channelId : "";
    if (!/^\d{17,20}$/.test(channelId)) {
      throw new InferaError("Choose a channel for the message", { code: ErrorCode.VALIDATION_ERROR });
    }
    const runAt = new Date(String(body.runAt ?? ""));
    if (Number.isNaN(runAt.getTime()) || runAt.getTime() <= Date.now() + 30_000) {
      throw new InferaError("Choose a time at least one minute in the future", { code: ErrorCode.VALIDATION_ERROR });
    }
    if (runAt.getTime() > Date.now() + 365 * 24 * 60 * 60 * 1000) {
      throw new InferaError("Schedules cannot be more than a year away", { code: ErrorCode.VALIDATION_ERROR });
    }
    const content = typeof body.content === "string" ? body.content.trim().slice(0, 2000) : "";
    if (!content) throw new InferaError("Write the message to schedule", { code: ErrorCode.VALIDATION_ERROR });
    const task = await services.scheduler.schedule({
      guildId,
      type: "message",
      payload: { channelId, content, userId: access.session.user.id },
      runAt,
    });
    await services.audit.record({
      guildId,
      actorId: access.session.user.id,
      action: "scheduled-message.create",
      targetId: task.id,
      metadata: { channelId, runAt: runAt.toISOString() },
    });
    return { task };
  });

  app.delete(`${BASE_PATH}/guilds/:guildId/scheduled-messages/:id`, async (request) => {
    const session = await requireSession(request);
    const { guildId, id } = request.params as { guildId: string; id: string };
    const access = await assertGuildAccess(session, guildId, { requireBot: true });
    requireConfigAccess(access);
    const removed = await services.scheduler.cancelMessageTask(guildId, id);
    if (!removed) throw new InferaError("Scheduled message not found", { code: ErrorCode.NOT_FOUND });
    return { removed: true };
  });

  // --------------------------------------------------------- autoresponders
  app.get(`${BASE_PATH}/guilds/:guildId/autoresponders`, async (request) => {
    const session = await requireSession(request);
    const { guildId } = request.params as { guildId: string };
    await assertGuildAccess(session, guildId, { requireBot: true });
    return {
      autoresponders: await db.autoresponder.findMany({ where: { guildId }, orderBy: { createdAt: "desc" } }),
    };
  });

  app.post(`${BASE_PATH}/guilds/:guildId/autoresponders`, async (request) => {
    const session = await requireSession(request);
    const { guildId } = request.params as { guildId: string };
    const access = await assertGuildAccess(session, guildId, { requireBot: true });
    requireConfigAccess(access);
    const body = (request.body ?? {}) as Record<string, unknown>;
    const trigger = typeof body.trigger === "string" ? body.trigger.trim() : "";
    if (trigger.length < 1 || trigger.length > 200) {
      throw new InferaError("A trigger between 1 and 200 characters is required", {
        code: ErrorCode.VALIDATION_ERROR,
      });
    }
    const matchType = typeof body.matchType === "string" && MATCH_TYPES.has(body.matchType) ? body.matchType : "contains";
    const autoresponder = await db.autoresponder.create({
      data: {
        guildId,
        trigger,
        response: cleanResponse(body.response),
        matchType,
        enabled: body.enabled !== false,
      },
    });
    await services.audit.record({
      guildId,
      actorId: access.session.user.id,
      action: "autoresponder.create",
      targetId: autoresponder.id,
    });
    return { autoresponder };
  });

  app.patch(`${BASE_PATH}/guilds/:guildId/autoresponders/:id`, async (request) => {
    const session = await requireSession(request);
    const { guildId, id } = request.params as { guildId: string; id: string };
    const access = await assertGuildAccess(session, guildId, { requireBot: true });
    requireConfigAccess(access);
    const body = (request.body ?? {}) as Record<string, unknown>;
    const existing = await db.autoresponder.findFirst({ where: { id, guildId } });
    if (!existing) throw new InferaError("Autoresponder not found", { code: ErrorCode.NOT_FOUND });
    const autoresponder = await db.autoresponder.update({
      where: { id: existing.id },
      data: {
        trigger:
          body.trigger === undefined
            ? undefined
            : typeof body.trigger === "string"
              ? body.trigger.trim().slice(0, 200)
              : existing.trigger,
        response: body.response === undefined ? undefined : cleanResponse(body.response),
        matchType:
          typeof body.matchType === "string" && MATCH_TYPES.has(body.matchType) ? body.matchType : undefined,
        enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
      },
    });
    return { autoresponder };
  });

  app.delete(`${BASE_PATH}/guilds/:guildId/autoresponders/:id`, async (request) => {
    const session = await requireSession(request);
    const { guildId, id } = request.params as { guildId: string; id: string };
    const access = await assertGuildAccess(session, guildId, { requireBot: true });
    requireConfigAccess(access);
    const result = await db.autoresponder.deleteMany({ where: { id, guildId } });
    if (result.count === 0) throw new InferaError("Autoresponder not found", { code: ErrorCode.NOT_FOUND });
    return { removed: true };
  });
};
