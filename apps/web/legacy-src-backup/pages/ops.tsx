import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  Ban,
  Check,
  ChevronRight,
  Clock,
  Gavel,
  History,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Siren,
  Trash2,
  UserX,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ActivityChart, CommandBarChart } from "../components/Charts";
import { ConfigForm } from "../components/ConfigForm";
import { useGuildData } from "../components/GuildGate";
import { useToast } from "../components/Toast";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Drawer,
  EmptyState,
  ErrorState,
  Field,
  InfoNote,
  Input,
  Modal,
  MultiOption,
  MultiSelect,
  PageHeader,
  Pagination,
  Select,
  Skeleton,
  Stat,
  Tabs,
  Textarea,
  Toggle,
  cn,
} from "../components/ui";
import { api } from "../lib/api";
import { qk, useChannels, useRoles, useSaveConfig, useSchema, useSettings } from "../lib/hooks";
import type {
  AnalyticsResponse,
  Appeal,
  AuditEntry,
  AutomodResponse,
  AutomodRule,
  CommandInfo,
  ModerationCase,
  ModerationStats,
  SecurityEvent,
  Warning,
  WhitelistEntry,
} from "../lib/types";
import { compactNumber, formatDate, relativeTime } from "../lib/utils";

/* ------------------------------------------------------------- moderation */

