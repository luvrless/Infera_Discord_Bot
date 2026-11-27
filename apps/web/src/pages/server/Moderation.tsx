import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Ban,
  Clock,
  FileWarning,
  Gavel,
  Hammer,
  Link2,
  MessageSquareX,
  Plus,
  Scale,
  Shield,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserMinus,
  Users,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { MetricCard, PageHeader, StatGrid } from "../../components/cards";
import { ConfigPage, SettingsSection } from "../../components/config/engine";
import { ChannelPicker, MemberPicker, UserChip } from "../../components/ui/pickers";
import { Badge, Button, Callout, Card, CardHeader, Field, NativeSelect, Segmented, Tabs, TextArea, TextInput, Unsupported, type Tone } from "../../components/ui/primitives";
import { ConfirmDialog, Drawer, Modal } from "../../components/ui/overlays";
import { EmptyState, ErrorState, SkeletonRows } from "../../components/ui/states";
import { DataTable, FilterBar, Pagination } from "../../components/ui/table";
import { useToast } from "../../components/ui/toast";
import { errorMessage } from "../../lib/api/client";
import { keys } from "../../lib/api/keys";
import { moderationApi, useAppeals, useCaseDetail, useCases, useModStats, useUserHistory, useWarnings, type CaseFilters } from "../../lib/api/moderation";
import type { ModAction, ModerationCase, WarningThreshold } from "../../lib/api/types";
import { cn, formatDate, formatDuration, formatNumber, parseDuration, safeParse, timeAgo } from "../../lib/utils";
import { displayName, useResolvedUser } from "../../hooks/useUsers";
import { useGuild } from "../../hooks/useGuild";

const ACTION_TONE: Record<string, Tone> = {
  ban: "danger",
  tempban: "danger",
  softban: "danger",
  kick: "warning",
  timeout: "warning",
  mute: "warning",
  warn: "info",
  unban: "success",
  untimeout: "success",
  unmute: "success",
  purge: "neutral",
};

export function ActionBadge({ type }: { type: string }) {
  return <Badge tone={ACTION_TONE[type] ?? "neutral"}>{type}</Badge>;
}

function StatusBadge({ status }: { status: string }) {
  const tone: Tone = status === "active" ? "accent" : status === "voided" ? "neutral" : status === "expired" ? "neutral" : "success";
  return <Badge tone={tone}>{status}</Badge>;
}

function useInvalidateModeration() {
  const { guildId } = useGuild();
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: keys.moderation(guildId) });
    void queryClient.invalidateQueries({ queryKey: keys.overview(guildId) });
    void queryClient.invalidateQueries({ queryKey: keys.activity(guildId) });
  };
}

// ------------------------------------------------------------- overview

function Overview({ onOpenCase }: { onOpenCase: (id: string) => void }) {
  const { guildId } = useGuild();
  const stats = useModStats(guildId);
  const recent = useCases(guildId, { page: 1, pageSize: 8 });
  const count = (type: string) => stats.data?.byType.filter((row) => row.type === type || (type === "ban" && row.type === "tempban")).reduce((sum, row) => sum + row.count, 0) ?? 0;
  if (stats.error) return <ErrorState error={stats.error} onRetry={() => void stats.refetch()} />;
  return (
    <div className="space-y-4">
      <StatGrid>
        <MetricCard label="Total cases" value={stats.data?.total} icon={Scale} loading={stats.isLoading} hint={stats.data ? `${formatNumber(stats.data.last30Days)} in the last 30 days` : undefined} />
        <MetricCard label="Bans" value={count("ban")} icon={Ban} tone="danger" loading={stats.isLoading} />
        <MetricCard label="Kicks" value={count("kick")} icon={UserMinus} tone="warning" loading={stats.isLoading} />
        <MetricCard label="Timeouts" value={count("timeout")} icon={Clock} tone="warning" loading={stats.isLoading} />
        <MetricCard label="Warnings issued" value={count("warn")} icon={FileWarning} loading={stats.isLoading} />
        <MetricCard label="Active warnings" value={stats.data?.activeWarnings} icon={FileWarning} tone="accent" loading={stats.isLoading} />
        <MetricCard label="Pending appeals" value={stats.data?.pendingAppeals} icon={Gavel} tone={stats.data?.pendingAppeals ? "warning" : "neutral"} loading={stats.isLoading} />
        <MetricCard label="Active punishments" value={null} icon={Shield} unavailable="Not aggregated" hint="The stats API doesn't count active punishments yet" />
      </StatGrid>
      <Card>
        <CardHeader title="Recent activity" description="The latest moderation cases." icon={<Shield className="h-4 w-4" />} />
        <CaseTable rows={recent.data?.rows} loading={recent.isLoading} onOpen={onOpenCase} />
      </Card>
    </div>
  );
}

