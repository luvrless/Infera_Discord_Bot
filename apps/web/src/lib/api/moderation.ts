import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "./client";
import { keys } from "./keys";
import type {
  Appeal,
  AutomodResponse,
  AutomodTestResult,
  CaseDetail,
  CasesPage,
  LockdownState,
  ModAction,
  ModerationCase,
  ModerationStats,
  SecurityResponse,
  Warning,
  WhitelistEntry,
} from "./types";

const g = (guildId: string) => `/guilds/${guildId}`;

export interface CaseFilters {
  page: number;
  pageSize: number;
  type?: string;
  userId?: string;
  moderatorId?: string;
}

export const moderationApi = {
  stats: (id: string, signal?: AbortSignal) => api.get<ModerationStats>(`${g(id)}/moderation/stats`, undefined, signal),
  cases: (id: string, filters: CaseFilters, signal?: AbortSignal) =>
    api.get<CasesPage>(`${g(id)}/moderation/cases`, { ...filters }, signal),
  case: (id: string, caseId: string, signal?: AbortSignal) =>
    api.get<{ case: CaseDetail }>(`${g(id)}/moderation/cases/${caseId}`, undefined, signal),
  editCase: (id: string, caseId: string, body: { reason?: string; evidenceUrl?: string }) =>
    api.patch<{ case: ModerationCase }>(`${g(id)}/moderation/cases/${caseId}`, body),
  voidCase: (id: string, caseId: string, reason?: string) =>
    api.post<{ case: ModerationCase }>(`${g(id)}/moderation/cases/${caseId}/void`, { reason }),
  history: (id: string, userId: string, signal?: AbortSignal) =>
    api.get<{ cases: ModerationCase[]; warnings: Warning[] }>(`${g(id)}/moderation/history/${userId}`, undefined, signal),
  action: (
    id: string,
    body: { action: ModAction; targetId: string; reason?: string; durationSeconds?: number; deleteMessageSeconds?: number },
  ) => api.post<{ case: ModerationCase; count?: number }>(`${g(id)}/moderation/actions`, body),
  purge: (id: string, body: { channelId: string; count: number; userId?: string }) =>
    api.post<{ deleted: number }>(`${g(id)}/moderation/purge`, body),
  warnings: (id: string, params: { userId?: string; active?: boolean }, signal?: AbortSignal) =>
    api.get<{ warnings: Warning[] }>(
      `${g(id)}/moderation/warnings`,
      { userId: params.userId, active: params.active === false ? "false" : undefined },
      signal,
    ),
  removeWarning: (id: string, warningId: string) => api.del<{ removed: boolean }>(`${g(id)}/moderation/warnings/${warningId}`),
  appeals: (id: string, status: string, signal?: AbortSignal) =>
    api.get<{ appeals: Appeal[] }>(`${g(id)}/moderation/appeals`, { status: status === "all" ? undefined : status }, signal),
  reviewAppeal: (id: string, appealId: string, status: "approved" | "rejected", notes?: string) =>
    api.post<{ appeal: Appeal }>(`${g(id)}/moderation/appeals/${appealId}/review`, { status, notes }),

  // automod
  automod: (id: string, signal?: AbortSignal) => api.get<AutomodResponse>(`${g(id)}/automod`, undefined, signal),
  updateRule: (
    id: string,
    type: string,
    body: { enabled?: boolean; action?: string; threshold?: number; windowSeconds?: number; list?: string[] },
  ) => api.patch<{ updated: boolean }>(`${g(id)}/automod/rules/${type}`, body),
  testAutomod: (id: string, content: string) => api.post<AutomodTestResult>(`${g(id)}/automod/test`, { content }),

  // security
  security: (id: string, signal?: AbortSignal) => api.get<SecurityResponse>(`${g(id)}/security`, undefined, signal),
  addWhitelist: (id: string, targetId: string, targetType: "user" | "role") =>
    api.post<{ entry: WhitelistEntry }>(`${g(id)}/security/whitelist`, { targetId, targetType }),
  removeWhitelist: (id: string, entryId: string) => api.del<{ removed: boolean }>(`${g(id)}/security/whitelist/${entryId}`),
  resolveEvent: (id: string, eventId: string) => api.post<{ resolved: boolean }>(`${g(id)}/security/events/${eventId}/resolve`),
  lockdown: (id: string, signal?: AbortSignal) =>
    api.get<{ lockdown: LockdownState }>(`${g(id)}/security/lockdown`, undefined, signal),
  startLockdown: (id: string, reason?: string) =>
    api.post<{ changed: number; failed: number; total: number; lockdown: LockdownState }>(`${g(id)}/security/lockdown`, { reason }),
  endLockdown: (id: string) =>
    api.post<{ changed: number; failed: number; total: number; lockdown: LockdownState }>(`${g(id)}/security/unlockdown`),
};

export function useModStats(guildId: string) {
  return useQuery({ queryKey: keys.modStats(guildId), queryFn: ({ signal }) => moderationApi.stats(guildId, signal) });
}

export function useCases(guildId: string, filters: CaseFilters) {
  return useQuery({
    queryKey: keys.cases(guildId, filters),
    queryFn: ({ signal }) => moderationApi.cases(guildId, filters, signal),
    placeholderData: keepPreviousData,
  });
}

export function useCaseDetail(guildId: string, caseId: string | null) {
  return useQuery({
    queryKey: keys.caseDetail(guildId, caseId ?? ""),
    queryFn: ({ signal }) => moderationApi.case(guildId, caseId!, signal),
    enabled: Boolean(caseId),
    select: (data) => data.case,
  });
}

export function useUserHistory(guildId: string, userId: string | null) {
  return useQuery({
    queryKey: keys.history(guildId, userId ?? ""),
    queryFn: ({ signal }) => moderationApi.history(guildId, userId!, signal),
    enabled: Boolean(userId),
  });
}

export function useWarnings(guildId: string, params: { userId?: string; active?: boolean }) {
  return useQuery({
    queryKey: keys.warnings(guildId, params),
    queryFn: ({ signal }) => moderationApi.warnings(guildId, params, signal),
    select: (data) => data.warnings,
  });
}

export function useAppeals(guildId: string, status: string) {
  return useQuery({
    queryKey: keys.appeals(guildId, status),
    queryFn: ({ signal }) => moderationApi.appeals(guildId, status, signal),
    select: (data) => data.appeals,
  });
}

export function useAutomod(guildId: string) {
  return useQuery({ queryKey: keys.automod(guildId), queryFn: ({ signal }) => moderationApi.automod(guildId, signal) });
}

export function useSecurity(guildId: string) {
  return useQuery({ queryKey: keys.security(guildId), queryFn: ({ signal }) => moderationApi.security(guildId, signal) });
}

export function useLockdown(guildId: string) {
  return useQuery({
    queryKey: keys.lockdown(guildId),
    queryFn: ({ signal }) => moderationApi.lockdown(guildId, signal),
    select: (data) => data.lockdown,
  });
}
