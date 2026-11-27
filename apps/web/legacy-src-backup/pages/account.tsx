import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  ArrowRight,
  Bell,
  Bot,
  CheckCheck,
  Copy,
  ExternalLink,
  LogOut,
  Server,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { useGuilds, useSession, qk } from "../lib/hooks";
import type { Alert, GuildListItem, StatusResponse } from "../lib/types";
import { useReadAlerts } from "../lib/useReadAlerts";
import { cn, compactNumber, formatDate, guildIconUrl, installUrl, relativeTime } from "../lib/utils";
import { useToast } from "../components/Toast";
import {
  Badge,
  Button,
  Card,
  Dot,
  EmptyState,
  ErrorState,
  InfoNote,
  PageHeader,
  Skeleton,
  Stat,
} from "../components/ui";

/* ------------------------------------------------------------------- login */

const loginErrors: Record<string, string> = {
  cancelled: "Discord sign-in was cancelled.",
  state_mismatch: "The sign-in session expired. Please try again.",
  oauth_failed: "Discord sign-in failed. Check the OAuth redirect URI in the Discord developer portal.",
  access_denied: "You declined the Discord authorization request.",
};

export function LoginPage() {
  const session = useSession();
  const [params] = useSearchParams();
  const error = params.get("error");

  if (session.data) return <Navigate to="/dashboard" replace />;

  return (
    <div className="grid min-h-screen bg-ink-900 lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden flex-col justify-between overflow-hidden border-r border-ink-800 p-10 lg:flex">
        <div className="pointer-events-none absolute -left-32 top-1/3 h-80 w-80 rounded-full bg-accent/10 blur-3xl" />
        <div className="relative">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-accent/30 bg-accent/15">
              <span className="text-sm font-bold text-accent-soft">IN</span>
            </div>
            <div>
              <p className="text-base font-semibold tracking-[0.14em] text-zinc-100">INFERA</p>
              <p className="text-[9px] uppercase tracking-[0.22em] text-zinc-600">One ecosystem. Complete control.</p>
            </div>
          </div>
          <h1 className="mt-16 max-w-md text-4xl font-semibold leading-tight tracking-tight text-zinc-50">
            The control room for your Discord community.
          </h1>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-zinc-500">
            Configure moderation, automod, welcome flows, leveling and security from one dashboard. Every change is
            written to the same configuration the bot reads — no separate settings to drift apart.
          </p>
          <ul className="mt-8 space-y-3 text-sm text-zinc-400">
            {[
              "Moderation cases, warnings and appeals",
              "Automod rules with a live tester",
              "Welcome, goodbye and autoroles with preview",
              "Leveling, leaderboards and role rewards",
              "Antinuke, antiraid and whitelists",
              "Real analytics from stored activity",
            ].map((item) => (
              <li key={item} className="flex items-center gap-2.5">
                <ShieldCheck className="h-4 w-4 text-accent-soft" />
                {item}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-2xs text-zinc-600">INFERA · api.infera.wtf · infera.wtf</p>
      </div>

      <div className="flex items-center justify-center px-5 py-16">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-accent/30 bg-accent/15">
              <span className="text-sm font-bold text-accent-soft">IN</span>
            </div>
            <div>
              <p className="text-base font-semibold tracking-[0.14em] text-zinc-100">INFERA</p>
              <p className="text-[9px] uppercase tracking-[0.22em] text-zinc-600">Dashboard</p>
            </div>
          </div>
          <h2 className="text-2xl font-semibold tracking-tight text-zinc-50">Sign in</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Use your Discord account. Only servers where you can manage settings are shown.
          </p>

          {error ? (
            <div className="mt-5 rounded-lg border border-red-500/25 bg-red-500/5 px-3.5 py-2.5 text-xs text-red-300">
              {loginErrors[error] ?? `Discord sign-in failed (${error}).`}
            </div>
          ) : null}

          <a
            href={import.meta.env.DEV ? "http://localhost:3001/v1/auth/discord" : "/v1/auth/discord"}
            className="btn-primary mt-6 h-11 w-full text-sm"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
              <path d="M20.317 4.369a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.6 12.6 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.056 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.1 13.1 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.009c.12.099.246.198.373.292a.077.077 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.029ZM8.02 15.331c-1.182 0-2.157-1.085-2.157-2.419 0-1.333.955-2.418 2.157-2.418 1.21 0 2.176 1.095 2.157 2.418 0 1.334-.955 2.419-2.157 2.419Zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.418 2.157-2.418 1.21 0 2.176 1.095 2.157 2.418 0 1.334-.946 2.419-2.157 2.419Z" />
            </svg>
            Continue with Discord
          </a>

          <p className="mt-4 text-center text-2xs leading-relaxed text-zinc-600">
            Sessions are stored server-side with HttpOnly cookies. INFERA never exposes the bot token to your browser.
          </p>

          <div className="mt-8 border-t border-ink-800 pt-5 text-2xs text-zinc-600">
            <p>
              The bot must be invited to a server before its settings can be managed.{" "}
              <Link to="/dashboard/servers" className="text-zinc-400 hover:text-zinc-200">
                Add INFERA
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- server card */

function ServerCard({ guild, clientId }: { guild: GuildListItem; clientId?: string }) {
  return (
    <Card className="group flex flex-col p-4 transition-colors hover:border-ink-600">
      <div className="flex items-start gap-3">
        <img src={guildIconUrl(guild.id, guild.icon, 96)} alt="" className="h-11 w-11 rounded-xl border border-ink-700" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-zinc-100">{guild.name}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-2xs text-zinc-500">
            <Dot tone={guild.botInstalled ? (guild.botOnline ? "success" : "warning") : "neutral"} />
            {guild.botInstalled
              ? guild.botOnline
                ? "INFERA online"
                : "Bot installed, offline"
              : "Not installed"}
            {guild.owner ? " · Owner" : ""}
          </p>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-ink-700/70 pt-3">
        <span className="text-2xs text-zinc-500">
          {guild.botInstalled ? `${guild.memberCount.toLocaleString()} members` : "Add the bot to get started"}
        </span>
        {guild.botInstalled ? (
          <Link to={`/dashboard/server/${guild.id}`} className="btn-secondary h-7 px-2.5 text-xs">
            Manage
            <ArrowRight className="h-3 w-3" />
          </Link>
        ) : clientId ? (
          <a href={installUrl(clientId)} target="_blank" rel="noreferrer" className="btn-primary h-7 px-2.5 text-xs">
            Add INFERA
          </a>
        ) : null}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------ account home */

export function AccountHomePage() {
  const session = useSession();
  const guilds = useGuilds();
  const status = useQuery({
    queryKey: qk.status,
    queryFn: () => api.get<StatusResponse>("/status"),
    staleTime: 30_000,
  });
  const notifications = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api.get<{ alerts: Alert[] }>("/notifications"),
    staleTime: 30_000,
  });
  const { isRead } = useReadAlerts();

  const installed = guilds.data?.guilds.filter((guild) => guild.botInstalled) ?? [];
  const manageable = guilds.data?.guilds ?? [];
  const unread = (notifications.data?.alerts ?? []).filter((alert) => !isRead(alert.id));

  return (
    <div>
      <PageHeader
        title={`Welcome back${session.data ? `, ${session.data.user.globalName ?? session.data.user.username}` : ""}`}
        description="Your servers, INFERA's health and everything that needs attention."
        actions={
          <Link to="/dashboard/servers" className="btn-secondary">
            <Server className="h-3.5 w-3.5" />
            All servers
          </Link>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Manageable servers" value={manageable.length} icon={<Server className="h-4 w-4" />} />
        <Stat
          label="INFERA installed"
          value={installed.length}
          hint={`${installed.filter((guild) => guild.botOnline).length} reporting online`}
          icon={<Bot className="h-4 w-4" />}
        />
        <Stat
          label="Bot status"
          value={status.data?.bot.online ? "Online" : "Offline"}
          hint={status.data?.bot.lastSeenAt ? `Last heartbeat ${relativeTime(status.data.bot.lastSeenAt)}` : "No heartbeat yet"}
          icon={<Activity className="h-4 w-4" />}
        />
        <Stat
          label="Unread alerts"
          value={unread.length}
          hint={`${notifications.data?.alerts.length ?? 0} total signals`}
          icon={<Bell className="h-4 w-4" />}
        />
      </div>

      <div className="mt-6 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-200">Your servers</h2>
        <Link to="/dashboard/servers" className="text-xs text-zinc-500 hover:text-zinc-300">
          View all
        </Link>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {guilds.isLoading ? (
          Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-[132px]" />)
        ) : null}
        {!guilds.isLoading && manageable.length === 0 ? (
          <Card className="md:col-span-2 xl:col-span-3">
            <EmptyState
              icon={<Server className="h-6 w-6" />}
              title="No servers you can manage"
              description="You need the Manage Server permission on Discord, or you need to be the server owner."
            />
          </Card>
        ) : null}
        {manageable.slice(0, 6).map((guild) => (
          <ServerCard key={guild.id} guild={guild} clientId={session.data?.clientId} />
        ))}
      </div>

      <div className="mt-6 grid gap-3 lg:grid-cols-3">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-zinc-200">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
            Service health
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            {status.data?.components.filter((component) => component.status === "operational").length ?? 0} of{" "}
            {status.data?.components.length ?? 0} components operational.
          </p>
          <Link to="/dashboard/status" className="mt-3 inline-flex items-center gap-1 text-xs text-accent-soft hover:text-accent">
            Open status <ArrowRight className="h-3 w-3" />
          </Link>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-zinc-200">
            <Bell className="h-4 w-4 text-accent-soft" />
            Signals
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            {unread.length === 0 ? "No unresolved alerts across your servers." : `${unread.length} unresolved alert${unread.length === 1 ? "" : "s"}.`}
          </p>
          <Link to="/dashboard/notifications" className="mt-3 inline-flex items-center gap-1 text-xs text-accent-soft hover:text-accent">
            Review alerts <ArrowRight className="h-3 w-3" />
          </Link>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-zinc-200">
            <Sparkles className="h-4 w-4 text-accent-soft" />
            Configuration
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            Pick a server to manage modules, moderation, engagement and security.
          </p>
          <Link to="/dashboard/servers" className="mt-3 inline-flex items-center gap-1 text-xs text-accent-soft hover:text-accent">
            Choose a server <ArrowRight className="h-3 w-3" />
          </Link>
        </Card>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- servers */

export function ServersPage() {
  const session = useSession();
  const guilds = useGuilds();
  const [query, setQuery] = useState("");

  const filtered = (guilds.data?.guilds ?? []).filter((guild) =>
    guild.name.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div>
      <PageHeader
        title="Servers"
        description="Every server where you have the Manage Server permission. Installing INFERA unlocks configuration."
        actions={
          session.data?.clientId ? (
            <a href={installUrl(session.data.clientId)} target="_blank" rel="noreferrer" className="btn-primary">
              <ExternalLink className="h-3.5 w-3.5" />
              Add INFERA
            </a>
          ) : null
        }
      />
      <div className="mb-4 max-w-xs">
        <input
          className="input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search your servers"
          type="search"
        />
      </div>
      {guilds.isError ? <ErrorState error={guilds.error} onRetry={() => void guilds.refetch()} /> : null}
      {guilds.isLoading ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-[132px]" />
          ))}
        </div>
      ) : null}
      {!guilds.isLoading && filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Server className="h-6 w-6" />}
            title={query ? "No servers match that search" : "No manageable servers"}
            description={query ? "Try a different name." : "You need Manage Server on Discord to see a server here."}
          />
        </Card>
      ) : null}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((guild) => (
          <ServerCard key={guild.id} guild={guild} clientId={session.data?.clientId} />
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- settings */

export function SettingsPage() {
  const session = useSession();
  const navigate = useNavigate();
  const { push } = useToast();
  const [signingOut, setSigningOut] = useState(false);
  const user = session.data?.user;

  const signOut = async () => {
    setSigningOut(true);
    await api.post("/auth/logout").catch(() => undefined);
    navigate("/login");
  };

  return (
    <div>
      <PageHeader title="Account settings" description="Your Discord identity and dashboard session." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <div className="flex items-center gap-3">
            {user ? <img src={user.avatarUrl} alt="" className="h-14 w-14 rounded-full border border-ink-700" /> : null}
            <div>
              <p className="text-base font-semibold text-zinc-100">{user?.globalName ?? user?.username}</p>
              <p className="text-xs text-zinc-500">@{user?.username}</p>
            </div>
          </div>
          <dl className="mt-5 space-y-3 text-sm">
            <div className="flex items-center justify-between gap-4">
              <dt className="text-xs text-zinc-500">Discord ID</dt>
              <dd className="flex items-center gap-1.5 font-mono text-xs text-zinc-300">
                {user?.id}
                <button
                  type="button"
                  className="text-zinc-500 hover:text-zinc-200"
                  onClick={() => {
                    if (!user) return;
                    void navigator.clipboard.writeText(user.id);
                    push({ title: "Copied Discord ID", tone: "success" });
                  }}
                  aria-label="Copy Discord ID"
                >
                  <Copy className="h-3 w-3" />
                </button>
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-xs text-zinc-500">Locale</dt>
              <dd className="text-xs text-zinc-300">{user?.locale ?? "—"}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-xs text-zinc-500">Signed in</dt>
              <dd className="text-xs text-zinc-300">{formatDate(session.data?.createdAt)}</dd>
            </div>
          </dl>
        </Card>

        <Card className="p-5">
          <h2 className="text-sm font-semibold text-zinc-200">Session</h2>
          <p className="mt-1 text-xs text-zinc-500">
            OAuth tokens are encrypted on the server. The dashboard only receives an HttpOnly session cookie.
          </p>
          <div className="mt-4 rounded-lg border border-ink-700 bg-ink-850 px-3 py-2.5 text-xs text-zinc-400">
            Session expires {formatDate(session.data?.expiresAt)}
          </div>
          <Button variant="secondary" className="mt-4" onClick={() => void signOut()} loading={signingOut}>
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </Button>
          <div className="mt-6">
            <InfoNote tone="warning">
              <span className="flex items-start gap-2">
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                The bot token and client secret belong in the server <code className="font-mono">.env</code> only. Never
                paste them into the dashboard, a browser console or a support ticket.
              </span>
            </InfoNote>
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- status */

export function StatusPage() {
  const query = useQuery({
    queryKey: qk.status,
    queryFn: () => api.get<StatusResponse>("/status"),
    refetchInterval: 30_000,
  });

  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  const data = query.data;

  return (
    <div>
      <PageHeader
        title="Service status"
        description="Live infrastructure health, read from the bot heartbeat and database."
        actions={
          <Badge tone={data?.status === "operational" ? "success" : "warning"}>
            {data?.status === "operational" ? "All systems operational" : "Degraded"}
          </Badge>
        }
      />
      <div className="grid gap-3 md:grid-cols-3">
        {(data?.components ?? []).map((component) => (
          <Card key={component.id} className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-zinc-200">{component.name}</p>
              <Dot tone={component.status === "operational" ? "success" : "danger"} />
            </div>
            <p className="mt-1 text-xs capitalize text-zinc-500">{component.status}</p>
          </Card>
        ))}
        {!data ? <Skeleton className="h-24" /> : null}
      </div>

      <Card className="mt-4 p-5">
        <h2 className="text-sm font-semibold text-zinc-200">Discord bot</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-2xs uppercase tracking-wide text-zinc-500">Status</p>
            <p className={cn("mt-1 text-sm", data?.bot.online ? "text-emerald-400" : "text-red-400")}>
              {data?.bot.online ? "Connected" : "Offline"}
            </p>
          </div>
          <div>
            <p className="text-2xs uppercase tracking-wide text-zinc-500">Account</p>
            <p className="mt-1 text-sm text-zinc-300">{data?.bot.user ?? "—"}</p>
          </div>
          <div>
            <p className="text-2xs uppercase tracking-wide text-zinc-500">Servers</p>
            <p className="mt-1 text-sm text-zinc-300">{data?.bot.guilds ?? 0}</p>
          </div>
          <div>
            <p className="text-2xs uppercase tracking-wide text-zinc-500">Commands</p>
            <p className="mt-1 text-sm text-zinc-300">{compactNumber(data?.bot.commands ?? 0)}</p>
          </div>
        </div>
        <p className="mt-4 text-2xs text-zinc-600">
          Last heartbeat: {data?.bot.lastSeenAt ? relativeTime(data.bot.lastSeenAt) : "never"} · Checked{" "}
          {data ? formatDate(data.checkedAt) : "—"} · API v{data?.version ?? "—"}
        </p>
      </Card>
    </div>
  );
}

/* ---------------------------------------------------------- notifications */

export function NotificationsPage() {
  const query = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api.get<{ alerts: Alert[] }>("/notifications"),
    staleTime: 30_000,
  });
  const { isRead, markRead, markAll } = useReadAlerts();
  const alerts = query.data?.alerts ?? [];
  const unread = alerts.filter((alert) => !isRead(alert.id));

  const tone = (severity: string) =>
    severity === "critical" || severity === "high"
      ? "border-l-red-500"
      : severity === "warning" || severity === "medium"
        ? "border-l-amber-500"
        : "border-l-accent";

  return (
    <div>
      <PageHeader
        title="Notifications"
        description="Security events, bot health and incomplete configuration across your servers."
        actions={
          <Button variant="secondary" onClick={() => markAll(alerts.map((alert) => alert.id))} disabled={alerts.length === 0}>
            <CheckCheck className="h-3.5 w-3.5" />
            Mark all read
          </Button>
        }
      />
      {query.isError ? <ErrorState error={query.error} onRetry={() => void query.refetch()} /> : null}
      {alerts.length === 0 && !query.isLoading ? (
        <Card>
          <EmptyState icon={<Bell className="h-6 w-6" />} title="No notifications" description="Nothing needs attention right now." />
        </Card>
      ) : null}
      <div className="space-y-2">
        {alerts.map((alert) => (
          <Card
            key={alert.id}
            className={cn("border-l-2 p-4", tone(alert.severity), !isRead(alert.id) && "bg-ink-800")}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-zinc-100">{alert.title}</p>
                  <Badge
                    tone={
                      alert.severity === "critical"
                        ? "danger"
                        : alert.severity === "warning"
                          ? "warning"
                          : "neutral"
                    }
                  >
                    {alert.severity}
                  </Badge>
                  {!isRead(alert.id) ? <Badge tone="accent">New</Badge> : null}
                </div>
                {alert.description ? <p className="mt-1 text-xs text-zinc-500">{alert.description}</p> : null}
                <p className="mt-1.5 text-2xs text-zinc-600">
                  {alert.guildName ? `${alert.guildName} · ` : ""}
                  {alert.createdAt ? relativeTime(alert.createdAt) : "Live check"}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                {alert.guildId ? (
                  <Link to={`/dashboard/server/${alert.guildId}`} className="btn-ghost text-xs">
                    Open server
                  </Link>
                ) : null}
                {!isRead(alert.id) ? (
                  <Button variant="ghost" onClick={() => markRead(alert.id)}>
                    Mark read
                  </Button>
                ) : null}
              </div>
            </div>
          </Card>
        ))}
      </div>
      {unread.length === 0 && alerts.length > 0 ? (
        <p className="mt-4 text-center text-2xs text-zinc-600">All signals marked as read.</p>
      ) : null}
    </div>
  );
}