// ------------------------------------------------------------ actions

const ACTIONS: Array<{ value: ModAction; label: string; icon: typeof Ban; destructive: boolean; description: string }> = [
  { value: "warn", label: "Warn", icon: FileWarning, destructive: false, description: "Record a warning. Escalation rules may apply automatically." },
  { value: "timeout", label: "Timeout", icon: Clock, destructive: true, description: "Prevent the member from chatting for a duration (max 28 days)." },
  { value: "untimeout", label: "Remove timeout", icon: UserCheck, destructive: false, description: "Lift an active timeout." },
  { value: "kick", label: "Kick", icon: UserMinus, destructive: true, description: "Remove the member. They can rejoin with an invite." },
  { value: "softban", label: "Softban", icon: Hammer, destructive: true, description: "Ban and immediately unban to purge recent messages." },
  { value: "ban", label: "Ban", icon: Ban, destructive: true, description: "Ban the member. Add a duration for a temporary ban." },
  { value: "unban", label: "Unban", icon: ShieldCheck, destructive: false, description: "Lift a ban using the user's ID." },
];

function ActionPanel() {
  const { guildId, canModerate, values } = useGuild();
  const toast = useToast();
  const invalidate = useInvalidateModeration();
  const [action, setAction] = useState<ModAction>("warn");
  const [target, setTarget] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [duration, setDuration] = useState("1h");
  const [deleteSeconds, setDeleteSeconds] = useState(0);
  const [confirm, setConfirm] = useState(false);
  const [result, setResult] = useState<{ caseNumber?: number; action: string; count?: number } | null>(null);
  const user = useResolvedUser(guildId, target);
  const meta = ACTIONS.find((entry) => entry.value === action)!;
  const requireReason = Boolean(values["moderation.require_reason"]);
  const seconds = parseDuration(duration);
  const needsDuration = action === "timeout";
  const allowsDuration = action === "timeout" || action === "ban";
  const durationInvalid = (needsDuration && (!seconds || seconds > 2_419_200)) || (action === "ban" && duration.trim() !== "" && !seconds);

  const run = useMutation({
    mutationFn: () =>
      moderationApi.action(guildId, {
        action,
        targetId: target!,
        reason: reason.trim() || undefined,
        ...(allowsDuration && seconds ? { durationSeconds: seconds } : {}),
        ...(action === "ban" || action === "softban" ? { deleteMessageSeconds: deleteSeconds } : {}),
      }),
    onSuccess: (data) => {
      setConfirm(false);
      setResult({ caseNumber: data.case?.caseNumber, action, count: data.count });
      toast.success(`${meta.label} applied`, data.case?.caseNumber ? `Case #${data.case.caseNumber} created.` : undefined);
      setReason("");
      invalidate();
    },
    onError: (error) => {
      setConfirm(false);
      toast.error(`${meta.label} failed`, errorMessage(error));
    },
  });

  const blocked = !canModerate || !target || (requireReason && !reason.trim()) || durationInvalid;
  return (
    <Card>
      <CardHeader title="Moderation action" description="Executed by the INFERA API through Discord — the same service the bot commands use." icon={<Gavel className="h-4 w-4" />} />
      <div className="space-y-4 p-5">
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 lg:grid-cols-7">
          {ACTIONS.map((entry) => (
            <button
              key={entry.value}
              type="button"
              onClick={() => {
                setAction(entry.value);
                setResult(null);
              }}
              aria-pressed={action === entry.value}
              className={cn(
                "flex flex-col items-center gap-1 rounded-lg border px-2 py-2.5 text-xs transition-colors",
                action === entry.value ? (entry.destructive ? "border-red-500/50 bg-red-500/10 text-red-200" : "border-accent/50 bg-accent/10 text-zinc-100") : "border-ink-700 bg-ink-900 text-zinc-400 hover:border-ink-600 hover:text-zinc-200",
              )}
            >
              <entry.icon className="h-4 w-4" />
              {entry.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-zinc-500">{meta.description}</p>
        <Field label={action === "unban" ? "User ID" : "Member"} required>
          <MemberPicker value={target} onChange={(id) => setTarget(id)} placeholder={action === "unban" ? "Paste the banned user's ID" : undefined} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          {allowsDuration ? (
            <Field
              label={action === "ban" ? "Duration (optional)" : "Duration"}
              required={needsDuration}
              hint={seconds ? `${formatDuration(seconds)}${action === "ban" ? " — temporary ban, lifted automatically" : ""}` : action === "ban" ? "Leave empty for a permanent ban. e.g. 7d" : "e.g. 10m, 1h, 1d (max 28d)"}
              error={durationInvalid ? (needsDuration && seconds && seconds > 2_419_200 ? "Discord timeouts are limited to 28 days" : "Enter a duration like 30m, 2h or 7d") : null}
            >
              <TextInput value={duration} onChange={(event) => setDuration(event.target.value)} placeholder={action === "ban" ? "Permanent" : "1h"} invalid={durationInvalid} />
            </Field>
          ) : null}
          {action === "ban" || action === "softban" ? (
            <Field label="Delete message history">
              <NativeSelect value={deleteSeconds} onChange={(event) => setDeleteSeconds(Number(event.target.value))}>
                <option value={0}>Don't delete</option>
                <option value={3600}>Previous hour</option>
                <option value={86_400}>Previous 24 hours</option>
                <option value={604_800}>Previous 7 days</option>
              </NativeSelect>
            </Field>
          ) : null}
        </div>
        <Field label="Reason" required={requireReason} hint={requireReason ? "This server requires a reason for punishments." : "Shown in the case and sent to the member if DMs are enabled."}>
          <TextArea rows={2} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why is this action being taken?" />
        </Field>
        {result ? (
          <Callout tone="success" title={`${ACTIONS.find((entry) => entry.value === result.action)?.label} applied${result.caseNumber ? ` · case #${result.caseNumber}` : ""}`}>
            {result.count !== undefined ? `This member now has ${result.count} active warning${result.count === 1 ? "" : "s"}.` : "Discord confirmed the action."}
          </Callout>
        ) : null}
        <div className="flex justify-end">
          <Button variant={meta.destructive ? "danger" : "primary"} disabled={blocked} loading={run.isPending} onClick={() => (meta.destructive ? setConfirm(true) : run.mutate())}>
            {meta.label}
            {target && user.data ? ` ${displayName(user.data)}` : ""}
          </Button>
        </div>
      </div>
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={() => run.mutate()}
        loading={run.isPending}
        title={`${meta.label} ${displayName(user.data, target)}?`}
        description={`${meta.description} ${reason.trim() ? `Reason: “${reason.trim()}”.` : "No reason given."}`}
        confirmLabel={meta.label}
      />
    </Card>
  );
}

function PurgePanel() {
  const { guildId, canModerate } = useGuild();
  const toast = useToast();
  const [channelId, setChannelId] = useState<string | null>(null);
  const [count, setCount] = useState("50");
  const [userId, setUserId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const amount = Number(count);
  const valid = Number.isInteger(amount) && amount >= 1 && amount <= 1000;
  const purge = useMutation({
    mutationFn: () => moderationApi.purge(guildId, { channelId: channelId!, count: amount, ...(userId ? { userId } : {}) }),
    onSuccess: (data) => {
      setConfirm(false);
      toast.success("Messages deleted", `${formatNumber(data.deleted)} message${data.deleted === 1 ? "" : "s"} removed.`);
    },
    onError: (error) => {
      setConfirm(false);
      toast.error("Purge failed", errorMessage(error));
    },
  });
  return (
    <Card>
      <CardHeader title="Purge messages" description="Bulk-delete recent messages. Discord can't bulk-delete messages older than 14 days." icon={<MessageSquareX className="h-4 w-4" />} />
      <div className="space-y-4 p-5">
        <Field label="Channel" required>
          <ChannelPicker value={channelId} onChange={setChannelId} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Messages to scan" hint="1 – 1000" error={valid ? null : "Enter a number from 1 to 1000"}>
            <TextInput type="number" min={1} max={1000} value={count} onChange={(event) => setCount(event.target.value)} invalid={!valid} />
          </Field>
          <Field label="Only from member (optional)">
            <MemberPicker value={userId} onChange={(id) => setUserId(id)} />
          </Field>
        </div>
        <div className="flex justify-end">
          <Button variant="danger" disabled={!canModerate || !channelId || !valid} onClick={() => setConfirm(true)}>
            Purge
          </Button>
        </div>
      </div>
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} onConfirm={() => purge.mutate()} loading={purge.isPending} title="Delete these messages?" description={`Up to ${amount} recent messages${userId ? " from the selected member" : ""} will be permanently deleted.`} confirmLabel="Delete messages" />
    </Card>
  );
}

// -------------------------------------------------------------- cases

function CaseTable({ rows, loading, onOpen }: { rows: ModerationCase[] | undefined; loading: boolean; onOpen: (id: string) => void }) {
  return (
    <DataTable
      loading={loading}
      rows={rows}
      rowKey={(row) => row.id}
      onRowClick={(row) => onOpen(row.id)}
      empty={<EmptyState compact icon={Scale} title="No moderation cases found" description="Cases appear here when INFERA or your staff take action." />}
      columns={[
        { id: "id", header: "Case", className: "font-mono text-zinc-400", cell: (row) => `#${row.caseNumber}` },
        { id: "user", header: "User", cell: (row) => <UserChip userId={row.targetId} /> },
        { id: "mod", header: "Moderator", cell: (row) => <UserChip userId={row.moderatorId} /> },
        { id: "action", header: "Action", cell: (row) => <ActionBadge type={row.type} /> },
        { id: "reason", header: "Reason", className: "max-w-[260px]", cell: (row) => <span className="line-clamp-1 text-zinc-400">{row.reason ?? <span className="text-zinc-600">No reason</span>}</span> },
        { id: "date", header: "Date", cell: (row) => <span title={formatDate(row.createdAt)} className="text-zinc-500">{timeAgo(row.createdAt)}</span> },
        { id: "status", header: "Status", cell: (row) => <StatusBadge status={row.status} /> },
      ]}
    />
  );
}

function Cases({ onOpen }: { onOpen: (id: string) => void }) {
  const { guildId } = useGuild();
  const [filters, setFilters] = useState<CaseFilters>({ page: 1, pageSize: 20 });
  const cases = useCases(guildId, filters);
  const set = (patch: Partial<CaseFilters>) => setFilters((current) => ({ ...current, ...patch, page: patch.page ?? 1 }));
  return (
    <Card>
      <FilterBar>
        <div className="w-40">
          <NativeSelect value={filters.type ?? ""} onChange={(event) => set({ type: event.target.value || undefined })} aria-label="Action">
            <option value="">All actions</option>
            {["ban", "tempban", "softban", "kick", "timeout", "untimeout", "warn", "unban", "mute", "jail"].map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="w-full sm:w-64">
          <MemberPicker value={filters.userId ?? null} onChange={(id) => set({ userId: id ?? undefined })} placeholder="Filter by user" />
        </div>
        <div className="w-full sm:w-64">
          <MemberPicker value={filters.moderatorId ?? null} onChange={(id) => set({ moderatorId: id ?? undefined })} placeholder="Filter by moderator" />
        </div>
        {filters.type || filters.userId || filters.moderatorId ? (
          <Button size="sm" variant="ghost" icon={<X className="h-3.5 w-3.5" />} onClick={() => setFilters({ page: 1, pageSize: 20 })}>
            Clear
          </Button>
        ) : null}
      </FilterBar>
      {cases.error ? <ErrorState error={cases.error} onRetry={() => void cases.refetch()} compact /> : <CaseTable rows={cases.data?.rows} loading={cases.isFetching} onOpen={onOpen} />}
      {cases.data ? <Pagination page={filters.page} pageSize={filters.pageSize} total={cases.data.total} onChange={(page) => set({ page })} /> : null}
      <div className="border-t border-ink-700 px-4 py-2.5 text-2xs text-zinc-600">Date-range and status filters need backend support; the cases API filters by action, user and moderator.</div>
    </Card>
  );
}

function CaseDrawer({ caseId, onClose }: { caseId: string | null; onClose: () => void }) {
  const { guildId, canModerate, canConfigure } = useGuild();
  const detail = useCaseDetail(guildId, caseId);
  const history = useUserHistory(guildId, detail.data?.targetId ?? null);
  const toast = useToast();
  const invalidate = useInvalidateModeration();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const [evidence, setEvidence] = useState("");
  const [voiding, setVoiding] = useState(false);
  useEffect(() => {
    setReason(detail.data?.reason ?? "");
    setEvidence("");
  }, [detail.data?.id, detail.data?.reason]);

  const refresh = () => {
    invalidate();
    if (caseId) void queryClient.invalidateQueries({ queryKey: keys.caseDetail(guildId, caseId) });
  };
  const edit = useMutation({
    mutationFn: (body: { reason?: string; evidenceUrl?: string }) => moderationApi.editCase(guildId, caseId!, body),
    onSuccess: (_data, body) => {
      toast.success(body.evidenceUrl ? "Evidence attached" : "Reason updated");
      setEvidence("");
      refresh();
    },
    onError: (error) => toast.error("Couldn't update the case", errorMessage(error)),
  });
  const voidCase = useMutation({
    mutationFn: () => moderationApi.voidCase(guildId, caseId!, "Voided from the dashboard"),
    onSuccess: () => {
      toast.success("Case voided", "The record is kept for auditing but no longer counts.");
      setVoiding(false);
      refresh();
    },
    onError: (error) => toast.error("Couldn't void the case", errorMessage(error)),
  });

  const data = detail.data;
  const related = (history.data?.cases ?? []).filter((row) => row.id !== caseId);
  const evidenceValid = /^https:\/\/\S+$/.test(evidence.trim());
  return (
    <Drawer
      open={Boolean(caseId)}
      onClose={onClose}
      width="lg"
      title={data ? `Case #${data.caseNumber}` : "Case"}
      subtitle={data ? <span className="flex items-center gap-2"><ActionBadge type={data.type} /><StatusBadge status={data.status} /> {formatDate(data.createdAt)}</span> : null}
      footer={
        data && canConfigure && data.status !== "voided" ? (
          <Button variant="danger-ghost" onClick={() => setVoiding(true)}>
            Void case
          </Button>
        ) : undefined
      }
    >
      {detail.isLoading ? (
        <SkeletonRows rows={6} />
      ) : detail.error ? (
        <ErrorState error={detail.error} onRetry={() => void detail.refetch()} compact />
      ) : data ? (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="eyebrow">User</p>
              <div className="mt-1.5">
                <UserChip userId={data.targetId} size={24} showId />
              </div>
            </div>
            <div>
              <p className="eyebrow">Moderator</p>
              <div className="mt-1.5">
                <UserChip userId={data.moderatorId} size={24} />
              </div>
            </div>
            <div>
              <p className="eyebrow">Expires</p>
              <p className="mt-1.5 text-13 text-zinc-200">{data.expiresAt ? `${formatDate(data.expiresAt)} (${timeAgo(data.expiresAt)})` : "Never"}</p>
            </div>
            <div>
              <p className="eyebrow">Resolved</p>
              <p className="mt-1.5 text-13 text-zinc-200">{data.resolvedAt ? (<span className="flex items-center gap-1.5">{formatDate(data.resolvedAt)} <UserChip userId={data.resolvedBy} size={16} /></span>) : "—"}</p>
            </div>
          </div>

          <Field label="Reason">
            <TextArea rows={3} maxLength={500} value={reason} disabled={!canModerate} onChange={(event) => setReason(event.target.value)} />
          </Field>
          {canModerate && reason !== (data.reason ?? "") ? (
            <div className="flex justify-end">
              <Button size="sm" variant="primary" loading={edit.isPending} onClick={() => edit.mutate({ reason })}>
                Save reason
              </Button>
            </div>
          ) : null}

          <div>
            <p className="eyebrow mb-2">Evidence</p>
            {data.evidence.length === 0 ? <p className="text-xs text-zinc-500">No evidence attached.</p> : null}
            <ul className="space-y-1.5">
              {data.evidence.map((item) => (
                <li key={item.id} className="flex items-center gap-2 rounded-lg border border-ink-700 px-3 py-2 text-xs">
                  <Link2 className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
                  <a href={item.url} target="_blank" rel="noreferrer noopener nofollow" className="min-w-0 flex-1 truncate text-accent-soft hover:underline">
                    {item.url}
                  </a>
                  <span className="shrink-0 text-zinc-600">{timeAgo(item.createdAt)}</span>
                </li>
              ))}
            </ul>
            {canModerate ? (
              <div className="mt-2 flex gap-2">
                <TextInput value={evidence} onChange={(event) => setEvidence(event.target.value)} placeholder="https://… screenshot or message link" invalid={Boolean(evidence) && !evidenceValid} />
                <Button icon={<Plus className="h-3.5 w-3.5" />} disabled={!evidenceValid} loading={edit.isPending} onClick={() => edit.mutate({ evidenceUrl: evidence.trim() })}>
                  Attach
                </Button>
              </div>
            ) : null}
          </div>

          {Object.keys(data.metadataParsed ?? {}).length > 0 ? (
            <div>
              <p className="eyebrow mb-2">Details</p>
              <pre className="max-h-40 overflow-auto rounded-lg border border-ink-700 bg-ink-900 p-3 font-mono text-2xs text-zinc-400">{JSON.stringify(data.metadataParsed, null, 2)}</pre>
            </div>
          ) : null}

          <div>
            <p className="eyebrow mb-2">User history</p>
            {history.isLoading ? (
              <SkeletonRows rows={2} />
            ) : (
              <>
                <p className="mb-2 text-xs text-zinc-500">
                  {formatNumber(history.data?.cases.length ?? 0)} cases · {formatNumber(history.data?.warnings.filter((warning) => warning.active).length ?? 0)} active warnings
                </p>
                <ul className="space-y-1">
                  {related.slice(0, 10).map((row) => (
                    <li key={row.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-ink-800">
                      <span className="font-mono text-zinc-500">#{row.caseNumber}</span>
                      <ActionBadge type={row.type} />
                      <span className="min-w-0 flex-1 truncate text-zinc-400">{row.reason ?? "No reason"}</span>
                      <span className="text-zinc-600">{timeAgo(row.createdAt)}</span>
                    </li>
                  ))}
                  {related.length === 0 ? <li className="text-xs text-zinc-600">No other cases for this user.</li> : null}
                </ul>
              </>
            )}
          </div>
        </div>
      ) : null}
      <ConfirmDialog
        open={voiding}
        onClose={() => setVoiding(false)}
        onConfirm={() => voidCase.mutate()}
        loading={voidCase.isPending}
        title="Void this case?"
        description="The case stays in the history marked as voided. Linked warnings stop counting toward escalation. Discord punishments are not reversed — use Unban or Remove timeout for that."
        confirmLabel="Void case"
      />
    </Drawer>
  );
}

// ----------------------------------------------------------- warnings

function Warnings() {
  const { guildId, canModerate } = useGuild();
  const [userId, setUserId] = useState<string | null>(null);
  const [active, setActive] = useState(true);
  const warnings = useWarnings(guildId, { userId: userId ?? undefined, active });
  const toast = useToast();
  const invalidate = useInvalidateModeration();
  const [remove, setRemove] = useState<string | null>(null);
  const del = useMutation({
    mutationFn: (id: string) => moderationApi.removeWarning(guildId, id),
    onSuccess: () => {
      toast.success("Warning removed");
      setRemove(null);
      invalidate();
    },
    onError: (error) => toast.error("Couldn't remove the warning", errorMessage(error)),
  });
  return (
    <Card>
      <FilterBar>
        <Segmented value={active ? "active" : "all"} onChange={(value) => setActive(value === "active")} size="sm" options={[{ value: "active", label: "Active" }, { value: "all", label: "All" }]} />
        <div className="w-full sm:w-64">
          <MemberPicker value={userId} onChange={(id) => setUserId(id)} placeholder="Filter by member" />
        </div>
      </FilterBar>
      <DataTable
        loading={warnings.isFetching}
        rows={warnings.data}
        rowKey={(row) => row.id}
        empty={<EmptyState compact icon={FileWarning} title="No warnings" description={active ? "No active warnings match." : "No warnings recorded."} />}
        columns={[
          { id: "user", header: "Member", cell: (row) => <UserChip userId={row.userId} /> },
          { id: "reason", header: "Reason", className: "max-w-[320px]", cell: (row) => <span className="line-clamp-2 text-zinc-400">{row.reason}</span> },
          { id: "mod", header: "Moderator", cell: (row) => <UserChip userId={row.moderatorId} /> },
          { id: "date", header: "Issued", cell: (row) => <span className="text-zinc-500">{timeAgo(row.createdAt)}</span> },
          { id: "expires", header: "Expires", cell: (row) => <span className="text-zinc-500">{row.expiresAt ? timeAgo(row.expiresAt) : "Never"}</span> },
          { id: "status", header: "Status", cell: (row) => <Badge tone={row.active ? "accent" : "neutral"}>{row.active ? "active" : "removed"}</Badge> },
          {
            id: "remove",
            header: "",
            className: "w-10",
            cell: (row) =>
              canModerate && row.active ? (
                <button type="button" aria-label="Remove warning" onClick={() => setRemove(row.id)} className="btn-icon h-7 w-7 text-zinc-600 hover:text-red-400">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              ) : null,
          },
        ]}
      />
      <ConfirmDialog open={Boolean(remove)} onClose={() => setRemove(null)} onConfirm={() => remove && del.mutate(remove)} loading={del.isPending} title="Remove this warning?" description="It stops counting toward escalation. The record stays in the case history." confirmLabel="Remove warning" />
    </Card>
  );
}

// ------------------------------------------------------------ appeals

function Appeals() {
  const { guildId, canModerate, values } = useGuild();
  const [status, setStatus] = useState("pending");
  const appeals = useAppeals(guildId, status);
  const toast = useToast();
  const invalidate = useInvalidateModeration();
  const [review, setReview] = useState<{ id: string; decision: "approved" | "rejected" } | null>(null);
  const [notes, setNotes] = useState("");
  const decide = useMutation({
    mutationFn: () => moderationApi.reviewAppeal(guildId, review!.id, review!.decision, notes.trim() || undefined),
    onSuccess: () => {
      toast.success(review?.decision === "approved" ? "Appeal approved" : "Appeal rejected");
      setReview(null);
      setNotes("");
      invalidate();
    },
    onError: (error) => toast.error("Couldn't review the appeal", errorMessage(error)),
  });
  return (
    <div className="space-y-3">
      {!values["moderation.appeals_enabled"] ? <Callout tone="info">Appeals are currently disabled for members. Enable them under Settings below.</Callout> : null}
      <Tabs value={status} onChange={setStatus} tabs={[{ id: "pending", label: "Pending" }, { id: "approved", label: "Approved" }, { id: "rejected", label: "Rejected" }, { id: "all", label: "All" }]} />
      {appeals.isLoading ? (
        <SkeletonRows />
      ) : appeals.error ? (
        <ErrorState error={appeals.error} onRetry={() => void appeals.refetch()} />
      ) : (appeals.data ?? []).length === 0 ? (
        <Card>
          <EmptyState icon={Gavel} title="No appeals here" description="Appeals submitted by members show up in this inbox." />
        </Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {(appeals.data ?? []).map((appeal) => {
            const answers = safeParse<Record<string, unknown>>(appeal.answers, {});
            return (
              <Card key={appeal.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <UserChip userId={appeal.userId} size={24} />
                  <Badge tone={appeal.status === "pending" ? "warning" : appeal.status === "approved" ? "success" : "neutral"}>{appeal.status}</Badge>
                </div>
                <p className="mt-2 text-2xs text-zinc-500">
                  Case <span className="font-mono">{appeal.caseId.slice(0, 10)}</span> · submitted {timeAgo(appeal.createdAt)}
                </p>
                <div className="mt-3 space-y-2">
                  {Object.entries(answers).length === 0 ? <p className="text-xs text-zinc-500">No written answers.</p> : null}
                  {Object.entries(answers).map(([question, answer]) => (
                    <div key={question}>
                      <p className="text-2xs font-medium text-zinc-500">{question}</p>
                      <p className="text-13 text-zinc-200">{String(answer)}</p>
                    </div>
                  ))}
                </div>
                {appeal.reviewNotes ? <p className="mt-3 rounded-md bg-ink-900 px-3 py-2 text-xs text-zinc-400">Notes: {appeal.reviewNotes}</p> : null}
                {appeal.status === "pending" && canModerate ? (
                  <div className="mt-4 flex justify-end gap-2">
                    <Button size="sm" variant="danger-ghost" onClick={() => setReview({ id: appeal.id, decision: "rejected" })}>
                      Reject
                    </Button>
                    <Button size="sm" variant="primary" onClick={() => setReview({ id: appeal.id, decision: "approved" })}>
                      Approve
                    </Button>
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}
      <p className="text-2xs text-zinc-600">Approving records the decision; reverse the punishment itself from the case (Unban / Remove timeout). “Request more information” isn't supported by the appeals API.</p>
      <Modal
        open={Boolean(review)}
        onClose={() => setReview(null)}
        size="sm"
        title={review?.decision === "approved" ? "Approve appeal" : "Reject appeal"}
        footer={
          <>
            <Button variant="ghost" onClick={() => setReview(null)}>
              Cancel
            </Button>
            <Button variant={review?.decision === "approved" ? "primary" : "danger"} loading={decide.isPending} onClick={() => decide.mutate()}>
              {review?.decision === "approved" ? "Approve" : "Reject"}
            </Button>
          </>
        }
      >
        <Field label="Reviewer notes (optional)">
          <TextArea rows={3} maxLength={2000} value={notes} onChange={(event) => setNotes(event.target.value)} />
        </Field>
      </Modal>
    </div>
  );
}

// --------------------------------------------------------- thresholds

function ThresholdEditor({ value, onChange, disabled }: { value: unknown; onChange: (value: unknown) => void; disabled: boolean }) {
  const rows = (Array.isArray(value) ? value : []) as WarningThreshold[];
  const update = (index: number, patch: Partial<WarningThreshold>) => onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  return (
    <div className="space-y-2">
      {rows.length === 0 ? <p className="text-xs text-zinc-500">No automatic escalation.</p> : null}
      {rows.map((row, index) => (
        <div key={index} className="flex flex-wrap items-center gap-2 rounded-lg border border-ink-700 bg-ink-900/60 px-3 py-2">
          <span className="text-xs text-zinc-500">At</span>
          <TextInput type="number" min={1} max={100} className="w-20" value={row.count} disabled={disabled} onChange={(event) => update(index, { count: Number(event.target.value) })} />
          <span className="text-xs text-zinc-500">warnings →</span>
          <div className="w-28">
            <NativeSelect value={row.action} disabled={disabled} onChange={(event) => update(index, { action: event.target.value as WarningThreshold["action"] })}>
              <option value="timeout">timeout</option>
              <option value="kick">kick</option>
              <option value="ban">ban</option>
            </NativeSelect>
          </div>
          {row.action !== "kick" ? (
            <>
              <span className="text-xs text-zinc-500">for</span>
              <TextInput
                className="w-24"
                defaultValue={row.durationSeconds ? formatDuration(row.durationSeconds).replace(/\s/g, "") : ""}
                placeholder={row.action === "ban" ? "forever" : "1h"}
                disabled={disabled}
                onBlur={(event) => update(index, { durationSeconds: parseDuration(event.target.value) ?? 0 })}
              />
            </>
          ) : null}
          <button type="button" aria-label="Remove rule" disabled={disabled} onClick={() => onChange(rows.filter((_, i) => i !== index))} className="btn-icon ml-auto h-7 w-7 text-zinc-500 hover:text-red-400">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      {!disabled && rows.length < 10 ? (
        <Button size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => onChange([...rows, { count: (rows[rows.length - 1]?.count ?? 0) + 2, action: "timeout", durationSeconds: 3600 }])}>
          Add rule
        </Button>
      ) : null}
    </div>
  );
}

function Staff() {
  const { guildId } = useGuild();
  const stats = useModStats(guildId);
  const max = Math.max(1, ...(stats.data?.byModerator.map((row) => row.count) ?? [1]));
  return (
    <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
      <Card>
        <CardHeader title="Moderator statistics" description="Cases created per moderator in the last 30 days." icon={<Users className="h-4 w-4" />} />
        {stats.isLoading ? (
          <SkeletonRows className="p-4" rows={4} />
        ) : (stats.data?.byModerator ?? []).length === 0 ? (
          <EmptyState compact title="No moderation in the last 30 days" />
        ) : (
          <ul className="space-y-3 p-5">
            {stats.data!.byModerator.map((row) => (
              <li key={row.moderatorId}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <UserChip userId={row.moderatorId} />
                  <span className="tabular-nums text-zinc-400">{formatNumber(row.count)}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-ink-700">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${(row.count / max) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <div className="space-y-3">
        <Unsupported title="Staff notes, duty status and activity timelines">
          These exist as bot commands (staffnote, staffduty, staffactivity) but the API has no endpoints for them yet.
        </Unsupported>
        <Card className="p-4">
          <p className="text-13 text-zinc-200">Staff roles</p>
          <p className="mt-1 text-xs text-zinc-500">Configure which roles count as staff under the Settings tab and in Permissions.</p>
        </Card>
      </div>
    </div>
  );
}

// --------------------------------------------------------------- page

type TabId = "overview" | "actions" | "cases" | "warnings" | "appeals" | "staff" | "settings";

export function ModerationPage() {
  const { guildId, canModerate } = useGuild();
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") as TabId | null) ?? "overview";
  const caseId = params.get("case");
  const stats = useModStats(guildId);
  const setTab = (next: TabId) => setParams((current) => { const p = new URLSearchParams(current); p.set("tab", next); return p; });
  const openCase = (id: string | null) =>
    setParams((current) => {
      const p = new URLSearchParams(current);
      if (id) p.set("case", id);
      else p.delete("case");
      return p;
    });

  if (!canModerate) {
    return (
      <div>
        <PageHeader title="Moderation" icon={Shield} />
        <Card>
          <EmptyState icon={Shield} title="You don't have permission to moderate" description="Moderator access in INFERA is required to view cases and take actions." />
        </Card>
      </div>
    );
  }

  return (
    <ConfigPage>
      <PageHeader title="Moderation" icon={Shield} description="Cases, actions, warnings and appeals — all executed and recorded by the INFERA backend." />
      <Tabs
        className="mb-5"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "overview", label: "Overview" },
          { id: "actions", label: "Actions" },
          { id: "cases", label: "Cases", count: stats.data?.total ?? null },
          { id: "warnings", label: "Warnings", count: stats.data?.activeWarnings ?? null },
          { id: "appeals", label: "Appeals", count: stats.data?.pendingAppeals || null },
          { id: "staff", label: "Staff" },
          { id: "settings", label: "Settings" },
        ]}
      />
      {tab === "overview" ? <Overview onOpenCase={openCase} /> : null}
      {tab === "actions" ? (
        <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
          <ActionPanel />
          <PurgePanel />
        </div>
      ) : null}
      {tab === "cases" ? <Cases onOpen={openCase} /> : null}
      {tab === "warnings" ? <Warnings /> : null}
      {tab === "appeals" ? <Appeals /> : null}
      {tab === "staff" ? <Staff /> : null}
      {tab === "settings" ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <SettingsSection id="mod-general" title="General" icon={<Shield className="h-4 w-4" />} configKeys={["moderation.enabled", "moderation.log_channel", "moderation.dm_users", "moderation.require_reason", "moderation.case_numbering", "moderation.appeals_enabled"]} />
          <SettingsSection
            id="mod-warnings"
            title="Warning system"
            description="Expiration, automatic escalation and exemptions."
            icon={<FileWarning className="h-4 w-4" />}
            configKeys={["moderation.warning_expiration_days", "moderation.warning_thresholds", "moderation.staff_roles", "moderation.exempt_roles", "moderation.exempt_channels"]}
            overrides={{
              "moderation.warning_thresholds": {
                label: "Automatic escalation",
                render: ({ value, onChange, disabled }) => <ThresholdEditor value={value} onChange={onChange} disabled={disabled} />,
              },
            }}
          />
        </div>
      ) : null}
      <CaseDrawer caseId={caseId} onClose={() => openCase(null)} />
    </ConfigPage>
  );
}
