import { Loader2 } from "lucide-react";
import { lazy, useEffect, type ComponentType } from "react";
import { Link, Navigate, Outlet, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { AppShell } from "./components/layout/AppShell";
import { GuildLayout } from "./components/layout/GuildLayout";
import { RealtimeProvider } from "./hooks/useRealtime";
import { UNAUTHORIZED_EVENT, isUnauthorized } from "./lib/api/client";
import { useSessionQuery } from "./lib/api/auth";
import { keys } from "./lib/api/keys";
import { ErrorState } from "./components/ui/states";
import { isChunkError, reloadForNewBuild } from "./components/ui/ErrorBoundary";

/** Lazy-load a named export so each page group is its own chunk. */
function page<T extends Record<string, unknown>>(loader: () => Promise<T>, name: keyof T) {
  return lazy(() =>
    loader().then(
      (module) => ({ default: module[name] as ComponentType }),
      (error: unknown) => {
        // The chunk belongs to an older deploy: reload once to get the new build.
        if (isChunkError(error)) reloadForNewBuild();
        throw error;
      },
    ),
  );
}

const account = () => import("./pages/account");
const LoginPage = page(account, "LoginPage");
const AccountHomePage = page(account, "AccountHomePage");
const ServersPage = page(account, "ServersPage");
const BotsPage = page(account, "BotsPage");
const NotificationsPage = page(account, "NotificationsPage");
const StatusPage = page(account, "StatusPage");
const AccountSettingsPage = page(account, "AccountSettingsPage");

const HomePage = page(() => import("./pages/server/Home"), "HomePage");
const ModulesPage = page(() => import("./pages/server/Modules"), "ModulesPage");
const ActivityPage = page(() => import("./pages/server/Activity"), "ActivityPage");
const WelcomePage = page(() => import("./pages/server/Welcome"), "WelcomePage");
const LevelingPage = page(() => import("./pages/server/Leveling"), "LevelingPage");
const EconomyPage = page(() => import("./pages/server/Economy"), "EconomyPage");
const GiveawaysPage = page(() => import("./pages/server/Giveaways"), "GiveawaysPage");
const community = () => import("./pages/server/Community");
const SuggestionsPage = page(community, "SuggestionsPage");
const ConfessionsPage = page(community, "ConfessionsPage");
const StarboardPage = page(community, "StarboardPage");
const IdentityPage = page(community, "IdentityPage");
const VerificationPage = page(community, "VerificationPage");
const VoicePage = page(community, "VoicePage");
const MusicPage = page(community, "MusicPage");
const AnnouncementsPage = page(community, "AnnouncementsPage");
const ModerationPage = page(() => import("./pages/server/Moderation"), "ModerationPage");
const AutomodPage = page(() => import("./pages/server/Automod"), "AutomodPage");
const SecurityPage = page(() => import("./pages/server/Security"), "SecurityPage");
const LoggingPage = page(() => import("./pages/server/Logging"), "LoggingPage");
const tickets = () => import("./pages/server/Tickets");
const TicketInboxPage = page(tickets, "TicketInboxPage");
const TicketPanelsPage = page(tickets, "TicketPanelsPage");
const TicketSettingsPage = page(tickets, "TicketSettingsPage");
const RolesPage = page(() => import("./pages/server/Roles"), "RolesPage");
const SocialPage = page(() => import("./pages/server/Social"), "SocialPage");
const CommandsPage = page(() => import("./pages/server/Commands"), "CommandsPage");
const automation = () => import("./pages/server/Automation");
const CustomCommandsPage = page(automation, "CustomCommandsPage");
const AutorespondersPage = page(automation, "AutorespondersPage");
const SchedulesPage = page(automation, "SchedulesPage");
const AnalyticsPage = page(() => import("./pages/server/Analytics"), "AnalyticsPage");
const settings = () => import("./pages/server/Settings");
const GeneralSettingsPage = page(settings, "GeneralSettingsPage");
const PermissionsPage = page(settings, "PermissionsPage");
const IntegrationsPage = page(settings, "IntegrationsPage");
const WebhooksPage = page(settings, "WebhooksPage");
const AuditPage = page(settings, "AuditPage");
const UnsupportedPage = page(() => import("./pages/server/Unsupported"), "UnsupportedPage");

function FullScreenLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-950">
      <Loader2 className="h-5 w-5 animate-spin text-accent-soft" />
    </div>
  );
}

