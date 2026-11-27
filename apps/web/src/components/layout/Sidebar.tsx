import { BookOpen, Bell, ChevronDown, ChevronRight, LifeBuoy, LogOut, Search, Settings, UserRound } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useGuildAlerts, useSettings } from "../../lib/api/guilds";
import { ACCOUNT_NAV, DOCS_URL, SERVER_NAV, SUPPORT_URL, serverPath, type NavItem } from "../../lib/nav";
import { cn, readLocal, writeLocal } from "../../lib/utils";
import { useAuth } from "../../hooks/useAuth";
import { Avatar, useClickOutside } from "../ui/primitives";
import { Wordmark } from "./Logo";
import { ServerSwitcher } from "./ServerSwitcher";

function useCollapsedGroups() {
  const [collapsed, setCollapsed] = useState<string[]>(() => readLocal<string[]>("sidebar:collapsed", []));
  const toggle = (id: string) =>
    setCollapsed((current) => {
      const next = current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id];
      writeLocal("sidebar:collapsed", next);
      return next;
    });
  return { collapsed, toggle };
}

function ItemStatus({ item, enabled, issue }: { item: NavItem; enabled: boolean | null; issue: boolean }) {
  if (item.unsupported) return <span className="rounded border border-ink-600 px-1 text-[9px] uppercase tracking-wide text-zinc-600">soon</span>;
  if (issue) return <span className="h-1.5 w-1.5 rounded-full bg-amber-400" title="Configuration needs attention" />;
  if (enabled) return <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" title="Enabled" />;
  return null;
}

