import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertOctagon, CheckCircle2, Lock, LockOpen, Plus, ShieldAlert, ShieldCheck, Siren, Trash2, UserRound, Users } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "../../components/cards";
import { ConfigPage, SettingsSection } from "../../components/config/engine";
import { MemberPicker, RoleName, RolePicker, UserChip } from "../../components/ui/pickers";
import { Badge, Button, Callout, Card, CardHeader, Field, Segmented, StatusDot, TextInput, Unsupported, type Tone } from "../../components/ui/primitives";
import { ConfirmDialog } from "../../components/ui/overlays";
import { EmptyState, ErrorState, PageSkeleton, SkeletonRows } from "../../components/ui/states";
import { DataTable } from "../../components/ui/table";
import { useToast } from "../../components/ui/toast";
import { errorMessage } from "../../lib/api/client";
import { keys } from "../../lib/api/keys";
import { moderationApi, useLockdown, useSecurity } from "../../lib/api/moderation";
import type { SecurityEvent } from "../../lib/api/types";
import { cn, formatDate, safeParse, timeAgo } from "../../lib/utils";
import { useGuild } from "../../hooks/useGuild";

function severityTone(severity: string): Tone {
  if (severity === "critical" || severity === "high") return "danger";
  if (severity === "medium" || severity === "warning") return "warning";
  return "info";
}

function LockdownPanel() {
  const { guildId, canConfigure } = useGuild();
  const lockdown = useLockdown(guildId);
  const queryClient = useQueryClient();
  const toast = useToast();
  const [confirm, setConfirm] = useState<"start" | "end" | null>(null);
  const [reason, setReason] = useState("");
  const mutation = useMutation({
    mutationFn: () => (confirm === "start" ? moderationApi.startLockdown(guildId, reason.trim() || undefined) : moderationApi.endLockdown(guildId)),
    onSuccess: (result) => {
      const started = confirm === "start";
      setConfirm(null);
      setReason("");
      queryClient.setQueryData(keys.lockdown(guildId), { lockdown: result.lockdown });
      void queryClient.invalidateQueries({ queryKey: keys.security(guildId) });
      if (result.failed > 0) toast.error(started ? "Lockdown partly applied" : "Lockdown partly lifted", `${result.changed} of ${result.total} channels changed — INFERA couldn't edit ${result.failed}. Check its permissions.`);
      else toast.success(started ? "Lockdown active" : "Lockdown lifted", `${result.changed} text channel${result.changed === 1 ? "" : "s"} ${started ? "locked" : "unlocked"}.`);
    },
    onError: (error) => {
      setConfirm(null);
      toast.error("Lockdown request failed", errorMessage(error));
    },
  });
  const state = lockdown.data;
  return (
    <Card className={cn(state?.active && "border-red-500/40")}>
      <CardHeader
        title="Lockdown"
        description="Deny Send Messages for @everyone in every text and announcement channel."
        icon={state?.active ? <Lock className="h-4 w-4 text-red-400" /> : <LockOpen className="h-4 w-4" />}
        action={state ? <Badge tone={state.active ? "danger" : "success"} dot>{state.active ? "Active" : "Not active"}</Badge> : null}
      />
      <div className="space-y-4 p-5">
        {lockdown.isLoading ? (
          <SkeletonRows rows={2} />
        ) : lockdown.error ? (
          <ErrorState error={lockdown.error} compact onRetry={() => void lockdown.refetch()} />
        ) : state?.since ? (
          <dl className="grid grid-cols-2 gap-4 text-13">
            <div>
              <dt className="eyebrow">{state.active ? "Started" : "Last change"}</dt>
              <dd className="mt-1 text-zinc-200">{formatDate(state.since)}</dd>
            </div>
            <div>
              <dt className="eyebrow">By</dt>
              <dd className="mt-1">
                <UserChip userId={state.actorId} />
              </dd>
            </div>
            <div>
              <dt className="eyebrow">Reason</dt>
              <dd className="mt-1 text-zinc-300">{state.reason ?? "—"}</dd>
            </div>
            <div>
              <dt className="eyebrow">Affected channels</dt>
              <dd className="mt-1 text-zinc-300">{state.lockedCount ?? state.channels.length} · via {state.source}</dd>
            </div>
          </dl>
        ) : (
          <p className="text-xs text-zinc-500">No lockdown has been recorded for this server.</p>
        )}
        {state?.active ? (
          <Button variant="primary" icon={<LockOpen className="h-3.5 w-3.5" />} disabled={!canConfigure} onClick={() => setConfirm("end")}>
            End lockdown
          </Button>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row">
            <TextInput value={reason} maxLength={300} onChange={(event) => setReason(event.target.value)} placeholder="Reason (optional)" disabled={!canConfigure} />
            <Button variant="danger" icon={<Lock className="h-3.5 w-3.5" />} disabled={!canConfigure} onClick={() => setConfirm("start")}>
              Activate lockdown
            </Button>
          </div>
        )}
        <p className="hint">Lifting a lockdown explicitly allows Send Messages for @everyone in those channels, matching the bot's unlockdown command. Review channels that previously denied it.</p>
      </div>
      <ConfirmDialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        onConfirm={() => mutation.mutate()}
        loading={mutation.isPending}
        tone={confirm === "start" ? "danger" : "primary"}
        title={confirm === "start" ? "Lock down the whole server?" : "End the lockdown?"}
        description={confirm === "start" ? "Members won't be able to send messages in any text channel until the lockdown ends." : "Members will be able to send messages again in every text channel."}
        confirmLabel={confirm === "start" ? "Lock server" : "End lockdown"}
        confirmText={confirm === "start" ? "lockdown" : undefined}
      />
    </Card>
  );
}

