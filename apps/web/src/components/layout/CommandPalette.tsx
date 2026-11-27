import { ArrowRight, BookOpen, CornerDownLeft, FileCog, Search, Server, Terminal } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { useGuildsQuery } from "../../lib/api/auth";
import { useSchema } from "../../lib/api/guilds";
import { useCommandCatalogue } from "../../lib/api/system";
import { ACCOUNT_NAV, ALL_SERVER_ITEMS, DOCS_URL, serverPath } from "../../lib/nav";
import { cn, keyLabel } from "../../lib/utils";

interface Result {
  id: string;
  group: string;
  label: string;
  hint?: string;
  icon: ReactNode;
  run: () => void;
}

/** Maps a config category to the page that edits it. */
const CATEGORY_PAGE: Record<string, string> = {
  general: "config",
  permissions: "permissions",
  moderation: "moderation",
  automod: "automod",
  security: "security",
  welcome: "welcome",
  goodbye: "welcome",
  logging: "logging",
  leveling: "leveling",
  economy: "economy",
  tickets: "tickets/settings",
  giveaways: "giveaways",
  suggestions: "suggestions",
  confessions: "confessions",
  starboard: "starboard",
  voice: "voice",
  music: "music",
  roblox: "integrations",
  social: "social",
};

export function CommandPalette({ open, onClose, guildId }: { open: boolean; onClose: () => void; guildId: string | null }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const schema = useSchema();
  const commands = useCommandCatalogue(open);
  const guilds = useGuildsQuery(open);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const results = useMemo<Result[]>(() => {
    const text = query.trim().toLowerCase();
    const go = (path: string) => () => {
      onClose();
      navigate(path);
    };
    const pages: Result[] = guildId
      ? ALL_SERVER_ITEMS.map((item) => ({
          id: `page:${item.id}`,
          group: "Pages",
          label: item.label,
          hint: item.group,
          icon: <item.icon className="h-4 w-4" />,
          run: go(serverPath(guildId, item.path)),
        }))
      : [];
    const account: Result[] = ACCOUNT_NAV[0]!.items.map((item) => ({
      id: `account:${item.id}`,
      group: "Account",
      label: item.label,
      icon: <item.icon className="h-4 w-4" />,
      run: go(item.path),
    }));
    const servers: Result[] = (guilds.data?.guilds ?? [])
      .filter((guild) => guild.botInstalled)
      .map((guild) => ({
        id: `server:${guild.id}`,
        group: "Servers",
        label: guild.name,
        hint: "Open server",
        icon: <Server className="h-4 w-4" />,
        run: go(serverPath(guild.id, "")),
      }));
    const settings: Result[] =
      guildId && schema.data
        ? schema.data.keys.map((def) => ({
            id: `setting:${def.key}`,
            group: "Settings",
            label: keyLabel(def.key),
            hint: def.key,
            icon: <FileCog className="h-4 w-4" />,
            run: go(`${serverPath(guildId, CATEGORY_PAGE[def.category] ?? "config")}`),
          }))
        : [];
    const commandResults: Result[] = (commands.data?.commands ?? []).map((command) => ({
      id: `command:${command.name}`,
      group: "Commands",
      label: command.name,
      hint: command.description,
      icon: <Terminal className="h-4 w-4" />,
      run: guildId ? go(`${serverPath(guildId, "commands")}?command=${encodeURIComponent(command.name)}`) : go("/dashboard/servers"),
    }));
    const docs: Result = {
      id: "docs",
      group: "Documentation",
      label: text ? `Search the docs for “${query.trim()}”` : "Open documentation",
      icon: <BookOpen className="h-4 w-4" />,
      run: () => {
        onClose();
        window.open(text ? `${DOCS_URL}?q=${encodeURIComponent(query.trim())}` : DOCS_URL, "_blank", "noopener,noreferrer");
      },
    };

    if (!text) return [...pages.slice(0, 8), ...account.slice(0, 4), docs];
    const score = (result: Result) => {
      const label = result.label.toLowerCase();
      if (label === text) return 0;
      if (label.startsWith(text)) return 1;
      if (label.includes(text)) return 2;
      if ((result.hint ?? "").toLowerCase().includes(text)) return 3;
      return 9;
    };
    const ranked = [...pages, ...servers, ...settings, ...commandResults, ...account]
      .map((result) => ({ result, rank: score(result) }))
      .filter((entry) => entry.rank < 9)
      .sort((a, b) => a.rank - b.rank)
      .slice(0, 40)
      .map((entry) => entry.result);
    return [...ranked, docs];
  }, [query, guildId, schema.data, commands.data, guilds.data, navigate, onClose]);

  useEffect(() => setActive(0), [query]);

  if (!open) return null;
  let lastGroup = "";
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-start justify-center px-4 pt-[12vh]">
      <div className="absolute inset-0 animate-fade-in bg-black/70" onClick={onClose} aria-hidden />
      <div role="dialog" aria-modal="true" aria-label="Search" className="relative w-full max-w-xl animate-slide-up overflow-hidden rounded-xl border border-ink-600 bg-ink-850 shadow-pop">
        <div className="flex items-center gap-3 border-b border-ink-700 px-4">
          <Search className="h-4 w-4 text-zinc-500" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActive((value) => Math.min(results.length - 1, value + 1));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setActive((value) => Math.max(0, value - 1));
              } else if (event.key === "Enter") {
                event.preventDefault();
                results[active]?.run();
              } else if (event.key === "Escape") {
                onClose();
              }
            }}
            placeholder={guildId ? "Search pages, settings, commands, servers…" : "Search pages, servers, commands…"}
            className="h-12 w-full bg-transparent text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
            aria-label="Search"
          />
          <kbd className="kbd">Esc</kbd>
        </div>
        <ul className="max-h-[55vh] overflow-y-auto p-1.5" role="listbox">
          {results.map((result, index) => {
            const header = result.group !== lastGroup ? result.group : null;
            lastGroup = result.group;
            return (
              <li key={result.id}>
                {header ? <p className="px-2.5 pb-1 pt-2.5 text-2xs font-semibold uppercase tracking-wider text-zinc-600">{header}</p> : null}
                <button
                  type="button"
                  role="option"
                  aria-selected={index === active}
                  onMouseEnter={() => setActive(index)}
                  onClick={result.run}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left",
                    index === active ? "bg-ink-700 text-zinc-100" : "text-zinc-300",
                  )}
                >
                  <span className="text-zinc-500">{result.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-13">{result.label}</span>
                    {result.hint ? <span className="block truncate text-2xs text-zinc-500">{result.hint}</span> : null}
                  </span>
                  {index === active ? <CornerDownLeft className="h-3.5 w-3.5 text-zinc-500" /> : <ArrowRight className="h-3.5 w-3.5 text-transparent" />}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="flex items-center gap-4 border-t border-ink-700 px-4 py-2 text-2xs text-zinc-600">
          <span><kbd className="kbd">↑</kbd> <kbd className="kbd">↓</kbd> navigate</span>
          <span><kbd className="kbd">↵</kbd> open</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