export function Sidebar({ guildId, onNavigate }: { guildId: string | null; onNavigate?: () => void }) {
  const { collapsed, toggle } = useCollapsedGroups();
  const [filter, setFilter] = useState("");
  const [cursor, setCursor] = useState(0);
  const navigate = useNavigate();
  const settings = useSettings(guildId ?? "", Boolean(guildId));
  const alerts = useGuildAlerts(guildId ?? "", Boolean(guildId));
  const searchRef = useRef<HTMLInputElement>(null);

  const issues = useMemo(
    () => new Set((alerts.data?.alerts ?? []).filter((alert) => alert.type === "configuration").map((alert) => alert.id.split(":config:")[1])),
    [alerts.data],
  );

  const enabledFor = (item: NavItem): boolean | null => {
    if (!settings.data) return null;
    if (item.moduleId) return settings.data.modules.find((module) => module.id === item.moduleId)?.enabled ?? null;
    if (item.enabledKey) return Boolean(settings.data.values[item.enabledKey]);
    return null;
  };

  const groups = guildId ? SERVER_NAV : ACCOUNT_NAV;
  const text = filter.trim().toLowerCase();
  const visible = groups
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) => !text || item.label.toLowerCase().includes(text) || (item.keywords ?? "").includes(text) || group.title.toLowerCase().includes(text),
      ),
    }))
    .filter((group) => group.items.length > 0);
  const flat = visible.flatMap((group) => group.items);

  const hrefFor = (item: NavItem) => (guildId ? serverPath(guildId, item.path) : item.path);

  return (
    <div className="flex h-full flex-col">
      <div className="px-4 pb-3 pt-4">
        <Link to="/dashboard" onClick={onNavigate} aria-label="INFERA account dashboard" className="inline-flex rounded-lg focus-visible:ring-2 focus-visible:ring-accent/60">
          <Wordmark />
        </Link>
      </div>

      <div className="px-3">
        <ServerSwitcher currentId={guildId} onNavigate={onNavigate} />
      </div>

      <div className="px-3 pt-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-600" />
          <input
            ref={searchRef}
            value={filter}
            onChange={(event) => {
              setFilter(event.target.value);
              setCursor(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setCursor((value) => Math.min(flat.length - 1, value + 1));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setCursor((value) => Math.max(0, value - 1));
              } else if (event.key === "Enter" && flat[cursor]) {
                navigate(hrefFor(flat[cursor]!));
                setFilter("");
                onNavigate?.();
              } else if (event.key === "Escape") {
                setFilter("");
                searchRef.current?.blur();
              }
            }}
            placeholder="Search navigation"
            aria-label="Search navigation"
            className="h-8 w-full rounded-lg border border-ink-700 bg-ink-900 pl-8 pr-2 text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-accent/50 focus:outline-none"
          />
        </div>
      </div>

      <nav className="mt-2 flex-1 overflow-y-auto px-3 pb-3" aria-label="Dashboard navigation">
        {visible.map((group) => {
          const isCollapsed = !text && collapsed.includes(group.id);
          return (
            <div key={group.id} className="pt-3">
              <button
                type="button"
                onClick={() => toggle(group.id)}
                aria-expanded={!isCollapsed}
                className="flex w-full items-center justify-between rounded px-2 py-1 text-2xs font-semibold uppercase tracking-[0.1em] text-zinc-600 hover:text-zinc-400"
              >
                {group.title}
                {isCollapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </button>
              {!isCollapsed ? (
                <ul className="mt-1 space-y-px">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const highlighted = Boolean(text) && flat[cursor]?.id === item.id;
                    return (
                      <li key={item.id}>
                        <NavLink
                          to={hrefFor(item)}
                          end={item.path === "" || item.path === "/dashboard" || item.path === "analytics" || item.path === "tickets"}
                          onClick={() => {
                            setFilter("");
                            onNavigate?.();
                          }}
                          className={({ isActive }) =>
                            cn(
                              "group relative flex h-8 items-center gap-2.5 rounded-lg px-2 text-13 transition-colors",
                              isActive ? "bg-accent/[0.12] text-zinc-50" : "text-zinc-400 hover:bg-ink-750 hover:text-zinc-100",
                              highlighted && "ring-1 ring-accent/50",
                              item.unsupported && "text-zinc-500",
                            )
                          }
                        >
                          {({ isActive }) => (
                            <>
                              {isActive ? <span className="absolute -left-3 top-1.5 h-5 w-[3px] rounded-r bg-accent" /> : null}
                              <Icon className={cn("h-4 w-4 shrink-0", isActive ? "text-accent-soft" : "text-zinc-500 group-hover:text-zinc-300")} />
                              <span className="flex-1 truncate">{item.label}</span>
                              {guildId ? <ItemStatus item={item} enabled={enabledFor(item)} issue={Boolean(item.issueId && issues.has(item.issueId))} /> : null}
                            </>
                          )}
                        </NavLink>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </div>
          );
        })}
        {visible.length === 0 ? <p className="px-2 py-6 text-center text-xs text-zinc-600">No pages match “{filter}”.</p> : null}
      </nav>

      <UserSection onNavigate={onNavigate} />
    </div>
  );
}

function UserSection({ onNavigate }: { onNavigate?: () => void }) {
  const { user, signOut, signingOut } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useClickOutside<HTMLDivElement>(open, () => setOpen(false));
  const navigate = useNavigate();
  if (!user) return null;
  const go = (path: string) => {
    setOpen(false);
    onNavigate?.();
    navigate(path);
  };
  return (
    <div ref={ref} className="relative border-t border-ink-700 p-3">
      {open ? (
        <div className="absolute bottom-full left-3 right-3 mb-1.5 animate-fade-in overflow-hidden rounded-xl border border-ink-600 bg-ink-800 p-1 shadow-pop">
          <MenuItem icon={Settings} label="Account settings" onClick={() => go("/dashboard/settings")} />
          <MenuItem icon={UserRound} label="Connected account" onClick={() => go("/dashboard/settings#discord")} />
          <MenuItem icon={Bell} label="Notifications" onClick={() => go("/dashboard/notifications")} />
          <MenuItem icon={BookOpen} label="Documentation" href={DOCS_URL} />
          <MenuItem icon={LifeBuoy} label="Support" href={SUPPORT_URL} />
          <div className="my-1 border-t border-ink-700" />
          <MenuItem icon={LogOut} label={signingOut ? "Signing out…" : "Sign out"} danger onClick={() => void signOut()} />
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left hover:bg-ink-750"
      >
        <Avatar src={user.avatarUrl} name={user.globalName ?? user.username} size={30} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-13 font-medium text-zinc-100">{user.globalName ?? user.username}</span>
          <span className="block truncate text-2xs text-zinc-500">@{user.username}</span>
        </span>
        <ChevronDown className={cn("h-3.5 w-3.5 text-zinc-500 transition-transform", open && "rotate-180")} />
      </button>
    </div>
  );
}

export function MenuItem({
  icon: Icon,
  label,
  onClick,
  href,
  danger,
}: {
  icon: typeof Settings;
  label: string;
  onClick?: () => void;
  href?: string;
  danger?: boolean;
}) {
  const className = cn(
    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-13 transition-colors",
    danger ? "text-red-400 hover:bg-red-500/10" : "text-zinc-300 hover:bg-ink-700 hover:text-zinc-100",
  );
  if (href) {
    return (
      <a href={href} target="_blank" rel="noreferrer noopener" className={className} role="menuitem">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className={className} role="menuitem">
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}
