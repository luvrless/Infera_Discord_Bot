import { ErrorCode, InferaError, createLogger, type Cache } from "@infera/shared";

const log = createLogger("integrations:roblox");

export interface RobloxUser {
  id: number;
  name: string;
  displayName: string;
  description?: string;
  created?: string;
  isBanned?: boolean;
  hasVerifiedBadge?: boolean;
}

export interface RobloxAvatar {
  targetId: number;
  state: string;
  imageUrl: string;
}

export interface RobloxGroupSummary {
  id: number;
  name: string;
  description?: string;
  memberCount?: number;
  owner?: { id: number; name: string; displayName?: string } | null;
  shout?: { body: string; poster?: { userId: number; username: string } } | null;
  publicEntryAllowed?: boolean;
}

export interface RobloxGame {
  id: number;
  name: string;
  description?: string;
  creator?: { id: number; name: string; type: string };
  playing?: number;
  visits?: number;
  favoritedCount?: number;
  maxPlayers?: number;
  created?: string;
  updated?: string;
  genre?: string;
}

export interface RobloxClientOptions {
  cache: Cache;
  cacheTtlSeconds?: number;
  timeoutMs?: number;
  bases?: Partial<Record<"users" | "friends" | "groups" | "games" | "thumbnails" | "presence" | "badges" | "apis", string>>;
}

const DEFAULT_BASES = {
  users: "https://users.roblox.com",
  friends: "https://friends.roblox.com",
  groups: "https://groups.roblox.com",
  games: "https://games.roblox.com",
  thumbnails: "https://thumbnails.roblox.com",
  presence: "https://presence.roblox.com",
  badges: "https://badges.roblox.com",
  apis: "https://apis.roblox.com",
} as const;

/**
 * Official Roblox web API client with caching, timeouts, retries and
 * rate-limit handling. Never requests credentials or private data.
 */
export class RobloxClient {
  private readonly bases: Record<keyof typeof DEFAULT_BASES, string>;
  private readonly ttl: number;
  private readonly timeoutMs: number;

  constructor(private readonly options: RobloxClientOptions) {
    this.bases = { ...DEFAULT_BASES, ...options.bases };
    this.ttl = options.cacheTtlSeconds ?? 300;
    this.timeoutMs = options.timeoutMs ?? 8_000;
  }

