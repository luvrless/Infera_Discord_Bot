import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "./client";
import { keys } from "./keys";
import type {
  EconomyAccount,
  EconomyItem,
  EconomyOverview,
  EconomyTransaction,
  Giveaway,
  LeaderboardPage,
  LevelExclusion,
  LevelReward,
  LevelingStats,
  Suggestion,
} from "./types";

const g = (guildId: string) => `/guilds/${guildId}`;

export type ItemInput = {
  name?: string;
  description?: string | null;
  category?: string;
  price?: number;
  stock?: number | null;
  roleId?: string | null;
  consumable?: boolean;
  enabled?: boolean;
};

export const engagementApi = {
  // leveling
  levelStats: (id: string, signal?: AbortSignal) => api.get<LevelingStats>(`${g(id)}/leveling/stats`, undefined, signal),
  leaderboard: (id: string, type: string, page: number, signal?: AbortSignal) =>
    api.get<LeaderboardPage>(`${g(id)}/leveling/leaderboard`, { type, page, pageSize: 15 }, signal),
  rewards: (id: string, signal?: AbortSignal) => api.get<{ rewards: LevelReward[] }>(`${g(id)}/leveling/rewards`, undefined, signal),
  addReward: (id: string, level: number, roleId: string) => api.post<{ reward: LevelReward }>(`${g(id)}/leveling/rewards`, { level, roleId }),
  removeReward: (id: string, rewardId: string) => api.del<{ removed: boolean }>(`${g(id)}/leveling/rewards/${rewardId}`),
  exclusions: (id: string, signal?: AbortSignal) =>
    api.get<{ exclusions: LevelExclusion[] }>(`${g(id)}/leveling/exclusions`, undefined, signal),
  addExclusion: (id: string, targetType: "user" | "channel" | "role", targetId: string) =>
    api.post<{ exclusion: LevelExclusion }>(`${g(id)}/leveling/exclusions`, { targetType, targetId }),
  removeExclusion: (id: string, exclusionId: string) => api.del<{ removed: boolean }>(`${g(id)}/leveling/exclusions/${exclusionId}`),
  resetLevels: (id: string, body: { scope: "guild" } | { scope: "user"; userId: string }) =>
    api.post<{ reset: number }>(`${g(id)}/leveling/reset`, body),

  // economy
  economyOverview: (id: string, signal?: AbortSignal) => api.get<EconomyOverview>(`${g(id)}/economy/overview`, undefined, signal),
  transactions: (id: string, page: number, signal?: AbortSignal) =>
    api.get<{ total: number; page: number; pageSize: number; transactions: EconomyTransaction[] }>(
      `${g(id)}/economy/transactions`,
      { page, pageSize: 20 },
      signal,
    ),
  createItem: (id: string, body: ItemInput) => api.post<{ item: EconomyItem }>(`${g(id)}/economy/items`, body),
  updateItem: (id: string, itemId: string, body: ItemInput) => api.patch<{ item: EconomyItem }>(`${g(id)}/economy/items/${itemId}`, body),
  deleteItem: (id: string, itemId: string) => api.del<{ removed: boolean }>(`${g(id)}/economy/items/${itemId}`),
  economyUser: (id: string, userId: string, signal?: AbortSignal) =>
    api.get<{ account: EconomyAccount | null; inventory: Array<{ item?: EconomyItem; quantity?: number } & Record<string, unknown>> }>(
      `${g(id)}/economy/users/${userId}`,
      undefined,
      signal,
    ),
  adjustBalance: (id: string, userId: string, amount: number, reason: string) =>
    api.post<{ balance: { wallet: number; bank: number } & Record<string, unknown> }>(`${g(id)}/economy/users/${userId}/adjust`, {
      amount,
      reason,
    }),

  // giveaways
  giveaways: (id: string, signal?: AbortSignal) => api.get<{ giveaways: Giveaway[] }>(`${g(id)}/giveaways`, undefined, signal),
  createGiveaway: (
    id: string,
    body: { channelId: string; prize: string; winners?: number; durationSeconds?: number; requiredRoles?: string[]; excludedRoles?: string[] },
  ) => api.post<{ giveaway: Giveaway }>(`${g(id)}/giveaways`, body),
  giveawayAction: (id: string, giveawayId: string, action: "end" | "reroll" | "cancel") =>
    api.post<{ result?: { winners: string[]; entries: number }; winners?: string[]; cancelled?: boolean }>(
      `${g(id)}/giveaways/${giveawayId}/${action}`,
    ),

  // suggestions
  suggestions: (id: string, signal?: AbortSignal) => api.get<{ suggestions: Suggestion[] }>(`${g(id)}/suggestions`, undefined, signal),
  reviewSuggestion: (id: string, suggestionId: string, decision: "approved" | "denied", note?: string) =>
    api.post<{ suggestion: Suggestion }>(`${g(id)}/suggestions/${suggestionId}/review`, { decision, note }),
};

export function useLevelStats(guildId: string) {
  return useQuery({ queryKey: keys.levelStats(guildId), queryFn: ({ signal }) => engagementApi.levelStats(guildId, signal) });
}

export function useLeaderboard(guildId: string, type: string, page: number) {
  return useQuery({
    queryKey: keys.leaderboard(guildId, type, page),
    queryFn: ({ signal }) => engagementApi.leaderboard(guildId, type, page, signal),
    placeholderData: keepPreviousData,
  });
}

export function useRewards(guildId: string) {
  return useQuery({
    queryKey: keys.rewards(guildId),
    queryFn: ({ signal }) => engagementApi.rewards(guildId, signal),
    select: (data) => data.rewards,
  });
}

export function useExclusions(guildId: string) {
  return useQuery({
    queryKey: keys.exclusions(guildId),
    queryFn: ({ signal }) => engagementApi.exclusions(guildId, signal),
    select: (data) => data.exclusions,
  });
}

export function useEconomyOverview(guildId: string) {
  return useQuery({ queryKey: keys.economyOverview(guildId), queryFn: ({ signal }) => engagementApi.economyOverview(guildId, signal) });
}

export function useTransactions(guildId: string, page: number) {
  return useQuery({
    queryKey: keys.transactions(guildId, page),
    queryFn: ({ signal }) => engagementApi.transactions(guildId, page, signal),
    placeholderData: keepPreviousData,
  });
}

export function useEconomyUser(guildId: string, userId: string | null) {
  return useQuery({
    queryKey: keys.economyUser(guildId, userId ?? ""),
    queryFn: ({ signal }) => engagementApi.economyUser(guildId, userId!, signal),
    enabled: Boolean(userId),
  });
}

export function useGiveaways(guildId: string) {
  return useQuery({
    queryKey: keys.giveaways(guildId),
    queryFn: ({ signal }) => engagementApi.giveaways(guildId, signal),
    select: (data) => data.giveaways,
    refetchInterval: 30_000,
  });
}

export function useSuggestions(guildId: string) {
  return useQuery({
    queryKey: keys.suggestions(guildId),
    queryFn: ({ signal }) => engagementApi.suggestions(guildId, signal),
    select: (data) => data.suggestions,
  });
}
