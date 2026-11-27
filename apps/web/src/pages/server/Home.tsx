import { useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Check,
  ChevronRight,
  Cpu,
  Gauge,
  Heart,
  LayoutGrid,
  Radio,
  Shield,
  Sparkles,
  Terminal,
  Users,
  Wand2,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Area, AreaChart, ResponsiveContainer, Tooltip } from "recharts";
import { GuildIcon } from "../../components/layout/ServerSwitcher";
import { Badge, Button, Callout, Card, Checkbox, StatusDot } from "../../components/ui/primitives";
import { Modal } from "../../components/ui/overlays";
import { EmptyState, Skeleton } from "../../components/ui/states";
import { ChannelName, RoleName, UserChip } from "../../components/ui/pickers";
import { useToast } from "../../components/ui/toast";
import { ApiError, errorMessage } from "../../lib/api/client";
import { guildApi, invalidateConfig, useOverview, useSchema } from "../../lib/api/guilds";
import { keys } from "../../lib/api/keys";
import type { SettingsResponse } from "../../lib/api/types";
import { LEVEL_NAMES } from "../../lib/api/types";
import { eventLabel, eventTone } from "../../lib/events";
import { CUSTOM_PRESET_KEYS, PRESETS, type Preset } from "../../lib/presets";
import { serverPath } from "../../lib/nav";
import { cn, formatDate, formatNumber, keyLabel, timeAgo } from "../../lib/utils";
import { useGuild } from "../../hooks/useGuild";
import { useRealtime } from "../../hooks/useRealtime";

// ------------------------------------------------------------- header

function ServerHeader() {
  const { detail } = useGuild();
  const guild = detail.guild;
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-4">
        <GuildIcon guild={guild} size={56} />
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight text-zinc-50">{guild.name}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
            <span className="flex items-center gap-1.5">
              <StatusDot tone={guild.botOnline ? "success" : "warning"} pulse={guild.botOnline} />
              {detail.bot.user ?? "INFERA"} {guild.botOnline ? "connected" : "disconnected"}
            </span>
            <span className="flex items-center gap-1">
              <Users className="h-3.5 w-3.5" /> {formatNumber(guild.memberCount)} members
            </span>
            <Badge tone="accent">{LEVEL_NAMES[detail.level] ?? "Member"}</Badge>
          </div>
        </div>
      </div>
      <Link to="/dashboard/servers" className="btn-secondary self-start sm:self-auto">
        <ArrowLeft className="h-3.5 w-3.5" /> All servers
      </Link>
    </div>
  );
}

// ------------------------------------------------------- system usage

function SystemUsageCard() {
  const { guildId, modules } = useGuild();
  const overview = useOverview(guildId);
  const analytics = overview.data?.analytics;
  const history = analytics?.history ?? [];
  const today = new Date().toISOString().slice(0, 10);
  const todayEntry = history.find((entry) => String(entry.date).slice(0, 10) === today);
  const enabled = modules.filter((module) => module.enabled).length;
  const toggleable = modules.filter((module) => module.configurable).length;
  const chartData = history.map((entry) => ({ date: String(entry.date).slice(5, 10), commands: entry.commands }));

  return (
    <Card className="flex flex-col">
      <div className="flex items-start justify-between gap-3 px-5 pt-5">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
            <Cpu className="h-4 w-4 text-accent-soft" /> INFERA system usage
          </p>
          <p className="mt-0.5 text-xs text-zinc-500">Command activity and modules for this server (last 30 days).</p>
        </div>
        <Link to={serverPath(guildId, "analytics")} className="btn-ghost btn-sm">
          Analytics <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-4 px-5 pt-4 sm:grid-cols-4">
        <Stat label="Commands executed" loading={overview.isLoading} value={analytics?.dataAvailable ? formatNumber(analytics.totals.commands ?? 0) : null} unavailable="No data yet" />
        <Stat
          label="Commands today"
          loading={overview.isLoading}
          value={todayEntry ? formatNumber(todayEntry.commands) : analytics?.dataAvailable ? "0" : null}
          unavailable="No snapshot yet"
        />
        <Stat label="Active modules" loading={!modules.length} value={`${enabled} / ${toggleable}`} />
        <Stat label="API requests" value={null} unavailable="Not tracked" title="The INFERA API doesn't record per-server request counts yet." />
      </div>
      <div className="mt-4 h-24 flex-1 px-2">
        {overview.isLoading ? (
          <Skeleton className="mx-3 h-full" />
        ) : chartData.length > 1 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 4, right: 12, left: 12, bottom: 0 }}>
              <defs>
                <linearGradient id="usage" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8B5CF6" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#8B5CF6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <Tooltip
                cursor={{ stroke: "#3a3a46" }}
                contentStyle={{ background: "#16161b", border: "1px solid #2c2c36", borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: "#a1a1aa" }}
                formatter={(value: number) => [formatNumber(value), "Commands"]}
              />
              <Area type="monotone" dataKey="commands" stroke="#A78BFA" strokeWidth={1.75} fill="url(#usage)" />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <p className="flex h-full items-center justify-center text-xs text-zinc-600">Daily command history appears after INFERA records its first analytics snapshot.</p>
        )}
      </div>
      <div className="flex items-center gap-2 border-t border-ink-700 px-5 py-3 text-2xs text-zinc-500">
        <Gauge className="h-3.5 w-3.5" /> No usage quota is defined for this server, so there's no limit or reset date.
      </div>
    </Card>
  );
}

