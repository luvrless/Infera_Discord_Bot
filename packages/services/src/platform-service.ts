import type { PrismaClient } from "@infera/database";
import { DEFAULT_PLATFORM_STATE, normalizePlatformState, type Cache, type PlatformListType, type PlatformState } from "@infera/shared";

const STATE_KEY = "infera:platform:state:v1";
const BLACKLIST_KEY = "infera:platform:blacklist:v1";
const STATE_FIELDS = ["maintenance", "presence", "disabledCommands", "dashboardBanner", "allowNewServers", "readOnly"] as const;

/**
 * Global platform state controlled from the operator panel. Read by the bot
 * (cached ~30s, invalidated on write) and the API.
 */
export class PlatformService {
  constructor(
    private readonly db: PrismaClient,
    private readonly cache: Cache,
  ) {}

  async state(): Promise<PlatformState> {
    return this.cache.getOrSet(STATE_KEY, 30, async () => {
      const rows = await this.db.platformSetting.findMany({ where: { key: { in: [...STATE_FIELDS] } } }).catch(() => []);
      const raw: Record<string, unknown> = {};
      for (const row of rows) {
        try {
          raw[row.key] = JSON.parse(row.value);
        } catch {
          // ignore malformed values
        }
      }
      return normalizePlatformState(raw);
    }).catch(() => DEFAULT_PLATFORM_STATE);
  }

  async setState(patch: Partial<PlatformState>, actorId: string): Promise<PlatformState> {
    const current = await this.state();
    const next = normalizePlatformState({ ...current, ...patch });
    for (const key of STATE_FIELDS) {
      if (!(key in patch)) continue;
      const value = JSON.stringify(next[key]);
      await this.db.platformSetting.upsert({ where: { key }, create: { key, value, updatedBy: actorId }, update: { value, updatedBy: actorId } });
    }
    await this.cache.del(STATE_KEY);
    return next;
  }

  // ------------------------------------------------------------- blacklist
  private async blacklistSets(): Promise<Record<string, string[]>> {
    return this.cache.getOrSet(BLACKLIST_KEY, 30, async () => {
      const rows = await this.db.platformBlacklist.findMany({ select: { type: true, targetId: true } }).catch(() => []);
      const sets: Record<string, string[]> = {};
      for (const row of rows) (sets[row.type] ??= []).push(row.targetId);
      return sets;
    }).catch(() => ({}));
  }

  async isBlacklisted(type: PlatformListType, id: string): Promise<boolean> {
    const sets = await this.blacklistSets();
    return (sets[type] ?? []).includes(id);
  }

  /** All ids of one list type (e.g. every frozen server). */
  async listIds(type: PlatformListType): Promise<string[]> {
    return (await this.blacklistSets())[type] ?? [];
  }

  async blacklist() {
    return this.db.platformBlacklist.findMany({ orderBy: { createdAt: "desc" }, take: 500 });
  }

  async addBlacklist(type: PlatformListType, targetId: string, reason: string | null, actorId: string) {
    const row = await this.db.platformBlacklist.upsert({
      where: { type_targetId: { type, targetId } },
      create: { type, targetId, reason, createdBy: actorId },
      update: { reason },
    });
    await this.cache.del(BLACKLIST_KEY);
    return row;
  }

  async removeBlacklist(id: string): Promise<void> {
    await this.db.platformBlacklist.deleteMany({ where: { id } });
    await this.cache.del(BLACKLIST_KEY);
  }

  async removeByTarget(type: PlatformListType, targetId: string): Promise<number> {
    const result = await this.db.platformBlacklist.deleteMany({ where: { type, targetId } });
    await this.cache.del(BLACKLIST_KEY);
    return result.count;
  }

  // ---------------------------------------------------- notes & flags
  async getSetting<T>(key: string, fallback: T): Promise<T> {
    const row = await this.db.platformSetting.findUnique({ where: { key } }).catch(() => null);
    if (!row) return fallback;
    try {
      return JSON.parse(row.value) as T;
    } catch {
      return fallback;
    }
  }

  async setSetting(key: string, value: unknown, actorId: string): Promise<void> {
    const json = JSON.stringify(value);
    await this.db.platformSetting.upsert({ where: { key }, create: { key, value: json, updatedBy: actorId }, update: { value: json, updatedBy: actorId } });
  }

  async clearCaches(): Promise<void> {
    await this.cache.del(STATE_KEY);
    await this.cache.del(BLACKLIST_KEY);
  }

  // ----------------------------------------------------------------- audit
  async audit(actorId: string, action: string, targetId: string | null, metadata: Record<string, unknown> = {}, ip: string | null = null) {
    await this.db.operatorAudit
      .create({ data: { actorId, action, targetId, metadata: JSON.stringify(metadata).slice(0, 8000), ip } })
      .catch(() => undefined);
  }

  async auditLog(take = 200) {
    return this.db.operatorAudit.findMany({ orderBy: { createdAt: "desc" }, take });
  }

  // --------------------------------------------------------------- backups
  async backupConfig(guildId: string, reason: string, actorId: string | null) {
    const config = await this.db.guildConfig.findUnique({ where: { guildId } });
    if (!config) return null;
    return this.db.configBackup.create({ data: { guildId, data: config.data, version: config.version, reason, createdBy: actorId } });
  }

  async backups(guildId: string) {
    return this.db.configBackup.findMany({ where: { guildId }, orderBy: { createdAt: "desc" }, take: 50, select: { id: true, guildId: true, version: true, reason: true, createdBy: true, createdAt: true } });
  }

  async backup(id: string) {
    return this.db.configBackup.findUnique({ where: { id } });
  }
}
