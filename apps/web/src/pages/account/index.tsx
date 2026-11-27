import {
  Activity,
  ArrowRight,
  Bell,
  Bot,
  CheckCheck,
  Clock,
  Crown,
  Database,
  ExternalLink,
  Globe,
  KeyRound,
  LogOut,
  MonitorSmartphone,
  Palette,
  Plus,
  RefreshCw,
  Server,
  Shield,
  ShieldCheck,
  Terminal,
  UserRound,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { MetricCard, PageHeader, SectionHeader, StatGrid } from "../../components/cards";
import { GuildIcon } from "../../components/layout/ServerSwitcher";
import { Wordmark } from "../../components/layout/Logo";
import { alertIcon, severityTone } from "../../components/layout/NotificationCenter";
import { Avatar, Badge, Button, Callout, Card, CardHeader, Segmented, StatusDot, Unsupported } from "../../components/ui/primitives";
import { EmptyState, ErrorState, SkeletonRows } from "../../components/ui/states";
import { SearchInput } from "../../components/ui/table";
import { loginUrl } from "../../lib/api/client";
import { useGuildsQuery, useSessionQuery, useStatusQuery } from "../../lib/api/auth";
import { serverPath } from "../../lib/nav";
import { botInviteUrl, cn, formatDate, formatNumber, timeAgo } from "../../lib/utils";
import { useAuth } from "../../hooks/useAuth";
import { useNotifications } from "../../hooks/useNotifications";
import { useRealtime } from "../../hooks/useRealtime";

const NEXT_KEY = "infera:post-login";

// ------------------------------------------------------------------ Login

const OAUTH_ERRORS: Record<string, string> = {
  access_denied: "You cancelled the Discord authorization.",
  cancelled: "Sign-in was cancelled.",
  state_mismatch: "The sign-in request expired or was tampered with. Please try again.",
  oauth_failed: "Discord sign-in failed. Please try again in a moment.",
};

export function LoginPage() {
  const session = useSessionQuery();
  const [params] = useSearchParams();
  const error = params.get("error");
  const expired = params.get("expired");
  const next = params.get("next");

  if (session.data) return <Navigate to={next && next.startsWith("/dashboard") ? next : "/dashboard"} replace />;

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-ink-1000 px-4">
      <div className="pointer-events-none absolute inset-0 opacity-[0.35]" style={{ backgroundImage: "radial-gradient(circle at 50% 0%, rgba(139,92,246,0.18), transparent 55%)" }} />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{ backgroundImage: "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)", backgroundSize: "48px 48px", maskImage: "radial-gradient(circle at 50% 30%, black, transparent 70%)" }}
      />
      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Wordmark />
        </div>
        <div className="card p-6 shadow-pop">
          <h1 className="text-lg font-semibold text-zinc-50">Sign in to INFERA</h1>
          <p className="mt-1.5 text-13 leading-relaxed text-zinc-500">
            Use your Discord account. You'll see every server where you have the <span className="text-zinc-300">Manage Server</span> permission.
          </p>
          {error ? (
            <Callout tone="danger" className="mt-4">
              {OAUTH_ERRORS[error] ?? "Sign-in failed. Please try again."}
            </Callout>
          ) : null}
          {expired ? (
            <Callout tone="warning" className="mt-4">
              Your session expired. Sign in again to continue.
            </Callout>
          ) : null}
          <a
            href={loginUrl()}
            onClick={() => {
              if (next) window.sessionStorage.setItem(NEXT_KEY, next);
            }}
            className="btn mt-5 h-10 w-full bg-[#5865F2] text-white hover:bg-[#4752c4]"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.6 1.3a18.4 18.4 0 0 0-5.5 0L8.6 3a19.7 19.7 0 0 0-4.9 1.5A20.3 20.3 0 0 0 .1 18a19.9 19.9 0 0 0 6 3l1.3-2a12.9 12.9 0 0 1-2-1l.5-.4a14.2 14.2 0 0 0 12.2 0l.5.4c-.6.4-1.3.7-2 1l1.3 2a19.8 19.8 0 0 0 6-3 20.2 20.2 0 0 0-3.6-13.6ZM8 15.3c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Zm8 0c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Z" />
            </svg>
            Continue with Discord
          </a>
          <ul className="mt-5 space-y-2 border-t border-ink-700 pt-4 text-xs text-zinc-500">
            <li className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
              <span>Your session is an HttpOnly cookie — no tokens are stored in the browser.</span>
            </li>
            <li className="flex items-start gap-2">
              <KeyRound className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-500" />
              <span>
                INFERA requests the <span className="font-mono">identify</span> and <span className="font-mono">guilds</span> scopes only.
              </span>
            </li>
          </ul>
        </div>
        <p className="mt-6 text-center text-2xs text-zinc-600">
          <a href="https://infera.wtf" className="hover:text-zinc-400">infera.wtf</a> · One ecosystem. Complete control.
        </p>
      </div>
    </div>
  );
}

