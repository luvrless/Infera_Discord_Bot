import { parseJson, toJson, type ModerationCase, type ModerationWarning, type PrismaClient } from "@infera/database";
import {
  ErrorCode,
  InferaError,
  discordTimestamp,
  type Cache,
} from "@infera/shared";
import type { AnalyticsService } from "./analytics-service";
import type { AuditService } from "./audit-service";
import type { GuildConfigService } from "./config-service";
import type { DiscordApi } from "./discord-api";
import type { RealtimeService } from "./realtime-service";

export type CaseType =
  | "ban"
  | "tempban"
  | "unban"
  | "kick"
  | "softban"
  | "timeout"
  | "untimeout"
  | "warn"
  | "unwarn"
  | "mute"
  | "jail"
  | "note";

export interface ModerationActionOptions {
  reason?: string;
  durationMs?: number;
  deleteMessageSeconds?: number;
  evidence?: string[];
  silent?: boolean;
}

export interface CreateCaseInput {
  guildId: string;
  type: CaseType;
  targetId: string;
  moderatorId: string;
  reason?: string | null;
  expiresAt?: Date | null;
  metadata?: unknown;
}

export class ModerationService {
  constructor(
    private readonly db: PrismaClient,
    private readonly discord: DiscordApi,
    private readonly config: GuildConfigService,
    private readonly realtime: RealtimeService,
    private readonly audit: AuditService,
    private readonly analytics: AnalyticsService,
    private readonly cache: Cache,
  ) {}

  private async nextCaseNumber(guildId: string): Promise<number> {
    const last = await this.db.moderationCase.findFirst({
      where: { guildId },
      orderBy: { caseNumber: "desc" },
      select: { caseNumber: true },
    });
    return (last?.caseNumber ?? 0) + 1;
  }

