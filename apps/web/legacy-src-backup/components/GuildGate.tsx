import { useQueryClient } from "@tanstack/react-query";
import { Bot, ShieldX } from "lucide-react";
import type { ReactNode } from "react";
import { Link, Outlet, useOutletContext, useParams } from "react-router-dom";
import { useGuild, useGuilds, useSession } from "../lib/hooks";
import { isBotMissing, isForbidden } from "../lib/api";
import { guildIconUrl, installUrl } from "../lib/utils";
import type { GuildDetail } from "../lib/types";
import { Button, ErrorState, Skeleton } from "./ui";

export interface GuildContextValue {
  guild: GuildDetail["guild"];
  level: number;
  scopes: string[];
  bot: GuildDetail["bot"];
  guildId: string;
  reload: () => void;
}

export function useGuildData(): GuildContextValue {
  return useOutletContext<GuildContextValue>();
}

export function GuildGate({ children }: { children?: ReactNode }) {
  const { guildId = "" } = useParams();
  const query = useGuild(guildId);
  const session = useSession();
  const guilds = useGuilds();
  const queryClient = useQueryClient();

  if (query.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 w-full" />
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (query.isError) {
    if (isBotMissing(query.error)) {
      const listItem = guilds.data?.guilds.find((guild) => guild.id === guildId);
      const clientId = session.data?.clientId;
      return (
        <div className="mx-auto max-w-xl py-12 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-ink-700 bg-ink-800">
            <Bot className="h-6 w-6 text-accent-soft" />
          </div>
          <h1 className="text-xl font-semibold text-zinc-100">INFERA is not in this server yet</h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-zinc-500">
            {listItem ? `${listItem.name} is available` : "This server is available"} — invite INFERA with
            administrator permissions, then reload this page. Configuration becomes available as soon as the bot
            joins.
          </p>
          <div className="mt-6 flex items-center justify-center gap-2">
            {clientId ? (
              <a className="btn-primary" href={installUrl(clientId)} target="_blank" rel="noreferrer">
                Add INFERA to server
              </a>
            ) : null}
            <Button variant="secondary" onClick={() => void query.refetch()}>
              I added it — reload
            </Button>
            <Link className="btn-ghost" to="/dashboard/servers">
              All servers
            </Link>
          </div>
        </div>
      );
    }
    if (isForbidden(query.error)) {
      return (
        <div className="mx-auto max-w-md py-16 text-center">
          <ShieldX className="mx-auto mb-3 h-7 w-7 text-amber-400" />
          <h1 className="text-lg font-semibold text-zinc-100">No access to this server</h1>
          <p className="mt-1 text-sm text-zinc-500">
            You need the Manage Server permission on Discord to open this dashboard.
          </p>
          <Link to="/dashboard/servers" className="btn-secondary mt-5 inline-flex">
            Back to servers
          </Link>
        </div>
      );
    }
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  }

  const data = query.data;
  if (!data) return null;

  const context: GuildContextValue = {
    guild: data.guild,
    level: data.level,
    scopes: data.scopes,
    bot: data.bot,
    guildId,
    reload: () => {
      void queryClient.invalidateQueries({ queryKey: ["guild", guildId] });
      void queryClient.invalidateQueries({ queryKey: ["overview", guildId] });
    },
  };

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <img
            src={guildIconUrl(data.guild.id, data.guild.icon, 96)}
            alt=""
            className="h-11 w-11 rounded-xl border border-ink-700 bg-ink-800"
          />
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-zinc-50">{data.guild.name}</h1>
            <div className="mt-0.5 flex items-center gap-2 text-xs text-zinc-500">
              <span className={data.guild.botOnline ? "text-emerald-400" : "text-zinc-500"}>
                {data.guild.botOnline ? "INFERA online" : "INFERA offline"}
              </span>
              <span>·</span>
              <span>{data.guild.memberCount.toLocaleString()} members</span>
              <span>·</span>
              <Link to="/dashboard/servers" className="hover:text-zinc-300">
                switch server
              </Link>
            </div>
          </div>
        </div>
      </div>
      <div className="min-w-0">{children ?? <Outlet context={context} />}</div>
    </>
  );
}