// --------------------------------------------------------- Account home

function ServerCard({ guild, clientId }: { guild: { id: string; name: string; icon: string | null; owner: boolean; botInstalled: boolean; botOnline: boolean; memberCount: number }; clientId: string | null }) {
  const body = (
    <>
      <div className="flex items-start gap-3">
        <GuildIcon guild={guild} size={44} />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 truncate text-sm font-medium text-zinc-100">
            <span className="truncate">{guild.name}</span>
            {guild.owner ? <Crown className="h-3.5 w-3.5 shrink-0 text-amber-400" aria-label="Owner" /> : null}
          </p>
          <p className="mt-1 text-xs text-zinc-500">{guild.botInstalled ? `${formatNumber(guild.memberCount)} members` : "INFERA not installed"}</p>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between">
        {guild.botInstalled ? (
          <Badge tone={guild.botOnline ? "success" : "warning"} dot>
            {guild.botOnline ? "Online" : "Offline"}
          </Badge>
        ) : (
          <Badge tone="neutral">Not installed</Badge>
        )}
        <span className="flex items-center gap-1 text-xs font-medium text-zinc-400 group-hover:text-zinc-100">
          {guild.botInstalled ? (
            <>
              Manage <ArrowRight className="h-3.5 w-3.5" />
            </>
          ) : (
            <>
              <Plus className="h-3.5 w-3.5" /> Add INFERA
            </>
          )}
        </span>
      </div>
    </>
  );
  const className = "card card-hover group block p-4";
  if (guild.botInstalled) return <Link to={serverPath(guild.id, "")} className={className}>{body}</Link>;
  return (
    <a href={clientId ? botInviteUrl(clientId, guild.id) : "#"} target="_blank" rel="noreferrer noopener" className={cn(className, "border-dashed")}>
      {body}
    </a>
  );
}

export function AccountHomePage() {
  const { user, clientId } = useAuth();
  const guilds = useGuildsQuery();
  const navigate = useNavigate();

  // Resume the page the user tried to open before signing in.
  useEffect(() => {
    const next = window.sessionStorage.getItem(NEXT_KEY);
    if (next) {
      window.sessionStorage.removeItem(NEXT_KEY);
      if (next.startsWith("/dashboard") && next !== "/dashboard") navigate(next, { replace: true });
    }
  }, [navigate]);

  const installed = guilds.data?.guilds.filter((guild) => guild.botInstalled) ?? [];
  const available = guilds.data?.guilds.filter((guild) => !guild.botInstalled) ?? [];
  const bot = guilds.data?.bot;

  return (
    <div>
      <PageHeader
        title={`Welcome back${user ? `, ${user.globalName ?? user.username}` : ""}`}
        description="Pick a server to manage, or add INFERA to another one."
        actions={
          clientId ? (
            <a href={botInviteUrl(clientId)} target="_blank" rel="noreferrer noopener" className="btn-primary">
              <Plus className="h-3.5 w-3.5" /> Add to a server
            </a>
          ) : null
        }
      />
      <StatGrid className="mb-8">
        <MetricCard label="Managed servers" value={installed.length} icon={Server} loading={guilds.isLoading} />
        <MetricCard label="Servers you can add" value={available.length} icon={Plus} loading={guilds.isLoading} />
        <MetricCard
          label="Bot status"
          value={bot ? (bot.online ? "Online" : "Offline") : null}
          icon={Bot}
          tone={bot?.online ? "success" : "warning"}
          loading={guilds.isLoading}
          hint={bot?.lastSeenAt ? `Heartbeat ${timeAgo(bot.lastSeenAt)}` : undefined}
        />
        <MetricCard label="Registered commands" value={bot?.commands ?? null} icon={Terminal} loading={guilds.isLoading} hint="Canonical commands reported by the bot" />
      </StatGrid>

      <SectionHeader title="Your servers" description="Servers with INFERA installed where you have Manage Server." action={<Link to="/dashboard/servers" className="btn-ghost btn-sm">View all</Link>} />
      {guilds.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="skeleton h-[118px]" />
          ))}
        </div>
      ) : guilds.error ? (
        <Card>
          <ErrorState error={guilds.error} onRetry={() => void guilds.refetch()} compact />
        </Card>
      ) : installed.length === 0 ? (
        <Card>
          <EmptyState
            icon={Server}
            title="INFERA isn't in any of your servers yet"
            description="Add INFERA to a server you manage to start configuring it here."
            action={clientId ? <a href={botInviteUrl(clientId)} target="_blank" rel="noreferrer noopener" className="btn-primary"><Plus className="h-3.5 w-3.5" /> Add INFERA</a> : undefined}
          />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {installed.map((guild) => (
            <ServerCard key={guild.id} guild={guild} clientId={clientId} />
          ))}
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------- Servers

export function ServersPage() {
  const guilds = useGuildsQuery();
  const { clientId } = useAuth();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "installed" | "available">("all");
  const list = useMemo(() => {
    const text = query.trim().toLowerCase();
    return (guilds.data?.guilds ?? [])
      .filter((guild) => (filter === "all" ? true : filter === "installed" ? guild.botInstalled : !guild.botInstalled))
      .filter((guild) => !text || guild.name.toLowerCase().includes(text))
      .sort((a, b) => Number(b.botInstalled) - Number(a.botInstalled) || a.name.localeCompare(b.name));
  }, [guilds.data, query, filter]);

  return (
    <div>
      <PageHeader
        title="Servers"
        icon={Server}
        description="Only servers where Discord reports you have Manage Server (or ownership) appear here. The API re-verifies this on every request."
        actions={
          <Button icon={<RefreshCw className="h-3.5 w-3.5" />} loading={guilds.isFetching} onClick={() => void guilds.refetch()}>
            Refresh
          </Button>
        }
      />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchInput value={query} onChange={setQuery} placeholder="Search servers" className="sm:w-72" />
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All" },
            { value: "installed", label: "Installed" },
            { value: "available", label: "Not installed" },
          ]}
        />
      </div>
      {guilds.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="skeleton h-[118px]" />
          ))}
        </div>
      ) : guilds.error ? (
        <Card>
          <ErrorState error={guilds.error} onRetry={() => void guilds.refetch()} />
        </Card>
      ) : list.length === 0 ? (
        <Card>
          <EmptyState icon={Server} title="No servers match" description="Try a different search or filter." />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((guild) => (
            <ServerCard key={guild.id} guild={guild} clientId={clientId} />
          ))}
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------------------------- Bot

