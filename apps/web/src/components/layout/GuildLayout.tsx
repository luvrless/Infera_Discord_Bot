import { useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Lock, RefreshCw, ServerOff } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { Link, Outlet, useParams } from "react-router-dom";
import { isBotMissing, isForbidden } from "../../lib/api/client";
import { useGuildDetail, useSettings } from "../../lib/api/guilds";
import type { DashboardScope } from "../../lib/api/types";
import { botInviteUrl, isSnowflake } from "../../lib/utils";
import { useAuth } from "../../hooks/useAuth";
import { GuildProvider, type GuildContextValue } from "../../hooks/useGuild";
import { useRealtime, useRealtimeGuild } from "../../hooks/useRealtime";
import { Button, Callout } from "../ui/primitives";
import { EmptyState, ErrorState, PageSkeleton } from "../ui/states";
import { useToast } from "../ui/toast";

/**
 * Wraps every /dashboard/server/:guildId route. Authorisation comes from the
 * API (GET /guilds/:id re-checks the user's live Discord permissions); the
 * client-side level/scopes only decide what to render.
 */
export function GuildLayout() {
  const { guildId = "" } = useParams();
  const queryClient = useQueryClient();
  const { clientId } = useAuth();
  const toast = useToast();
  const previous = useRef<string | null>(null);
  const valid = isSnowflake(guildId);

  const detail = useGuildDetail(valid ? guildId : "");
  const installed = Boolean(detail.data?.guild.botInstalled);
  const settings = useSettings(guildId, valid && installed);
  const { subscribe } = useRealtime();
  useRealtimeGuild(valid && installed ? guildId : null);

  // Clear the previous guild's cached data so nothing leaks across servers.
  useEffect(() => {
    if (previous.current && previous.current !== guildId) {
      queryClient.removeQueries({ queryKey: ["g", previous.current] });
    }
    previous.current = guildId;
  }, [guildId, queryClient]);

  // Immediate in-app alert for security events on this server.
  useEffect(
    () =>
      subscribe((envelope) => {
        if (envelope.guildId !== guildId) return;
        if (envelope.event === "security.antinuke.triggered") toast.security("Antinuke triggered", "INFERA detected destructive administrative activity. Review Security.");
        else if (envelope.event === "security.antiraid.triggered") toast.security("Raid activity detected", "A burst of suspicious joins was detected. Review Security.");
        else if (envelope.event === "security.alert.created") toast.security("Security alert", "A new security alert was raised for this server.");
        else if (envelope.event === "security.lockdown.created") toast.security("Server lockdown started", "Text channels have been locked.");
      }),
    [guildId, subscribe, toast],
  );

  const value = useMemo<GuildContextValue | null>(() => {
    if (!detail.data) return null;
    const scopes = settings.data?.scopes ?? detail.data.scopes;
    const level = settings.data?.level ?? detail.data.level;
    return {
      guildId,
      detail: detail.data,
      settings: settings.data,
      values: settings.data?.values ?? {},
      modules: settings.data?.modules ?? [],
      level,
      scopes,
      can: (scope: DashboardScope) => scopes.includes(scope),
      canConfigure: scopes.includes("configure_modules"),
      canModerate: scopes.includes("manage_moderation"),
      botOnline: detail.data.guild.botOnline,
    };
  }, [detail.data, settings.data, guildId]);

  if (!valid) {
    return <EmptyState icon={ServerOff} title="That isn't a valid server" description="Pick a server from the switcher to continue." action={<Link to="/dashboard/servers" className="btn-primary">Choose a server</Link>} />;
  }
  if (detail.isLoading) return <PageSkeleton />;
  if (detail.error && !detail.data) {
    if (isForbidden(detail.error)) {
      return (
        <EmptyState
          icon={Lock}
          title="You can't manage this server"
          description="INFERA only lets you manage servers where you have the Manage Server permission. Ask an owner for access."
          action={<Link to="/dashboard/servers" className="btn-secondary">Back to servers</Link>}
        />
      );
    }
    return <ErrorState error={detail.error} onRetry={() => void detail.refetch()} />;
  }
  if (!detail.data || !value) return <PageSkeleton />;

  if (!detail.data.guild.botInstalled || isBotMissing(settings.error)) {
    return (
      <EmptyState
        icon={ServerOff}
        title={`INFERA isn't in ${detail.data.guild.name} yet`}
        description="Invite INFERA to this server to configure modules, moderation and everything else from here. Come back to this page once it has joined."
        action={
          <div className="flex gap-2">
            {clientId ? (
              <a href={botInviteUrl(clientId, guildId)} target="_blank" rel="noreferrer noopener" className="btn-primary">
                <ExternalLink className="h-3.5 w-3.5" /> Add INFERA
              </a>
            ) : null}
            <Button icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={() => void detail.refetch()}>
              I've added it
            </Button>
          </div>
        }
      />
    );
  }

  if (settings.isLoading) return <PageSkeleton />;
  if (settings.error && !settings.data) return <ErrorState error={settings.error} onRetry={() => void settings.refetch()} />;

  return (
    <GuildProvider value={value}>
      {!detail.data.guild.botOnline ? (
        <Callout tone="warning" className="mb-5" title="INFERA is currently disconnected">
          The bot hasn't sent a heartbeat in the last few minutes{detail.data.bot.lastSeenAt ? ` (last seen ${new Date(detail.data.bot.lastSeenAt).toLocaleString()})` : ""}. Settings still save, but Discord actions and live
          events will wait until it reconnects.
        </Callout>
      ) : null}
      {!value.canConfigure ? (
        <Callout tone="info" className="mb-5" title="Read-only access">
          Your INFERA permission level in this server doesn't allow changing configuration. You can still view what's available to your role.
        </Callout>
      ) : null}
      <Outlet />
    </GuildProvider>
  );
}
