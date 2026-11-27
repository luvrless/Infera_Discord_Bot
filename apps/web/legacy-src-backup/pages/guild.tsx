import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  BarChart3,
  Check,
  Copy,
  ExternalLink,
  Loader2,
  Package,
  RefreshCw,
  Sparkles,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { ConfigForm } from "../components/ConfigForm";
import { ActivityChart } from "../components/Charts";
import { useGuildData } from "../components/GuildGate";
import { useToast } from "../components/Toast";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Dot,
  EmptyState,
  ErrorState,
  InfoNote,
  Modal,
  PageHeader,
  Skeleton,
  Stat,
  Tabs,
  Toggle,
  cn,
} from "../components/ui";
import { qk, useChannels, useGuild, useRoles, useSaveConfig, useSchema, useSettings, useToggleModule } from "../lib/hooks";
import { PRESETS, type Preset } from "../lib/presets";
import type { AnalyticsResponse, ModuleState, OverviewResponse } from "../lib/types";
import { compactNumber, formatDate, guildIconUrl, relativeTime } from "../lib/utils";

const MODULE_GROUPS: Array<{ id: string; label: string; modules: string[] }> = [
  { id: "engagement", label: "Engagement", modules: ["welcome", "goodbye", "leveling", "economy", "giveaways", "suggestions"] },
  { id: "moderation", label: "Moderation", modules: ["moderation", "automod", "logging"] },
  { id: "security", label: "Security", modules: ["security"] },
  { id: "community", label: "Community", modules: ["tickets", "starboard", "voice", "music", "fun", "utility", "community"] },
  { id: "integrations", label: "Integrations", modules: ["roblox", "social"] },
];

const MODULE_LINKS: Record<string, string> = {
  welcome: "welcome",
  goodbye: "welcome",
  leveling: "leveling",
  economy: "economy",
  giveaways: "giveaways",
  suggestions: "suggestions",
  moderation: "moderation",
  automod: "automod",
  logging: "logging",
  security: "security",
  tickets: "tickets",
  roblox: "integrations",
  social: "social",
  voice: "config",
  music: "config",
  starboard: "config",
  fun: "config",
  utility: "config",
  community: "config",
};

const CATEGORY_LABELS: Record<string, string> = {
  general: "General",
  moderation: "Moderation",
  automod: "AutoMod",
  security: "Security",
  welcome: "Welcome",
  goodbye: "Goodbye",
  logging: "Logging",
  leveling: "Leveling",
  economy: "Economy",
  tickets: "Tickets",
  giveaways: "Giveaways",
  suggestions: "Suggestions",
  starboard: "Starboard",
  confessions: "Confessions",
  voice: "Voice",
  music: "Music",
  roblox: "Roblox",
  social: "Social feeds",
  permissions: "Permissions",
};

/* --------------------------------------------------------------- overview */

