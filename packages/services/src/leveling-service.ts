import { toJson, type PrismaClient } from "@infera/database";
import { ErrorCode, InferaError, type Cache } from "@infera/shared";
import type { AnalyticsService } from "./analytics-service";
import type { GuildConfigService } from "./config-service";
import type { DiscordApi } from "./discord-api";
import type { RealtimeService } from "./realtime-service";
import { paginationArgs, type Paginated } from "./types";

export type LevelFormula = "sqrt" | "linear" | "quadratic";

/** Total XP required to reach `level`. */
export function xpForLevel(level: number, formula: LevelFormula): number {
  const l = Math.max(0, Math.floor(level));
  switch (formula) {
    case "linear":
      return 100 * l;
    case "quadratic":
      return 50 * l * l + 50 * l;
    case "sqrt":
    default:
      return 100 * l * l;
  }
}

/** Level achieved at a given total XP value. */
export function levelFromXp(xp: number, formula: LevelFormula): number {
  let level = 0;
  while (xpForLevel(level + 1, formula) <= xp && level < 10_000) level += 1;
  return level;
}

export interface AddXpResult {
  gained: number;
  totalXp: number;
  level: number;
  leveledUp: boolean;
  previousLevel: number;
  cooldownRemainingMs: number;
  capped: boolean;
}

export class LevelingService {
  constructor(
    private readonly db: PrismaClient,
    private readonly config: GuildConfigService,
    private readonly realtime: RealtimeService,
    private readonly analytics: AnalyticsService,
    private readonly cache: Cache,
    private readonly discord: DiscordApi,
  ) {}

  private async formula(guildId: string): Promise<LevelFormula> {
    return this.config.getValue<LevelFormula>(guildId, "leveling.level_formula");
  }

  async isExcluded(guildId: string, userId: string, channelId: string | null, roleIds: string[] = []): Promise<boolean> {
    const exclusions = await this.db.levelExclusion.findMany({ where: { guildId } });
    return exclusions.some(
      (exclusion) =>
        (exclusion.targetType === "user" && exclusion.targetId === userId) ||
        (exclusion.targetType === "channel" && exclusion.targetId === channelId) ||
        (exclusion.targetType === "role" && roleIds.includes(exclusion.targetId)),
    );
  }