/** Protected routes: restores the session from the HttpOnly cookie. */
function Protected() {
  const session = useSessionQuery();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    const handler = () => {
      queryClient.clear();
      navigate(`/login?next=${encodeURIComponent(location.pathname)}&expired=1`, { replace: true });
    };
    window.addEventListener(UNAUTHORIZED_EVENT, handler);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, handler);
  }, [location.pathname, navigate, queryClient]);

  if (session.isLoading) return <FullScreenLoader />;
  if (session.error && !isUnauthorized(session.error)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-950 p-6">
        <ErrorState error={session.error} onRetry={() => void queryClient.invalidateQueries({ queryKey: keys.session })} />
      </div>
    );
  }
  if (!session.data) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />;
  return (
    <RealtimeProvider enabled>
      <Outlet />
    </RealtimeProvider>
  );
}

function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
      <p className="font-mono text-5xl font-semibold tracking-tight text-ink-500">404</p>
      <p className="text-13 text-zinc-400">This page doesn't exist in the INFERA dashboard.</p>
      <Link to="/dashboard" className="btn-primary mt-2">
        Back to dashboard
      </Link>
    </div>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/login" element={<LoginPage />} />

      <Route element={<Protected />}>
        <Route path="/dashboard" element={<AppShell />}>
          <Route index element={<AccountHomePage />} />
          <Route path="servers" element={<ServersPage />} />
          <Route path="bots" element={<BotsPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="status" element={<StatusPage />} />
          <Route path="settings" element={<AccountSettingsPage />} />

          <Route path="server/:guildId" element={<GuildLayout />}>
            <Route index element={<HomePage />} />
            <Route path="modules" element={<ModulesPage />} />
            <Route path="activity" element={<ActivityPage />} />

            <Route path="welcome" element={<WelcomePage />} />
            <Route path="leveling" element={<LevelingPage />} />
            <Route path="economy" element={<EconomyPage />} />
            <Route path="giveaways" element={<GiveawaysPage />} />
            <Route path="suggestions" element={<SuggestionsPage />} />
            <Route path="confessions" element={<ConfessionsPage />} />
            <Route path="reputation" element={<UnsupportedPage />} />

            <Route path="moderation" element={<ModerationPage />} />
            <Route path="automod" element={<AutomodPage />} />
            <Route path="security" element={<SecurityPage />} />
            <Route path="verification" element={<VerificationPage />} />
            <Route path="logging" element={<LoggingPage />} />

            <Route path="tickets" element={<TicketInboxPage />} />
            <Route path="tickets/panels" element={<TicketPanelsPage />} />
            <Route path="tickets/settings" element={<TicketSettingsPage />} />

            <Route path="identity" element={<IdentityPage />} />
            <Route path="roles" element={<RolesPage />} />
            <Route path="social" element={<SocialPage />} />
            <Route path="starboard" element={<StarboardPage />} />
            <Route path="announcements" element={<AnnouncementsPage />} />
            <Route path="events" element={<UnsupportedPage />} />

            <Route path="commands" element={<CommandsPage />} />
            <Route path="custom-commands" element={<CustomCommandsPage />} />
            <Route path="autoresponders" element={<AutorespondersPage />} />
            <Route path="schedules" element={<SchedulesPage />} />
            <Route path="voice" element={<VoicePage />} />
            <Route path="music" element={<MusicPage />} />

            <Route path="analytics" element={<AnalyticsPage />} />
            <Route path="analytics/:view" element={<AnalyticsPage />} />

            <Route path="config" element={<GeneralSettingsPage />} />
            <Route path="permissions" element={<PermissionsPage />} />
            <Route path="integrations" element={<IntegrationsPage />} />
            <Route path="webhooks" element={<WebhooksPage />} />
            <Route path="audit" element={<AuditPage />} />

            <Route path="unsupported/:feature" element={<UnsupportedPage />} />
            <Route path="*" element={<NotFound />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
