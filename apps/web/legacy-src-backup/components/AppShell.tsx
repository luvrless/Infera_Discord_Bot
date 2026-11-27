import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  Check,
  ChevronDown,
  ChevronRight,
  Command,
  ExternalLink,
  LogOut,
  Menu,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useGuilds, useSession } from "../lib/hooks";
import { accountNav, guildIdFromPath, pageLabels, serverNav, type NavGroup, type NavItem } from "../lib/nav";
import type { Alert, CommandInfo, GuildListItem } from "../lib/types";
import { useReadAlerts } from "../lib/useReadAlerts";
import { cn, guildIconUrl, installUrl, relativeTime } from "../lib/utils";
import { Badge, Dot, Modal } from "./ui";

const NAV_STATE_KEY = "infera.nav.groups";

function Brand({ compact }: { compact?: boolean }) {
  return (
    <Link to="/dashboard" className={cn("flex items-center gap-2.5", compact && "gap-2")}>
      <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-accent/30 bg-accent/15">
        <span className="text-[13px] font-bold tracking-tight text-accent-soft">IN</span>
      </div>
      <div className="leading-none">
        <p className="text-[15px] font-semibold tracking-[0.14em] text-zinc-100">INFERA</p>
        <p className="mt-1 text-[9px] font-medium uppercase tracking-[0.22em] text-zinc-600">Dashboard</p>
      </div>
    </Link>
  );
}

function SidebarSearch({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-600" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Search navigation"
        className="h-8 w-full rounded-lg border border-ink-700 bg-ink-900/60 pl-8 pr-2 text-xs text-zinc-300 placeholder:text-zinc-600 focus:border-accent/50 focus:outline-none"
        aria-label="Search navigation"
      />
    </div>
  );
}