export function ModerationPage() {
  const { guildId } = useGuildData();
  const { push } = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("cases");
  const [page, setPage] = useState(1);
  const [type, setType] = useState("");
  const [form, setForm] = useState({
    action: "warn",
    targetId: "",
    reason: "",
    durationSeconds: 600,
  });
  const [selectedCase, setSelectedCase] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState(false);

  const stats = useQuery({
    queryKey: ["moderation-stats", guildId],
    queryFn: () => api.get<ModerationStats>(`/guilds/${guildId}/moderation/stats`),
  });
  const cases = useQuery({
    queryKey: ["moderation-cases", guildId, page, type],
    queryFn: () =>
      api.get<{ total: number; rows: ModerationCase[]; page: number; pageSize: number }>(
        `/guilds/${guildId}/moderation/cases?page=${page}&pageSize=20${type ? `&type=${type}` : ""}`,
      ),
  });
  const warnings = useQuery({
    queryKey: ["moderation-warnings", guildId],
    queryFn: () => api.get<{ warnings: Warning[] }>(`/guilds/${guildId}/moderation/warnings`),
    enabled: tab === "warnings",
  });
  const appeals = useQuery({
    queryKey: ["moderation-appeals", guildId],
    queryFn: () => api.get<{ appeals: Appeal[] }>(`/guilds/${guildId}/moderation/appeals`),
    enabled: tab === "appeals",
  });
  const detail = useQuery({
    queryKey: ["moderation-case", guildId, selectedCase],
    queryFn: () =>
      api.get<{ case: ModerationCase & { evidence: Array<{ id: string; url: string }>; metadataParsed: Record<string, unknown> } }>(
        `/guilds/${guildId}/moderation/cases/${selectedCase}`,
      ),
    enabled: Boolean(selectedCase),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["moderation-cases", guildId] });
    void queryClient.invalidateQueries({ queryKey: ["moderation-stats", guildId] });
    void queryClient.invalidateQueries({ queryKey: ["moderation-warnings", guildId] });
    void queryClient.invalidateQueries({ queryKey: ["overview", guildId] });
  };

  const runAction = useMutation({
    mutationFn: () =>
      api.post<{ case: ModerationCase; count?: number }>(`/guilds/${guildId}/moderation/actions`, {
        action: form.action,
        targetId: form.targetId,
        reason: form.reason,
        durationSeconds: ["timeout", "ban", "tempban"].includes(form.action) ? form.durationSeconds : undefined,
      }),
    onSuccess: (result) => {
      setConfirmAction(false);
      setForm({ ...form, targetId: "", reason: "" });
      invalidate();
      push({
        title: `Case #${result.case.caseNumber} created`,
        description: result.count !== undefined ? `Member now has ${result.count} active warnings.` : undefined,
        tone: "success",
      });
    },
    onError: (error) => {
      setConfirmAction(false);
      push({ title: "Moderation action failed", description: error.message, tone: "error" });
    },
  });

  const removeWarning = useMutation({
    mutationFn: (id: string) => api.del(`/guilds/${guildId}/moderation/warnings/${id}`),
    onSuccess: () => {
      invalidate();
      push({ title: "Warning removed", tone: "success" });
    },
    onError: (error) => push({ title: "Could not remove warning", description: error.message, tone: "error" }),
  });

  const reviewAppeal = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "approved" | "rejected" }) =>
      api.post(`/guilds/${guildId}/moderation/appeals/${id}/review`, { status }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["moderation-appeals", guildId] });
      push({ title: "Appeal reviewed", tone: "success" });
    },
    onError: (error) => push({ title: "Appeal review failed", description: error.message, tone: "error" }),
  });

  return (
    <div>
      <PageHeader title="Moderation" description="Cases, warnings, appeals and real Discord actions." />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Total cases" value={stats.data?.total ?? 0} icon={<Gavel className="h-4 w-4" />} />
        <Stat label="Last 30 days" value={stats.data?.last30Days ?? 0} icon={<Activity className="h-4 w-4" />} />
        <Stat label="Active warnings" value={stats.data?.activeWarnings ?? 0} icon={<AlertTriangle className="h-4 w-4" />} />
        <Stat label="Pending appeals" value={stats.data?.pendingAppeals ?? 0} icon={<Siren className="h-4 w-4" />} />
      </div>

      <Card className="mt-4 p-4">
        <h2 className="text-sm font-semibold text-zinc-200">Take action</h2>
        <p className="mt-0.5 text-xs text-zinc-500">
          Executed against Discord through the bot with an audited case. Requires moderator access in INFERA.
        </p>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Field label="Action">
            <Select
              value={form.action}
              onChange={(event) => setForm({ ...form, action: event.target.value })}
              options={[
                { value: "warn", label: "Warn" },
                { value: "timeout", label: "Timeout" },
                { value: "kick", label: "Kick" },
                { value: "ban", label: "Ban" },
                { value: "unban", label: "Unban" },
                { value: "untimeout", label: "Remove timeout" },
              ]}
            />
          </Field>
          <Field label="Member ID">
            <Input
              value={form.targetId}
              onChange={(event) => setForm({ ...form, targetId: event.target.value.trim() })}
              placeholder="Discord user ID"
              className="font-mono"
            />
          </Field>
          <Field label="Reason">
            <Input value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} />
          </Field>
          {form.action === "timeout" ? (
            <Field label="Duration (seconds)">
              <Input
                type="number"
                value={form.durationSeconds}
                onChange={(event) => setForm({ ...form, durationSeconds: Number(event.target.value) })}
              />
            </Field>
          ) : (
            <div className="flex items-end">
              <Button
                variant="primary"
                className="h-9"
                disabled={!form.targetId}
                onClick={() => (["ban", "kick"].includes(form.action) ? setConfirmAction(true) : runAction.mutate())}
                loading={runAction.isPending}
              >
                Execute {form.action}
              </Button>
            </div>
          )}
          {form.action === "timeout" ? (
            <div className="flex items-end">
              <Button
                variant="primary"
                className="h-9"
                disabled={!form.targetId}
                onClick={() => setConfirmAction(true)}
                loading={runAction.isPending}
              >
                Execute timeout
              </Button>
            </div>
          ) : null}
        </div>
      </Card>

      <Card className="mt-4 overflow-hidden">
        <div className="px-3 pt-2">
          <Tabs
            items={[
              { id: "cases", label: "Cases", count: stats.data?.total },
              { id: "warnings", label: "Warnings", count: stats.data?.activeWarnings },
              { id: "appeals", label: "Appeals", count: stats.data?.pendingAppeals },
            ]}
            active={tab}
            onChange={setTab}
          />
        </div>

        {tab === "cases" ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <div className="w-44">
                <Select
                  value={type}
                  onChange={(event) => {
                    setType(event.target.value);
                    setPage(1);
                  }}
                  placeholder="All actions"
                  options={(stats.data?.byType ?? []).map((entry) => ({ value: entry.type, label: entry.type }))}
                />
              </div>
              <Button variant="ghost" onClick={() => void cases.refetch()} loading={cases.isFetching}>
                <Search className="h-3.5 w-3.5" /> Refresh
              </Button>
            </div>
            {cases.isError ? <ErrorState error={cases.error} onRetry={() => void cases.refetch()} /> : null}
            {cases.isLoading ? <div className="p-4"><Skeleton className="h-40" /></div> : null}
            {(cases.data?.rows ?? []).length === 0 && !cases.isLoading ? (
              <EmptyState compact title="No moderation cases" description="Cases appear when a moderator takes action." />
            ) : null}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px]">
                <thead className="border-y border-ink-700">
                  <tr>
                    <th className="table-head">Case</th>
                    <th className="table-head">Action</th>
                    <th className="table-head">Member</th>
                    <th className="table-head">Moderator</th>
                    <th className="table-head">Reason</th>
                    <th className="table-head">When</th>
                    <th className="table-head" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-800">
                  {(cases.data?.rows ?? []).map((entry) => (
                    <tr key={entry.id} className="hover:bg-ink-750/40">
                      <td className="table-cell">#{entry.caseNumber}</td>
                      <td className="table-cell">
                        <Badge tone={entry.type.includes("ban") ? "danger" : entry.type === "warn" ? "warning" : "neutral"}>
                          {entry.type}
                        </Badge>
                      </td>
                      <td className="table-cell font-mono text-2xs">{entry.targetId}</td>
                      <td className="table-cell font-mono text-2xs">{entry.moderatorId}</td>
                      <td className="table-cell max-w-[220px] truncate">{entry.reason ?? "No reason"}</td>
                      <td className="table-cell text-2xs text-zinc-500">{relativeTime(entry.createdAt)}</td>
                      <td className="table-cell text-right">
                        <Button variant="ghost" onClick={() => setSelectedCase(entry.id)} aria-label="Open case">
                          <ChevronRight className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {cases.data ? (
              <Pagination
                page={cases.data.page}
                pages={Math.max(1, Math.ceil(cases.data.total / cases.data.pageSize))}
                onPage={setPage}
                total={cases.data.total}
              />
            ) : null}
          </>
        ) : null}

        {tab === "warnings" ? (
          <div>
            {(warnings.data?.warnings ?? []).length === 0 ? (
              <EmptyState compact title="No active warnings" />
            ) : null}
            <div className="divide-y divide-ink-800">
              {(warnings.data?.warnings ?? []).map((warning) => (
                <div key={warning.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-xs text-zinc-300">{warning.reason}</p>
                    <p className="mt-0.5 font-mono text-2xs text-zinc-600">
                      {warning.userId} · by {warning.moderatorId} · {relativeTime(warning.createdAt)}
                    </p>
                  </div>
                  <Button variant="ghost" onClick={() => removeWarning.mutate(warning.id)}>
                    <Trash2 className="h-3.5 w-3.5" /> Remove
                  </Button>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {tab === "appeals" ? (
          <div>
            {(appeals.data?.appeals ?? []).length === 0 ? (
              <EmptyState compact title="No appeals" description="Appeals appear when members submit one through the bot." />
            ) : null}
            <div className="divide-y divide-ink-800">
              {(appeals.data?.appeals ?? []).map((appeal) => (
                <div key={appeal.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-xs text-zinc-300">Case {appeal.caseId}</p>
                    <p className="mt-0.5 font-mono text-2xs text-zinc-600">
                      {appeal.userId} · {formatDate(appeal.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={appeal.status === "pending" ? "warning" : appeal.status === "approved" ? "success" : "danger"}>
                      {appeal.status}
                    </Badge>
                    {appeal.status === "pending" ? (
                      <>
                        <Button variant="secondary" onClick={() => reviewAppeal.mutate({ id: appeal.id, status: "approved" })}>
                          <Check className="h-3.5 w-3.5" /> Approve
                        </Button>
                        <Button variant="ghost" onClick={() => reviewAppeal.mutate({ id: appeal.id, status: "rejected" })}>
                          Reject
                        </Button>
                      </>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </Card>

      <Drawer open={Boolean(selectedCase)} onClose={() => setSelectedCase(null)} title="Case details">
        {detail.isLoading ? <Skeleton className="h-40" /> : null}
        {detail.data ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-lg font-semibold text-zinc-100">Case #{detail.data.case.caseNumber}</p>
                <p className="text-xs text-zinc-500">{formatDate(detail.data.case.createdAt)}</p>
              </div>
              <Badge tone="neutral">{detail.data.case.status}</Badge>
            </div>
            <dl className="space-y-2.5 text-sm">
              {[
                ["Action", detail.data.case.type],
                ["Member", detail.data.case.targetId],
                ["Moderator", detail.data.case.moderatorId],
                ["Reason", detail.data.case.reason ?? "No reason"],
                ["Expires", detail.data.case.expiresAt ? formatDate(detail.data.case.expiresAt) : "Never"],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-4 border-b border-ink-800 pb-2">
                  <dt className="text-xs text-zinc-500">{label}</dt>
                  <dd className="max-w-[65%] break-words text-right text-xs text-zinc-300">{value}</dd>
                </div>
              ))}
            </dl>
            <div>
              <p className="mb-1.5 text-xs font-medium text-zinc-400">Evidence</p>
              {detail.data.case.evidence.length === 0 ? (
                <p className="text-xs text-zinc-500">No evidence attached.</p>
              ) : (
                <ul className="space-y-1">
                  {detail.data.case.evidence.map((item) => (
                    <li key={item.id}>
                      <a href={item.url} target="_blank" rel="noreferrer" className="text-xs text-accent-soft hover:underline">
                        {item.url}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <p className="mb-1.5 text-xs font-medium text-zinc-400">Metadata</p>
              <pre className="overflow-x-auto rounded-lg border border-ink-700 bg-ink-900 p-3 text-2xs text-zinc-400">
                {JSON.stringify(detail.data.case.metadataParsed, null, 2)}
              </pre>
            </div>
          </div>
        ) : null}
      </Drawer>

      <ConfirmDialog
        open={confirmAction}
        onClose={() => setConfirmAction(false)}
        onConfirm={() => runAction.mutate()}
        loading={runAction.isPending}
        destructive
        title={`${form.action === "ban" ? "Ban" : "Kick"} this member?`}
        description={
          <span>
            This executes a real Discord action against <code className="font-mono">{form.targetId}</code> and opens an
            audited case. It cannot be undone from here.
          </span>
        }
        confirmLabel={`Confirm ${form.action}`}
      />
    </div>
  );
}

/* ---------------------------------------------------------------- automod */

export function AutomodPage() {
  const { guildId } = useGuildData();
  const query = useQuery({
    queryKey: ["automod", guildId],
    queryFn: () => api.get<AutomodResponse>(`/guilds/${guildId}/automod`),
  });
  const settings = useSettings(guildId);
  const roles = useRoles(guildId);
  const channels = useChannels(guildId);
  const save = useSaveConfig(guildId);
  const { push } = useToast();
  const queryClient = useQueryClient();
  const [testContent, setTestContent] = useState("");
  const [testResult, setTestResult] = useState<Array<{ rule: string; label: string; action: string; reason: string }> | null>(null);
  const [testing, setTesting] = useState(false);

  const saveExemptions = async (key: "automod.exempt_roles" | "automod.exempt_channels", values: string[]) => {
    try {
      await save.mutateAsync({ [key]: values });
      void queryClient.invalidateQueries({ queryKey: ["automod", guildId] });
      push({ title: "Exemptions updated", tone: "success" });
    } catch (error) {
      push({ title: "Could not save exemptions", description: error instanceof Error ? error.message : "Unknown error", tone: "error" });
    }
  };

  const runTest = async () => {
    setTesting(true);
    try {
      const result = await api.post<{ matches: typeof testResult }>(`/guilds/${guildId}/automod/test`, { content: testContent });
      setTestResult(result.matches ?? []);
    } catch (error) {
      push({ title: "Test failed", description: error instanceof Error ? error.message : "Unknown error", tone: "error" });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div>
      <PageHeader title="AutoMod" description="Content rules evaluated on every message. Changes apply immediately." />
      {query.isError ? <ErrorState error={query.error} onRetry={() => void query.refetch()} /> : null}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {(query.data?.rules ?? []).map((rule) => (
          <AutomodRuleCard key={rule.type} guildId={guildId} rule={rule} actions={query.data?.actions ?? []} />
        ))}
        {query.isLoading ? Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-40" />) : null}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h2 className="text-sm font-semibold text-zinc-200">Exemptions</h2>
          <p className="mt-0.5 text-xs text-zinc-500">Exempt roles and channels are skipped entirely by automod.</p>
          <div className="mt-3 space-y-4">
            <Field label="Exempt roles">
              <MultiSelect
                values={query.data?.exemptions.roles ?? []}
                onChange={(values) => void saveExemptions("automod.exempt_roles", values)}
              >
                {(roles.data?.roles ?? []).slice(0, 30).map((role) => (
                  <MultiOption key={role.id} value={role.id} label={role.name} />
                ))}
              </MultiSelect>
            </Field>
            <Field label="Exempt channels">
              <MultiSelect
                values={query.data?.exemptions.channels ?? []}
                onChange={(values) => void saveExemptions("automod.exempt_channels", values)}
              >
                {(channels.data?.channels ?? []).slice(0, 40).map((channel) => (
                  <MultiOption key={channel.id} value={channel.id} label={`# ${channel.name}`} />
                ))}
              </MultiSelect>
            </Field>
            {settings.data ? (
              <InfoNote>
                AutoMod master switch is currently{" "}
                <span className={settings.data.values["automod.enabled"] ? "text-emerald-400" : "text-zinc-400"}>
                  {settings.data.values["automod.enabled"] ? "enabled" : "disabled"}
                </span>
                . Change it in General → AutoMod.
              </InfoNote>
            ) : null}
          </div>
        </Card>

        <Card className="p-4">
          <h2 className="text-sm font-semibold text-zinc-200">Rule tester</h2>
          <p className="mt-0.5 text-xs text-zinc-500">Runs the same checks against a sample message. Nothing is sent to Discord.</p>
          <Textarea
            className="mt-3"
            rows={4}
            value={testContent}
            onChange={(event) => setTestContent(event.target.value)}
            placeholder="Paste a message to test…"
          />
          <Button variant="primary" className="mt-2" onClick={() => void runTest()} loading={testing} disabled={!testContent.trim()}>
            Test message
          </Button>
          {testResult ? (
            <div className="mt-3 space-y-1.5">
              {testResult.length === 0 ? (
                <p className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-400">
                  No rules matched this message.
                </p>
              ) : null}
              {testResult.map((match) => (
                <div key={`${match.rule}-${match.reason}`} className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2">
                  <p className="text-xs font-medium text-amber-300">
                    {match.label} → {match.action}
                  </p>
                  <p className="text-2xs text-amber-200/70">{match.reason}</p>
                </div>
              ))}
            </div>
          ) : null}
        </Card>
      </div>
    </div>
  );
}

function AutomodRuleCard({ guildId, rule, actions }: { guildId: string; rule: AutomodRule; actions: string[] }) {
  const { push } = useToast();
  const queryClient = useQueryClient();
  const [enabled, setEnabled] = useState(rule.enabled);
  const [action, setAction] = useState(rule.action ?? "delete");
  const [threshold, setThreshold] = useState(rule.threshold ?? 0);
  const [windowSeconds, setWindowSeconds] = useState(rule.windowSeconds ?? 0);
  const [list, setList] = useState((rule.list ?? []).join("\n"));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await api.patch(`/guilds/${guildId}/automod/rules/${rule.type}`, {
        enabled,
        ...(rule.supports.action ? { action } : {}),
        ...(rule.supports.threshold ? { threshold } : {}),
        ...(rule.supports.window ? { windowSeconds } : {}),
        ...(rule.supports.list ? { list: list.split("\n").map((entry) => entry.trim()).filter(Boolean) } : {}),
      });
      void queryClient.invalidateQueries({ queryKey: ["automod", guildId] });
      push({ title: `${rule.label} saved`, tone: "success" });
    } catch (error) {
      push({ title: "Could not save rule", description: error instanceof Error ? error.message : "Unknown error", tone: "error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-zinc-200">{rule.label}</p>
          <p className="mt-0.5 text-xs text-zinc-500">{rule.description}</p>
        </div>
        <Toggle checked={enabled} onChange={setEnabled} />
      </div>
      <div className="mt-3 space-y-2">
        {rule.supports.action ? (
          <Select
            value={action}
            onChange={(event) => setAction(event.target.value)}
            options={actions.map((entry) => ({ value: entry, label: entry }))}
          />
        ) : null}
        {rule.supports.threshold ? (
          <Input type="number" value={threshold} onChange={(event) => setThreshold(Number(event.target.value))} placeholder="Threshold" />
        ) : null}
        {rule.supports.window ? (
          <Input
            type="number"
            value={windowSeconds}
            onChange={(event) => setWindowSeconds(Number(event.target.value))}
            placeholder="Window (seconds)"
          />
        ) : null}
        {rule.supports.list ? (
          <Textarea
            rows={3}
            className="font-mono text-xs"
            value={list}
            onChange={(event) => setList(event.target.value)}
            placeholder={rule.type === "regex" ? "One regular expression per line" : "One word per line"}
          />
        ) : null}
      </div>
      <Button variant="secondary" className="mt-3 w-full" onClick={() => void save()} loading={saving}>
        Save rule
      </Button>
    </Card>
  );
}

/* --------------------------------------------------------------- security */

export function SecurityPage() {
  const { guildId } = useGuildData();
  const schema = useSchema();
  const definitions = (schema.data?.schema.keys ?? []).filter((definition) => definition.key.startsWith("security."));
  const settings = useSettings(guildId);
  const channels = useChannels(guildId);
  const save = useSaveConfig(guildId);
  const { push } = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("settings");
  const [targetId, setTargetId] = useState("");
  const [targetType, setTargetType] = useState("user");

  const query = useQuery({
    queryKey: ["security", guildId],
    queryFn: () =>
      api.get<{ values: Record<string, unknown>; events: SecurityEvent[]; whitelist: WhitelistEntry[] }>(
        `/guilds/${guildId}/security`,
      ),
  });

  const addWhitelist = useMutation({
    mutationFn: () => api.post(`/guilds/${guildId}/security/whitelist`, { targetId, targetType }),
    onSuccess: () => {
      setTargetId("");
      void queryClient.invalidateQueries({ queryKey: ["security", guildId] });
      push({ title: "Whitelist entry added", tone: "success" });
    },
    onError: (error) => push({ title: "Could not add entry", description: error.message, tone: "error" }),
  });
  const removeWhitelist = useMutation({
    mutationFn: (id: string) => api.del(`/guilds/${guildId}/security/whitelist/${id}`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["security", guildId] }),
  });
  const resolveEvent = useMutation({
    mutationFn: (id: string) => api.post(`/guilds/${guildId}/security/events/${id}/resolve`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["security", guildId] }),
  });

  return (
    <div>
      <PageHeader title="Security" description="Antinuke, antiraid and the live security event feed." />
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat
          label="Anti-nuke"
          value={settings.data?.values["security.antinuke.enabled"] ? "Armed" : "Off"}
          hint={`Threshold ${settings.data?.values["security.antinuke.threshold"] ?? 3} actions / ${settings.data?.values["security.antinuke.window_seconds"] ?? 10}s`}
          icon={<ShieldAlert className="h-4 w-4" />}
        />
        <Stat
          label="Anti-raid"
          value={settings.data?.values["security.antiraid.enabled"] ? "Armed" : "Off"}
          hint={`${settings.data?.values["security.antiraid.join_threshold"] ?? 10} joins / ${settings.data?.values["security.antiraid.window_seconds"] ?? 10}s`}
          icon={<Siren className="h-4 w-4" />}
        />
        <Stat label="Unresolved events" value={(query.data?.events ?? []).filter((event) => !event.resolved).length} icon={<Shield className="h-4 w-4" />} />
      </div>

      <Card className="mt-4 overflow-hidden">
        <div className="px-3 pt-2">
          <Tabs
            items={[
              { id: "settings", label: "Protection" },
              { id: "whitelist", label: "Whitelist", count: query.data?.whitelist.length },
              { id: "events", label: "Events", count: query.data?.events.length },
            ]}
            active={tab}
            onChange={setTab}
          />
        </div>

        {tab === "settings" ? (
          <div className="p-4">
            {settings.data ? (
              <ConfigForm
                key={`security-${settings.data.version}`}
                definitions={definitions}
                values={settings.data.values}
                channels={channels.data?.channels ?? []}
                saving={save.isPending}
                onSave={async (patch) => {
                  await save.mutateAsync(patch);
                  void queryClient.invalidateQueries({ queryKey: ["security", guildId] });
                }}
              />
            ) : (
              <Skeleton className="h-64" />
            )}
          </div>
        ) : null}

        {tab === "whitelist" ? (
          <div className="p-4">
            <div className="flex flex-wrap items-end gap-2">
              <Field label="Type" className="w-32">
                <Select
                  value={targetType}
                  onChange={(event) => setTargetType(event.target.value)}
                  options={[
                    { value: "user", label: "User" },
                    { value: "role", label: "Role" },
                  ]}
                />
              </Field>
              <Field label="Discord ID" className="min-w-[220px] flex-1">
                <Input value={targetId} onChange={(event) => setTargetId(event.target.value.trim())} className="font-mono" />
              </Field>
              <Button variant="primary" onClick={() => addWhitelist.mutate()} loading={addWhitelist.isPending} disabled={!targetId}>
                Add to whitelist
              </Button>
            </div>
            <div className="mt-4 divide-y divide-ink-800">
              {(query.data?.whitelist ?? []).map((entry) => (
                <div key={entry.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div>
                    <p className="font-mono text-xs text-zinc-300">{entry.targetId}</p>
                    <p className="text-2xs text-zinc-600">
                      {entry.targetType} · added {relativeTime(entry.createdAt)}
                    </p>
                  </div>
                  <Button variant="ghost" onClick={() => removeWhitelist.mutate(entry.id)} aria-label="Remove entry">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
              {(query.data?.whitelist ?? []).length === 0 ? <p className="py-6 text-center text-xs text-zinc-500">No whitelist entries.</p> : null}
            </div>
          </div>
        ) : null}

        {tab === "events" ? (
          <div>
            {(query.data?.events ?? []).length === 0 ? <EmptyState compact title="No security events" /> : null}
            <div className="divide-y divide-ink-800">
              {(query.data?.events ?? []).map((event) => (
                <div key={event.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge tone={event.severity === "high" || event.severity === "critical" ? "danger" : "warning"}>
                        {event.severity}
                      </Badge>
                      <p className="text-xs text-zinc-300">{event.type.replaceAll(".", " ")}</p>
                      {event.resolved ? <Badge tone="success">Resolved</Badge> : null}
                    </div>
                    <p className="mt-1 text-2xs text-zinc-600">
                      {event.actorId ? `Actor ${event.actorId} · ` : ""}
                      {formatDate(event.createdAt)}
                    </p>
                  </div>
                  {!event.resolved ? (
                    <Button variant="secondary" onClick={() => resolveEvent.mutate(event.id)}>
                      Mark resolved
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </Card>
    </div>
  );
}

/* --------------------------------------------------------------- commands */

export function CommandsPage() {
  const { guildId } = useGuildData();
  const [params] = useSearchParams();
  const [queryText, setQueryText] = useState(params.get("q") ?? "");
  const [category, setCategory] = useState("");
  const [editing, setEditing] = useState<CommandInfo | null>(null);
  const [level, setLevel] = useState(0);
  const [cooldown, setCooldown] = useState(3000);
  const { push } = useToast();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["guild-commands", guildId],
    queryFn: () => api.get<{ commands: CommandInfo[]; level: number }>(`/guilds/${guildId}/commands`),
  });

  const update = useMutation({
    mutationFn: ({ name, body }: { name: string; body: Record<string, unknown> }) =>
      api.patch(`/guilds/${guildId}/commands/${name}`, body),
    onSuccess: () => {
      setEditing(null);
      void queryClient.invalidateQueries({ queryKey: ["guild-commands", guildId] });
      push({ title: "Command updated", tone: "success" });
    },
    onError: (error) => push({ title: "Could not update command", description: error.message, tone: "error" }),
  });

  const commands = query.data?.commands ?? [];
  const categories = [...new Set(commands.map((command) => command.category))];
  const filtered = commands.filter((command) => {
    if (category && command.category !== category) return false;
    if (!queryText.trim()) return true;
    const term = queryText.toLowerCase();
    return command.name.includes(term) || command.description.toLowerCase().includes(term);
  });

  return (
    <div>
      <PageHeader
        title="Commands"
        description={`${commands.length} commands. Overrides change prefix and slash behaviour for this server only.`}
      />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-600" />
          <Input value={queryText} onChange={(event) => setQueryText(event.target.value)} placeholder="Search commands" className="pl-8" />
        </div>
        <Select
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          placeholder="All categories"
          options={categories.map((entry) => ({ value: entry, label: entry }))}
          className="w-44"
        />
      </div>
      <Card className="overflow-hidden">
        {query.isError ? <ErrorState error={query.error} onRetry={() => void query.refetch()} /> : null}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px]">
            <thead className="border-b border-ink-700">
              <tr>
                <th className="table-head">Command</th>
                <th className="table-head">Category</th>
                <th className="table-head">Level</th>
                <th className="table-head">Cooldown</th>
                <th className="table-head">Usage 30d</th>
                <th className="table-head">Enabled</th>
                <th className="table-head" />
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-800">
              {filtered.map((command) => (
                <tr key={command.name} className="hover:bg-ink-750/40">
                  <td className="table-cell">
                    <p className="font-mono text-xs text-zinc-200">/{command.name}</p>
                    <p className="max-w-[280px] truncate text-2xs text-zinc-600">{command.description}</p>
                  </td>
                  <td className="table-cell text-2xs capitalize text-zinc-500">{command.category}</td>
                  <td className="table-cell text-2xs">{command.level ?? command.defaultLevel}</td>
                  <td className="table-cell text-2xs">{Math.round((command.effectiveCooldownMs ?? command.cooldownMs) / 1000)}s</td>
                  <td className="table-cell text-2xs">{command.usage?.uses ?? 0}</td>
                  <td className="table-cell">
                    <Toggle
                      checked={command.enabled}
                      onChange={(enabled) => update.mutate({ name: command.name, body: { enabled } })}
                    />
                  </td>
                  <td className="table-cell text-right">
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setEditing(command);
                        setLevel(command.level ?? command.defaultLevel);
                        setCooldown(command.effectiveCooldownMs ?? command.cooldownMs);
                      }}
                    >
                      Edit
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 ? <EmptyState compact title="No commands match" description="Try another name or category." /> : null}
      </Card>

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={`Configure /${editing?.name ?? ""}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() =>
                editing && update.mutate({ name: editing.name, body: { level, cooldownMs: cooldown } })
              }
              loading={update.isPending}
            >
              Save override
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Required permission level" hint="0 member · 1 trusted · 2 moderator · 3 administrator">
            <Input type="number" min={0} max={5} value={level} onChange={(event) => setLevel(Number(event.target.value))} />
          </Field>
          <Field label="Cooldown (ms)">
            <Input type="number" min={0} value={cooldown} onChange={(event) => setCooldown(Number(event.target.value))} />
          </Field>
          <InfoNote>Overrides apply to both prefix and slash invocations of the command in this server.</InfoNote>
        </div>
      </Modal>
    </div>
  );
}

/* -------------------------------------------------------------- analytics */

export function AnalyticsPage() {
  const { guildId } = useGuildData();
  const [days, setDays] = useState(30);
  const query = useQuery({
    queryKey: ["analytics", guildId, days],
    queryFn: () => api.get<AnalyticsResponse>(`/guilds/${guildId}/analytics?days=${days}`),
  });
  const data = query.data;

  return (
    <div>
      <PageHeader
        title="Analytics"
        description="Activity recorded by the bot. Nothing here is estimated or generated."
        actions={
          <div className="flex gap-1">
            {[7, 14, 30, 90].map((range) => (
              <button
                key={range}
                type="button"
                onClick={() => setDays(range)}
                className={cn(
                  "rounded-md border px-2.5 py-1 text-xs",
                  days === range
                    ? "border-accent/40 bg-accent/10 text-accent-soft"
                    : "border-ink-600 bg-ink-750 text-zinc-400 hover:text-zinc-200",
                )}
              >
                {range}d
              </button>
            ))}
          </div>
        }
      />
      {query.isError ? <ErrorState error={query.error} onRetry={() => void query.refetch()} /> : null}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Messages" value={compactNumber(data?.totals.messages ?? 0)} hint={`Last ${days} days`} />
        <Stat label="Commands" value={compactNumber(data?.totals.commands ?? 0)} hint={`${data?.totals.commandFails ?? 0} failed`} />
        <Stat label="Joins" value={compactNumber(data?.totals.memberJoins ?? 0)} hint={`${data?.totals.memberLeaves ?? 0} leaves`} />
        <Stat label="Moderation" value={compactNumber(data?.totals.moderation ?? 0)} hint={`${data?.totals.automod ?? 0} automod actions`} />
      </div>

      {!data?.dataAvailable ? (
        <div className="mt-4">
          <InfoNote tone="warning">
            No analysis data has been recorded for this period yet. Charts appear once members talk or use commands.
          </InfoNote>
        </div>
      ) : null}

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card className="p-4">
          <h2 className="mb-3 text-sm font-semibold text-zinc-200">Messages & commands</h2>
          <ActivityChart
            data={data?.history ?? []}
            series={[
              { key: "messages", label: "Messages", color: "#8b5cf6" },
              { key: "commands", label: "Commands", color: "#34d399" },
            ]}
          />
        </Card>
        <Card className="p-4">
          <h2 className="mb-3 text-sm font-semibold text-zinc-200">Member movement</h2>
          <ActivityChart
            data={data?.history ?? []}
            series={[
              { key: "memberJoins", label: "Joins", color: "#34d399" },
              { key: "memberLeaves", label: "Leaves", color: "#f87171" },
            ]}
          />
        </Card>
        <Card className="p-4">
          <h2 className="mb-3 text-sm font-semibold text-zinc-200">Moderation activity</h2>
          <ActivityChart
            data={data?.history ?? []}
            series={[
              { key: "moderation", label: "Moderation", color: "#fbbf24" },
              { key: "automod", label: "AutoMod", color: "#f87171" },
            ]}
          />
        </Card>
        <Card className="p-4">
          <h2 className="mb-3 text-sm font-semibold text-zinc-200">Top commands</h2>
          <CommandBarChart data={data?.topCommands ?? []} />
        </Card>
      </div>

      <Card className="mt-4 overflow-hidden">
        <div className="border-b border-ink-700 px-4 py-3">
          <h2 className="text-sm font-semibold text-zinc-200">Command usage</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px]">
            <thead className="border-b border-ink-700">
              <tr>
                <th className="table-head">Command</th>
                <th className="table-head">Uses</th>
                <th className="table-head">Failures</th>
                <th className="table-head">Success rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-800">
              {(data?.usage ?? []).slice(0, 20).map((entry) => {
                const rate = entry.uses > 0 ? Math.round(((entry.uses - entry.failures) / entry.uses) * 100) : 0;
                return (
                  <tr key={entry.commandName}>
                    <td className="table-cell font-mono text-xs">/{entry.commandName}</td>
                    <td className="table-cell">{entry.uses}</td>
                    <td className="table-cell">{entry.failures}</td>
                    <td className="table-cell">{rate}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {(data?.usage ?? []).length === 0 ? <EmptyState compact title="No command usage yet" /> : null}
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ audit */

export function AuditPage() {
  const { guildId } = useGuildData();
  const [page, setPage] = useState(1);
  const [action, setAction] = useState("");
  const [selected, setSelected] = useState<AuditEntry | null>(null);
  const query = useQuery({
    queryKey: ["audit", guildId, page, action],
    queryFn: () =>
      api.get<{ total: number; page: number; pageSize: number; entries: AuditEntry[] }>(
        `/guilds/${guildId}/audit?page=${page}&pageSize=25${action ? `&action=${encodeURIComponent(action)}` : ""}`,
      ),
  });

  return (
    <div>
      <PageHeader title="Audit log" description="Every dashboard write is recorded with the actor and payload." />
      <div className="mb-3 max-w-xs">
        <Input value={action} onChange={(event) => setAction(event.target.value)} placeholder="Filter by action, e.g. config.update" />
      </div>
      <Card className="overflow-hidden">
        {query.isError ? <ErrorState error={query.error} onRetry={() => void query.refetch()} /> : null}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px]">
            <thead className="border-b border-ink-700">
              <tr>
                <th className="table-head">Action</th>
                <th className="table-head">Actor</th>
                <th className="table-head">Target</th>
                <th className="table-head">When</th>
                <th className="table-head" />
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-800">
              {(query.data?.entries ?? []).map((entry) => (
                <tr key={entry.id} className="hover:bg-ink-750/40">
                  <td className="table-cell font-mono text-2xs text-zinc-300">{entry.action}</td>
                  <td className="table-cell font-mono text-2xs">{entry.actorId ?? "system"}</td>
                  <td className="table-cell max-w-[180px] truncate font-mono text-2xs text-zinc-500">{entry.targetId ?? "—"}</td>
                  <td className="table-cell text-2xs text-zinc-500">{relativeTime(entry.createdAt)}</td>
                  <td className="table-cell text-right">
                    <Button variant="ghost" onClick={() => setSelected(entry)} aria-label="Open audit entry">
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {(query.data?.entries ?? []).length === 0 && !query.isLoading ? (
          <EmptyState compact title="No audit entries" description="Changes made in the dashboard appear here." />
        ) : null}
        {query.data ? (
          <Pagination
            page={query.data.page}
            pages={Math.max(1, Math.ceil(query.data.total / query.data.pageSize))}
            onPage={setPage}
            total={query.data.total}
          />
        ) : null}
      </Card>

      <Drawer open={Boolean(selected)} onClose={() => setSelected(null)} title={selected?.action ?? "Audit entry"}>
        {selected ? (
          <div className="space-y-4">
            <dl className="space-y-2 text-sm">
              {[
                ["Actor", selected.actorId ?? "system"],
                ["Target", selected.targetId ?? "—"],
                ["IP", selected.ip ?? "not recorded"],
                ["Timestamp", formatDate(selected.createdAt)],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-4 border-b border-ink-800 pb-2">
                  <dt className="text-xs text-zinc-500">{label}</dt>
                  <dd className="text-right font-mono text-2xs text-zinc-300">{value}</dd>
                </div>
              ))}
            </dl>
            <div>
              <p className="mb-1.5 text-xs font-medium text-zinc-400">Metadata</p>
              <pre className="overflow-x-auto rounded-lg border border-ink-700 bg-ink-900 p-3 text-2xs text-zinc-400">
                {JSON.stringify(selected.metadata, null, 2)}
              </pre>
            </div>
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
