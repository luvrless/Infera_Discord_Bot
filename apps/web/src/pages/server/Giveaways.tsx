import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Clock, Crown, Gift, Plus, RefreshCw, Square, Users, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { PageHeader } from "../../components/cards";
import { ConfigPage, SettingsSection } from "../../components/config/engine";
import { ChannelName, ChannelPicker, MultiRolePicker, RoleName, UserChip } from "../../components/ui/pickers";
import { Badge, Button, Callout, Card, Field, Tabs, TextInput } from "../../components/ui/primitives";
import { ConfirmDialog, Modal } from "../../components/ui/overlays";
import { EmptyState, ErrorState, SkeletonRows } from "../../components/ui/states";
import { useToast } from "../../components/ui/toast";
import { errorMessage } from "../../lib/api/client";
import { engagementApi, useGiveaways } from "../../lib/api/engagement";
import { keys } from "../../lib/api/keys";
import type { Giveaway } from "../../lib/api/types";
import { formatDate, formatDuration, parseDuration, parseJsonList, timeAgo } from "../../lib/utils";
import { useGuild } from "../../hooks/useGuild";

function Countdown({ endsAt }: { endsAt: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const remaining = Math.max(0, Math.round((new Date(endsAt).getTime() - now) / 1000));
  return <span className="tabular-nums">{remaining > 0 ? formatDuration(remaining) : "ending…"}</span>;
}

function CreateModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { guildId, values } = useGuild();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [prize, setPrize] = useState("");
  const [channelId, setChannelId] = useState<string | null>(null);
  const [duration, setDuration] = useState(formatDuration(Number(values["giveaways.default_duration"] ?? 86_400)).replace(/\s/g, ""));
  const [winners, setWinners] = useState(String(values["giveaways.default_winners"] ?? 1));
  const [required, setRequired] = useState<string[]>((values["giveaways.required_roles"] as string[]) ?? []);
  const [excluded, setExcluded] = useState<string[]>((values["giveaways.excluded_roles"] as string[]) ?? []);
  const seconds = parseDuration(duration);
  const winnerCount = Number(winners);
  const durationInvalid = !seconds || seconds < 10 || seconds > 2_592_000;
  const winnersInvalid = !Number.isInteger(winnerCount) || winnerCount < 1 || winnerCount > 100;
  const create = useMutation({
    mutationFn: () => engagementApi.createGiveaway(guildId, { channelId: channelId!, prize: prize.trim(), winners: winnerCount, durationSeconds: seconds!, requiredRoles: required, excludedRoles: excluded }),
    onSuccess: () => {
      toast.success("Giveaway started", "INFERA posted it in Discord.");
      void queryClient.invalidateQueries({ queryKey: keys.giveaways(guildId) });
      setPrize("");
      onClose();
    },
    onError: (error) => toast.error("Couldn't start the giveaway", errorMessage(error)),
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Start a giveaway"
      description="The bot posts the giveaway with an Enter button and picks winners automatically when it ends."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={create.isPending} disabled={!prize.trim() || !channelId || durationInvalid || winnersInvalid} onClick={() => create.mutate()}>
            Start giveaway
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Prize" required>
          <TextInput value={prize} maxLength={200} onChange={(event) => setPrize(event.target.value)} placeholder="Discord Nitro, 1 month" />
        </Field>
        <Field label="Channel" required>
          <ChannelPicker value={channelId} onChange={setChannelId} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Duration" required hint={seconds ? formatDuration(seconds) : "e.g. 30m, 12h, 7d (max 30d)"} error={durationInvalid && duration ? "Between 10 seconds and 30 days" : null}>
            <TextInput value={duration} onChange={(event) => setDuration(event.target.value)} invalid={durationInvalid} />
          </Field>
          <Field label="Winners" required error={winnersInvalid ? "1 – 100" : null}>
            <TextInput type="number" min={1} max={100} value={winners} onChange={(event) => setWinners(event.target.value)} invalid={winnersInvalid} />
          </Field>
        </div>
        <Field label="Required roles" hint="Members need at least one of these to enter.">
          <MultiRolePicker value={required} onChange={setRequired} />
        </Field>
        <Field label="Excluded roles">
          <MultiRolePicker value={excluded} onChange={setExcluded} />
        </Field>
        <p className="hint">Description and custom entry requirements (account age, level, messages) aren't supported by the giveaway API.</p>
      </div>
    </Modal>
  );
}

function GiveawayCard({ giveaway }: { giveaway: Giveaway }) {
  const { guildId, canModerate } = useGuild();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [confirm, setConfirm] = useState<"end" | "cancel" | "reroll" | null>(null);
  const action = useMutation({
    mutationFn: (kind: "end" | "cancel" | "reroll") => engagementApi.giveawayAction(guildId, giveaway.id, kind),
    onSuccess: (result, kind) => {
      setConfirm(null);
      const winners = result.result?.winners ?? result.winners ?? [];
      toast.success(kind === "cancel" ? "Giveaway cancelled" : kind === "reroll" ? "Rerolled" : "Giveaway ended", kind !== "cancel" ? (winners.length ? `${winners.length} winner${winners.length === 1 ? "" : "s"} drawn.` : "No eligible entries — no winners drawn.") : undefined);
      void queryClient.invalidateQueries({ queryKey: keys.giveaways(guildId) });
    },
    onError: (error) => {
      setConfirm(null);
      toast.error("The giveaway action failed", errorMessage(error));
    },
  });
  const winners = giveaway.entries.filter((entry) => entry.won);
  const required = parseJsonList(giveaway.requiredRoles);
  const active = giveaway.status === "active";
  return (
    <Card className="flex flex-col p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-zinc-100">{giveaway.prize}</p>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-zinc-500">
            <ChannelName id={giveaway.channelId} /> · hosted by <UserChip userId={giveaway.hostId} size={16} />
          </p>
        </div>
        <Badge tone={active ? "success" : giveaway.status === "cancelled" ? "neutral" : "accent"} dot>
          {giveaway.status}
        </Badge>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3 text-xs">
        <div>
          <p className="flex items-center gap-1 text-zinc-500"><Clock className="h-3 w-3" /> {active ? "Ends in" : "Ended"}</p>
          <p className="mt-1 text-13 text-zinc-100">{active ? <Countdown endsAt={giveaway.endsAt} /> : timeAgo(giveaway.endedAt ?? giveaway.endsAt)}</p>
        </div>
        <div>
          <p className="flex items-center gap-1 text-zinc-500"><Users className="h-3 w-3" /> Entries</p>
          <p className="mt-1 text-13 tabular-nums text-zinc-100">{giveaway.entries.length}</p>
        </div>
        <div>
          <p className="flex items-center gap-1 text-zinc-500"><Crown className="h-3 w-3" /> Winners</p>
          <p className="mt-1 text-13 tabular-nums text-zinc-100">{giveaway.winners}</p>
        </div>
      </div>
      {required.length ? (
        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-2xs text-zinc-500">
          Requires {required.map((id) => <RoleName key={id} id={id} />)}
        </div>
      ) : null}
      {winners.length ? (
        <div className="mt-3 rounded-lg bg-ink-900 px-3 py-2">
          <p className="mb-1.5 text-2xs font-medium text-zinc-500">Winners</p>
          <div className="flex flex-wrap gap-2">
            {winners.map((entry) => (
              <UserChip key={entry.userId} userId={entry.userId} size={18} />
            ))}
          </div>
        </div>
      ) : null}
      <p className="mt-3 text-2xs text-zinc-600">{active ? `Ends ${formatDate(giveaway.endsAt)}` : `Started ${formatDate(giveaway.createdAt)}`}</p>
      {canModerate ? (
        <div className="mt-3 flex flex-wrap justify-end gap-2 border-t border-ink-700 pt-3">
          {active ? (
            <>
              <Button size="sm" variant="danger-ghost" icon={<XCircle className="h-3.5 w-3.5" />} onClick={() => setConfirm("cancel")}>
                Cancel
              </Button>
              <Button size="sm" icon={<Square className="h-3.5 w-3.5" />} onClick={() => setConfirm("end")}>
                End now
              </Button>
            </>
          ) : giveaway.status === "ended" ? (
            <Button size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={() => setConfirm("reroll")}>
              Reroll
            </Button>
          ) : null}
        </div>
      ) : null}
      <ConfirmDialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm && action.mutate(confirm)}
        loading={action.isPending}
        tone={confirm === "cancel" ? "danger" : "primary"}
        title={confirm === "cancel" ? "Cancel this giveaway?" : confirm === "end" ? "End this giveaway now?" : "Reroll winners?"}
        description={confirm === "cancel" ? "No winners will be drawn and entries are discarded." : confirm === "end" ? "Winners are drawn immediately from current entries." : "New winners are drawn from the remaining entries and announced."}
        confirmLabel={confirm === "cancel" ? "Cancel giveaway" : confirm === "end" ? "End & draw" : "Reroll"}
      />
    </Card>
  );
}