  private async request<T>(url: string, init?: RequestInit, attempt = 0): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "user-agent": "INFERA/1.0 (+https://infera.wtf)",
          ...(init?.headers ?? {}),
        },
      });

      if (response.status === 429 && attempt < 2) {
        const retryAfter = Number(response.headers.get("retry-after") ?? "1");
        await new Promise((resolve) => setTimeout(resolve, Math.min(5_000, retryAfter * 1_000)));
        return this.request<T>(url, init, attempt + 1);
      }
      if (response.status >= 500 && attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
        return this.request<T>(url, init, attempt + 1);
      }
      if (response.status === 404) {
        throw new InferaError("Roblox resource not found", { code: ErrorCode.NOT_FOUND });
      }
      if (!response.ok) {
        throw new InferaError(`Roblox API returned ${response.status}`, {
          code: ErrorCode.EXTERNAL_API_UNAVAILABLE,
        });
      }
      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof InferaError) throw error;
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
        return this.request<T>(url, init, attempt + 1);
      }
      log.warn({ err: error, url }, "roblox request failed");
      throw new InferaError("Roblox is unavailable right now", {
        code: ErrorCode.EXTERNAL_API_UNAVAILABLE,
        messageKey: "errors.external_api_unavailable",
      });
    } finally {
      clearTimeout(timer);
    }
  }

  private async cached<T>(key: string, loader: () => Promise<T>): Promise<T> {
    return this.options.cache.getOrSet(`infera:roblox:${key}`, this.ttl, loader);
  }

  async resolveUsername(username: string): Promise<RobloxUser> {
    const clean = username.trim();
    if (!/^[A-Za-z0-9_]{3,20}$/.test(clean)) {
      throw new InferaError("That is not a valid Roblox username", { code: ErrorCode.VALIDATION_ERROR });
    }
    return this.cached(`username:${clean.toLowerCase()}`, async () => {
      const result = await this.request<{
        data: Array<{ id: number; name: string; displayName: string }>;
      }>(`${this.bases.users}/v1/usernames/users`, {
        method: "POST",
        body: JSON.stringify({ usernames: [clean], excludeBannedUsers: false }),
      });
      const user = result.data[0];
      if (!user) throw new InferaError("Roblox user not found", { code: ErrorCode.NOT_FOUND });
      return this.getUser(user.id);
    });
  }

  async getUser(userId: number | string): Promise<RobloxUser> {
    const id = Number(userId);
    if (!Number.isInteger(id) || id <= 0) {
      throw new InferaError("Invalid Roblox user ID", { code: ErrorCode.VALIDATION_ERROR });
    }
    return this.cached(`user:${id}`, () =>
      this.request<RobloxUser>(`${this.bases.users}/v1/users/${id}`),
    );
  }

  async getAvatar(userId: number, size: "48x48" | "150x150" | "180x180" | "420x420" = "420x420"): Promise<RobloxAvatar | null> {
    return this.cached(`avatar:${userId}:${size}`, async () => {
      const result = await this.request<{ data: RobloxAvatar[] }>(
        `${this.bases.thumbnails}/v1/users/avatar?userIds=${userId}&size=${size}&format=Png&isCircular=false`,
      );
      return result.data[0] ?? null;
    });
  }

  async getHeadshot(userId: number, size: "48x48" | "150x150" | "180x180" | "420x420" = "420x420"): Promise<RobloxAvatar | null> {
    return this.cached(`headshot:${userId}:${size}`, async () => {
      const result = await this.request<{ data: RobloxAvatar[] }>(
        `${this.bases.thumbnails}/v1/users/avatar-headshot?userIds=${userId}&size=${size}&format=Png&isCircular=false`,
      );
      return result.data[0] ?? null;
    });
  }

  async getFriends(userId: number): Promise<Array<{ id: number; name: string; displayName: string }>> {
    return this.cached(`friends:${userId}`, async () => {
      const result = await this.request<{ data: Array<{ id: number; name: string; displayName: string }> }>(
        `${this.bases.friends}/v1/users/${userId}/friends`,
      );
      return result.data;
    });
  }

  async getFollowers(userId: number, limit = 50): Promise<{ followers: number; following: number }> {
    return this.cached(`followers:${userId}`, async () => {
      const [followers, following] = await Promise.all([
        this.request<{ count: number }>(`${this.bases.friends}/v1/users/${userId}/followers/count`),
        this.request<{ count: number }>(`${this.bases.friends}/v1/users/${userId}/followings/count`),
      ]);
      return { followers: followers.count, following: following.count };
    });
  }

  async getGroups(userId: number): Promise<Array<{ group: RobloxGroupSummary; role: { name: string; rank: number } }>> {
    return this.cached(`groups:${userId}`, async () => {
      const result = await this.request<{
        data: Array<{ group: RobloxGroupSummary; role: { name: string; rank: number } }>;
      }>(`${this.bases.groups}/v1/users/${userId}/groups/roles`);
      return result.data;
    });
  }

  async getBadges(userId: number, limit = 20): Promise<Array<{ id: number; name: string; description?: string; awardedDate?: string }>> {
    return this.cached(`badges:${userId}`, async () => {
      const result = await this.request<{
        data: Array<{ id: number; name: string; description?: string; awardedDate?: string }>;
      }>(`${this.bases.badges}/v1/users/${userId}/badges?limit=${limit}&sortOrder=Desc`);
      return result.data;
    });
  }

  async getPresence(userIds: number[]): Promise<Array<{ userId: number; userPresenceType: number; lastOnline?: string; placeId?: number; gameId?: number }>> {
    if (userIds.length === 0) return [];
    const result = await this.request<{
      userPresences: Array<{ userId: number; userPresenceType: number; lastOnline?: string; placeId?: number; gameId?: number }>;
    }>(`${this.bases.presence}/v1/presence/users`, {
      method: "POST",
      body: JSON.stringify({ userIds: userIds.slice(0, 100) }),
    });
    return result.userPresences;
  }

  async getGame(universeId: number): Promise<RobloxGame> {
    return this.cached(`game:${universeId}`, async () => {
      const result = await this.request<{ data: RobloxGame[] }>(
        `${this.bases.games}/v1/games?universeIds=${universeId}`,
      );
      const game = result.data[0];
      if (!game) throw new InferaError("Roblox game not found", { code: ErrorCode.NOT_FOUND });
      return game;
    });
  }

  async getGames(universeIds: number[]): Promise<RobloxGame[]> {
    if (universeIds.length === 0) return [];
    const result = await this.request<{ data: RobloxGame[] }>(
      `${this.bases.games}/v1/games?universeIds=${universeIds.slice(0, 50).join(",")}`,
    );
    return result.data;
  }

  async getUniverseFromPlace(placeId: number): Promise<number> {
    const result = await this.request<{ universeId: number }>(
      `${this.bases.apis}/universes/v1/places/${placeId}/universe`,
    );
    return result.universeId;
  }

  async getGroup(groupId: number): Promise<RobloxGroupSummary> {
    return this.cached(`group:${groupId}`, () =>
      this.request<RobloxGroupSummary>(`${this.bases.groups}/v1/groups/${groupId}`),
    );
  }

  async getGroupRoles(groupId: number): Promise<Array<{ id: number; name: string; rank: number; memberCount?: number }>> {
    return this.cached(`group-roles:${groupId}`, async () => {
      const result = await this.request<{
        roles: Array<{ id: number; name: string; rank: number; memberCount?: number }>;
      }>(`${this.bases.groups}/v1/groups/${groupId}/roles`);
      return result.roles;
    });
  }

  async searchGames(query: string, limit = 10): Promise<RobloxGame[]> {
    const result = await this.request<{
      data: Array<{ id: number; name: string; description?: string; creatorName?: string; playerCount?: number }>;
    }>(
      `${this.bases.games}/v1/games/search?keyword=${encodeURIComponent(query)}&limit=${Math.min(limit, 25)}&sortOrder=Desc`,
    );
    return result.data.map((game) => ({
      id: game.id,
      name: game.name,
      description: game.description,
      creator: game.creatorName ? { id: 0, name: game.creatorName, type: "unknown" } : undefined,
      playing: game.playerCount,
    }));
  }

  async getGameIcon(universeId: number): Promise<string | null> {
    const result = await this.request<{ data: Array<{ imageUrl: string }> }>(
      `${this.bases.thumbnails}/v1/games/icons?universeIds=${universeId}&size=512x512&format=Png`,
    );
    return result.data[0]?.imageUrl ?? null;
  }

  async getGroupIcon(groupId: number): Promise<string | null> {
    const result = await this.request<{ data: Array<{ imageUrl: string }> }>(
      `${this.bases.thumbnails}/v1/groups/icons?groupIds=${groupId}&size=420x420&format=Png`,
    );
    return result.data[0]?.imageUrl ?? null;
  }
}