function ServerSwitcher({ guilds, currentId }: { guilds: GuildListItem[]; currentId: string | null }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const session = useSession();
  const current = guilds.find((guild) => guild.id === currentId);

  useEffect(() => {
    if (!open) return;
    const handler = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const filtered = guilds.filter((guild) => guild.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2.5 rounded-lg border border-ink-700 bg-ink-800 px-2.5 py-2 text-left transition-colors hover:border-ink-600"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {current ? (
          <img src={guildIconUrl(current.id, current.icon, 64)} alt="" className="h-7 w-7 rounded-lg" />
        ) : (
          <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-dashed border-ink-600 text-zinc-600">
            <Plus className="h-3.5 w-3.5" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-zinc-200">
            {current?.name ?? "Select a server"}
          </p>
          <p className="flex items-center gap-1.5 text-2xs text-zinc-500">
            {current ? (
              <>
                <Dot tone={current.botInstalled ? (current.botOnline ? "success" : "warning") : "neutral"} />
                {current.botInstalled ? (current.botOnline ? "INFERA online" : "INFERA offline") : "Not installed"}
              </>
            ) : (
              "Choose where to configure INFERA"
            )}
          </p>
        </div>
        <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-zinc-600 transition-transform", open && "rotate-180")} />
      </button>

      {open ? (
        <div className="absolute left-0 right-0 top-full z-50 mt-1.5 overflow-hidden rounded-xl border border-ink-600 bg-ink-850 shadow-pop">
          <div className="border-b border-ink-700 p-2">
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search servers"
              className="h-8 w-full rounded-md border border-ink-700 bg-ink-900 px-2 text-xs text-zinc-300 placeholder:text-zinc-600 focus:border-accent/50 focus:outline-none"
            />
          </div>
          <div className="max-h-64 overflow-y-auto p-1.5">
            {filtered.length === 0 ? (
              <p className="px-2 py-6 text-center text-xs text-zinc-500">No servers match.</p>
            ) : null}
            {filtered.map((guild) => (
              <button
                key={guild.id}
                type="button"
                onClick={() => {
                  navigate(`/dashboard/server/${guild.id}`);
                  setOpen(false);
                  setQuery("");
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-ink-750",
                  guild.id === currentId && "bg-ink-750/70",
                )}
              >
                <img src={guildIconUrl(guild.id, guild.icon, 64)} alt="" className="h-6 w-6 rounded-md" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-zinc-200">{guild.name}</p>
                  <p className="text-2xs text-zinc-500">
                    {guild.botInstalled ? `${guild.memberCount.toLocaleString()} members` : "Add INFERA to configure"}
                  </p>
                </div>
                {guild.id === currentId ? <Check className="h-3.5 w-3.5 text-accent-soft" /> : null}
                <Dot tone={guild.botInstalled ? (guild.botOnline ? "success" : "warning") : "neutral"} />
              </button>
            ))}
          </div>
          <div className="space-y-0.5 border-t border-ink-700 p-1.5">
            <Link
              to="/dashboard/servers"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-zinc-400 hover:bg-ink-750 hover:text-zinc-200"
            >
              All servers
              <ChevronRight className="h-3 w-3" />
            </Link>
            {session.data?.clientId ? (
              <a
                href={installUrl(session.data.clientId)}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-zinc-400 hover:bg-ink-750 hover:text-zinc-200"
              >
                Add INFERA to a server
                <ExternalLink className="h-3 w-3" />
              </a>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SidebarContent({
  guildId,
  onNavigate,
}: {
  guildId: string | null;
  onNavigate?: () => void;
}) {
  const { data } = useGuilds();
  const [query, setQuery] = useState("");
  const [closedGroups, setClosedGroups] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem(NAV_STATE_KEY) ?? "{}") as Record<string, boolean>;
    } catch {
      return {};
    }
  });

  const groups: NavGroup[] = guildId ? serverNav(guildId) : accountNav;
  const filtered = useMemo(() => {
    if (!query.trim()) return groups;
    const term = query.toLowerCase();
    return groups
      .map((group) => ({
        ...group,
        items: group.items.filter(
          (item) => item.label.toLowerCase().includes(term) || item.keywords?.toLowerCase().includes(term),
        ),
      }))
      .filter((group) => group.items.length > 0);
  }, [groups, query]);

  const toggleGroup = (title: string) => {
    setClosedGroups((current) => {
      const next = { ...current, [title]: !current[title] };
      localStorage.setItem(NAV_STATE_KEY, JSON.stringify(next));
      return next;
    });
  };

  return (
    <div className="flex h-full flex-col">
      <div className="px-3.5 pb-3 pt-4">
        <Brand />
        <div className="mt-4 space-y-2">
          <ServerSwitcher guilds={data?.guilds ?? []} currentId={guildId} />
          <SidebarSearch value={query} onChange={setQuery} />
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-2.5 pb-4">
        {filtered.length === 0 ? <p className="px-2 py-6 text-xs text-zinc-500">Nothing matches that search.</p> : null}
        {filtered.map((group) => {
          const collapsed = closedGroups[group.title] && !query;
          return (
            <div key={group.title} className="mb-3">
              <button
                type="button"
                onClick={() => toggleGroup(group.title)}
                className="flex w-full items-center justify-between px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600 hover:text-zinc-400"
              >
                {group.title}
                <ChevronDown className={cn("h-3 w-3 transition-transform", collapsed && "-rotate-90")} />
              </button>
              {!collapsed ? (
                <div className="mt-0.5 space-y-0.5">
                  {group.items.map((item) => (
                    <NavItemLink key={item.href} item={item} onNavigate={onNavigate} />
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </nav>

      <div className="border-t border-ink-800 p-2.5">
        <UserCard />
      </div>
    </div>
  );
}

function NavItemLink({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.href}
      end={item.end}
      onClick={onNavigate}
      className={({ isActive }) => cn("nav-link", isActive && "nav-link-active")}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{item.label}</span>
    </NavLink>
  );
}

function UserCard() {
  const session = useSession();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const user = session.data?.user;

  useEffect(() => {
    if (!open) return;
    const handler = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const signOut = async () => {
    await api.post("/auth/logout").catch(() => undefined);
    queryClient.clear();
    navigate("/login");
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-ink-800"
      >
        {user ? (
          <img src={user.avatarUrl} alt="" className="h-7 w-7 rounded-full border border-ink-700" />
        ) : (
          <div className="h-7 w-7 rounded-full bg-ink-700" />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-zinc-200">{user?.globalName ?? user?.username ?? "Loading"}</p>
          <p className="text-2xs text-zinc-500">Discord account</p>
        </div>
        <ChevronDown className="h-3.5 w-3.5 text-zinc-600" />
      </button>

      {open ? (
        <div className="absolute bottom-full left-0 right-0 z-50 mb-1.5 overflow-hidden rounded-xl border border-ink-600 bg-ink-850 p-1.5 shadow-pop">
          <Link
            to="/dashboard/settings"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-zinc-300 hover:bg-ink-750"
          >
            <Settings className="h-3.5 w-3.5" /> Account settings
          </Link>
          <Link
            to="/dashboard/status"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-zinc-300 hover:bg-ink-750"
          >
            <ShieldCheck className="h-3.5 w-3.5" /> Service status
          </Link>
          <button
            type="button"
            onClick={() => void signOut()}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-red-400 hover:bg-red-500/10"
          >
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}

function useNotifications() {
  return useQuery({
    queryKey: ["notifications"],
    queryFn: () => api.get<{ alerts: Alert[] }>("/notifications"),
    staleTime: 30_000,
  });
}

function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const query = useNotifications();
  const { isRead, markMany } = useReadAlerts();
  const alerts = query.data?.alerts ?? [];
  const unread = alerts.filter((alert) => !isRead(alert.id));

  useEffect(() => {
    if (!open) return;
    const handler = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="relative rounded-lg p-2 text-zinc-500 transition-colors hover:bg-ink-800 hover:text-zinc-200"
        aria-label="Notifications"
      >
        <Bell className="h-4 w-4" />
        {unread.length > 0 ? (
          <span className="absolute right-1 top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-accent px-0.5 text-[9px] font-semibold text-white">
            {unread.length > 9 ? "9+" : unread.length}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-xl border border-ink-600 bg-ink-850 shadow-pop">
          <div className="flex items-center justify-between border-b border-ink-700 px-3 py-2.5">
            <p className="text-xs font-semibold text-zinc-200">Notifications</p>
            <button
              type="button"
              className="text-2xs text-zinc-500 hover:text-zinc-300"
              onClick={() => markMany(alerts.map((alert) => alert.id))}
              disabled={alerts.length === 0}
            >
              Mark all read
            </button>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {alerts.length === 0 ? (
              <p className="px-3 py-8 text-center text-xs text-zinc-500">No alerts. Everything looks healthy.</p>
            ) : null}
            {alerts.slice(0, 8).map((alert) => (
              <Link
                key={alert.id}
                to="/dashboard/notifications"
                onClick={() => setOpen(false)}
                className="flex gap-2.5 border-b border-ink-800 px-3 py-2.5 last:border-0 hover:bg-ink-800/60"
              >
                <Dot
                  tone={
                    alert.severity === "critical" ? "danger" : alert.severity === "warning" ? "warning" : "success"
                  }
                />
                <div className="min-w-0">
                  <p className={cn("truncate text-xs", isRead(alert.id) ? "text-zinc-400" : "font-medium text-zinc-200")}>
                    {alert.title}
                  </p>
                  <p className="truncate text-2xs text-zinc-500">
                    {alert.guildName ? `${alert.guildName} · ` : ""}
                    {alert.createdAt ? relativeTime(alert.createdAt) : alert.description}
                  </p>
                </div>
              </Link>
            ))}
          </div>
          <Link
            to="/dashboard/notifications"
            onClick={() => setOpen(false)}
            className="block border-t border-ink-700 px-3 py-2 text-center text-2xs text-zinc-400 hover:text-zinc-200"
          >
            View all notifications
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function GlobalSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const guildId = guildIdFromPath(useLocation().pathname);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  const pages = useMemo(() => {
    const items = [...accountNav, ...(guildId ? serverNav(guildId) : [])].flatMap((group) => group.items);
    if (!query.trim()) return items.slice(0, 7);
    const term = query.toLowerCase();
    return items.filter((item) => item.label.toLowerCase().includes(term) || item.keywords?.toLowerCase().includes(term)).slice(0, 8);
  }, [guildId, query]);

  const commands = useQuery({
    queryKey: ["commands"],
    queryFn: () => api.get<{ commands: CommandInfo[] }>("/commands"),
    enabled: open,
    staleTime: 5 * 60_000,
  });

  const commandResults = (commands.data?.commands ?? [])
    .filter((command) => {
      if (!query.trim()) return false;
      const term = query.toLowerCase();
      return command.name.includes(term) || command.description.toLowerCase().includes(term);
    })
    .slice(0, 6);

  const results = [
    ...pages.map((item) => ({ kind: "page" as const, label: item.label, href: item.href, hint: "Page" })),
    ...commandResults.map((command) => ({
      kind: "command" as const,
      label: `/${command.name}`,
      href: `${guildId ? `/dashboard/server/${guildId}/commands` : "/dashboard"}?q=${encodeURIComponent(command.name)}`,
      hint: command.category,
    })),
  ];

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  useEffect(() => setActive(0), [query]);

  if (!open) return null;

  const go = (href: string) => {
    navigate(href);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Search INFERA">
      <div className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActive((value) => Math.min(value + 1, results.length - 1));
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setActive((value) => Math.max(value - 1, 0));
              }
              if (event.key === "Enter" && results[active]) {
                event.preventDefault();
                go(results[active].href);
              }
            }}
            placeholder="Search pages, modules and commands"
            className="input h-11 pl-10"
          />
        </div>
        <div className="max-h-[45vh] overflow-y-auto">
          {results.length === 0 ? (
            <p className="py-10 text-center text-xs text-zinc-500">No results. Try a module name or a command.</p>
          ) : null}
          {results.map((result, index) => (
            <button
              key={`${result.kind}-${result.label}`}
              type="button"
              onMouseEnter={() => setActive(index)}
              onClick={() => go(result.href)}
              className={cn(
                "flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left",
                index === active ? "bg-ink-750" : "hover:bg-ink-800",
              )}
            >
              <span className="flex items-center gap-2 text-sm text-zinc-200">
                {result.kind === "command" ? <Command className="h-3.5 w-3.5 text-zinc-500" /> : null}
                {result.label}
              </span>
              <Badge tone={result.kind === "command" ? "accent" : "neutral"}>{result.hint}</Badge>
            </button>
          ))}
        </div>
        <p className="text-2xs text-zinc-600">Use ↑ ↓ to move, Enter to open, Esc to close.</p>
      </div>
    </Modal>
  );
}

function Topbar({ onMenu, onSearch }: { onMenu: () => void; onSearch: () => void }) {
  const location = useLocation();
  const guildId = guildIdFromPath(location.pathname);
  const guilds = useGuilds();
  const session = useSession();
  const [userOpen, setUserOpen] = useState(false);
  const userRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const crumbs = useMemo(() => {
    const guild = guilds.data?.guilds.find((entry) => entry.id === guildId);
    const segments = location.pathname.split("/").filter(Boolean);
    const items: Array<{ label: string; href?: string }> = [{ label: "Dashboard", href: "/dashboard" }];
    if (guildId) {
      items.push({ label: guild?.name ?? "Server", href: `/dashboard/server/${guildId}` });
      const last = segments[segments.length - 1] ?? "";
      if (last !== guildId) {
        items.push({ label: pageLabels[last] ?? "Page" });
      }
    } else {
      const last = segments[segments.length - 1] ?? "";
      if (last && last !== "dashboard") items.push({ label: pageLabels[last] ?? last });
    }
    return items;
  }, [guildId, guilds.data, location.pathname]);

  useEffect(() => {
    if (!userOpen) return;
    const handler = (event: MouseEvent) => {
      if (userRef.current && !userRef.current.contains(event.target as Node)) setUserOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [userOpen]);

  const signOut = async () => {
    await api.post("/auth/logout").catch(() => undefined);
    queryClient.clear();
    navigate("/login");
  };

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-ink-800 bg-ink-900/85 px-4 backdrop-blur lg:px-7">
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          onClick={onMenu}
          className="rounded-lg p-2 text-zinc-500 hover:bg-ink-800 hover:text-zinc-200 lg:hidden"
          aria-label="Open navigation"
        >
          <Menu className="h-4 w-4" />
        </button>
        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-xs">
          {crumbs.map((crumb, index) => (
            <span key={`${crumb.label}-${index}`} className="flex min-w-0 items-center gap-1.5">
              {index > 0 ? <ChevronRight className="h-3 w-3 shrink-0 text-zinc-700" /> : null}
              {crumb.href ? (
                <Link to={crumb.href} className="truncate text-zinc-500 hover:text-zinc-300">
                  {crumb.label}
                </Link>
              ) : (
                <span className="truncate font-medium text-zinc-300">{crumb.label}</span>
              )}
            </span>
          ))}
        </nav>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={onSearch}
          className="hidden h-8 items-center gap-2 rounded-lg border border-ink-700 bg-ink-850 px-2.5 text-xs text-zinc-500 hover:border-ink-600 hover:text-zinc-300 sm:flex"
        >
          <Search className="h-3.5 w-3.5" />
          Search
          <span className="kbd">Ctrl K</span>
        </button>
        <NotificationBell />
        <div className="relative" ref={userRef}>
          <button
            type="button"
            onClick={() => setUserOpen((value) => !value)}
            className="flex items-center gap-1.5 rounded-lg p-1 hover:bg-ink-800"
            aria-label="Account menu"
          >
            {session.data?.user ? (
              <img src={session.data.user.avatarUrl} alt="" className="h-7 w-7 rounded-full border border-ink-700" />
            ) : (
              <div className="h-7 w-7 rounded-full bg-ink-700" />
            )}
            <ChevronDown className="hidden h-3 w-3 text-zinc-600 sm:block" />
          </button>
          {userOpen ? (
            <div className="absolute right-0 top-full z-50 mt-1.5 w-52 rounded-xl border border-ink-600 bg-ink-850 p-1.5 shadow-pop">
              <div className="border-b border-ink-700 px-2 py-2">
                <p className="truncate text-xs font-medium text-zinc-200">
                  {session.data?.user.globalName ?? session.data?.user.username}
                </p>
                <p className="text-2xs text-zinc-500">@{session.data?.user.username}</p>
              </div>
              <Link
                to="/dashboard/settings"
                onClick={() => setUserOpen(false)}
                className="mt-1 flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-zinc-300 hover:bg-ink-750"
              >
                <Settings className="h-3.5 w-3.5" /> Account settings
              </Link>
              <button
                type="button"
                onClick={() => void signOut()}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-red-400 hover:bg-red-500/10"
              >
                <LogOut className="h-3.5 w-3.5" /> Sign out
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}

export function AppShell() {
  const location = useLocation();
  const guildId = guildIdFromPath(location.pathname);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-ink-900">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[255px] border-r border-ink-800 bg-ink-850 lg:block">
        <SidebarContent guildId={guildId} />
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-[280px] flex-col border-r border-ink-700 bg-ink-850">
            <button
              type="button"
              className="absolute right-2 top-2 rounded-lg p-2 text-zinc-500 hover:bg-ink-800"
              onClick={() => setMobileOpen(false)}
              aria-label="Close navigation"
            >
              <X className="h-4 w-4" />
            </button>
            <SidebarContent guildId={guildId} onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      ) : null}

      <div className="lg:pl-[255px]">
        <Topbar onMenu={() => setMobileOpen(true)} onSearch={() => setSearchOpen(true)} />
        <main className="mx-auto w-full max-w-[1440px] px-4 pb-16 pt-5 lg:px-7">
          <Outlet />
        </main>
      </div>

      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