  async addXp(
    guildId: string,
    userId: string,
    amount: number,
    source: "message" | "voice" | "command" | "admin",
    options: { channelId?: string | null; roleIds?: string[]; ignoreCooldown?: boolean } = {},
  ): Promise<AddXpResult> {
    const enabled = await this.config.getValue<boolean>(guildId, "leveling.enabled");
    if (!enabled) throw new InferaError("Leveling is disabled", { code: ErrorCode.FEATURE_DISABLED });

    if (source !== "admin" && (await this.isExcluded(guildId, userId, options.channelId ?? null, options.roleIds ?? []))) {
      return { gained: 0, totalXp: 0, level: 0, leveledUp: false, previousLevel: 0, cooldownRemainingMs: 0, capped: true };
    }

    const multiplier = await this.config.getValue<number>(guildId, "leveling.xp_multiplier");
    const cooldownSeconds = await this.config.getValue<number>(guildId, "leveling.message_cooldown");
    const dailyCap = await this.config.getValue<number>(guildId, "leveling.daily_cap");
    const formula = await this.formula(guildId);

    const existing = await this.db.levelingUser.findUnique({ where: { guildId_userId: { guildId, userId } } });
    const now = new Date();

    if (existing && !options.ignoreCooldown && source !== "admin") {
      const cooldownMs = Math.max(0, cooldownSeconds) * 1000;
      if (existing.lastXpAt && now.getTime() - existing.lastXpAt.getTime() < cooldownMs) {
        return {
          gained: 0,
          totalXp: existing.totalXp,
          level: existing.level,
          leveledUp: false,
          previousLevel: existing.level,
          cooldownRemainingMs: cooldownMs - (now.getTime() - existing.lastXpAt.getTime()),
          capped: false,
        };
      }
    }

    const dailyReset =
      !existing?.dailyResetAt || now.getTime() - existing.dailyResetAt.getTime() >= 86_400_000;
    const currentDaily = dailyReset ? 0 : existing?.dailyXp ?? 0;
    let granted = Math.max(0, Math.round(amount * multiplier));
    let capped = false;
    if (dailyCap > 0 && source !== "admin") {
      const remaining = Math.max(0, dailyCap - currentDaily);
      if (granted > remaining) {
        granted = remaining;
        capped = true;
      }
    }

    const previousLevel = existing?.level ?? 0;
    const totalXp = (existing?.totalXp ?? 0) + granted;
    const newLevel = levelFromXp(totalXp, formula);
    const leveledUp = newLevel > previousLevel;

    const updated = await this.db.levelingUser.upsert({
      where: { guildId_userId: { guildId, userId } },
      create: {
        guildId,
        userId,
        xp: totalXp,
        totalXp,
        level: newLevel,
        messageCount: source === "message" ? 1 : 0,
        voiceMinutes: source === "voice" ? 1 : 0,
        dailyXp: granted,
        dailyResetAt: now,
        lastXpAt: now,
      },
      update: {
        xp: totalXp,
        totalXp,
        level: newLevel,
        messageCount: source === "message" ? { increment: 1 } : undefined,
        voiceMinutes: source === "voice" ? { increment: 1 } : undefined,
        dailyXp: dailyReset ? granted : { increment: granted },
        dailyResetAt: dailyReset ? now : existing?.dailyResetAt ?? now,
        lastXpAt: now,
      },
    });

    await this.cache.del(`infera:guild:${guildId}:leaderboard:xp`);
    await this.realtime.publish(guildId, "leveling.xp.updated", {
      userId,
      gained: granted,
      totalXp: updated.totalXp,
      level: updated.level,
      source,
    });
    await this.analytics.recordMetric(guildId, "messages", source === "message" ? 1 : 0);

    if (leveledUp) {
      await this.realtime.publish(guildId, "leveling.level.up", {
        userId,
        level: newLevel,
        previousLevel,
      });
      await this.grantRewards(guildId, userId, newLevel);
    }

    return {
      gained: granted,
      totalXp: updated.totalXp,
      level: updated.level,
      leveledUp,
      previousLevel,
      cooldownRemainingMs: 0,
      capped,
    };
  }

  private async grantRewards(guildId: string, userId: string, level: number): Promise<void> {
    const rewards = await this.db.levelReward.findMany({ where: { guildId, level } });
    for (const reward of rewards) {
      try {
        await this.discord.addRole(guildId, userId, reward.roleId, `Level ${level} reward`);
        await this.realtime.publish(guildId, "leveling.reward.granted", {
          userId,
          level,
          roleId: reward.roleId,
        });
      } catch {
        // Missing permission or deleted role: rewards are best effort.
      }
    }
  }

  async getRank(guildId: string, userId: string) {
    const formula = await this.formula(guildId);
    const record = await this.db.levelingUser.findUnique({ where: { guildId_userId: { guildId, userId } } });
    const totalXp = record?.totalXp ?? 0;
    const level = levelFromXp(totalXp, formula);
    const [higher, total] = await Promise.all([
      this.db.levelingUser.count({ where: { guildId, totalXp: { gt: totalXp } } }),
      this.db.levelingUser.count({ where: { guildId } }),
    ]);
    const currentFloor = xpForLevel(level, formula);
    const nextFloor = xpForLevel(level + 1, formula);
    return {
      userId,
      totalXp,
      level,
      rank: higher + 1,
      total,
      currentLevelXp: totalXp - currentFloor,
      requiredXp: Math.max(1, nextFloor - currentFloor),
      progress: Math.max(0, Math.min(1, (totalXp - currentFloor) / Math.max(1, nextFloor - currentFloor))),
      messages: record?.messageCount ?? 0,
      voiceMinutes: record?.voiceMinutes ?? 0,
      prestige: record?.prestige ?? 0,
    };
  }

