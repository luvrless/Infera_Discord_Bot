import type { Cache } from "@infera/shared";
import { RobloxClient, type RobloxClientOptions, type RobloxGame, type RobloxGroupSummary, type RobloxUser } from "./roblox-client";

export * from "./roblox-client";

/** User-facing Roblox lookups, composed from the shared client. */
export class RobloxUserService {
  constructor(private readonly client: RobloxClient) {}

  resolve(username: string): Promise<RobloxUser> {
    return this.client.resolveUsername(username);
  }

  get(userId: number | string): Promise<RobloxUser> {
    return this.client.getUser(userId);
  }

  async profile(usernameOrId: string): Promise<{
    user: RobloxUser;
    avatar: string | null;
    headshot: string | null;
    followers: { followers: number; following: number };
    friends: Array<{ id: number; name: string; displayName: string }>;
    groups: Array<{ group: RobloxGroupSummary; role: { name: string; rank: number } }>;
    badges: Array<{ id: number; name: string; description?: string }>;
  }> {
    const user = /^\d+$/.test(usernameOrId)
      ? await this.client.getUser(usernameOrId)
      : await this.client.resolveUsername(usernameOrId);

    const [avatar, headshot, followers, friends, groups, badges] = await Promise.all([
      this.client.getAvatar(user.id).catch(() => null),
      this.client.getHeadshot(user.id).catch(() => null),
      this.client.getFollowers(user.id).catch(() => ({ followers: 0, following: 0 })),
      this.client.getFriends(user.id).catch(() => []),
      this.client.getGroups(user.id).catch(() => []),
      this.client.getBadges(user.id).catch(() => []),
    ]);

    return {
      user,
      avatar: avatar?.imageUrl ?? null,
      headshot: headshot?.imageUrl ?? null,
      followers,
      friends,
      groups,
      badges,
    };
  }
}

export class RobloxGameService {
  constructor(private readonly client: RobloxClient) {}

  game(universeId: number): Promise<RobloxGame> {
    return this.client.getGame(universeId);
  }

  games(universeIds: number[]): Promise<RobloxGame[]> {
    return this.client.getGames(universeIds);
  }

  universeFromPlace(placeId: number): Promise<number> {
    return this.client.getUniverseFromPlace(placeId);
  }

  search(query: string, limit?: number): Promise<RobloxGame[]> {
    return this.client.searchGames(query, limit);
  }

  icon(universeId: number): Promise<string | null> {
    return this.client.getGameIcon(universeId);
  }
}

export class RobloxGroupService {
  constructor(private readonly client: RobloxClient) {}

  group(groupId: number): Promise<RobloxGroupSummary> {
    return this.client.getGroup(groupId);
  }

  roles(groupId: number): Promise<Array<{ id: number; name: string; rank: number; memberCount?: number }>> {
    return this.client.getGroupRoles(groupId);
  }

  icon(groupId: number): Promise<string | null> {
    return this.client.getGroupIcon(groupId);
  }
}

export class RobloxAvatarService {
  constructor(private readonly client: RobloxClient) {}

  avatar(userId: number, size?: "48x48" | "150x150" | "180x180" | "420x420") {
    return this.client.getAvatar(userId, size);
  }

  headshot(userId: number, size?: "48x48" | "150x150" | "180x180" | "420x420") {
    return this.client.getHeadshot(userId, size);
  }
}

export class RobloxCacheService {
  constructor(
    private readonly cache: Cache,
    private readonly client: RobloxClient,
  ) {}

  async invalidateUser(userId: number): Promise<void> {
    await this.cache.delPrefix(`infera:roblox:user:${userId}`);
    await this.cache.delPrefix(`infera:roblox:avatar:${userId}`);
    await this.cache.delPrefix(`infera:roblox:headshot:${userId}`);
  }

  async invalidateAll(): Promise<void> {
    await this.cache.delPrefix("infera:roblox:");
  }

  clientInstance(): RobloxClient {
    return this.client;
  }
}

export interface RobloxServices {
  client: RobloxClient;
  users: RobloxUserService;
  games: RobloxGameService;
  groups: RobloxGroupService;
  avatars: RobloxAvatarService;
  cache: RobloxCacheService;
}

export function createRobloxServices(options: RobloxClientOptions): RobloxServices {
  const client = new RobloxClient(options);
  return {
    client,
    users: new RobloxUserService(client),
    games: new RobloxGameService(client),
    groups: new RobloxGroupService(client),
    avatars: new RobloxAvatarService(client),
    cache: new RobloxCacheService(options.cache, client),
  };
}