export function BotsPage() {
  const guilds = useGuildsQuery();
  const status = useStatusQuery();
  const { clientId } = useAuth();
  const bot = guilds.data?.bot ?? status.data?.bot;
  return (
    <div>
      <PageHeader title="INFERA bot" icon={Bot} description="Connection and inventory for the INFERA bot application connected to this dashboard." />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Connection" description="Derived from the bot's database heartbeat (every 60 seconds)." icon={<Activity className="h-4 w-4" />} />
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <div>
              <p className="eyebrow">Status</p>
              <p className="mt-1.5 flex items-center gap-2 text-sm font-medium text-zinc-100">
                <StatusDot tone={bot?.online ? "success" : "danger"} pulse={bot?.online} />
                {bot ? (bot.online ? "Online" : "Offline") : "Unknown"}
              </p>
            </div>
            <div>
              <p className="eyebrow">Bot account</p>
              <p className="mt-1.5 font-mono text-13 text-zinc-200">{bot?.user ?? "—"}</p>
            </div>
            <div>
              <p className="eyebrow">Last heartbeat</p>
              <p className="mt-1.5 text-13 text-zinc-200">{bot?.lastSeenAt ? `${formatDate(bot.lastSeenAt)} (${timeAgo(bot.lastSeenAt)})` : "Never"}</p>
            </div>
            <div>
              <p className="eyebrow">Servers / commands</p>
              <p className="mt-1.5 text-13 text-zinc-200">
                {formatNumber(bot?.guilds)} servers · {formatNumber(bot?.commands)} commands
              </p>
            </div>
          </div>
        </Card>
        <Card>
          <CardHeader title="Invite" description="Add INFERA to another server." icon={<Plus className="h-4 w-4" />} />
          <div className="p-5">
            {clientId ? (
              <a href={botInviteUrl(clientId)} target="_blank" rel="noreferrer noopener" className="btn-primary w-full">
                <ExternalLink className="h-3.5 w-3.5" /> Open Discord invite
              </a>
            ) : (
              <p className="text-xs text-zinc-500">The API didn't return a client ID.</p>
            )}
            <p className="mt-3 text-xs leading-relaxed text-zinc-500">The invite requests Administrator so moderation, security and role features can work. You can reduce permissions in Discord afterwards.</p>
          </div>
        </Card>
      </div>
      <div className="mt-4">
        <Unsupported title="Multiple bot management isn't available">
          The backend runs a single INFERA application. Custom bot instances, shard controls and restarts are platform-owner operations without a dashboard API.
        </Unsupported>
      </div>
    </div>
  );
}

