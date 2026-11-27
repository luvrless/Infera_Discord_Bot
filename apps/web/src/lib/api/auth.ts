import { useQuery } from "@tanstack/react-query";
import { api } from "./client";
import { keys } from "./keys";
import type { Alert, BotStatus, GuildsResponse, SessionResponse, StatusResponse } from "./types";

export const authApi = {
  session: (signal?: AbortSignal) => api.get<SessionResponse>("/auth/session", undefined, signal),
  guilds: (signal?: AbortSignal) => api.get<GuildsResponse>("/auth/me/guilds", undefined, signal),
  permissions: (guildId: string) =>
    api.get<{ guildId: string; level: number; scopes: string[]; botInstalled: boolean }>("/auth/me/permissions", { guildId }),
  logout: () => api.post<{ signedOut: boolean }>("/auth/logout"),
  status: (signal?: AbortSignal) => api.get<StatusResponse>("/status", undefined, signal),
  accountAlerts: (signal?: AbortSignal) =>
    api.get<{ alerts: Alert[]; bot: BotStatus; guilds: number }>("/notifications", undefined, signal),
};

export function useSessionQuery() {
  return useQuery({
    queryKey: keys.session,
    queryFn: ({ signal }) => authApi.session(signal),
    retry: false,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: true,
  });
}

export function useGuildsQuery(enabled = true) {
  return useQuery({
    queryKey: keys.guilds,
    queryFn: ({ signal }) => authApi.guilds(signal),
    enabled,
    staleTime: 30_000,
  });
}

export function useStatusQuery() {
  return useQuery({
    queryKey: keys.status,
    queryFn: ({ signal }) => authApi.status(signal),
    refetchInterval: 60_000,
  });
}

export function useAccountAlerts(enabled = true) {
  return useQuery({
    queryKey: keys.accountAlerts,
    queryFn: ({ signal }) => authApi.accountAlerts(signal),
    enabled,
    refetchInterval: 90_000,
  });
}
