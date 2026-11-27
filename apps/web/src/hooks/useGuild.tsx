import { createContext, useContext, type ReactNode } from "react";
import type { DashboardScope, GuildDetail, ModuleState, PermissionLevel, SettingsResponse } from "../lib/api/types";

export interface GuildContextValue {
  guildId: string;
  detail: GuildDetail;
  settings: SettingsResponse | undefined;
  values: Record<string, unknown>;
  modules: ModuleState[];
  level: PermissionLevel;
  scopes: DashboardScope[];
  /** UI hint only — the API re-checks every request. */
  can: (scope: DashboardScope) => boolean;
  canConfigure: boolean;
  canModerate: boolean;
  botOnline: boolean;
}

const GuildContext = createContext<GuildContextValue | null>(null);

export function GuildProvider({ value, children }: { value: GuildContextValue; children: ReactNode }) {
  return <GuildContext.Provider value={value}>{children}</GuildContext.Provider>;
}

export function useGuild(): GuildContextValue {
  const context = useContext(GuildContext);
  if (!context) throw new Error("useGuild must be used inside a server route");
  return context;
}

export function useOptionalGuild(): GuildContextValue | null {
  return useContext(GuildContext);
}

export function moduleEnabled(modules: ModuleState[], id: string): boolean | null {
  const module = modules.find((entry) => entry.id === id);
  return module ? module.enabled : null;
}
