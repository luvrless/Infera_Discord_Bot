import { guildMemberCount, type DiscordGuild } from "@infera/services";
import {
  DashboardScope,
  ErrorCode,
  InferaError,
  PermissionLevel,
  scopesForLevel,
} from "@infera/shared";
import { db, env, services } from "./config";
import { accessTokenFor, type SessionContext } from "./session";
import { fetchUserGuilds, type DiscordGuildSummary } from "./oauth";

const MANAGE_GUILD = 1n << 5n;
const ADMINISTRATOR = 1n << 3n;
const GUILD_CACHE_TTL = 30_000;
const MEMBER_CACHE_TTL = 60_000;
const BOT_GUILD_TTL = 60_000;

interface CacheEntry<T> {
  expires: number;
  value: T;
}

const guildListCache = new Map<string, CacheEntry<DiscordGuildSummary[]>>();
const botGuildCache = new Map<string, CacheEntry<DiscordGuild>>();
const memberCache = new Map<string, CacheEntry<{ roles: string[] }>>();
const accessCache = new Map<string, CacheEntry<GuildAccess>>();
let heartbeatCache: CacheEntry<BotStatus> | null = null;

export interface BotStatus {
  online: boolean;
  lastSeenAt: string | null;
  guilds: number;
  commands: number;
  user: string | null;
}

export interface GuildListItem {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  permissions: string;
  botInstalled: boolean;
  botOnline: boolean;
  memberCount: number;
}

export interface GuildAccess {
  session: SessionContext;
  guildId: string;
  level: PermissionLevel;
  scopes: DashboardScope[];
  userGuild: DiscordGuildSummary;
  botInstalled: boolean;
  botGuild: DiscordGuild | null;
  roles: string[];
}

function hasManage(permissions: string): boolean {
  try {
    const bits = BigInt(permissions);
    return (bits & MANAGE_GUILD) !== 0n || (bits & ADMINISTRATOR) !== 0n;
  } catch {
    return false;
  }
}

function hasAdministrator(permissions: string): boolean {
  try {
    return (BigInt(permissions) & ADMINISTRATOR) !== 0n;
  } catch {
    return false;
  }
}

export async function botStatus(): Promise<BotStatus> {
  if (heartbeatCache && heartbeatCache.expires > Date.now()) return heartbeatCache.value;
  const row = await db.systemEvent.findFirst({
    where: { source: "bot:heartbeat" },
    orderBy: { createdAt: "desc" },
  });
  let data: { guilds?: number; commands?: number; user?: string } = {};
  if (row) {
    try {
      data = JSON.parse(row.message) as typeof data;
    } catch {
      data = {};
    }
  }
  const status: BotStatus = {
    online: Boolean(row && Date.now() - row.createdAt.getTime() < 3 * 60_000),
    lastSeenAt: row?.createdAt.toISOString() ?? null,
    guilds: data.guilds ?? 0,
    commands: data.commands ?? 0,
    user: data.user ?? null,
  };
  heartbeatCache = { expires: Date.now() + 15_000, value: status };
  return status;
}

export async function userGuilds(session: SessionContext): Promise<DiscordGuildSummary[]> {
  const cached = guildListCache.get(session.user.id);
  if (cached && cached.expires > Date.now()) return cached.value;
  const token = await accessTokenFor(session.row);
  const guilds = await fetchUserGuilds(token);
  guildListCache.set(session.user.id, { expires: Date.now() + GUILD_CACHE_TTL, value: guilds });
  return guilds;
}