export function GuildOverviewPage() {
  const { guildId } = useGuildData();
  const query = useQuery({
    queryKey: qk.overview(guildId),
    queryFn: () => api.get<OverviewResponse>(`/guilds/${guildId}/overview`),
  });
  const settings = useSettings(guildId);
  const toggleModule = useToggleModule(guildId);
  const queryClient = useQueryClient();
  const { push } = useToast();
  const [preset, setPreset] = useState<Preset | null>(null);

  const analytics = query.data?.analytics;
  const modules = query.data?.modules ?? [];
  const featured = MODULE_GROUPS.flatMap((group) => group.modules).slice(0, 9);

  const changes = useMemo(() => {
    if (!preset || !settings.data) return [];
    return Object.entries(preset.patch).filter(
      ([key, value]) => JSON.stringify(settings.data?.values[key]) !== JSON.stringify(value),
    );
  }, [preset, settings.data]);

  const applyPreset = useMutation({
    mutationFn: async () => {
      if (!preset) return;
      if (Object.keys(preset.patch).length > 0) {
        await api.patch(`/guilds/${guildId}/config`, { patch: preset.patch });
      }
      for (const [moduleId, enabled] of Object.entries(preset.modules ?? {})) {
        await api.patch(`/guilds/${guildId}/modules/${moduleId}`, { enabled });
      }
    },
    onSuccess: () => {
      push({ title: `${preset?.name} applied`, description: `${changes.length} values updated.`, tone: "success" });
      setPreset(null);
      void queryClient.invalidateQueries({ queryKey: qk.settings(guildId) });
      void queryClient.invalidateQueries({ queryKey: qk.modules(guildId) });
      void queryClient.invalidateQueries({ queryKey: qk.overview(guildId) });
      void queryClient.invalidateQueries({ queryKey: ["guild", guildId] });
    },
    onError: (error) => push({ title: "Preset failed", description: error.message, tone: "error" }),
  });

  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  if (query.isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-72" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Server overview"
        description="Live configuration state, activity and one-click presets."
        actions={
          <Button variant="secondary" onClick={() => void query.refetch()} loading={query.isFetching}>
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Members" value={compactNumber(query.data?.stats.members ?? 0)} />
        <Stat
          label="Active modules"
          value={`${query.data?.stats.enabledModules ?? 0}/${modules.length}`}
          hint="Enabled in INFERA"
        />
        <Stat
          label="Commands · 30d"
          value={compactNumber(analytics?.totals.commands ?? 0)}
          hint={`${compactNumber(analytics?.totals.messages ?? 0)} messages tracked`}
        />
        <Stat
          label="Moderation cases"
          value={query.data?.stats.moderationCases ?? 0}
          hint={`${query.data?.stats.openTickets ?? 0} open tickets`}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="p-4 xl:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-zinc-200">Server activity</h2>
              <p className="mt-0.5 text-xs text-zinc-500">Messages and commands recorded by the bot, last 30 days.</p>
            </div>
            <Link to={`/dashboard/server/${guildId}/analytics`} className="btn-ghost text-xs">
              Full analytics <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="mt-3">
            {analytics && (analytics.history?.length ?? 0) > 0 ? (
              <ActivityChart
                data={analytics.history.slice(-30)}
                series={[
                  { key: "messages", label: "Messages", color: "#8b5cf6" },
                  { key: "commands", label: "Commands", color: "#34d399" },
                ]}
              />
            ) : (
              <div className="flex h-[220px] flex-col items-center justify-center gap-2 text-center">
                <BarChart3 className="h-6 w-6 text-zinc-600" />
                <p className="text-xs text-zinc-500">No activity has been recorded yet.</p>
                <p className="max-w-xs text-2xs text-zinc-600">
                  Analytics start filling as members talk and use commands.
                </p>
              </div>
            )}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 border-t border-ink-700 pt-3 sm:grid-cols-4">
            {[
              ["Joins", analytics?.totals.memberJoins ?? 0],
              ["Leaves", analytics?.totals.memberLeaves ?? 0],
              ["AutoMod actions", analytics?.totals.automod ?? 0],
              ["Voice minutes", analytics?.totals.voiceMinutes ?? 0],
            ].map(([label, value]) => (
              <div key={String(label)}>
                <p className="text-2xs uppercase tracking-wide text-zinc-500">{label}</p>
                <p className="mt-0.5 text-sm font-medium text-zinc-200">{compactNumber(Number(value))}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-accent-soft" />
            <h2 className="text-sm font-semibold text-zinc-200">Server presets</h2>
          </div>
          <p className="mt-1 text-xs text-zinc-500">Configure your community in seconds. Every preset shows its changes first.</p>
          <div className="mt-3 space-y-1">
            {PRESETS.slice(0, 5).map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => setPreset(entry)}
                className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-ink-750"
              >
                <span className="text-xs text-zinc-300">{entry.name}</span>
                <ArrowRight className="h-3 w-3 text-zinc-600" />
              </button>
            ))}
          </div>
          <Button variant="secondary" className="mt-3 w-full" onClick={() => setPreset(PRESETS[0] ?? null)}>
            Browse presets
          </Button>
          <p className="mt-2 text-2xs text-zinc-600">Presets only touch the keys they list. Other settings stay as they are.</p>
        </Card>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-zinc-200">Modules</h2>
            <p className="mt-0.5 text-xs text-zinc-500">Toggle features instantly — the bot reads the same configuration.</p>
          </div>
          <Link to={`/dashboard/server/${guildId}/modules`} className="btn-ghost text-xs">
            All modules <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {featured.map((moduleId) => {
            const module = modules.find((entry) => entry.id === moduleId);
            if (!module) return null;
            return (
              <ModuleToggleCard
                key={module.id}
                guildId={guildId}
                module={module}
                busy={toggleModule.isPending && toggleModule.variables?.moduleId === module.id}
                onToggle={(enabled) => toggleModule.mutate({ moduleId: module.id, enabled })}
              />
            );
          })}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h2 className="text-sm font-semibold text-zinc-200">Recent changes</h2>
          <div className="mt-3 space-y-2">
            {(query.data?.recentAudit ?? []).length === 0 ? (
              <EmptyState compact title="No changes recorded yet" description="Configuration changes made here are audited." />
            ) : null}
            {(query.data?.recentAudit ?? []).map((entry) => (
              <div key={entry.id} className="flex items-center justify-between gap-3 border-b border-ink-800 pb-2 last:border-0">
                <div className="min-w-0">
                  <p className="truncate text-xs text-zinc-300">{entry.action.replaceAll(".", " · ")}</p>
                  <p className="text-2xs text-zinc-600">
                    {entry.actorId ? `<@${entry.actorId}>` : "System"} · {relativeTime(entry.createdAt)}
                  </p>
                </div>
                <Link to={`/dashboard/server/${guildId}/audit`} className="text-2xs text-zinc-500 hover:text-zinc-300">
                  Audit
                </Link>
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-4">
          <h2 className="text-sm font-semibold text-zinc-200">Bot connection</h2>
          <div className="mt-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-500">Gateway</span>
              <Badge tone={query.data?.bot.online ? "success" : "danger"}>
                {query.data?.bot.online ? "Connected" : "Offline"}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-500">Account</span>
              <span className="text-xs text-zinc-300">{query.data?.bot.user ?? "—"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-500">Last heartbeat</span>
              <span className="text-xs text-zinc-300">
                {query.data?.bot.lastSeenAt ? relativeTime(query.data.bot.lastSeenAt) : "never"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-500">Commands loaded</span>
              <span className="text-xs text-zinc-300">{query.data?.bot.commands ?? 0}</span>
            </div>
          </div>
          {!query.data?.bot.online ? (
            <div className="mt-3">
              <InfoNote tone="warning">
                The bot is offline. Configuration is saved, but it will only take effect once the bot reconnects.
              </InfoNote>
            </div>
          ) : null}
        </Card>
      </div>

      <PresetModal
        preset={preset}
        changes={changes}
        onClose={() => setPreset(null)}
        onApply={() => applyPreset.mutate()}
        loading={applyPreset.isPending}
      />
    </div>
  );
}

function ModuleToggleCard({
  module,
  onToggle,
  busy,
}: {
  guildId: string;
  module: ModuleState;
  onToggle: (enabled: boolean) => void;
  busy?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-ink-700 bg-ink-850/60 px-3 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-zinc-200">{module.name}</p>
        <p className={cn("text-2xs", module.enabled ? "text-emerald-400" : "text-zinc-600")}>
          {module.enabled ? "Enabled" : "Disabled"}
        </p>
      </div>
      {busy ? <Loader2 className="h-4 w-4 animate-spin text-zinc-500" /> : <Toggle checked={module.enabled} onChange={onToggle} />}
    </div>
  );
}

function PresetModal({
  preset,
  changes,
  onClose,
  onApply,
  loading,
}: {
  preset: Preset | null;
  changes: Array<[string, unknown]>;
  onClose: () => void;
  onApply: () => void;
  loading: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => {
    setSelectedId(preset?.id ?? null);
  }, [preset]);
  const active = preset;
  return (
    <Modal
      open={Boolean(preset)}
      onClose={onClose}
      wide
      title={active?.name ?? "Server presets"}
      description={active?.description ?? "Choose a preset to preview its changes."}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={onApply}
            loading={loading}
            disabled={!active || (active.patch && Object.keys(active.patch).length === 0) || changes.length === 0}
          >
            <Check className="h-3.5 w-3.5" />
            Apply {changes.length} change{changes.length === 1 ? "" : "s"}
          </Button>
        </>
      }
    >
      {!selectedId ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {PRESETS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setSelectedId(entry.id)}
              className="rounded-lg border border-ink-700 bg-ink-850 p-3 text-left hover:border-accent/40"
            >
              <p className="text-sm font-medium text-zinc-200">{entry.name}</p>
              <p className="mt-0.5 text-xs text-zinc-500">{entry.description}</p>
              <p className="mt-2 text-2xs text-zinc-600">{Object.keys(entry.patch).length} settings</p>
            </button>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-zinc-200">
              {PRESETS.find((entry) => entry.id === selectedId)?.name}
            </p>
            <Button variant="ghost" onClick={() => setSelectedId(null)}>
              Choose another
            </Button>
          </div>
          <p className="text-xs text-zinc-500">These are the exact changes. Settings not listed are untouched.</p>
          <div className="max-h-64 overflow-y-auto rounded-lg border border-ink-700">
            {changes.length === 0 ? (
              <p className="p-4 text-xs text-zinc-500">This server already matches the preset.</p>
            ) : null}
            {changes.map(([key, value]) => (
              <div key={key} className="flex items-start justify-between gap-3 border-b border-ink-800 px-3 py-2 last:border-0">
                <code className="text-2xs text-zinc-400">{key}</code>
                <span className="max-w-[55%] truncate text-right text-2xs text-accent-soft">{JSON.stringify(value)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {active && selectedId ? null : (
        <p className="mt-3 text-2xs text-zinc-600">
          Selecting a preset opens the change list; nothing is written until you confirm.
        </p>
      )}
    </Modal>
  );
}

/* ---------------------------------------------------------------- modules */

export function ModulesPage() {
  const { guildId } = useGuildData();
  const query = useQuery({
    queryKey: qk.modules(guildId),
    queryFn: () => api.get<{ modules: ModuleState[] }>(`/guilds/${guildId}/modules`),
  });
  const toggle = useToggleModule(guildId);
  const { push } = useToast();
  const modules = query.data?.modules ?? [];
  const enabled = modules.filter((module) => module.enabled).length;

  return (
    <div>
      <PageHeader
        title="Modules"
        description={`${enabled} of ${modules.length} modules enabled. Toggles write straight to the bot configuration.`}
      />
      {query.isError ? <ErrorState error={query.error} onRetry={() => void query.refetch()} /> : null}
      <div className="space-y-5">
        {MODULE_GROUPS.map((group) => {
          const entries = group.modules
            .map((id) => modules.find((module) => module.id === id))
            .filter((module): module is ModuleState => Boolean(module));
          if (entries.length === 0) return null;
          return (
            <section key={group.id}>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">{group.label}</h2>
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {entries.map((module) => (
                  <Card key={module.id} className="p-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-zinc-200">{module.name}</p>
                        <p className="mt-0.5 text-2xs text-zinc-500">
                          {module.configKey ? <code>{module.configKey}</code> : "Stored module toggle"}
                        </p>
                      </div>
                      <Toggle
                        checked={module.enabled}
                        onChange={(next) => {
                          toggle.mutate(
                            { moduleId: module.id, enabled: next },
                            {
                              onError: (error) => push({ title: "Could not update module", description: error.message, tone: "error" }),
                            },
                          );
                        }}
                      />
                    </div>
                    <div className="mt-3 flex items-center justify-between border-t border-ink-700 pt-2.5">
                      <Badge tone={module.enabled ? "success" : "neutral"}>{module.enabled ? "Active" : "Inactive"}</Badge>
                      <Link to={`/dashboard/server/${guildId}/${MODULE_LINKS[module.id] ?? "config"}`} className="text-2xs text-zinc-500 hover:text-zinc-300">
                        Configure <ArrowRight className="ml-1 inline h-3 w-3" />
                      </Link>
                    </div>
                  </Card>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- config */

export function ConfigPage() {
  const { guildId } = useGuildData();
  const schema = useSchema();
  const settings = useSettings(guildId);
  const channels = useChannels(guildId);
  const roles = useRoles(guildId);
  const save = useSaveConfig(guildId);
  const { push } = useToast();
  const queryClient = useQueryClient();
  const [category, setCategory] = useState("general");
  const [confirmReset, setConfirmReset] = useState(false);

  const reset = useMutation({
    mutationFn: () => api.post(`/guilds/${guildId}/config/reset`, { section: category }),
    onSuccess: () => {
      push({ title: `${CATEGORY_LABELS[category] ?? category} reset to defaults`, tone: "success" });
      setConfirmReset(false);
      void queryClient.invalidateQueries({ queryKey: qk.settings(guildId) });
      void queryClient.invalidateQueries({ queryKey: qk.overview(guildId) });
    },
    onError: (error) => push({ title: "Reset failed", description: error.message, tone: "error" }),
  });

  const definitions = (schema.data?.schema.keys ?? []).filter((definition) => definition.category === category);
  const categories = schema.data?.schema.categories ?? [];

  return (
    <div>
      <PageHeader
        title="General configuration"
        description="Every setting is validated against the bot's configuration registry before it is saved."
      />
      {schema.isError || settings.isError ? (
        <ErrorState error={schema.error ?? settings.error} onRetry={() => void settings.refetch()} />
      ) : null}
      <Card className="overflow-hidden">
        <div className="px-3 pt-2">
          <Tabs
            items={categories.map((entry) => ({ id: entry, label: CATEGORY_LABELS[entry] ?? entry }))}
            active={category}
            onChange={setCategory}
          />
        </div>
        <div className="p-4">
          {settings.isLoading || schema.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, index) => (
                <Skeleton key={index} className="h-10" />
              ))}
            </div>
          ) : settings.data ? (
            <ConfigForm
              key={`${category}-${settings.data.version}`}
              definitions={definitions}
              values={settings.data.values}
              channels={channels.data?.channels ?? []}
              roles={roles.data?.roles ?? []}
              saving={save.isPending}
              onSave={async (patch) => {
                await save.mutateAsync(patch);
              }}
              onReset={() => setConfirmReset(true)}
              resetLabel={`Reset ${CATEGORY_LABELS[category] ?? category}`}
            />
          ) : null}
        </div>
      </Card>
      <div className="mt-3">
        <InfoNote>
          Values are stored in the guild configuration and picked up by the bot within a minute. Keys are validated; an
          unknown or invalid value rejects the whole save.
        </InfoNote>
      </div>
      <ConfirmDialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        onConfirm={() => reset.mutate()}
        loading={reset.isPending}
        destructive
        title={`Reset ${CATEGORY_LABELS[category] ?? category}?`}
        description="Every key in this section returns to its default. Other categories are not touched."
        confirmLabel="Reset section"
      />
    </div>
  );
}

/* --------------------------------------------------------------- identity */

export function IdentityPage() {
  const { guildId, guild } = useGuildData();
  const { push } = useToast();
  const copy = (value: string, label: string) => {
    void navigator.clipboard.writeText(value);
    push({ title: `${label} copied`, tone: "success" });
  };

  return (
    <div>
      <PageHeader
        title="Server identity"
        description="Discord owns these fields; INFERA reads them live from the gateway. Edit them in Discord server settings."
      />
      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <Card className="overflow-hidden">
          <div className="relative h-32 bg-gradient-to-r from-accent/25 via-ink-750 to-ink-850">
            {guild.banner ? (
              <img
                src={`https://cdn.discordapp.com/banners/${guildId}/${guild.banner}.png?size=1024`}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : null}
          </div>
          <div className="px-4 pb-4">
            <div className="-mt-7 flex items-end gap-3">
              <img
                src={guildIconUrl(guildId, guild.icon, 256)}
                alt=""
                className="h-16 w-16 rounded-2xl border-4 border-ink-800 bg-ink-800"
              />
              <div className="pb-1">
                <p className="text-lg font-semibold text-zinc-100">{guild.name}</p>
                <p className="text-xs text-zinc-500">{guild.memberCount.toLocaleString()} members</p>
              </div>
            </div>
            <p className="mt-4 text-sm text-zinc-400">{guild.description ?? "No server description set in Discord."}</p>
            <dl className="mt-5 grid gap-3 sm:grid-cols-2">
              {[
                ["Server ID", guild.id],
                ["Owner ID", guild.ownerId ?? "Unknown"],
                ["Created", formatDate(guild.createdAt)],
                ["Boost tier", `Tier ${guild.premiumTier}`],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-ink-700 bg-ink-850 px-3 py-2">
                  <dt className="text-2xs uppercase tracking-wide text-zinc-500">{label}</dt>
                  <dd className="mt-0.5 flex items-center gap-1.5 truncate font-mono text-xs text-zinc-300">
                    {value}
                    <button
                      type="button"
                      className="text-zinc-600 hover:text-zinc-300"
                      onClick={() => copy(String(value), String(label))}
                      aria-label={`Copy ${label}`}
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </Card>
        <Card className="p-4">
          <h2 className="text-sm font-semibold text-zinc-200">INFERA in this server</h2>
          <div className="mt-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-500">Installed</span>
              <Badge tone={guild.botInstalled ? "success" : "danger"}>{guild.botInstalled ? "Yes" : "No"}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-500">Bot connection</span>
              <Badge tone={guild.botOnline ? "success" : "warning"}>{guild.botOnline ? "Online" : "Offline"}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-500">Your role</span>
              <span className="text-xs text-zinc-300">{guild.userIsOwner ? "Server owner" : "Administrator"}</span>
            </div>
          </div>
          <div className="mt-4">
            <InfoNote>
              Updating server name, icon or banner requires Discord's <code className="font-mono">Manage Guild</code>{" "}
              permission for a bot user; INFERA intentionally does not request it for identity changes.
            </InfoNote>
          </div>
          <a
            href={`https://discord.com/channels/${guildId}`}
            target="_blank"
            rel="noreferrer"
            className="btn-secondary mt-4"
          >
            Open in Discord <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </Card>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- logging */

export function LoggingPage() {
  const { guildId } = useGuildData();
  const schema = useSchema();
  const settings = useSettings(guildId);
  const channels = useChannels(guildId);
  const save = useSaveConfig(guildId);
  const definitions = (schema.data?.schema.keys ?? []).filter((definition) => definition.key.startsWith("logging."));

  return (
    <div>
      <PageHeader
        title="Logging"
        description="Choose one destination channel and exactly which gateway events INFERA writes there."
      />
      {settings.isError ? <ErrorState error={settings.error} onRetry={() => void settings.refetch()} /> : null}
      <Card className="p-4">
        {settings.data ? (
          <ConfigForm
            key={`logging-${settings.data.version}`}
            definitions={definitions}
            values={settings.data.values}
            channels={channels.data?.channels ?? []}
            saving={save.isPending}
            onSave={async (patch) => {
              await save.mutateAsync(patch);
            }}
            resetLabel="Reset logging"
          />
        ) : (
          <Skeleton className="h-64" />
        )}
      </Card>
      <div className="mt-3">
        <InfoNote tone="warning">
          Logging needs the <code className="font-mono">logging.channel_id</code> destination. Without it, enabled events
          are collected but cannot be delivered.
        </InfoNote>
      </div>
    </div>
  );
}