  async getLeaderboard(
    guildId: string,
    options: { page: number; pageSize: number; type?: "xp" | "level" | "messages" | "voice" } = {
      page: 1,
      pageSize: 10,
    },
  ): Promise<Paginated<{ userId: string; totalXp: number; level: number; messages: number; voiceMinutes: number }>> {
    const { skip, take } = paginationArgs(options.page, options.pageSize);
    const orderBy =
      options.type === "messages"
        ? { messageCount: "desc" as const }
        : options.type === "voice"
          ? { voiceMinutes: "desc" as const }
          : { totalXp: "desc" as const };
    const [total, rows] = await this.db.$transaction([
      this.db.levelingUser.count({ where: { guildId } }),
      this.db.levelingUser.findMany({ where: { guildId }, orderBy, skip, take }),
    ]);
    return {
      items: rows.map((row) => ({
        userId: row.userId,
        totalXp: row.totalXp,
        level: row.level,
        messages: row.messageCount,
        voiceMinutes: row.voiceMinutes,
      })),
      total,
      page: Math.max(1, options.page),
      pageSize: take,
      pages: Math.max(1, Math.ceil(total / take)),
    };
  }

  async setXp(guildId: string, userId: string, totalXp: number): Promise<void> {
    const formula = await this.formula(guildId);
    await this.db.levelingUser.upsert({
      where: { guildId_userId: { guildId, userId } },
      create: { guildId, userId, xp: totalXp, totalXp, level: levelFromXp(totalXp, formula) },
      update: { xp: totalXp, totalXp, level: levelFromXp(totalXp, formula) },
    });
    await this.cache.del(`infera:guild:${guildId}:leaderboard:xp`);
  }

  async resetUser(guildId: string, userId: string): Promise<void> {
    await this.db.levelingUser.deleteMany({ where: { guildId, userId } });
    await this.cache.del(`infera:guild:${guildId}:leaderboard:xp`);
  }

  async resetGuild(guildId: string): Promise<number> {
    const result = await this.db.levelingUser.deleteMany({ where: { guildId } });
    await this.cache.del(`infera:guild:${guildId}:leaderboard:xp`);
    return result.count;
  }

  async listRewards(guildId: string) {
    return this.db.levelReward.findMany({ where: { guildId }, orderBy: { level: "asc" } });
  }

  async addReward(guildId: string, level: number, roleId: string) {
    return this.db.levelReward.upsert({
      where: { guildId_level_roleId: { guildId, level, roleId } },
      create: { guildId, level, roleId },
      update: {},
    });
  }

  async removeReward(guildId: string, rewardId: string) {
    const deleted = await this.db.levelReward.deleteMany({ where: { guildId, id: rewardId } });
    if (deleted.count === 0) throw new InferaError("Reward not found", { code: ErrorCode.NOT_FOUND });
  }

  async listExclusions(guildId: string) {
    return this.db.levelExclusion.findMany({ where: { guildId } });
  }

  async addExclusion(guildId: string, targetType: "user" | "channel" | "role", targetId: string) {
    return this.db.levelExclusion.upsert({
      where: { guildId_targetType_targetId: { guildId, targetType, targetId } },
      create: { guildId, targetType, targetId },
      update: {},
    });
  }

  async removeExclusion(guildId: string, id: string) {
    await this.db.levelExclusion.deleteMany({ where: { guildId, id } });
  }

  async recordVoiceTick(guildId: string, userId: string, minutes = 1): Promise<void> {
    const enabled = await this.config.getValue<boolean>(guildId, "leveling.voice_xp_enabled");
    if (!enabled) return;
    const rate = await this.config.getValue<number>(guildId, "leveling.voice_xp_rate");
    if (rate <= 0) return;
    await this.addXp(guildId, userId, rate * minutes, "voice", { ignoreCooldown: true });
  }
}
