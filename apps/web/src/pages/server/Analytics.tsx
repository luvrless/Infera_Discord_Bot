import { BarChart3, Coins, LayoutGrid, MessageSquare, Mic, Shield, ShieldAlert, Terminal, Ticket, UserMinus, UserPlus, Users } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { MetricCard, PageHeader, StatGrid } from "../../components/cards";
import { Badge, Card, CardHeader, Callout, Segmented, TextInput } from "../../components/ui/primitives";
import { EmptyState, ErrorState, PageSkeleton, Skeleton } from "../../components/ui/states";
import { DataTable } from "../../components/ui/table";
import { useAnalytics } from "../../lib/api/system";
import type { AnalyticsHistoryEntry } from "../../lib/api/types";
import { serverPath } from "../../lib/nav";
import { cn, formatNumber } from "../../lib/utils";
import { useGuild } from "../../hooks/useGuild";

/** Series colours chosen for contrast on near-black backgrounds. */
const COLORS = { violet: "#A78BFA", emerald: "#34D399", red: "#F87171", sky: "#38BDF8", amber: "#FBBF24", pink: "#F472B6" };

const tooltipStyle = { background: "#16161b", border: "1px solid #2c2c36", borderRadius: 8, fontSize: 12 };
const axisTick = { fill: "#71717a", fontSize: 11 };

type Series = { key: keyof AnalyticsHistoryEntry; label: string; color: string };

function shortDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function ChartCard({ title, description, icon, data, series, kind = "area", loading, height = 220, empty }: { title: string; description?: string; icon?: ReactNode; data: AnalyticsHistoryEntry[]; series: Series[]; kind?: "area" | "bar"; loading?: boolean; height?: number; empty?: boolean }) {
  const rows = data.map((entry) => ({ ...entry, label: shortDate(String(entry.date)) }));
  const total = series.reduce((sum, entry) => sum + data.reduce((acc, row) => acc + Number(row[entry.key] ?? 0), 0), 0);
  return (
    <Card>
      <CardHeader title={title} description={description} icon={icon} action={!loading && !empty ? <span className="text-13 font-semibold tabular-nums text-zinc-100">{formatNumber(total)}</span> : null} />
      <div className="px-2 py-4" style={{ height }}>
        {loading ? (
          <Skeleton className="mx-3 h-full" />
        ) : empty || rows.length === 0 ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-xs text-zinc-600">Historical analytics are not available for this period.</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {kind === "bar" ? (
              <BarChart data={rows} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#1d1d24" vertical={false} />
                <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} minTickGap={16} />
                <YAxis tick={axisTick} axisLine={false} tickLine={false} width={40} allowDecimals={false} />
                <Tooltip cursor={{ fill: "rgba(255,255,255,0.03)" }} contentStyle={tooltipStyle} labelStyle={{ color: "#a1a1aa" }} />
                {series.length > 1 ? <Legend wrapperStyle={{ fontSize: 11, color: "#a1a1aa" }} iconType="circle" iconSize={7} /> : null}
                {series.map((entry) => (
                  <Bar key={String(entry.key)} dataKey={entry.key as string} name={entry.label} fill={entry.color} radius={[3, 3, 0, 0]} maxBarSize={18} />
                ))}
              </BarChart>
            ) : (
              <AreaChart data={rows} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <defs>
                  {series.map((entry) => (
                    <linearGradient key={String(entry.key)} id={`fill-${String(entry.key)}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={entry.color} stopOpacity={0.28} />
                      <stop offset="100%" stopColor={entry.color} stopOpacity={0} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid stroke="#1d1d24" vertical={false} />
                <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} minTickGap={16} />
                <YAxis tick={axisTick} axisLine={false} tickLine={false} width={40} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: "#a1a1aa" }} cursor={{ stroke: "#3a3a46" }} />
                {series.length > 1 ? <Legend wrapperStyle={{ fontSize: 11, color: "#a1a1aa" }} iconType="circle" iconSize={7} /> : null}
                {series.map((entry) => (
                  <Area key={String(entry.key)} type="monotone" dataKey={entry.key as string} name={entry.label} stroke={entry.color} strokeWidth={1.75} fill={`url(#fill-${String(entry.key)})`} />
                ))}
              </AreaChart>
            )}
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
}

const VIEWS = [
  { id: "overview", label: "Overview" },
  { id: "members", label: "Members" },
  { id: "messages", label: "Messages" },
  { id: "commands", label: "Commands" },
  { id: "moderation", label: "Moderation" },
  { id: "modules", label: "Modules" },
] as const;

export function AnalyticsPage() {
  const { guildId, detail, can } = useGuild();
  const { view = "overview" } = useParams();
  const [range, setRange] = useState<number | "custom">(30);
  const [custom, setCustom] = useState("60");
  const days = range === "custom" ? Math.min(365, Math.max(1, Number(custom) || 30)) : range;
  const analytics = useAnalytics(guildId, days);
  const data = analytics.data;
  const history = useMemo(() => data?.history ?? [], [data]);
  const empty = data ? !data.dataAvailable || history.length === 0 : false;
  const total = (key: string) => (data && !empty ? data.totals[key] ?? 0 : null);
  const loading = analytics.isLoading;

  if (!can("view_analytics")) {
    return (
      <div>
        <PageHeader title="Analytics" icon={BarChart3} />
        <Card>
          <EmptyState title="Moderator access required" description="Analytics are visible to moderators and administrators." />
        </Card>
      </div>
    );
  }
  if (analytics.error && !data) return <ErrorState error={analytics.error} onRetry={() => void analytics.refetch()} />;

  return (
    <div>
      <PageHeader
        title="Analytics"
        icon={BarChart3}
        description="Daily snapshots recorded by the bot. Missing history is shown as unavailable — never as zero."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              value={range}
              onChange={setRange}
              size="sm"
              options={[
                { value: 1, label: "24h" },
                { value: 7, label: "7d" },
                { value: 30, label: "30d" },
                { value: 90, label: "90d" },
                { value: "custom", label: "Custom" },
              ]}
            />
            {range === "custom" ? (
              <span className="flex items-center gap-1.5 text-xs text-zinc-500">
                Last <TextInput type="number" min={1} max={365} value={custom} onChange={(event) => setCustom(event.target.value)} className="h-7 w-16 text-xs" /> days
              </span>
            ) : null}
          </div>
        }
      />
      <nav className="mb-5 flex gap-1 overflow-x-auto border-b border-ink-700" aria-label="Analytics views">
        {VIEWS.map((entry) => (
          <Link
            key={entry.id}
            to={serverPath(guildId, entry.id === "overview" ? "analytics" : `analytics/${entry.id}`)}
            className={cn("-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-13 font-medium", view === entry.id ? "border-accent text-zinc-100" : "border-transparent text-zinc-500 hover:text-zinc-200")}
          >
            {entry.label}
          </Link>
        ))}
      </nav>

      {loading ? <PageSkeleton /> : null}
      {!loading && empty ? (
        <Callout tone="info" className="mb-4" title="No historical data for this period">
          INFERA records one analytics snapshot per day once the bot is active in this server. Charts fill in as data is collected.
        </Callout>
      ) : null}

      {!loading && data ? (
        <>
          {view === "overview" ? (
            <>
              <StatGrid className="mb-4">
                <MetricCard label="Members" value={detail.guild.memberCount} icon={Users} hint="Current, from Discord" />
                <MetricCard label="Joins" value={total("memberJoins")} unavailable="No data" icon={UserPlus} tone="success" />
                <MetricCard label="Leaves" value={total("memberLeaves")} unavailable="No data" icon={UserMinus} tone="danger" />
                <MetricCard label="Messages" value={total("messages")} unavailable="No data" icon={MessageSquare} />
                <MetricCard label="Commands" value={total("commands")} unavailable="No data" icon={Terminal} tone="accent" />
                <MetricCard label="Moderation actions" value={total("moderation")} unavailable="No data" icon={Shield} tone="warning" />
                <MetricCard label="AutoMod actions" value={total("automod")} unavailable="No data" icon={ShieldAlert} />
                <MetricCard label="Active modules" value={`${data.enabledModules} / ${data.totalModules}`} icon={LayoutGrid} />
              </StatGrid>
              <div className="grid gap-4 xl:grid-cols-2">
                <ChartCard title="Member growth" icon={<Users className="h-4 w-4" />} data={history} kind="bar" empty={empty} series={[{ key: "memberJoins", label: "Joins", color: COLORS.emerald }, { key: "memberLeaves", label: "Leaves", color: COLORS.red }]} />
                <ChartCard title="Message activity" icon={<MessageSquare className="h-4 w-4" />} data={history} empty={empty} series={[{ key: "messages", label: "Messages", color: COLORS.violet }]} />
                <ChartCard title="Command usage" icon={<Terminal className="h-4 w-4" />} data={history} empty={empty} series={[{ key: "commands", label: "Commands", color: COLORS.sky }]} />
                <ChartCard title="Moderation activity" icon={<Shield className="h-4 w-4" />} data={history} kind="bar" empty={empty} series={[{ key: "moderation", label: "Moderation", color: COLORS.amber }, { key: "automod", label: "AutoMod", color: COLORS.pink }]} />
              </div>
            </>
          ) : null}

          {view === "members" ? (
            <div className="space-y-4">
              <StatGrid>
                <MetricCard label="Current members" value={detail.guild.memberCount} icon={Users} />
                <MetricCard label="Joins" value={total("memberJoins")} unavailable="No data" icon={UserPlus} tone="success" />
                <MetricCard label="Leaves" value={total("memberLeaves")} unavailable="No data" icon={UserMinus} tone="danger" />
                <MetricCard label="Net growth" value={empty ? null : (data.totals.memberJoins ?? 0) - (data.totals.memberLeaves ?? 0)} unavailable="No data" icon={BarChart3} />
              </StatGrid>
              <ChartCard title="Joins and leaves per day" data={history} kind="bar" height={300} empty={empty} series={[{ key: "memberJoins", label: "Joins", color: COLORS.emerald }, { key: "memberLeaves", label: "Leaves", color: COLORS.red }]} />
            </div>
          ) : null}

          {view === "messages" ? (
            <div className="space-y-4">
              <StatGrid>
                <MetricCard label="Messages" value={total("messages")} unavailable="No data" icon={MessageSquare} />
                <MetricCard label="Daily average" value={empty ? null : Math.round((data.totals.messages ?? 0) / Math.max(1, history.length))} unavailable="No data" icon={BarChart3} />
                <MetricCard label="Voice minutes" value={total("voiceMinutes")} unavailable="No data" icon={Mic} />
                <MetricCard label="Days recorded" value={history.length} icon={LayoutGrid} hint={`of the last ${days}`} />
              </StatGrid>
              <ChartCard title="Messages per day" data={history} height={300} empty={empty} series={[{ key: "messages", label: "Messages", color: COLORS.violet }]} />
              <ChartCard title="Voice minutes per day" description="Recorded when voice XP is enabled." data={history} empty={empty} series={[{ key: "voiceMinutes", label: "Voice minutes", color: COLORS.sky }]} />
            </div>
          ) : null}

          {view === "commands" ? (
            <div className="space-y-4">
              <StatGrid>
                <MetricCard label="Commands run" value={total("commands")} unavailable="No data" icon={Terminal} tone="accent" />
                <MetricCard label="Failures" value={total("commandFails")} unavailable="No data" icon={ShieldAlert} tone="danger" />
                <MetricCard label="Distinct commands" value={data.usage.length} icon={LayoutGrid} />
                <MetricCard label="Success rate" value={empty || !data.totals.commands ? null : `${Math.round(100 - ((data.totals.commandFails ?? 0) / data.totals.commands) * 100)}%`} unavailable="No data" icon={BarChart3} />
              </StatGrid>
              <ChartCard title="Commands per day" data={history} kind="bar" height={260} empty={empty} series={[{ key: "commands", label: "Commands", color: COLORS.sky }, { key: "commandFails", label: "Failures", color: COLORS.red }]} />
              <Card>
                <CardHeader title="Most used commands" description={`Last ${days} days, from the command usage log.`} icon={<Terminal className="h-4 w-4" />} />
                <DataTable
                  rows={data.usage}
                  rowKey={(row) => row.commandName}
                  empty={<EmptyState compact title="No command usage recorded" />}
                  columns={[
                    { id: "name", header: "Command", cell: (row) => <Link to={`${serverPath(guildId, "commands")}?command=${encodeURIComponent(row.commandName)}`} className="font-mono text-zinc-100 hover:text-accent-soft">{row.commandName}</Link> },
                    { id: "uses", header: "Uses", cell: (row) => formatNumber(row.uses) },
                    { id: "fails", header: "Failures", cell: (row) => (row.failures ? <span className="text-red-400">{formatNumber(row.failures)}</span> : "0") },
                    {
                      id: "share",
                      header: "Share",
                      cell: (row) => {
                        const max = data.usage[0]?.uses ?? 1;
                        return (
                          <div className="h-1.5 w-32 overflow-hidden rounded-full bg-ink-700">
                            <div className="h-full rounded-full bg-accent" style={{ width: `${(row.uses / max) * 100}%` }} />
                          </div>
                        );
                      },
                    },
                  ]}
                />
              </Card>
            </div>
          ) : null}

          {view === "moderation" ? (
            <div className="space-y-4">
              <StatGrid>
                <MetricCard label="Moderation actions" value={total("moderation")} unavailable="No data" icon={Shield} tone="warning" />
                <MetricCard label="AutoMod actions" value={total("automod")} unavailable="No data" icon={ShieldAlert} />
                <MetricCard label="Total cases (all time)" value={data.current.cases} icon={Shield} />
                <MetricCard label="Active warnings" value={data.current.activeWarnings} icon={ShieldAlert} tone="accent" />
              </StatGrid>
              <ChartCard title="Moderation vs AutoMod" data={history} kind="bar" height={300} empty={empty} series={[{ key: "moderation", label: "Moderation", color: COLORS.amber }, { key: "automod", label: "AutoMod", color: COLORS.pink }]} />
            </div>
          ) : null}

          {view === "modules" ? (
            <div className="space-y-4">
              <StatGrid>
                <MetricCard label="Tickets opened" value={total("tickets")} unavailable="No data" icon={Ticket} />
                <MetricCard label="Open tickets now" value={data.current.openTickets} icon={Ticket} tone="accent" />
                <MetricCard label="Economy activity" value={total("economy")} unavailable="No data" icon={Coins} tone="warning" />
                <MetricCard label="Active giveaways" value={data.current.activeGiveaways} icon={LayoutGrid} />
              </StatGrid>
              <div className="grid gap-4 xl:grid-cols-2">
                <ChartCard title="Ticket activity" data={history} kind="bar" empty={empty} series={[{ key: "tickets", label: "Tickets", color: COLORS.violet }]} />
                <ChartCard title="Economy activity" description="Ledger events per day." data={history} empty={empty} series={[{ key: "economy", label: "Economy", color: COLORS.amber }]} />
              </div>
              <Card>
                <CardHeader title="Module status" icon={<LayoutGrid className="h-4 w-4" />} />
                <div className="grid gap-2 p-5 sm:grid-cols-2 lg:grid-cols-3">
                  {data.modules.map((module) => (
                    <div key={module.id} className="flex items-center justify-between rounded-lg border border-ink-700 px-3 py-2 text-13">
                      <span className="text-zinc-300">{module.name}</span>
                      {module.configurable ? <Badge tone={module.enabled ? "success" : "neutral"} dot>{module.enabled ? "on" : "off"}</Badge> : <Badge>always on</Badge>}
                    </div>
                  ))}
                </div>
              </Card>
              <p className="text-2xs text-zinc-600">XP progression and giveaway participation history aren't part of the daily snapshot yet — see Leveling and Giveaways for current values.</p>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
