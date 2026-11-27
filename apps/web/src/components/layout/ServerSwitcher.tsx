import { ChevronsUpDown, Crown, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useGuildsQuery } from "../../lib/api/auth";
import type { GuildListItem } from "../../lib/api/types";
import { botInviteUrl, cn, guildIconUrl } from "../../lib/utils";
import { guildIdFromPath, serverPath } from "../../lib/nav";
import { useAuth } from "../../hooks/useAuth";
import { Avatar, StatusDot, useClickOutside } from "../ui/primitives";

export function GuildIcon({ guild, size = 32 }: { guild: Pick<GuildListItem, "id" | "name" | "icon">; size?: number }) {
  return <Avatar src={guildIconUrl(guild.id, guild.icon, size * 2)} name={guild.name} size={size} rounded="lg" />;
}

export function ServerSwitcher({ currentId, onNavigate }: { currentId: string | null; onNavigate?: () => void }) {
  const guilds = useGuildsQuery();
  const { clientId } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useClickOutside<HTMLDivElement>(open, () => setOpen(false));
  const current = guilds.data?.guilds.find((guild) => guild.id === currentId);

  const list = useMemo(() => {
    const text = query.trim().toLowerCase();
    const all = guilds.data?.guilds ?? [];
    return (text ? all.filter((guild) => guild.name.toLowerCase().includes(text)) : all).sort(
      (a, b) => Number(b.botInstalled) - Number(a.botInstalled) || a.name.localeCompare(b.name),
    );
  }, [guilds.data, query]);

  const choose = (guild: GuildListItem) => {
    setOpen(false);
    setQuery("");
    onNavigate?.();
    if (!guild.botInstalled) {
      if (clientId) window.open(botInviteUrl(clientId, guild.id), "_blank", "noopener,noreferrer");
      return;
    }
    // Preserve the current module when switching servers.
    const relative = currentId ? window.location.pathname.split(`/server/${currentId}`)[1]?.replace(/^\//, "") ?? "" : "";
    navigate(serverPath(guild.id, relative));
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 rounded-lg border border-ink-700 bg-ink-800 px-2.5 py-2 text-left transition-colors hover:border-ink-600 hover:bg-ink-750"
      >
        {current ? (
          <GuildIcon guild={current} size={30} />
        ) : (
          <span className="flex h-[30px] w-[30px] items-center justify-center rounded-lg border border-dashed border-ink-500 text-zinc-500">
            <Search className="h-3.5 w-3.5" />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-13 font-medium text-zinc-100">{current?.name ?? "Select a server"}</span>
          <span className="mt-0.5 flex items-center gap-1.5 text-2xs text-zinc-500">
            {current ? (
              <>
                <StatusDot tone={current.botOnline ? "success" : current.botInstalled ? "warning" : "neutral"} />
                {current.botOnline ? "INFERA online" : current.botInstalled ? "INFERA offline" : "Not installed"}
              </>
            ) : (
              `${guilds.data?.guilds.length ?? 0} servers available`
            )}
          </span>
        </span>
        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
      </button>

      {open ? (
        <div className="absolute left-0 right-0 z-50 mt-1.5 animate-fade-in overflow-hidden rounded-xl border border-ink-600 bg-ink-800 shadow-pop">
          <div className="flex items-center gap-2 border-b border-ink-700 px-3">
            <Search className="h-3.5 w-3.5 text-zinc-500" />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find a server"
              className="h-9 w-full bg-transparent text-13 text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
            />
          </div>
          <ul role="listbox" className="max-h-80 overflow-y-auto p-1">
            {guilds.isLoading ? <li className="px-3 py-4 text-center text-xs text-zinc-500">Loading servers…</li> : null}
            {guilds.error ? <li className="px-3 py-4 text-center text-xs text-red-400">Couldn't load your servers.</li> : null}
            {list.map((guild) => (
              <li key={guild.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={guild.id === currentId}
                  onClick={() => choose(guild)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-ink-700",
                    guild.id === currentId && "bg-ink-750",
                  )}
                >
                  <GuildIcon guild={guild} size={26} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1 truncate text-13 text-zinc-200">
                      <span className="truncate">{guild.name}</span>
                      {guild.owner ? <Crown className="h-3 w-3 shrink-0 text-amber-400" aria-label="Owner" /> : null}
                    </span>
                    <span className="block text-2xs text-zinc-500">{guild.owner ? "Owner" : "Manage Server"}</span>
                  </span>
                  {guild.botInstalled ? (
                    <StatusDot tone={guild.botOnline ? "success" : "warning"} />
                  ) : (
                    <span className="flex items-center gap-0.5 rounded-md border border-accent/30 bg-accent/10 px-1.5 py-0.5 text-2xs font-medium text-accent-soft">
                      <Plus className="h-3 w-3" /> Add
                    </span>
                  )}
                </button>
              </li>
            ))}
            {!guilds.isLoading && list.length === 0 ? (
              <li className="px-3 py-4 text-center text-xs text-zinc-500">No servers where you have Manage Server.</li>
            ) : null}
          </ul>
          <div className="border-t border-ink-700 p-1">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onNavigate?.();
                navigate("/dashboard/servers");
              }}
              className="w-full rounded-lg px-2.5 py-1.5 text-left text-xs text-zinc-400 hover:bg-ink-700 hover:text-zinc-100"
            >
              View all servers
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export { guildIdFromPath };