function Whitelist() {
  const { guildId, canConfigure } = useGuild();
  const security = useSecurity(guildId);
  const queryClient = useQueryClient();
  const toast = useToast();
  const [type, setType] = useState<"user" | "role">("user");
  const [target, setTarget] = useState<string | null>(null);
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: keys.security(guildId) });
    void queryClient.invalidateQueries({ queryKey: keys.settings(guildId) });
  };
  const add = useMutation({
    mutationFn: () => moderationApi.addWhitelist(guildId, target!, type),
    onSuccess: () => {
      toast.success(type === "role" ? "Role trusted" : "User whitelisted");
      setTarget(null);
      refresh();
    },
    onError: (error) => toast.error("Couldn't add to the whitelist", errorMessage(error)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => moderationApi.removeWhitelist(guildId, id),
    onSuccess: () => {
      toast.success("Removed from the whitelist");
      refresh();
    },
    onError: (error) => toast.error("Couldn't remove the entry", errorMessage(error)),
  });
  const entries = security.data?.whitelist ?? [];
  return (
    <Card>
      <CardHeader title="Trusted users & roles" description="Exempt from antinuke enforcement. Whitelist bots you trust here too." icon={<ShieldCheck className="h-4 w-4" />} action={<Badge>{entries.length}</Badge>} />
      {canConfigure ? (
        <div className="space-y-3 border-b border-ink-700 p-5">
          <Segmented value={type} onChange={(value) => { setType(value); setTarget(null); }} size="sm" options={[{ value: "user", label: "User or bot" }, { value: "role", label: "Role" }]} />
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="flex-1">{type === "user" ? <MemberPicker value={target} onChange={(id) => setTarget(id)} /> : <RolePicker value={target} onChange={setTarget} assignable={false} />}</div>
            <Button icon={<Plus className="h-3.5 w-3.5" />} disabled={!target} loading={add.isPending} onClick={() => add.mutate()}>
              Trust
            </Button>
          </div>
        </div>
      ) : null}
      {security.isLoading ? (
        <SkeletonRows className="p-4" rows={2} />
      ) : entries.length === 0 ? (
        <EmptyState compact icon={Users} title="Nobody is trusted yet" description="Only the server owner bypasses antinuke by default." />
      ) : (
        <ul className="divide-y divide-ink-700/60">
          {entries.map((entry) => (
            <li key={entry.id} className="flex items-center gap-3 px-5 py-2.5">
              {entry.targetType === "role" ? <Users className="h-3.5 w-3.5 text-zinc-500" /> : <UserRound className="h-3.5 w-3.5 text-zinc-500" />}
              <span className="flex-1">{entry.targetType === "role" ? <RoleName id={entry.targetId} /> : <UserChip userId={entry.targetId} />}</span>
              <span className="hidden text-2xs text-zinc-600 sm:inline">added {timeAgo(entry.createdAt)}</span>
              {canConfigure ? (
                <button type="button" aria-label="Remove" onClick={() => remove.mutate(entry.id)} className="btn-icon h-7 w-7 text-zinc-500 hover:text-red-400">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Events() {
  const { guildId, canConfigure } = useGuild();
  const security = useSecurity(guildId);
  const queryClient = useQueryClient();
  const toast = useToast();
  const [filter, setFilter] = useState<"open" | "all">("open");
  const resolve = useMutation({
    mutationFn: (id: string) => moderationApi.resolveEvent(guildId, id),
    onSuccess: () => {
      toast.success("Event marked resolved");
      void queryClient.invalidateQueries({ queryKey: keys.security(guildId) });
      void queryClient.invalidateQueries({ queryKey: keys.alerts(guildId) });
    },
    onError: (error) => toast.error("Couldn't resolve the event", errorMessage(error)),
  });
  const rows = (security.data?.events ?? []).filter((event) => filter === "all" || !event.resolved);
  return (
    <Card>
      <CardHeader
        title="Security events"
        description="Recorded by the bot's antinuke and antiraid engines. Updates live."
        icon={<Siren className="h-4 w-4" />}
        action={<Segmented value={filter} onChange={setFilter} size="sm" options={[{ value: "open", label: "Unresolved" }, { value: "all", label: "All" }]} />}
      />
      {security.error ? (
        <ErrorState error={security.error} compact onRetry={() => void security.refetch()} />
      ) : (
        <DataTable<SecurityEvent>
          loading={security.isLoading}
          rows={rows}
          rowKey={(row) => row.id}
          empty={<EmptyState compact icon={ShieldCheck} title={filter === "open" ? "No unresolved security events" : "No security events recorded"} description="When INFERA detects destructive actions or raid behaviour, it's recorded here." />}
          columns={[
            { id: "type", header: "Event", cell: (row) => <span className="font-mono text-xs text-zinc-200">{row.type}</span> },
            { id: "severity", header: "Severity", cell: (row) => <Badge tone={severityTone(row.severity)}>{row.severity}</Badge> },
            { id: "actor", header: "Actor", cell: (row) => (row.actorId ? <UserChip userId={row.actorId} /> : <span className="text-zinc-600">Unknown</span>) },
            {
              id: "detail",
              header: "Detail / action",
              className: "max-w-[280px]",
              cell: (row) => {
                const detail = safeParse<Record<string, unknown>>(row.detail, {});
                const entries = Object.entries(detail).slice(0, 3);
                return entries.length ? (
                  <span className="line-clamp-2 font-mono text-2xs text-zinc-500">{entries.map(([key, value]) => `${key}: ${typeof value === "object" ? JSON.stringify(value) : String(value)}`).join(" · ")}</span>
                ) : (
                  <span className="text-zinc-600">—</span>
                );
              },
            },
            { id: "time", header: "Time", cell: (row) => <span className="text-zinc-500" title={formatDate(row.createdAt)}>{timeAgo(row.createdAt)}</span> },
            {
              id: "resolution",
              header: "Resolution",
              cell: (row) =>
                row.resolved ? (
                  <span className="flex items-center gap-1 text-xs text-emerald-400">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Resolved
                  </span>
                ) : canConfigure ? (
                  <Button size="sm" loading={resolve.isPending && resolve.variables === row.id} onClick={() => resolve.mutate(row.id)}>
                    Mark resolved
                  </Button>
                ) : (
                  <Badge tone="warning">Open</Badge>
                ),
            },
          ]}
        />
      )}
      <div className="border-t border-ink-700 px-5 py-2.5 text-2xs text-zinc-600">
        Events show what was detected and the configured response. INFERA only reports a threat as handled when the bot records it.
      </div>
    </Card>
  );
}

export function SecurityPage() {
  const { guildId, values, can } = useGuild();
  const security = useSecurity(guildId);
  if (security.isLoading) return <PageSkeleton />;
  if (security.error && !security.data) return <ErrorState error={security.error} onRetry={() => void security.refetch()} />;
  const antinuke = Boolean(values["security.antinuke.enabled"]);
  const antiraid = Boolean(values["security.antiraid.enabled"]);
  const open = (security.data?.events ?? []).filter((event) => !event.resolved).length;

  return (
    <ConfigPage>
      <PageHeader
        title="Security"
        icon={ShieldAlert}
        description="Antinuke, antiraid, lockdown and trusted access. Changes here protect the server against compromised staff accounts and raids."
        meta={
          <>
            <Badge tone={antinuke ? "success" : "neutral"} dot>Antinuke {antinuke ? "on" : "off"}</Badge>
            <Badge tone={antiraid ? "success" : "neutral"} dot>Antiraid {antiraid ? "on" : "off"}</Badge>
            {open ? <Badge tone="danger">{open} unresolved</Badge> : null}
          </>
        }
      />
      {!can("manage_security") ? (
        <Callout tone="info" className="mb-4">You can view security status. Changing it requires administrator access.</Callout>
      ) : null}
      {!values["security.alert_channel"] && (antinuke || antiraid) ? (
        <Callout tone="warning" className="mb-4" title="No alert channel">
          Protection is on but alerts have nowhere to go. Choose an alert channel below so staff are notified.
        </Callout>
      ) : null}
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="space-y-4">
          <SettingsSection
            id="antinuke"
            title="Antinuke"
            description="Detects bursts of bans, kicks, channel or role deletions and dangerous permission grants by a single actor."
            icon={<AlertOctagon className="h-4 w-4" />}
            configKeys={["security.antinuke.enabled", "security.antinuke.threshold", "security.antinuke.window_seconds", "security.antinuke.action", "security.alert_channel"]}
            overrides={{
              "security.antinuke.threshold": { label: "Detection threshold", description: "Destructive actions allowed inside the window before INFERA responds." },
              "security.antinuke.window_seconds": { label: "Detection window" },
              "security.antinuke.action": { label: "Response action", description: "alert only · remove dangerous permissions · kick · ban the offending actor." },
            }}
          />
          <SettingsSection
            id="recovery"
            title="Recovery"
            description="Best-effort restoration when enough information exists. Deleted Discord data can't always be fully recovered."
            icon={<CheckCircle2 className="h-4 w-4" />}
            configKeys={["security.restore_deleted_channels", "security.restore_deleted_roles"]}
          />
          <Whitelist />
        </div>
        <div className="space-y-4">
          <SettingsSection
            id="antiraid"
            title="Antiraid"
            description="Detects mass joins and very new accounts."
            icon={<Users className="h-4 w-4" />}
            configKeys={["security.antiraid.enabled", "security.antiraid.join_threshold", "security.antiraid.window_seconds", "security.antiraid.account_age_days", "security.lockdown.enabled"]}
            overrides={{
              "security.antiraid.join_threshold": { label: "Join threshold" },
              "security.antiraid.window_seconds": { label: "Time window" },
              "security.antiraid.account_age_days": { label: "Minimum account age (days)" },
              "security.lockdown.enabled": { label: "Allow lockdown mode" },
            }}
          />
          <LockdownPanel />
          <Unsupported title="Response actions for antiraid and per-detector thresholds">
            The backend has a single antinuke threshold/action and antiraid has detection settings only — separate thresholds per event type and antiraid response actions need new config keys.
          </Unsupported>
        </div>
      </div>
      <div className="mt-4">
        <Events />
      </div>
      <p className="mt-3 flex items-center gap-1.5 text-2xs text-zinc-600">
        <StatusDot tone="success" /> Security events stream in live while this page is open.
      </p>
    </ConfigPage>
  );
}
