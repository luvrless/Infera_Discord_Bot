import { parseJson, toJson, type PrismaClient } from "@infera/database";
import {
  CONFIG_DEFINITIONS,
  ErrorCode,
  InferaError,
  defaultConfig,
  getConfigDefinition,
  validateConfigPatch,
  type Cache,
  type ConfigDefinition,
  type ConfigValidationIssue,
} from "@infera/shared";
import { RealtimeService } from "./realtime-service";
import type { GuildIdentity } from "./types";

export interface GuildConfigSnapshot {
  guildId: string;
  version: number;
  values: Record<string, unknown>;
  updatedAt: string;
}

export interface ModuleState {
  id: string;
  name: string;
  enabled: boolean;
  /** True when the module is backed by a configuration key. */
  configurable: boolean;
  configKey: string | null;
}

export interface ConfigUpdateResult {
  changed: string[];
  snapshot: GuildConfigSnapshot;
}

export const MODULES: Array<{ id: string; name: string; configKey: string | null }> = [
  { id: "moderation", name: "Moderation", configKey: "moderation.enabled" },
  { id: "automod", name: "Automod", configKey: "automod.enabled" },
  { id: "security", name: "Security", configKey: null },
  { id: "logging", name: "Logging", configKey: "logging.enabled" },
  { id: "welcome", name: "Welcome", configKey: "welcome.enabled" },
  { id: "goodbye", name: "Goodbye", configKey: "goodbye.enabled" },
  { id: "leveling", name: "Leveling", configKey: "leveling.enabled" },
  { id: "economy", name: "Economy", configKey: "economy.enabled" },
  { id: "tickets", name: "Tickets", configKey: "tickets.enabled" },
  { id: "giveaways", name: "Giveaways", configKey: "giveaways.enabled" },
  { id: "suggestions", name: "Suggestions", configKey: "suggestions.enabled" },
  { id: "starboard", name: "Starboard", configKey: "starboard.enabled" },
  { id: "voice", name: "Voice", configKey: "voice.enabled" },
  { id: "music", name: "Music", configKey: "music.enabled" },
  { id: "roblox", name: "Roblox", configKey: "integrations.roblox.enabled" },
  { id: "social", name: "Social feeds", configKey: "social.youtube.enabled" },
  { id: "fun", name: "Fun", configKey: null },
  { id: "utility", name: "Utility", configKey: null },
  { id: "community", name: "Community", configKey: null },
];

const MODULE_BY_ID = new Map(MODULES.map((module) => [module.id, module]));

/**
 * Owns every per-guild setting. All reads are cached under a guild-scoped,
 * versioned key; all writes are validated against the central registry and
 * published as `config.updated`.
 */
export class GuildConfigService {
  constructor(
    private readonly db: PrismaClient,
    private readonly cache: Cache,
    private readonly realtime: RealtimeService,
  ) {}

  private cacheKey(guildId: string): string {
    return `infera:guild:${guildId}:config:v1`;
  }

  private modulesKey(guildId: string): string {
    return `infera:guild:${guildId}:modules:v1`;
  }

  /** Ensure the guild row and configuration row exist. */
  async ensureGuild(guild: GuildIdentity): Promise<void> {
    await this.db.guild.upsert({
      where: { id: guild.id },
      create: {
        id: guild.id,
        name: guild.name,
        icon: guild.icon ?? null,
        ownerId: guild.ownerId ?? null,
        memberCount: guild.memberCount ?? 0,
        locale: guild.locale ?? null,
        premiumTier: guild.premiumTier ?? 0,
        leftAt: null,
      },
      update: {
        name: guild.name,
        icon: guild.icon ?? null,
        ownerId: guild.ownerId ?? null,
        memberCount: guild.memberCount ?? 0,
        locale: guild.locale ?? null,
        premiumTier: guild.premiumTier ?? 0,
        leftAt: null,
      },
    });
    await this.db.guildConfig.upsert({
      where: { guildId: guild.id },
      create: { guildId: guild.id, data: "{}" },
      update: {},
    });
    await this.cache.del(this.cacheKey(guild.id));
  }

  async markLeft(guildId: string): Promise<void> {
    await this.db.guild.update({ where: { id: guildId }, data: { leftAt: new Date() } }).catch(() => undefined);
    await this.cache.del(this.cacheKey(guildId));
  }

  private async readStored(guildId: string): Promise<Record<string, unknown>> {
    const row = await this.db.guildConfig.findUnique({ where: { guildId } });
    return parseJson<Record<string, unknown>>(row?.data, {});
  }

  async get(guildId: string): Promise<GuildConfigSnapshot> {
    return this.cache.getOrSet(this.cacheKey(guildId), 60, async () => {
      const row = await this.db.guildConfig.findUnique({ where: { guildId } });
      if (!row) {
        const exists = await this.db.guild.findUnique({ where: { id: guildId } });
        if (!exists) throw new InferaError(`Guild ${guildId} is not known to INFERA`, { code: ErrorCode.GUILD_NOT_FOUND });
        const created = await this.db.guildConfig.create({ data: { guildId, data: "{}" } });
        return this.snapshot(guildId, created.version, {}, created.updatedAt);
      }
      const stored = parseJson<Record<string, unknown>>(row.data, {});
      return this.snapshot(guildId, row.version, stored, row.updatedAt);
    });
  }

  private snapshot(
    guildId: string,
    version: number,
    stored: Record<string, unknown>,
    updatedAt: Date,
  ): GuildConfigSnapshot {
    return {
      guildId,
      version,
      values: { ...defaultConfig(), ...stored },
      updatedAt: updatedAt.toISOString(),
    };
  }

