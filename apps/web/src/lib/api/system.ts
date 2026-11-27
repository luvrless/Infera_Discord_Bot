import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "./client";
import { keys } from "./keys";
import type { AnalyticsResponse, AuditPage, CommandDefinition, GuildCommand } from "./types";

const g = (guildId: string) => `/guilds/${guildId}`;

export interface AuditParams {
  page: number;
  pageSize: number;
  action?: string;
  /** "true" matches actions starting with `action`. */
  prefix?: string;
  actorId?: string;
}

export const systemApi = {
  commandCatalogue: (signal?: AbortSignal) =>
    api.get<{ commands: CommandDefinition[]; total: number }>("/commands", undefined, signal),
  commandCategories: (signal?: AbortSignal) =>
    api.get<{ categories: Array<{ id: string; name: string; count: number }> }>("/commands/categories", undefined, signal),
  guildCommands: (id: string, signal?: AbortSignal) =>
    api.get<{ level: number; commands: GuildCommand[] }>(`${g(id)}/commands`, undefined, signal),
  updateCommand: (id: string, name: string, body: { enabled?: boolean; level?: number; cooldownMs?: number }) =>
    api.patch<{ override: Record<string, unknown> }>(`${g(id)}/commands/${encodeURIComponent(name)}`, body),
  analytics: (id: string, days: number, signal?: AbortSignal) =>
    api.get<AnalyticsResponse>(`${g(id)}/analytics`, { days }, signal),
  audit: (id: string, params: AuditParams, signal?: AbortSignal) =>
    api.get<AuditPage>(`${g(id)}/audit`, { ...params }, signal),
};

export function useCommandCatalogue(enabled = true) {
  return useQuery({
    queryKey: keys.commandCatalogue,
    queryFn: ({ signal }) => systemApi.commandCatalogue(signal),
    staleTime: 10 * 60_000,
    enabled,
  });
}

export function useCommandCategories() {
  return useQuery({
    queryKey: keys.commandCategories,
    queryFn: ({ signal }) => systemApi.commandCategories(signal),
    staleTime: 10 * 60_000,
    select: (data) => data.categories,
  });
}

export function useGuildCommands(guildId: string) {
  return useQuery({ queryKey: keys.guildCommands(guildId), queryFn: ({ signal }) => systemApi.guildCommands(guildId, signal) });
}

export function useAnalytics(guildId: string, days: number) {
  return useQuery({
    queryKey: keys.analytics(guildId, days),
    queryFn: ({ signal }) => systemApi.analytics(guildId, days, signal),
    placeholderData: keepPreviousData,
  });
}

export function useAudit(guildId: string, params: AuditParams) {
  return useQuery({
    queryKey: keys.audit(guildId, params),
    queryFn: ({ signal }) => systemApi.audit(guildId, params, signal),
    placeholderData: keepPreviousData,
  });
}