// --------------------------------------------------------- Notifications

export function NotificationsPage() {
  const { user } = useAuth();
  const notifications = useNotifications(user?.id, null);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const list = filter === "unread" ? notifications.unread : notifications.alerts;
  return (
    <div>
      <PageHeader
        title="Notifications"
        icon={Bell}
        description="Security alerts, bot disconnections, moderation queues and configuration warnings across your servers."
        actions={
          <>
            <Button icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={notifications.refetch}>
              Refresh
            </Button>
            <Button icon={<CheckCheck className="h-3.5 w-3.5" />} disabled={notifications.unread.length === 0} onClick={notifications.markAllRead}>
              Mark all read
            </Button>
          </>
        }
      />
      <div className="mb-4">
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: `All (${notifications.alerts.length})` },
            { value: "unread", label: `Unread (${notifications.unread.length})` },
          ]}
        />
      </div>
      <Card>
        {notifications.isLoading ? (
          <SkeletonRows className="p-4" />
        ) : notifications.error && notifications.alerts.length === 0 ? (
          <ErrorState error={notifications.error} onRetry={notifications.refetch} />
        ) : list.length === 0 ? (
          <EmptyState icon={Bell} title={filter === "unread" ? "No unread notifications" : "No notifications"} description="When INFERA needs your attention, it shows up here." />
        ) : (
          <ul className="divide-y divide-ink-700/70">
            {list.map((alert) => {
              const Icon = alertIcon(alert);
              const read = notifications.isRead(alert.id);
              return (
                <li key={alert.id} className={cn("flex items-start gap-3 px-5 py-4", read && "opacity-60")}>
                  <span className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border", severityTone(alert.severity))}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-13 font-medium capitalize text-zinc-100">{alert.title}</p>
                      <Badge tone={alert.severity === "critical" || alert.severity === "high" ? "danger" : alert.severity === "warning" || alert.severity === "medium" ? "warning" : "info"}>{alert.severity}</Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-zinc-500">{alert.description}</p>
                    <p className="mt-1 text-2xs text-zinc-600">
                      {alert.guildName ? (
                        <Link to={serverPath(alert.guildId!, "security")} className="hover:text-zinc-300">
                          {alert.guildName}
                        </Link>
                      ) : null}
                      {alert.guildName ? " · " : ""}
                      {alert.createdAt ? timeAgo(alert.createdAt) : "Ongoing"}
                    </p>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => (read ? notifications.markUnread(alert.id) : notifications.markRead([alert.id]))}>
                    {read ? "Mark unread" : "Mark read"}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      <p className="mt-3 text-2xs text-zinc-600">Read state is stored in this browser — the INFERA API doesn't persist notification reads yet.</p>
    </div>
  );
}

// ----------------------------------------------------------------- Status

export function StatusPage() {
  const status = useStatusQuery();
  const realtime = useRealtime();
  const icons: Record<string, typeof Server> = { api: Globe, database: Database, bot: Bot };
  return (
    <div>
      <PageHeader
        title="Service status"
        icon={Activity}
        description="Live health of the INFERA platform components this dashboard depends on."
        actions={
          <Button icon={<RefreshCw className="h-3.5 w-3.5" />} loading={status.isFetching} onClick={() => void status.refetch()}>
            Check now
          </Button>
        }
      />
      {status.isLoading ? (
        <SkeletonRows rows={4} />
      ) : status.error ? (
        <Card>
          <ErrorState error={status.error} onRetry={() => void status.refetch()} />
        </Card>
      ) : status.data ? (
        <>
          <Card className={cn("mb-4 flex items-center gap-4 p-5", status.data.status === "operational" ? "border-emerald-500/20" : "border-amber-500/25")}>
            <StatusDot tone={status.data.status === "operational" ? "success" : "warning"} pulse />
            <div>
              <p className="text-sm font-semibold text-zinc-100">{status.data.status === "operational" ? "All systems operational" : "Degraded performance"}</p>
              <p className="text-xs text-zinc-500">
                Checked {timeAgo(status.data.checkedAt)} · API v{status.data.version}
              </p>
            </div>
          </Card>
          <Card>
            <ul className="divide-y divide-ink-700/70">
              {status.data.components.map((component) => {
                const Icon = icons[component.id] ?? Server;
                const ok = component.status === "operational";
                return (
                  <li key={component.id} className="flex items-center gap-3 px-5 py-4">
                    <Icon className="h-4 w-4 text-zinc-500" />
                    <span className="flex-1 text-13 text-zinc-200">{component.name}</span>
                    <Badge tone={ok ? "success" : component.status === "down" ? "danger" : "warning"} dot>
                      {component.status}
                    </Badge>
                  </li>
                );
              })}
              <li className="flex items-center gap-3 px-5 py-4">
                <MonitorSmartphone className="h-4 w-4 text-zinc-500" />
                <span className="flex-1 text-13 text-zinc-200">Realtime connection (this browser)</span>
                <Badge tone={realtime.status === "open" ? "success" : realtime.status === "reconnecting" ? "warning" : "neutral"} dot>
                  {realtime.status}
                </Badge>
              </li>
            </ul>
          </Card>
        </>
      ) : null}
    </div>
  );
}

// --------------------------------------------------------- Account settings

export function AccountSettingsPage() {
  const { user, session, signOut, signingOut } = useAuth();
  if (!user || !session) return null;
  return (
    <div className="space-y-4">
      <PageHeader title="Account settings" icon={UserRound} description="Your INFERA dashboard account, which is linked to your Discord identity." />

      <Card>
        <CardHeader title="Profile" description="Pulled from Discord when you signed in." icon={<UserRound className="h-4 w-4" />} />
        <div className="flex items-center gap-4 p-5">
          <Avatar src={user.avatarUrl} name={user.globalName ?? user.username} size={56} />
          <div>
            <p className="text-base font-semibold text-zinc-100">{user.globalName ?? user.username}</p>
            <p className="text-13 text-zinc-500">@{user.username}</p>
            <p className="mt-1 font-mono text-2xs text-zinc-600">{user.id}</p>
          </div>
        </div>
      </Card>

      <Card>
        <div id="discord" />
        <CardHeader title="Discord account" description="Connected through Discord OAuth2." icon={<Shield className="h-4 w-4" />} />
        <div className="grid gap-4 p-5 sm:grid-cols-3">
          <div>
            <p className="eyebrow">Connection</p>
            <p className="mt-1.5"><Badge tone="success" dot>Connected</Badge></p>
          </div>
          <div>
            <p className="eyebrow">Locale</p>
            <p className="mt-1.5 text-13 text-zinc-200">{user.locale ?? "—"}</p>
          </div>
          <div>
            <p className="eyebrow">Scopes</p>
            <p className="mt-1.5 font-mono text-xs text-zinc-300">identify guilds</p>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Session" description="Sessions are HttpOnly cookies and expire automatically." icon={<Clock className="h-4 w-4" />} />
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <div>
            <p className="eyebrow">Signed in</p>
            <p className="mt-1.5 text-13 text-zinc-200">{formatDate(session.createdAt)}</p>
          </div>
          <div>
            <p className="eyebrow">Expires</p>
            <p className="mt-1.5 text-13 text-zinc-200">{formatDate(session.expiresAt)}</p>
          </div>
        </div>
        <div className="border-t border-ink-700 px-5 py-4">
          <Unsupported title="Managing other sessions isn't available">
            The API can revoke the current session (sign out) but has no endpoint to list or revoke your other devices.
          </Unsupported>
        </div>
      </Card>

      <Card>
        <CardHeader title="Appearance" icon={<Palette className="h-4 w-4" />} />
        <div className="p-5">
          <p className="text-13 text-zinc-200">Dark theme</p>
          <p className="mt-0.5 text-xs text-zinc-500">The INFERA dashboard uses a single dark theme designed for long sessions. There are no other appearance options yet.</p>
        </div>
      </Card>

      <Card>
        <CardHeader title="Notification preferences" icon={<Bell className="h-4 w-4" />} />
        <div className="p-5">
          <Unsupported title="Notification preferences aren't stored by the backend">
            All alerts derived by the API are shown. Per-user preferences (email, muting categories) need a backend endpoint.
          </Unsupported>
        </div>
      </Card>

      <Card>
        <CardHeader title="Security" icon={<KeyRound className="h-4 w-4" />} />
        <div className="space-y-3 p-5">
          <Unsupported title="Account deletion isn't available">
            There's no backend process for deleting an INFERA account yet. Signing out revokes this session immediately.
          </Unsupported>
          <Button variant="danger" icon={<LogOut className="h-3.5 w-3.5" />} loading={signingOut} onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
      </Card>
    </div>
  );
}