function Stat({ label, value, loading, unavailable, title }: { label: string; value: string | null; loading?: boolean; unavailable?: string; title?: string }) {
  return (
    <div title={title}>
      <p className="text-2xs font-medium text-zinc-500">{label}</p>
      {loading ? <Skeleton className="mt-1.5 h-6 w-14" /> : value !== null ? <p className="mt-1 text-xl font-semibold tabular-nums text-zinc-50">{value}</p> : <p className="mt-1.5 text-xs text-zinc-600">{unavailable ?? "—"}</p>}
    </div>
  );
}

// ------------------------------------------------------------ presets

function same(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "On" : "Off";
  if (Array.isArray(value)) return value.length === 0 ? "None" : `${value.length} item${value.length === 1 ? "" : "s"}`;
  if (typeof value === "object") return "Custom rules";
  return String(value);
}

function PresetCard() {
  const { guildId, values, settings, canConfigure } = useGuild();
  const schema = useSchema();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [selected, setSelected] = useState<string>(PRESETS[0]!.id);
  const [open, setOpen] = useState(false);
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<{ changed: string[] } | null>(null);
  const [custom, setCustom] = useState<Record<string, boolean>>({});

  const preset: Preset | null =
    selected === "custom"
      ? {
          id: "custom",
          name: "Custom",
          description: "Choose exactly which modules to switch on or off.",
          patch: Object.fromEntries(Object.entries(custom)),
          requires: [],
          permissions: [],
        }
      : PRESETS.find((entry) => entry.id === selected) ?? null;

  const changes = useMemo(() => {
    if (!preset) return [];
    return Object.entries(preset.patch).map(([key, next]) => {
      const current = values[key];
      const def = schema.data?.keys.find((entry) => entry.key === key);
      const customised = def ? !same(current, def.default) : false;
      return { key, current, next, unchanged: same(current, next), overwrites: !same(current, next) && customised };
    });
  }, [preset, values, schema.data]);
  const effective = changes.filter((change) => !change.unchanged);

  const apply = async () => {
    if (!preset || effective.length === 0) return;
    setApplying(true);
    try {
      const patch = Object.fromEntries(effective.map((change) => [change.key, change.next]));
      const response = await guildApi.patchConfig(guildId, patch, settings?.version);
      queryClient.setQueryData<SettingsResponse>(keys.settings(guildId), (current) =>
        current ? { ...current, values: response.snapshot.values, version: response.snapshot.version } : current,
      );
      invalidateConfig(queryClient, guildId);
      setResult({ changed: response.changed });
      toast.success(`${preset.name} applied`, `${response.changed.length} settings updated.`);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        void queryClient.invalidateQueries({ queryKey: keys.settings(guildId) });
        toast.error("Settings changed while you were reviewing", "The latest values were loaded — review the changes again before applying.");
      } else {
        toast.error("The preset could not be applied", errorMessage(error));
      }
    } finally {
      setApplying(false);
    }
  };

  return (
    <Card className="flex flex-col">
      <div className="px-5 pt-5">
        <p className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
          <Wand2 className="h-4 w-4 text-accent-soft" /> Server preset
        </p>
        <p className="mt-0.5 text-xs text-zinc-500">Configure your community in seconds.</p>
      </div>
      <div className="grid max-h-[208px] flex-1 grid-cols-1 gap-1.5 overflow-y-auto px-5 py-4 sm:grid-cols-2">
        {[...PRESETS, { id: "custom", name: "Custom", description: "Pick modules yourself" } as Preset].map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setSelected(entry.id)}
            aria-pressed={selected === entry.id}
            className={cn(
              "rounded-lg border px-3 py-2 text-left transition-colors",
              selected === entry.id ? "border-accent/60 bg-accent/[0.08]" : "border-ink-700 bg-ink-900 hover:border-ink-600",
            )}
          >
            <span className="flex items-center justify-between text-13 font-medium text-zinc-100">
              {entry.name}
              {selected === entry.id ? <Check className="h-3.5 w-3.5 text-accent-soft" /> : null}
            </span>
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-ink-700 px-5 py-3">
        <p className="line-clamp-2 text-xs text-zinc-500">{preset?.description}</p>
        <Button variant="primary" size="sm" disabled={!canConfigure} onClick={() => { setResult(null); setOpen(true); }} title={canConfigure ? undefined : "Administrator access required"}>
          Review
        </Button>
      </div>

      <Modal
        open={open}
        onClose={() => !applying && setOpen(false)}
        size="lg"
        title={result ? `${preset?.name} applied` : `Apply ${preset?.name}?`}
        description={result ? "These settings were saved. INFERA picks them up immediately." : "Review exactly what changes. Settings not listed here are left untouched."}
        footer={
          result ? (
            <Button variant="primary" onClick={() => setOpen(false)}>
              Done
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setOpen(false)} disabled={applying}>
                Cancel
              </Button>
              <Button variant="primary" loading={applying} disabled={effective.length === 0} onClick={() => void apply()}>
                Apply {effective.length} change{effective.length === 1 ? "" : "s"}
              </Button>
            </>
          )
        }
      >
        {result ? (
          <div className="space-y-4">
            <Callout tone="success" title={`${result.changed.length} settings updated`} />
            {preset && preset.requires.length > 0 ? (
              <div>
                <p className="mb-2 text-xs font-medium text-zinc-300">Finish setup</p>
                <ul className="space-y-1.5">
                  {preset.requires.map((item) => (
                    <li key={item.key} className="flex items-center justify-between gap-3 rounded-lg border border-ink-700 px-3 py-2 text-xs">
                      <span className="text-zinc-300">{item.why}</span>
                      {values[item.key] && (!Array.isArray(values[item.key]) || (values[item.key] as unknown[]).length) ? (
                        <Badge tone="success">Set</Badge>
                      ) : (
                        <Badge tone="warning">Needs a {item.kind}</Badge>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="space-y-4">
            {selected === "custom" ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {CUSTOM_PRESET_KEYS.map((entry) => {
                  const current = Boolean(values[entry.key]);
                  const chosen = custom[entry.key] ?? current;
                  return (
                    <Checkbox
                      key={entry.key}
                      checked={chosen}
                      onChange={(checked) => setCustom((state) => ({ ...state, [entry.key]: checked }))}
                      label={entry.label}
                      description={current ? "Currently on" : "Currently off"}
                    />
                  );
                })}
              </div>
            ) : null}
            {effective.length === 0 ? (
              <Callout tone="neutral" title="Nothing to change">
                {selected === "custom" ? "Toggle modules above to build your preset." : "This server already matches this preset."}
              </Callout>
            ) : (
              <div className="overflow-hidden rounded-lg border border-ink-700">
                <table className="w-full text-xs">
                  <thead className="bg-ink-900">
                    <tr>
                      <th className="table-head">Setting</th>
                      <th className="table-head">Current</th>
                      <th className="table-head">New</th>
                    </tr>
                  </thead>
                  <tbody>
                    {effective.map((change) => (
                      <tr key={change.key} className="border-t border-ink-700/70">
                        <td className="px-4 py-2">
                          <p className="text-zinc-200">{keyLabel(change.key)}</p>
                          <p className="font-mono text-2xs text-zinc-600">{change.key}</p>
                        </td>
                        <td className="px-4 py-2 text-zinc-500">
                          {formatValue(change.current)}
                          {change.overwrites ? <span className="ml-1.5 rounded bg-amber-500/15 px-1 text-2xs text-amber-300">overwrites your value</span> : null}
                        </td>
                        <td className="px-4 py-2 font-medium text-zinc-100">{formatValue(change.next)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {preset && preset.requires.length > 0 ? (
              <div>
                <p className="mb-1.5 text-xs font-medium text-zinc-300">Channels and roles you'll need</p>
                <ul className="space-y-1 text-xs text-zinc-500">
                  {preset.requires.map((item) => (
                    <li key={item.key} className="flex flex-wrap items-center gap-1.5">
                      <span className="text-zinc-400">{item.why}</span> ·
                      {item.kind === "role" ? (
                        Array.isArray(values[item.key]) && (values[item.key] as string[]).length ? (
                          (values[item.key] as string[]).map((id) => <RoleName key={id} id={id} />)
                        ) : (
                          <span className="text-amber-400">not set</span>
                        )
                      ) : values[item.key] ? (
                        <ChannelName id={values[item.key] as string} />
                      ) : (
                        <span className="text-amber-400">not set</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {preset && preset.permissions.length > 0 ? (
              <p className="text-xs text-zinc-500">
                INFERA needs these Discord permissions for the enabled modules: <span className="text-zinc-300">{preset.permissions.join(", ")}</span>. Presets never change Discord permissions themselves.
              </p>
            ) : null}
          </div>
        )}
      </Modal>
    </Card>
  );
}

// ------------------------------------------------------- feature cards

interface Sub {
  label: string;
  path: string;
  enabled: boolean | null;
  unsupported?: boolean;
}

function FeatureCard({ icon: Icon, title, description, subs }: { icon: LucideIcon; title: string; description: string; subs: Sub[] }) {
  const { guildId } = useGuild();
  const toggleable = subs.filter((sub) => sub.enabled !== null);
  const on = toggleable.filter((sub) => sub.enabled).length;
  return (
    <Card className="flex flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-ink-600 bg-ink-800 text-accent-soft">
          <Icon className="h-[18px] w-[18px]" />
        </div>
        {toggleable.length > 0 ? (
          <Badge tone={on > 0 ? "success" : "neutral"}>
            {on}/{toggleable.length} active
          </Badge>
        ) : (
          <Badge>{subs.filter((sub) => !sub.unsupported).length} tools</Badge>
        )}
      </div>
      <p className="mt-3.5 text-sm font-semibold text-zinc-100">{title}</p>
      <p className="mt-0.5 text-xs text-zinc-500">{description}</p>
      <ul className="mt-4 space-y-0.5 border-t border-ink-700 pt-3">
        {subs.map((sub) => (
          <li key={sub.label}>
            <Link
              to={serverPath(guildId, sub.path)}
              className="group flex items-center gap-2 rounded-md px-2 py-1.5 text-13 text-zinc-400 transition-colors hover:bg-ink-750 hover:text-zinc-100"
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  sub.unsupported ? "bg-ink-500" : sub.enabled === null ? "bg-zinc-600" : sub.enabled ? "bg-emerald-400" : "bg-ink-500",
                )}
              />
              <span className="flex-1">{sub.label}</span>
              {sub.unsupported ? <span className="text-2xs text-zinc-600">unavailable</span> : null}
              <ArrowRight className="h-3.5 w-3.5 text-transparent transition-colors group-hover:text-zinc-500" />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function FeatureGrid() {
  const { modules, values } = useGuild();
  const mod = (id: string) => modules.find((module) => module.id === id)?.enabled ?? false;
  const autoroles = Array.isArray(values["welcome.autoroles"]) && (values["welcome.autoroles"] as string[]).length > 0;
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <FeatureCard
        icon={Shield}
        title="Moderation"
        description="Protect your server automatically."
        subs={[
          { label: "Auto Moderation", path: "automod", enabled: mod("automod") },
          { label: "Mod Actions", path: "moderation", enabled: mod("moderation") },
          { label: "Logs", path: "logging", enabled: mod("logging") },
        ]}
      />
      <FeatureCard
        icon={Heart}
        title="Messaging"
        description="Welcome members and automate communication."
        subs={[
          { label: "Welcome & Leave", path: "welcome", enabled: mod("welcome") || mod("goodbye") },
          { label: "Auto Roles", path: "roles", enabled: autoroles },
          { label: "Announcements", path: "announcements", enabled: null },
        ]}
      />
      <FeatureCard
        icon={Sparkles}
        title="Engagement"
        description="Keep your community active and growing."
        subs={[
          { label: "Leveling & XP", path: "leveling", enabled: mod("leveling") },
          { label: "Economy", path: "economy", enabled: mod("economy") },
          { label: "Giveaways", path: "giveaways", enabled: mod("giveaways") },
        ]}
      />
      <FeatureCard
        icon={Wrench}
        title="Utilities"
        description="Automations and tools that run on their own."
        subs={[
          { label: "Custom Commands", path: "custom-commands", enabled: null },
          { label: "Auto Responders", path: "autoresponders", enabled: null },
          { label: "Schedules", path: "schedules", enabled: null },
          { label: "Reminders", path: "unsupported/reminders", enabled: null, unsupported: true },
          { label: "Embed Builder", path: "unsupported/embed-builder", enabled: null, unsupported: true },
        ]}
      />
      <FeatureCard
        icon={Terminal}
        title="Commands"
        description="Every INFERA command, its permissions and usage."
        subs={[
          { label: "Command Catalogue", path: "commands", enabled: null },
          { label: "Command Permissions", path: "permissions", enabled: null },
          { label: "Custom Commands", path: "custom-commands", enabled: null },
          { label: "Command Usage", path: "analytics/commands", enabled: null },
        ]}
      />
      <FeatureCard
        icon={BarChart3}
        title="Analytics & More"
        description="Understand activity and connect other services."
        subs={[
          { label: "Server Analytics", path: "analytics", enabled: null },
          { label: "Member Activity", path: "analytics/members", enabled: null },
          { label: "Command Statistics", path: "analytics/commands", enabled: null },
          { label: "Integrations", path: "integrations", enabled: mod("roblox") || mod("social") },
          { label: "Audit History", path: "audit", enabled: null },
        ]}
      />
    </div>
  );
}

// -------------------------------------------------------- live + audit

function LiveFeed() {
  const { events, status } = useRealtime();
  const { guildId } = useGuild();
  return (
    <Card>
      <div className="flex items-center justify-between border-b border-ink-700 px-5 py-3.5">
        <p className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
          <Radio className="h-4 w-4 text-accent-soft" /> Live events
        </p>
        <span className="flex items-center gap-1.5 text-2xs text-zinc-500">
          <StatusDot tone={status === "open" ? "success" : "warning"} pulse={status === "open"} />
          {status === "open" ? "Listening" : status}
        </span>
      </div>
      {events.length === 0 ? (
        <EmptyState compact icon={Activity} title="Waiting for activity" description="Member joins, moderation actions, config changes and more appear here as they happen." />
      ) : (
        <ul className="max-h-80 divide-y divide-ink-700/60 overflow-y-auto">
          {events.slice(0, 25).map((event) => {
            const tone = eventTone(event.event);
            const data = event.data as Record<string, unknown>;
            const userId = (data.userId ?? data.targetId ?? data.actorId) as string | undefined;
            return (
              <li key={event.eventId} className="flex items-center gap-3 px-5 py-2.5">
                <StatusDot tone={tone === "neutral" ? "neutral" : tone} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-13 capitalize text-zinc-200">{eventLabel(event.event)}</span>
                  {userId ? <UserChip userId={userId} size={16} className="text-xs" /> : null}
                </span>
                <span className="shrink-0 text-2xs text-zinc-600">{timeAgo(event.timestamp)}</span>
              </li>
            );
          })}
        </ul>
      )}
      <Link to={serverPath(guildId, "activity")} className="block border-t border-ink-700 px-5 py-2.5 text-center text-xs text-zinc-500 hover:text-zinc-200">
        Open activity
      </Link>
    </Card>
  );
}

function RecentChanges() {
  const { guildId, level } = useGuild();
  const overview = useOverview(guildId);
  const rows = overview.data?.recentAudit ?? [];
  return (
    <Card>
      <div className="flex items-center justify-between border-b border-ink-700 px-5 py-3.5">
        <p className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
          <LayoutGrid className="h-4 w-4 text-accent-soft" /> Recent changes
        </p>
        {level >= 3 ? (
          <Link to={serverPath(guildId, "audit")} className="btn-ghost btn-sm">
            Audit log <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        ) : null}
      </div>
      {overview.isLoading ? (
        <div className="space-y-2 p-4">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-8" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState compact title="No changes recorded yet" description="Configuration and moderation changes made from Discord or here are recorded in the audit log." />
      ) : (
        <ul className="divide-y divide-ink-700/60">
          {rows.map((row) => (
            <li key={row.id} className="flex items-center gap-3 px-5 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-mono text-xs text-zinc-300">{row.action}</span>
                <UserChip userId={row.actorId} size={16} className="text-xs" />
              </span>
              <span className="shrink-0 text-2xs text-zinc-600" title={formatDate(row.createdAt)}>
                {timeAgo(row.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function HomePage() {
  return (
    <div>
      <ServerHeader />
      <div className="mb-4 grid gap-4 xl:grid-cols-[1.35fr_1fr]">
        <SystemUsageCard />
        <PresetCard />
      </div>
      <FeatureGrid />
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <LiveFeed />
        <RecentChanges />
      </div>
    </div>
  );
}
