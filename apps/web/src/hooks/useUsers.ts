import { useQuery } from "@tanstack/react-query";
import { guildApi } from "../lib/api/guilds";
import { keys } from "../lib/api/keys";
import type { ResolvedUser } from "../lib/api/types";
import { isSnowflake } from "../lib/utils";

/**
 * Batches user-ID lookups: every <UserChip> on screen asks for its own ID and
 * the loader coalesces them into one `GET /guilds/:id/users?ids=` per tick.
 */
interface Pending {
  ids: Set<string>;
  waiters: Map<string, Array<{ resolve: (user: ResolvedUser | null) => void; reject: (error: unknown) => void }>>;
  timer: number | null;
}

const pendingByGuild = new Map<string, Pending>();

function flush(guildId: string): void {
  const pending = pendingByGuild.get(guildId);
  if (!pending) return;
  pendingByGuild.delete(guildId);
  const ids = Array.from(pending.ids);
  for (let index = 0; index < ids.length; index += 50) {
    const chunk = ids.slice(index, index + 50);
    guildApi
      .users(guildId, chunk)
      .then(({ users }) => {
        for (const id of chunk) {
          for (const waiter of pending.waiters.get(id) ?? []) waiter.resolve(users[id] ?? null);
        }
      })
      .catch((error) => {
        for (const id of chunk) {
          for (const waiter of pending.waiters.get(id) ?? []) waiter.reject(error);
        }
      });
  }
}

export function loadUser(guildId: string, userId: string): Promise<ResolvedUser | null> {
  return new Promise((resolve, reject) => {
    let pending = pendingByGuild.get(guildId);
    if (!pending) {
      pending = { ids: new Set(), waiters: new Map(), timer: null };
      pendingByGuild.set(guildId, pending);
    }
    pending.ids.add(userId);
    const list = pending.waiters.get(userId) ?? [];
    list.push({ resolve, reject });
    pending.waiters.set(userId, list);
    if (pending.timer === null) pending.timer = window.setTimeout(() => flush(guildId), 25);
  });
}

export function useResolvedUser(guildId: string, userId: string | null | undefined) {
  return useQuery({
    queryKey: keys.user(guildId, userId ?? ""),
    queryFn: () => loadUser(guildId, userId!),
    enabled: Boolean(guildId) && isSnowflake(userId),
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    retry: false,
  });
}

export function displayName(user: ResolvedUser | null | undefined, fallbackId?: string | null): string {
  if (!user) return fallbackId ?? "Unknown user";
  return user.nick ?? user.globalName ?? user.username;
}
