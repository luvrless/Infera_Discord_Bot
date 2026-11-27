import { Loader2 } from "lucide-react";
import { Link, Navigate, Outlet, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { GuildGate } from "./components/GuildGate";
import { useSession } from "./lib/hooks";
import {
  AccountHomePage,
  LoginPage,
  NotificationsPage,
  ServersPage,
  SettingsPage,
  StatusPage,
} from "./pages/account";
import {
  AutomodPage,
  AnalyticsPage,
  AuditPage,
  CommandsPage,
  ModerationPage,
  SecurityPage,
} from "./pages/ops";
import {
  EconomyPage,
  GiveawaysPage,
  LevelingPage,
  SuggestionsPage,
  WelcomePage,
} from "./pages/engagement";
import {
  ConfigPage,
  GuildOverviewPage,
  IdentityPage,
  LoggingPage,
  ModulesPage,
} from "./pages/guild";
import { IntegrationsPage, RolesPage, SocialPage, TicketsPage } from "./pages/community";
import { AutomationPage } from "./pages/automation";

function Protected() {
  const session = useSession();
  if (session.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-900">
        <Loader2 className="h-5 w-5 animate-spin text-accent-soft" />
      </div>
    );
  }
  if (!session.data) return <Navigate to="/login" replace />;
  return <Outlet />;
}

function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-ink-900 text-center">
      <p className="text-5xl font-semibold tracking-tight text-zinc-700">404</p>
      <p className="text-sm text-zinc-400">That page does not exist in the dashboard.</p>
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
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="status" element={<StatusPage />} />
          <Route path="settings" element={<SettingsPage />} />

          <Route path="server/:guildId" element={<GuildGate />}>
            <Route index element={<GuildOverviewPage />} />
            <Route path="modules" element={<ModulesPage />} />
            <Route path="welcome" element={<WelcomePage />} />
            <Route path="leveling" element={<LevelingPage />} />
            <Route path="moderation" element={<ModerationPage />} />
            <Route path="automod" element={<AutomodPage />} />
            <Route path="security" element={<SecurityPage />} />
            <Route path="logging" element={<LoggingPage />} />
            <Route path="roles" element={<RolesPage />} />
            <Route path="tickets" element={<TicketsPage />} />
            <Route path="economy" element={<EconomyPage />} />
            <Route path="giveaways" element={<GiveawaysPage />} />
            <Route path="suggestions" element={<SuggestionsPage />} />
            <Route path="identity" element={<IdentityPage />} />
            <Route path="social" element={<SocialPage />} />
            <Route path="commands" element={<CommandsPage />} />
            <Route path="automation" element={<AutomationPage />} />
            <Route path="analytics" element={<AnalyticsPage />} />
            <Route path="integrations" element={<IntegrationsPage />} />
            <Route path="config" element={<ConfigPage />} />
            <Route path="audit" element={<AuditPage />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