  async getValue<T = unknown>(guildId: string, key: string): Promise<T> {
    const definition = getConfigDefinition(key);
    if (!definition) throw new InferaError(`Unknown configuration key: ${key}`, { code: ErrorCode.VALIDATION_ERROR });
    const snapshot = await this.get(guildId);
    return (snapshot.values[key] ?? definition.default) as T;
  }

  async getValues(guildId: string): Promise<Record<string, unknown>> {
    return (await this.get(guildId)).values;
  }

  /** Apply a validated, atomic patch. Unknown or invalid keys reject the whole update. */
  async update(
    guildId: string,
    patch: Record<string, unknown>,
    actorId: string | null,
  ): Promise<ConfigUpdateResult> {
    const { values, issues } = validateConfigPatch(patch);
    if (issues.length > 0) {
      throw new InferaError("One or more configuration values are invalid", {
        code: ErrorCode.VALIDATION_ERROR,
        details: issues,
      });
    }
    if (Object.keys(values).length === 0) {
      throw new InferaError("No configuration values were provided", { code: ErrorCode.VALIDATION_ERROR });
    }

    await this.ensureGuildStub(guildId);
    const stored = await this.readStored(guildId);
    const merged = { ...stored, ...values };

    const updated = await this.db.guildConfig.update({
      where: { guildId },
      data: { data: toJson(merged), version: { increment: 1 }, updatedBy: actorId },
    });

    await this.cache.del(this.cacheKey(guildId));
    await this.realtime.publish(guildId, "config.updated", {
      keys: Object.keys(values),
      version: updated.version,
      actorId,
    });
    return {
      changed: Object.keys(values),
      snapshot: this.snapshot(guildId, updated.version, merged, updated.updatedAt),
    };
  }

  /** Reset a configuration section (or everything) back to defaults. */
  async reset(guildId: string, section: string | null, actorId: string | null): Promise<GuildConfigSnapshot> {
    await this.ensureGuildStub(guildId);
    const stored = await this.readStored(guildId);
    const next: Record<string, unknown> = {};
    if (section) {
      const prefix = `${section}.`;
      for (const [key, value] of Object.entries(stored)) {
        if (key !== section && !key.startsWith(prefix)) next[key] = value;
      }
    }
    const updated = await this.db.guildConfig.update({
      where: { guildId },
      data: { data: toJson(next), version: { increment: 1 }, updatedBy: actorId },
    });
    await this.cache.del(this.cacheKey(guildId));
    await this.cache.del(this.modulesKey(guildId));
    await this.realtime.publish(guildId, "config.updated", { section: section ?? "all", version: updated.version });
    return this.snapshot(guildId, updated.version, next, updated.updatedAt);
  }

  private async ensureGuildStub(guildId: string): Promise<void> {
    const exists = await this.db.guild.findUnique({ where: { id: guildId }, select: { id: true } });
    if (!exists) {
      await this.ensureGuild({ id: guildId, name: guildId });
      return;
    }
    const config = await this.db.guildConfig.findUnique({ where: { guildId }, select: { id: true } });
    if (!config) await this.db.guildConfig.create({ data: { guildId, data: "{}" } });
  }

  async getModules(guildId: string): Promise<ModuleState[]> {
    return this.cache.getOrSet(this.modulesKey(guildId), 60, async () => {
      const values = await this.getValues(guildId);
      const overrides = await this.db.guildModule.findMany({ where: { guildId } });
      const overrideMap = new Map(overrides.map((row) => [row.module, row.enabled]));
      return MODULES.map((module) => {
        const explicit = overrideMap.get(module.id);
        const enabled =
          explicit ?? (module.configKey ? Boolean(values[module.configKey]) : true);
        return {
          id: module.id,
          name: module.name,
          enabled,
          configurable: module.configKey !== null,
          configKey: module.configKey,
        };
      });
    });
  }

  async isModuleEnabled(guildId: string, moduleId: string): Promise<boolean> {
    const modules = await this.getModules(guildId);
    return modules.find((module) => module.id === moduleId)?.enabled ?? false;
  }

  async setModule(
    guildId: string,
    moduleId: string,
    enabled: boolean,
    actorId: string | null,
  ): Promise<ModuleState> {
    const module = MODULE_BY_ID.get(moduleId);
    if (!module) throw new InferaError(`Unknown module: ${moduleId}`, { code: ErrorCode.VALIDATION_ERROR });

    if (module.configKey) {
      await this.update(guildId, { [module.configKey]: enabled }, actorId);
    } else {
      await this.ensureGuildStub(guildId);
      await this.db.guildModule.upsert({
        where: { guildId_module: { guildId, module: moduleId } },
        create: { guildId, module: moduleId, enabled, updatedBy: actorId },
        update: { enabled, updatedBy: actorId },
      });
      await this.cache.del(this.modulesKey(guildId));
    }

    await this.realtime.publish(guildId, enabled ? "module.enabled" : "module.disabled", {
      module: moduleId,
      actorId,
    });

    return {
      id: module.id,
      name: module.name,
      enabled,
      configurable: module.configKey !== null,
      configKey: module.configKey,
    };
  }

  /** Definitions for a category, used by the dashboard. */
  definitionsFor(category: string): ConfigDefinition[] {
    return CONFIG_DEFINITIONS.filter((definition) => definition.category === category);
  }
}

export type { ConfigValidationIssue };
