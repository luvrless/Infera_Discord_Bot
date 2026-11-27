import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import { keys } from "./keys";
import type {
  ActivityItem,
  Alert,
  Channel,
  ConfigSnapshot,
  GuildDetail,
  ModuleState,
  OverviewResponse,
  ResolvedUser,
  Role,
  SchemaDocument,
  SettingsResponse,
} from "./types";

const g = (guildId: string) => `/guilds/${guildId}`;

export const guildApi = {
  detail: (id: string, signal?: AbortSignal) => api.get<GuildDetail>(g(id), undefined, signal),
  overview: (id: string, signal?: AbortSignal) => api.get<OverviewResponse>(`${g(id)}/overview`, undefined, signal),
  settings: (id: string, signal?: AbortSignal) => api.get<SettingsResponse>(`${g(id)}/settings`, undefined, signal),
  channels: (id: string, signal?: AbortSignal) => api.get<{ channels: Channel[] }>(`${g(id)}/channels`, undefined, signal),
  roles: (id: string, signal?: AbortSignal) => api.get<{ roles: Role[] }>(`${g(id)}/roles`, undefined, signal),
  modules: (id: string, signal?: AbortSignal) => api.get<{ modules: ModuleState[] }>(`${g(id)}/modules`, undefined, signal),
  setModule: (id: string, moduleId: string, enabled: boolean) =>
    api.patch<{ module: ModuleState }>(`${g(id)}/modules/${moduleId}`, { enabled }),
  patchConfig: (id: string, patch: Record<string, unknown>, expectedVersion?: number) =>
    api.patch<{ changed: string[]; snapshot: ConfigSnapshot }>(`${g(id)}/config`, {
      patch,
      ...(expectedVersion !== undefined ? { expectedVersion } : {}),
    }),
  resetConfig: (id: string, section: string | null) =>
    api.post<{ snapshot: ConfigSnapshot }>(`${g(id)}/config/reset`, { section }),
  schema: (signal?: AbortSignal) => api.get<{ schema: SchemaDocument }>("/config/schema", undefined, signal),
  alerts: (id: string, signal?: AbortSignal) =>
    api.get<{ alerts: Alert[]; unreadCases: number }>(`${g(id)}/notifications`, undefined, signal),
  welcome: (id: string, signal?: AbortSignal) =>
    api.get<{ values: Record<string, unknown>; placeholders: string[] }>(`${g(id)}/welcome`, undefined, signal),
  testMessage: (
    id: string,
    body: { channelId: string; message?: string; embed?: { enabled?: boolean; title?: string; description?: string; color?: string } },
  ) => api.post<{ sent: boolean; messageId: string | null }>(`${g(id)}/test-message`, body),
  searchMembers: (id: string, q: string, signal?: AbortSignal) =>
    api.get<{ members: ResolvedUser[] }>(`${g(id)}/members/search`, { q }, signal),
  users: (id: string, ids: string[], signal?: AbortSignal) =>
    api.get<{ users: Record<string, ResolvedUser | null> }>(`${g(id)}/users`, { ids: ids.join(",") }, signal),
  activity: (id: string, signal?: AbortSignal) =>
    api.get<{ items: ActivityItem[] }>(`${g(id)}/activity`, { limit: 40 }, signal),
};

export function useGuildDetail(guildId: string) {
  return useQuery({
    queryKey: keys.detail(guildId),
    queryFn: ({ signal }) => guildApi.detail(guildId, signal),
    enabled: Boolean(guildId),
    staleTime: 30_000,
    retry: (count, error) => count < 1 && !(error && "status" in error && [401, 403, 404].includes((error as { status: number }).status)),
  });
}

export function useSettings(guildId: string, enabled = true) {
  return useQuery({
    queryKey: keys.settings(guildId),
    queryFn: ({ signal }) => guildApi.settings(guildId, signal),
    enabled: Boolean(guildId) && enabled,
    staleTime: 20_000,
  });
}

export function useOverview(guildId: string, enabled = true) {
  return useQuery({
    queryKey: keys.overview(guildId),
    queryFn: ({ signal }) => guildApi.overview(guildId, signal),
    enabled: Boolean(guildId) && enabled,
  });
}

export function useChannels(guildId: string, enabled = true) {
  return useQuery({
    queryKey: keys.channels(guildId),
    queryFn: ({ signal }) => guildApi.channels(guildId, signal),
    enabled: Boolean(guildId) && enabled,
    staleTime: 60_000,
    select: (data) => data.channels,
  });
}

export function useRoles(guildId: string, enabled = true) {
  return useQuery({
    queryKey: keys.roles(guildId),
    queryFn: ({ signal }) => guildApi.roles(guildId, signal),
    enabled: Boolean(guildId) && enabled,
    staleTime: 60_000,
    select: (data) => data.roles,
  });
}

export function useSchema() {
  return useQuery({
    queryKey: keys.schema,
    queryFn: ({ signal }) => guildApi.schema(signal),
    staleTime: Infinity,
    select: (data) => data.schema,
  });
}

export function useGuildAlerts(guildId: string, enabled = true) {
  return useQuery({
    queryKey: keys.alerts(guildId),
    queryFn: ({ signal }) => guildApi.alerts(guildId, signal),
    enabled: Boolean(guildId) && enabled,
    refetchInterval: 90_000,
  });
}

export function useActivity(guildId: string, enabled = true) {
  return useQuery({
    queryKey: keys.activity(guildId),
    queryFn: ({ signal }) => guildApi.activity(guildId, signal),
    enabled: Boolean(guildId) && enabled,
  });
}

/** Invalidate everything derived from guild configuration. */
export function invalidateConfig(queryClient: ReturnType<typeof useQueryClient>, guildId: string): void {
  for (const key of [
    keys.settings(guildId),
    keys.modules(guildId),
    keys.overview(guildId),
    keys.alerts(guildId),
    keys.automod(guildId),
    keys.security(guildId),
    keys.welcome(guildId),
    keys.integrations(guildId),
    keys.autoroles(guildId),
  ]) {
    void queryClient.invalidateQueries({ queryKey: key });
  }
}

export function useToggleModule(guildId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ moduleId, enabled }: { moduleId: string; enabled: boolean }) =>
      guildApi.setModule(guildId, moduleId, enabled),
    onSuccess: () => invalidateConfig(queryClient, guildId),
  });
}
