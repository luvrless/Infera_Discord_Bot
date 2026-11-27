import { ChevronRight, LogOut, Menu, Search, Settings, UserRound } from "lucide-react";
import { Suspense, useEffect, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useGuildsQuery } from "../../lib/api/auth";
import { guildIdFromPath, labelForPath, serverPath } from "../../lib/nav";
import { cn } from "../../lib/utils";
import { useAuth } from "../../hooks/useAuth";
import { useRealtime } from "../../hooks/useRealtime";
import { Avatar, StatusDot, useClickOutside } from "../ui/primitives";
import { PageSkeleton } from "../ui/states";
import { CommandPalette } from "./CommandPalette";
import { NotificationCenter } from "./NotificationCenter";
import { MenuItem, Sidebar } from "./Sidebar";

const ACCOUNT_LABELS: Record<string, string> = {
  "": "Overview",
  servers: "Servers",
  bots: "Bot",
  notifications: "Notifications",
  status: "Service Status",
  settings: "Account Settings",
};

function Breadcrumbs({ guildId }: { guildId: string | null }) {
  const location = useLocation();
  const guilds = useGuildsQuery();
  const crumbs: Array<{ label: string; to?: string }> = [{ label: "Dashboard", to: "/dashboard" }];
  if (guildId) {
    const guild = guilds.data?.guilds.find((entry) => entry.id === guildId);
    const relative = location.pathname.split(`/server/${guildId}`)[1]?.replace(/^\/|\/$/g, "") ?? "";
    crumbs.push({ label: guild?.name ?? "Server", to: serverPath(guildId, "") });
    if (relative) crumbs.push({ label: labelForPath(relative) ?? relative.split("/").pop()!.replace(/-/g, " ") });
  } else {
    const relative = location.pathname.replace(/^\/dashboard\/?/, "").replace(/\/$/, "");
    if (relative) crumbs.push({ label: ACCOUNT_LABELS[relative] ?? relative });
  }
  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1 text-13">
        {crumbs.map((crumb, index) => {
          const last = index === crumbs.length - 1;
          return (
            <li key={`${crumb.label}-${index}`} className={cn("flex min-w-0 items-center gap-1", index < crumbs.length - 2 && "hidden sm:flex")}>
              {index > 0 ? <ChevronRight className="h-3.5 w-3.5 shrink-0 text-zinc-600" /> : null}
              {crumb.to && !last ? (
                <Link to={crumb.to} className="truncate text-zinc-500 hover:text-zinc-200">
                  {crumb.label}
                </Link>
              ) : (
                <span aria-current={last ? "page" : undefined} className="truncate font-medium capitalize text-zinc-100">
                  {crumb.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function RealtimeIndicator() {
  const { status, subscribedGuild } = useRealtime();
  const tone = status === "open" ? "success" : status === "reconnecting" || status === "connecting" ? "warning" : "neutral";
  const label =
    status === "open"
      ? subscribedGuild
        ? "Live updates on"
        : "Connected"
      : status === "reconnecting"
        ? "Reconnecting…"
        : status === "connecting"
          ? "Connecting…"
          : status === "unauthorized"
            ? "Live updates need sign-in"
            : "Live updates off";
  return (
    <span className="hidden items-center gap-1.5 rounded-md border border-ink-700 px-2 py-1 text-2xs text-zinc-500 md:inline-flex" title={label}>
      <StatusDot tone={tone} pulse={status === "open" && Boolean(subscribedGuild)} />
      {label}
    </span>
  );
}

function AccountMenu() {
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useClickOutside<HTMLDivElement>(open, () => setOpen(false));
  const navigate = useNavigate();
  if (!user) return null;
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((value) => !value)} aria-label="Account menu" aria-expanded={open} className="rounded-full focus-visible:ring-2 focus-visible:ring-accent/60">
        <Avatar src={user.avatarUrl} name={user.globalName ?? user.username} size={30} />
      </button>
      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-56 animate-fade-in overflow-hidden rounded-xl border border-ink-600 bg-ink-800 p-1 shadow-pop" role="menu">
          <div className="px-2.5 py-2">
            <p className="truncate text-13 font-medium text-zinc-100">{user.globalName ?? user.username}</p>
            <p className="truncate text-2xs text-zinc-500">@{user.username}</p>
          </div>
          <div className="my-1 border-t border-ink-700" />
          <MenuItem icon={Settings} label="Account settings" onClick={() => { setOpen(false); navigate("/dashboard/settings"); }} />
          <MenuItem icon={UserRound} label="Connected account" onClick={() => { setOpen(false); navigate("/dashboard/settings#discord"); }} />
          <div className="my-1 border-t border-ink-700" />
          <MenuItem icon={LogOut} label="Sign out" danger onClick={() => void signOut()} />
        </div>
      ) : null}
    </div>
  );
}

export function AppShell() {
  const location = useLocation();
  const guildId = guildIdFromPath(location.pathname);
  const { user } = useAuth();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((value) => !value);
      }
      if (event.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes((event.target as HTMLElement).tagName)) {
        event.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => setMobileOpen(false), [location.pathname]);
  useEffect(() => window.scrollTo({ top: 0 }), [location.pathname]);

  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

  return (
    <div className="min-h-screen bg-ink-950">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-lg focus:bg-accent focus:px-3 focus:py-2 focus:text-white">
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[255px] border-r border-ink-700 bg-ink-900 lg:block">
        <Sidebar guildId={guildId} />
      </aside>

      {/* Mobile / tablet drawer */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 animate-fade-in bg-black/70" onClick={() => setMobileOpen(false)} aria-hidden />
          <aside className="absolute inset-y-0 left-0 w-[280px] max-w-[85vw] animate-slide-in-left border-r border-ink-700 bg-ink-900">
            <Sidebar guildId={guildId} onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      ) : null}

      <div className="lg:pl-[255px]">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-ink-700 bg-ink-950/85 px-4 backdrop-blur-md sm:px-6">
          <button type="button" onClick={() => setMobileOpen(true)} aria-label="Open navigation" className="btn-icon -ml-1 lg:hidden">
            <Menu className="h-4 w-4" />
          </button>
          <div className="min-w-0 flex-1">
            <Breadcrumbs guildId={guildId} />
          </div>
          <div className="flex items-center gap-2">
            <RealtimeIndicator />
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="hidden h-8 w-60 items-center gap-2 rounded-lg border border-ink-700 bg-ink-900 px-2.5 text-xs text-zinc-500 transition-colors hover:border-ink-600 hover:text-zinc-300 md:flex"
            >
              <Search className="h-3.5 w-3.5" />
              <span className="flex-1 text-left">Search…</span>
              <kbd className="kbd">{isMac ? "⌘" : "Ctrl"}</kbd>
              <kbd className="kbd">K</kbd>
            </button>
            <button type="button" onClick={() => setPaletteOpen(true)} aria-label="Search" className="btn-icon md:hidden">
              <Search className="h-4 w-4" />
            </button>
            <NotificationCenter userId={user?.id} guildId={guildId} />
            <AccountMenu />
          </div>
        </header>

        <main id="main" className="mx-auto w-full max-w-[1400px] px-4 pb-28 pt-6 sm:px-6 lg:px-8">
          <Suspense fallback={<PageSkeleton />}>
            <Outlet />
          </Suspense>
        </main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} guildId={guildId} />
    </div>
  );
}