  async createCase(input: CreateCaseInput): Promise<ModerationCase> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        const caseNumber = await this.nextCaseNumber(input.guildId);
        const created = await this.db.moderationCase.create({
          data: {
            guildId: input.guildId,
            caseNumber,
            type: input.type,
            targetId: input.targetId,
            moderatorId: input.moderatorId,
            reason: input.reason ?? null,
            expiresAt: input.expiresAt ?? null,
            metadata: toJson(input.metadata ?? {}),
          },
        });
        await this.realtime.publish(input.guildId, "moderation.case.created", {
          caseId: created.id,
          caseNumber: created.caseNumber,
          type: created.type,
          targetId: created.targetId,
          moderatorId: created.moderatorId,
          reason: created.reason,
        });
        await this.analytics.recordMetric(input.guildId, "moderation");
        return created;
      } catch (error) {
        if ((error as { code?: string }).code !== "P2002") throw error;
        await this.cache.del(`infera:guild:${input.guildId}:case-sequence`);
      }
    }
    throw new InferaError("Could not allocate a case number", { code: ErrorCode.CONFLICT });
  }

  private async requireReason(guildId: string, reason?: string): Promise<void> {
    const required = await this.config.getValue<boolean>(guildId, "moderation.require_reason");
    if (required && (!reason || reason.trim().length === 0)) {
      throw new InferaError("A reason is required for this action", {
        code: ErrorCode.VALIDATION_ERROR,
        messageKey: "commands.moderation.reason_required",
      });
    }
  }

  private async notifyUser(guildId: string, userId: string, content: string): Promise<void> {
    const dmUsers = await this.config.getValue<boolean>(guildId, "moderation.dm_users");
    if (!dmUsers) return;
    try {
      await this.discord.sendDirectMessage(userId, { content });
    } catch {
      // DMs closed or user unreachable; moderation must still succeed.
    }
  }

  async ban(guildId: string, actorId: string, targetId: string, options: ModerationActionOptions = {}) {
    if (actorId === targetId) throw new InferaError("You cannot ban yourself", { code: ErrorCode.VALIDATION_ERROR });
    await this.requireReason(guildId, options.reason);
    await this.discord.ban(guildId, targetId, {
      reason: options.reason,
      deleteMessageSeconds: options.deleteMessageSeconds,
    });
    const expiresAt = options.durationMs ? new Date(Date.now() + options.durationMs) : null;
    const record = await this.createCase({
      guildId,
      type: expiresAt ? "tempban" : "ban",
      targetId,
      moderatorId: actorId,
      reason: options.reason ?? null,
      expiresAt,
      metadata: { evidence: options.evidence ?? [] },
    });
    if (expiresAt) {
      await this.db.scheduledTask.create({
        data: {
          guildId,
          type: "unban",
          payload: toJson({ userId: targetId, caseId: record.id }),
          runAt: expiresAt,
          status: "pending",
        },
      });
    }
    await this.realtime.publish(guildId, "moderation.ban.created", {
      userId: targetId,
      caseId: record.id,
      expiresAt: expiresAt?.toISOString() ?? null,
    });
    await this.audit.record({
      guildId,
      actorId,
      action: "moderation.ban",
      targetId,
      metadata: { caseId: record.id, reason: options.reason },
    });
    await this.notifyUser(
      guildId,
      targetId,
      `You were banned from the server${options.reason ? `: ${options.reason}` : "."}`,
    );
    return record;
  }

  async unban(guildId: string, actorId: string, targetId: string, reason?: string) {
    await this.discord.unban(guildId, targetId, reason);
    const record = await this.createCase({ guildId, type: "unban", targetId, moderatorId: actorId, reason: reason ?? null });
    await this.realtime.publish(guildId, "moderation.ban.removed", { userId: targetId, caseId: record.id });
    await this.audit.record({ guildId, actorId, action: "moderation.unban", targetId, metadata: { caseId: record.id } });
    return record;
  }

  async kick(guildId: string, actorId: string, targetId: string, options: ModerationActionOptions = {}) {
    if (actorId === targetId) throw new InferaError("You cannot kick yourself", { code: ErrorCode.VALIDATION_ERROR });
    await this.requireReason(guildId, options.reason);
    await this.discord.kick(guildId, targetId, options.reason);
    const record = await this.createCase({
      guildId,
      type: "kick",
      targetId,
      moderatorId: actorId,
      reason: options.reason ?? null,
    });
    await this.audit.record({ guildId, actorId, action: "moderation.kick", targetId, metadata: { caseId: record.id } });
    await this.notifyUser(guildId, targetId, `You were kicked from the server${options.reason ? `: ${options.reason}` : "."}`);
    return record;
  }

  async softban(guildId: string, actorId: string, targetId: string, options: ModerationActionOptions = {}) {
    await this.requireReason(guildId, options.reason);
    await this.discord.ban(guildId, targetId, {
      reason: options.reason,
      deleteMessageSeconds: options.deleteMessageSeconds ?? 86_400,
    });
    await this.discord.unban(guildId, targetId, options.reason);
    const record = await this.createCase({
      guildId,
      type: "softban",
      targetId,
      moderatorId: actorId,
      reason: options.reason ?? null,
    });
    await this.audit.record({ guildId, actorId, action: "moderation.softban", targetId, metadata: { caseId: record.id } });
    return record;
  }

  async timeout(guildId: string, actorId: string, targetId: string, options: ModerationActionOptions = {}) {
    if (!options.durationMs || options.durationMs <= 0) {
      throw new InferaError("A timeout duration is required", { code: ErrorCode.VALIDATION_ERROR });
    }
    const max = 28 * 24 * 60 * 60 * 1000;
    const duration = Math.min(options.durationMs, max);
    const until = new Date(Date.now() + duration);
    await this.discord.timeout(guildId, targetId, until, options.reason);
    const record = await this.createCase({
      guildId,
      type: "timeout",
      targetId,
      moderatorId: actorId,
      reason: options.reason ?? null,
      expiresAt: until,
    });
    await this.realtime.publish(guildId, "moderation.timeout.created", {
      userId: targetId,
      caseId: record.id,
      expiresAt: until.toISOString(),
    });
    await this.audit.record({ guildId, actorId, action: "moderation.timeout", targetId, metadata: { caseId: record.id, duration } });
    return record;
  }

  async untimeout(guildId: string, actorId: string, targetId: string, reason?: string) {
    await this.discord.timeout(guildId, targetId, null, reason);
    const record = await this.createCase({ guildId, type: "untimeout", targetId, moderatorId: actorId, reason: reason ?? null });
    await this.realtime.publish(guildId, "moderation.timeout.removed", { userId: targetId, caseId: record.id });
    return record;
  }

  async warn(guildId: string, actorId: string, targetId: string, reason: string) {
    const record = await this.createCase({ guildId, type: "warn", targetId, moderatorId: actorId, reason });
    const expiresDays = await this.config.getValue<number>(guildId, "moderation.warning_expiration_days");
    const expiresAt = expiresDays > 0 ? new Date(Date.now() + expiresDays * 86_400_000) : null;
    const warning = await this.db.moderationWarning.create({
      data: {
        guildId,
        caseId: record.id,
        userId: targetId,
        moderatorId: actorId,
        reason,
        expiresAt,
      },
    });
    const count = await this.db.moderationWarning.count({ where: { guildId, userId: targetId, active: true } });
    await this.realtime.publish(guildId, "moderation.warning.created", {
      warningId: warning.id,
      userId: targetId,
      caseId: record.id,
      count,
    });
    await this.notifyUser(
      guildId,
      targetId,
      `You received a warning${reason ? `: ${reason}` : "."} You now have ${count} active warning(s).`,
    );
    const escalation = await this.applyEscalation(guildId, actorId, targetId, count);
    return { case: record, warning, count, escalation };
  }

  private async applyEscalation(
    guildId: string,
    actorId: string,
    targetId: string,
    warningCount: number,
  ): Promise<string | null> {
    const thresholds = await this.config.getValue<
      Array<{ count: number; action: "timeout" | "kick" | "ban"; durationSeconds: number }>
    >(guildId, "moderation.warning_thresholds");
    const match = thresholds.find((threshold) => threshold.count === warningCount);
    if (!match) return null;
    if (match.action === "timeout") {
      await this.timeout(guildId, actorId, targetId, {
        reason: `Automatic escalation: ${warningCount} warnings`,
        durationMs: Math.max(60_000, match.durationSeconds * 1000),
      });
      return "timeout";
    }
    if (match.action === "kick") {
      await this.kick(guildId, actorId, targetId, { reason: `Automatic escalation: ${warningCount} warnings` });
      return "kick";
    }
    await this.ban(guildId, actorId, targetId, { reason: `Automatic escalation: ${warningCount} warnings` });
    return "ban";
  }

  async removeWarning(guildId: string, actorId: string, warningId: string): Promise<ModerationWarning> {
    const warning = await this.db.moderationWarning.findFirst({ where: { id: warningId, guildId } });
    if (!warning) throw new InferaError("Warning not found", { code: ErrorCode.NOT_FOUND });
    const updated = await this.db.moderationWarning.update({
      where: { id: warningId },
      data: { active: false, removedAt: new Date(), removedBy: actorId },
    });
    await this.realtime.publish(guildId, "moderation.warning.removed", { warningId, userId: warning.userId });
    return updated;
  }

  async listWarnings(guildId: string, userId?: string, activeOnly = true) {
    return this.db.moderationWarning.findMany({
      where: { guildId, ...(userId ? { userId } : {}), ...(activeOnly ? { active: true } : {}) },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }

  async getCase(guildId: string, caseId: string) {
    const record = await this.db.moderationCase.findFirst({
      where: { guildId, OR: [{ id: caseId }, { caseNumber: Number.isNaN(Number(caseId)) ? -1 : Number(caseId) }] },
    });
    if (!record) throw new InferaError("Case not found", { code: ErrorCode.NOT_FOUND });
    const evidence = await this.db.moderationEvidence.findMany({ where: { guildId, caseId: record.id } });
    return { ...record, evidence, metadataParsed: parseJson<Record<string, unknown>>(record.metadata, {}) };
  }

  async listCases(
    guildId: string,
    options: { page: number; pageSize: number; type?: string; targetId?: string; moderatorId?: string } = {
      page: 1,
      pageSize: 25,
    },
  ) {
    const where = {
      guildId,
      ...(options.type ? { type: options.type } : {}),
      ...(options.targetId ? { targetId: options.targetId } : {}),
      ...(options.moderatorId ? { moderatorId: options.moderatorId } : {}),
    };
    const [total, rows] = await this.db.$transaction([
      this.db.moderationCase.count({ where }),
      this.db.moderationCase.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (options.page - 1) * options.pageSize,
        take: options.pageSize,
      }),
    ]);
    return { total, rows, page: options.page, pageSize: options.pageSize };
  }

  async editCase(
    guildId: string,
    caseId: string,
    actorId: string,
    changes: { reason?: string; status?: string; evidenceUrl?: string },
  ) {
    const existing = await this.db.moderationCase.findFirst({ where: { guildId, id: caseId } });
    if (!existing) throw new InferaError("Case not found", { code: ErrorCode.NOT_FOUND });
    if (changes.evidenceUrl) {
      await this.db.moderationEvidence.create({
        data: { guildId, caseId, url: changes.evidenceUrl, addedBy: actorId },
      });
    }
    const updated = await this.db.moderationCase.update({
      where: { id: caseId },
      data: {
        ...(changes.reason !== undefined ? { reason: changes.reason } : {}),
        ...(changes.status ? { status: changes.status } : {}),
      },
    });
    await this.realtime.publish(guildId, "moderation.case.updated", { caseId, changes });
    await this.audit.record({ guildId, actorId, action: "moderation.case.edit", targetId: caseId, metadata: changes });
    return updated;
  }

  async voidCase(guildId: string, caseId: string, actorId: string, reason?: string) {
    const existing = await this.db.moderationCase.findFirst({ where: { guildId, id: caseId } });
    if (!existing) throw new InferaError("Case not found", { code: ErrorCode.NOT_FOUND });
    const updated = await this.db.moderationCase.update({
      where: { id: caseId },
      data: { status: "voided", resolvedAt: new Date(), resolvedBy: actorId },
    });
    if (existing.type === "warn") {
      await this.db.moderationWarning.updateMany({
        where: { guildId, caseId, active: true },
        data: { active: false, removedAt: new Date(), removedBy: actorId },
      });
    }
    await this.realtime.publish(guildId, "moderation.case.deleted", { caseId, reason: reason ?? null });
    await this.audit.record({ guildId, actorId, action: "moderation.case.void", targetId: caseId, metadata: { reason } });
    return updated;
  }

  async purge(
    guildId: string,
    channelId: string,
    actorId: string,
    count: number,
    filterUserId?: string,
  ): Promise<number> {
    const limit = Math.min(Math.max(1, count), 1000);
    let deleted = 0;
    let before: string | undefined;
    const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;

    while (deleted < limit) {
      const batchSize = Math.min(100, limit - deleted);
      const messages = await this.discord.getMessages(channelId, { limit: 100, before });
      if (messages.length === 0) break;
      before = messages[messages.length - 1]?.id;
      const eligible = messages
        .filter((message) => new Date(message.timestamp).getTime() > cutoff)
        .filter((message) => !filterUserId || message.author.id === filterUserId)
        .slice(0, batchSize);
      if (eligible.length === 0) break;
      if (eligible.length === 1) {
        await this.discord.deleteMessage(channelId, eligible[0]!.id, "Purge");
      } else {
        await this.discord.bulkDelete(channelId, eligible.map((message) => message.id), "Purge");
      }
      deleted += eligible.length;
      if (messages.length < 100) break;
    }

    await this.analytics.recordMetric(guildId, "moderation", deleted);
    await this.audit.record({
      guildId,
      actorId,
      action: "moderation.purge",
      targetId: channelId,
      metadata: { deleted, filterUserId: filterUserId ?? null },
    });
    return deleted;
  }

  async setSlowmode(guildId: string, channelId: string, seconds: number, actorId: string) {
    const rateLimit = Math.min(Math.max(0, Math.round(seconds)), 21_600);
    await this.discord.editChannel(channelId, { rate_limit_per_user: rateLimit }, "Slowmode");
    await this.audit.record({
      guildId,
      actorId,
      action: "moderation.slowmode",
      targetId: channelId,
      metadata: { rateLimit },
    });
    return rateLimit;
  }

  async setChannelLocked(
    guildId: string,
    channelId: string,
    locked: boolean,
    actorId: string,
  ): Promise<void> {
    // SendMessages permission bit (1 << 11). Denying it for @everyone locks the channel.
    const sendMessages = (1n << 11n).toString();
    await this.discord.setChannelPermission(channelId, guildId, {
      type: 0,
      allow: locked ? "0" : sendMessages,
      deny: locked ? sendMessages : "0",
    }, locked ? "Channel locked" : "Channel unlocked");
    await this.audit.record({
      guildId,
      actorId,
      action: locked ? "moderation.lock" : "moderation.unlock",
      targetId: channelId,
    });
  }

  async history(guildId: string, userId: string) {
    const [cases, warnings] = await Promise.all([
      this.db.moderationCase.findMany({ where: { guildId, targetId: userId }, orderBy: { createdAt: "desc" } }),
      this.db.moderationWarning.findMany({ where: { guildId, userId }, orderBy: { createdAt: "desc" } }),
    ]);
    return { cases, warnings };
  }

  async stats(guildId: string) {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [total, byType, byModerator, recent] = await Promise.all([
      this.db.moderationCase.count({ where: { guildId } }),
      this.db.moderationCase.groupBy({ by: ["type"], where: { guildId }, _count: { type: true } }),
      this.db.moderationCase.groupBy({
        by: ["moderatorId"],
        where: { guildId, createdAt: { gte: since } },
        _count: { moderatorId: true },
        orderBy: { _count: { moderatorId: "desc" } },
        take: 10,
      }),
      this.db.moderationCase.count({ where: { guildId, createdAt: { gte: since } } }),
    ]);
    return {
      total,
      last30Days: recent,
      byType: byType.map((row) => ({ type: row.type, count: row._count.type })),
      byModerator: byModerator.map((row) => ({ moderatorId: row.moderatorId, count: row._count.moderatorId })),
    };
  }

  /** Human-readable case summary used by the bot. */
  formatCase(record: ModerationCase): string {
    return `Case #${record.caseNumber} · ${record.type} · ${record.targetId} · ${discordTimestamp(record.createdAt)}`;
  }
}
