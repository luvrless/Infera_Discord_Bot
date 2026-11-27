import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import type {
  Channel,
  GuildDetail,
  GuildListItem,
  ModuleState,
  Role,
  SchemaDocument,
  SessionResponse,
  SettingsResponse,
} from "./types";

export const qk = {
  session: ["session"] as const,
  guilds: ["guilds"] as const,
  guild: (id: string) => ["guild", id] as const,
  overview: (id: string) => ["overview", id] as const,
  settings: (id: string) => ["settings", id] as const,
  modules: (id: string) => ["modules", id] as const,
  channels: (id: string) => ["channels", id] as const,
  roles: (id: string) => ["roles", id] as const,
  schema: ["schema"] as const,
  notifications: ["notifications"] as const,
  status: ["status"] as const,
};

export function useSession() {
  return useQuery({
    queryKey: qk.session,
    queryFn: () => api.get<SessionResponse>("/auth/session"),
    retry: false,
    staleTime: 5 * 60_000,
  });
}

export function useGuilds(enabled = true) {
  return useQuery({
    queryKey: qk.guilds,
    queryFn: () => api.get<{ guilds: GuildListItem[]; bot: { online: boolean; guilds: number } }>("/guilds"),
    enabled,
    staleTime: 30_000,
  });
}

export function useGuild(guildId: string) {
  return useQuery({
    queryKey: qk.guild(guildId),
    queryFn: () => api.get<GuildDetail>(`/guilds/${guildId}`),
    enabled: Boolean(guildId),
    staleTime: 30_000,
  });
}

export function useSettings(guildId: string, enabled = true) {
  return useQuery({
    queryKey: qk.settings(guildId),
    queryFn: () => api.get<SettingsResponse>(`/guilds/${guildId}/settings`),
    enabled: Boolean(guildId) && enabled,
  });
}

export function useSchema() {
  return useQuery({
    queryKey: qk.schema,
    queryFn: () => api.get<{ schema: SchemaDocument }>("/config/schema"),
    staleTime: Infinity,
  });
}

export function useChannels(guildId: string, enabled = true) {
  return useQuery({
    queryKey: qk.channels(guildId),
    queryFn: () => api.get<{ channels: Channel[] }>(`/guilds/${guildId}/channels`),
    enabled: Boolean(guildId) && enabled,
    staleTime: 60_000,
  });
}

export function useRoles(guildId: string, enabled = true) {
  return useQuery({
    queryKey: qk.roles(guildId),
    queryFn: () => api.get<{ roles: Role[] }>(`/guilds/${guildId}/roles`),
    enabled: Boolean(guildId) && enabled,
    staleTime: 60_000,
  });
}

export function useSaveConfig(guildId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: Record<string, unknown>) =>
      api.patch<{ changed: string[]; snapshot: { values: Record<string, unknown>; version: number } }>(
        `/guilds/${guildId}/config`,
        { patch },
      ),
    onSuccess: (result) => {
      queryClient.setQueryData<SettingsResponse>(qk.settings(guildId), (current) =>
        current ? { ...current, values: result.snapshot.values, version: result.snapshot.version } : current,
      );
      void queryClient.invalidateQueries({ queryKey: qk.settings(guildId) });
      void queryClient.invalidateQueries({ queryKey: qk.modules(guildId) });
      void queryClient.invalidateQueries({ queryKey: qk.overview(guildId) });
    },
  });
}

export function useToggleModule(guildId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ moduleId, enabled }: { moduleId: string; enabled: boolean }) =>
      api.patch<{ module: ModuleState }>(`/guilds/${guildId}/modules/${moduleId}`, { enabled }),
    onSuccess: ({ module }) => {
      queryClient.setQueryData<ModuleState[]>(qk.modules(guildId), (current) =>
        current?.map((entry) => (entry.id === module.id ? module : entry)),
      );
      void queryClient.invalidateQueries({ queryKey: qk.modules(guildId) });
      void queryClient.invalidateQueries({ queryKey: qk.settings(guildId) });
      void queryClient.invalidateQueries({ queryKey: qk.overview(guildId) });
    },
  });
}