export function GiveawaysPage() {
  const { guildId, canModerate, modules } = useGuild();
  const giveaways = useGiveaways(guildId);
  const [tab, setTab] = useState<"active" | "ended" | "cancelled" | "settings">("active");
  const [creating, setCreating] = useState(false);
  const enabled = modules.find((module) => module.id === "giveaways")?.enabled;
  const list = (giveaways.data ?? []).filter((giveaway) => giveaway.status === tab);
  const counts = (status: string) => (giveaways.data ?? []).filter((giveaway) => giveaway.status === status).length;
  return (
    <ConfigPage>
      <PageHeader
        title="Giveaways"
        icon={Gift}
        description="Run giveaways with role requirements. Entries and winners update live."
        actions={canModerate ? <Button variant="primary" icon={<Plus className="h-3.5 w-3.5" />} disabled={enabled === false} onClick={() => setCreating(true)}>New giveaway</Button> : null}
      />
      {enabled === false ? <Callout tone="warning" className="mb-4">The giveaways module is disabled. Enable it in Modules to start giveaways.</Callout> : null}
      <Tabs className="mb-5" value={tab} onChange={setTab} tabs={[{ id: "active", label: "Active", count: counts("active") }, { id: "ended", label: "Ended", count: counts("ended") }, { id: "cancelled", label: "Cancelled", count: counts("cancelled") }, { id: "settings", label: "Defaults" }]} />
      {tab === "settings" ? (
        <div className="max-w-2xl">
          <SettingsSection id="giveaway-defaults" title="Giveaway defaults" icon={<Gift className="h-4 w-4" />} configKeys={["giveaways.enabled", "giveaways.default_duration", "giveaways.default_winners", "giveaways.required_roles", "giveaways.excluded_roles"]} />
        </div>
      ) : !canModerate ? (
        <Card><EmptyState title="Moderator access required" /></Card>
      ) : giveaways.isLoading ? (
        <SkeletonRows />
      ) : giveaways.error ? (
        <Card><ErrorState error={giveaways.error} onRetry={() => void giveaways.refetch()} /></Card>
      ) : list.length === 0 ? (
        <Card><EmptyState icon={Gift} title={`No ${tab} giveaways`} description={tab === "active" ? "Start one and it'll appear here with a live countdown." : undefined} /></Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {list.map((giveaway) => (
            <GiveawayCard key={giveaway.id} giveaway={giveaway} />
          ))}
        </div>
      )}
      <CreateModal open={creating} onClose={() => setCreating(false)} />
    </ConfigPage>
  );
}