export async function guildListForSession(session: SessionContext): Promise<GuildListItem[]> {
  const [guilds, status] = await Promise.all([userGuilds(session), botStatus()]);
  const manageable = guilds.filter((guild) => guild.owner || hasManage(guild.permissions));
  const rows = await db.guild.findMany({
    where: { id: { in: manageable.map((guild) => guild.id) } },
    select: { id: true, leftAt: true, memberCount: true },
  });
  const installed = new Map(rows.filter((row) => !row.leftAt).map((row) => [row.id, row]));
  return manageable
    .map((guild) => ({
      id: guild.id,
      name: guild.name,
      icon: guild.icon,
      owner: guild.owner,
      permissions: guild.permissions,
      botInstalled: installed.has(guild.id),
      botOnline: installed.has(guild.id) && status.online,
      memberCount: installed.get(guild.id)?.memberCount ?? 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function getBotGuild(guildId: string): Promise<DiscordGuild> {
  const cached = botGuildCache.get(guildId);
  if (cached && cached.expires > Date.now()) return cached.value;
  const guild = await services.discord.getGuild(guildId);
  botGuildCache.set(guildId, { expires: Date.now() + BOT_GUILD_TTL, value: guild });
  return guild;
}

async function getMemberRoles(guildId: string, userId: string): Promise<string[]> {
  const key = `${guildId}:${userId}`;
  const cached = memberCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.value.roles;
  const member = await services.discord.getGuildMember(guildId, userId);
  memberCache.set(key, { expires: Date.now() + MEMBER_CACHE_TTL, value: { roles: member.roles } });
  return member.roles;
}

export interface GuildAccessOptions {
  requireBot?: boolean;
}

/**
 * Authoritative guild authorization: the user's live Discord permissions are
 * checked first, then INFERA's own permission levels. Never trusts a guild ID
 * or role list supplied by the browser.
 */
export async function assertGuildAccess(
  session: SessionContext,
  guildId: string,
  options: GuildAccessOptions = {},
): Promise<GuildAccess> {
  const cacheKey = `${session.user.id}:${guildId}:${options.requireBot ? "bot" : "any"}`;
  const cached = accessCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.value;

  const guilds = await userGuilds(session);
  const userGuild = guilds.find((guild) => guild.id === guildId);
  if (!userGuild) {
    throw new InferaError("You cannot manage that server", { code: ErrorCode.GUILD_NOT_AUTHORIZED });
  }
  if (!userGuild.owner && !hasManage(userGuild.permissions)) {
    throw new InferaError("You need the Manage Server permission", {
      code: ErrorCode.MISSING_PERMISSION,
    });
  }

  const row = await db.guild.findUnique({ where: { id: guildId }, select: { leftAt: true } });
  const botInstalled = Boolean(row && !row.leftAt);
  if (options.requireBot && !botInstalled) {
    throw new InferaError("INFERA is not installed in this server", {
      code: ErrorCode.GUILD_NOT_FOUND,
      details: [{ reason: "bot_not_installed", guildId }],
    });
  }

  let botGuild: DiscordGuild | null = null;
  let roles: string[] = [];
  let level: PermissionLevel = userGuild.owner
    ? PermissionLevel.GuildOwner
    : hasAdministrator(userGuild.permissions)
      ? PermissionLevel.Admin
      : PermissionLevel.Admin;

  if (botInstalled) {
    try {
      [botGuild, roles] = await Promise.all([getBotGuild(guildId), getMemberRoles(guildId, session.user.id)]);
      level = await services.permissions.resolveLevel(guildId, {
        userId: session.user.id,
        roleIds: roles,
        isGuildOwner: botGuild.owner_id === session.user.id || userGuild.owner,
        hasAdministrator: hasAdministrator(userGuild.permissions),
        isPlatformOwner: env.INFERA_OWNER_IDS.includes(session.user.id),
      });
      // Keep the local guild mirror fresh for dashboard stats.
      await services.config
        .ensureGuild({
          id: botGuild.id,
          name: botGuild.name,
          icon: botGuild.icon ?? null,
          ownerId: botGuild.owner_id,
          memberCount: guildMemberCount(botGuild),
          locale: botGuild.preferred_locale ?? null,
          premiumTier: botGuild.premium_tier ?? 0,
        })
        .catch(() => undefined);
    } catch (error) {
      if (error instanceof InferaError && error.code === ErrorCode.TARGET_NOT_FOUND) {
        throw new InferaError("You are no longer a member of that server", {
          code: ErrorCode.FORBIDDEN,
        });
      }
      throw error;
    }
  }

  const access: GuildAccess = {
    session,
    guildId,
    level,
    scopes: scopesForLevel(level),
    userGuild,
    botInstalled,
    botGuild,
    roles,
  };
  accessCache.set(cacheKey, { expires: Date.now() + 15_000, value: access });
  return access;
}

export function requireLevel(access: GuildAccess, required: PermissionLevel, message?: string): void {
  if (access.level >= required) return;
  throw new InferaError(message ?? "You do not have permission to do that", {
    code: ErrorCode.MISSING_PERMISSION,
  });
}

export function requireConfigAccess(access: GuildAccess): void {
  requireLevel(access, PermissionLevel.Admin, "You need administrator access in this server");
}

export function requireModerator(access: GuildAccess): void {
  requireLevel(access, PermissionLevel.Moderator, "You need moderator access in this server");
}

export function clearUserCache(userId: string): void {
  guildListCache.delete(userId);
  for (const key of accessCache.keys()) {
    if (key.startsWith(`${userId}:`)) accessCache.delete(key);
  }
}
