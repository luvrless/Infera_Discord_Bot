import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Award, Ban, Crown, Hash, MessageSquare, Plus, RotateCcw, Sparkles, Trash2, TrendingUp, Trophy, UserRound, Users } from "lucide-react";
import { useState } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { MetricCard, PageHeader, StatGrid } from "../../components/cards";
import { ConfigPage, SettingsSection } from "../../components/config/engine";
import { ChannelName, ChannelPicker, MemberPicker, RoleName, RolePicker, UserChip } from "../../components/ui/pickers";
import { Avatar, Badge, Button, Callout, Card, CardHeader, Field, Segmented, TextInput, Unsupported } from "../../components/ui/primitives";
import { ConfirmDialog } from "../../components/ui/overlays";
import { EmptyState, ErrorState, SkeletonRows } from "../../components/ui/states";
import { DataTable, Pagination } from "../../components/ui/table";
import { useToast } from "../../components/ui/toast";
import { errorMessage } from "../../lib/api/client";
import { engagementApi, useExclusions, useLeaderboard, useLevelStats, useRewards } from "../../lib/api/engagement";
import { keys } from "../../lib/api/keys";
import { formatNumber, timeAgo } from "../../lib/utils";
import { displayName, useResolvedUser } from "../../hooks/useUsers";
import { useGuild } from "../../hooks/useGuild";
import { useAuth } from "../../hooks/useAuth";

function Overview() {
  const { guildId } = useGuild();
  const stats = useLevelStats(guildId);
  const chart = (stats.data?.top ?? []).map((row, index) => ({ name: `#${index + 1}`, xp: row.totalXp, userId: row.userId }));
  return (
    <>
      <StatGrid className="mb-4">
        <MetricCard label="Members with XP" value={stats.data?.members} icon={Users} loading={stats.isLoading} />
        <MetricCard label="Total XP awarded" value={stats.data?.totalXp} icon={Sparkles} tone="accent" loading={stats.isLoading} />
        <MetricCard label="Messages counted" value={stats.data?.messages} icon={MessageSquare} loading={stats.isLoading} />
        <MetricCard label="Highest level" value={stats.data?.highestLevel} icon={Crown} tone="warning" loading={stats.isLoading} />
      </StatGrid>
      <Card className="mb-4">
        <CardHeader title="XP distribution" description="Top members by total XP." icon={<TrendingUp className="h-4 w-4" />} />
        <div className="h-48 px-3 py-4">
          {stats.isLoading ? (
            <SkeletonRows rows={3} />
          ) : chart.length === 0 ? (
            <EmptyState compact title="No XP earned yet" description="Members start earning XP as soon as leveling is enabled and they chat." />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                <XAxis dataKey="name" tick={{ fill: "#71717a", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#71717a", fontSize: 11 }} axisLine={false} tickLine={false} width={48} tickFormatter={(value: number) => formatNumber(value)} />
                <Tooltip cursor={{ fill: "rgba(255,255,255,0.03)" }} contentStyle={{ background: "#16161b", border: "1px solid #2c2c36", borderRadius: 8, fontSize: 12 }} formatter={(value: number) => [formatNumber(value), "XP"]} />
                <Bar dataKey="xp" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>
    </>
  );
}

function Rewards() {
  const { guildId, canConfigure } = useGuild();
  const rewards = useRewards(guildId);
  const queryClient = useQueryClient();
  const toast = useToast();
  const [level, setLevel] = useState("5");
  const [roleId, setRoleId] = useState<string | null>(null);
  const [remove, setRemove] = useState<string | null>(null);
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: keys.rewards(guildId) });
    void queryClient.invalidateQueries({ queryKey: keys.levelStats(guildId) });
  };
  const add = useMutation({
    mutationFn: () => engagementApi.addReward(guildId, Number(level), roleId!),
    onSuccess: () => {
      toast.success("Reward added", `Members reaching level ${level} will receive the role.`);
      setRoleId(null);
      refresh();
    },
    onError: (error) => toast.error("Couldn't add the reward", errorMessage(error)),
  });
  const del = useMutation({
    mutationFn: (id: string) => engagementApi.removeReward(guildId, id),
    onSuccess: () => {
      toast.success("Reward removed");
      setRemove(null);
      refresh();
    },
    onError: (error) => toast.error("Couldn't remove the reward", errorMessage(error)),
  });
  const sorted = [...(rewards.data ?? [])].sort((a, b) => a.level - b.level);
  const levelNumber = Number(level);
  return (
    <Card>
      <CardHeader title="Level rewards" description="Roles granted automatically when members reach a level." icon={<Award className="h-4 w-4" />} action={<Badge>{sorted.length}</Badge>} />
      {canConfigure ? (
        <div className="grid gap-3 border-b border-ink-700 p-5 sm:grid-cols-[110px_1fr_auto] sm:items-end">
          <Field label="Level">
            <TextInput type="number" min={1} max={10000} value={level} onChange={(event) => setLevel(event.target.value)} invalid={!Number.isInteger(levelNumber) || levelNumber < 1} />
          </Field>
          <Field label="Role">
            <RolePicker value={roleId} onChange={setRoleId} />
          </Field>
          <Button variant="primary" icon={<Plus className="h-3.5 w-3.5" />} loading={add.isPending} disabled={!roleId || !Number.isInteger(levelNumber) || levelNumber < 1} onClick={() => add.mutate()}>
            Add reward
          </Button>
        </div>
      ) : null}
      {rewards.isLoading ? (
        <SkeletonRows className="p-4" rows={3} />
      ) : rewards.error ? (
        <ErrorState error={rewards.error} onRetry={() => void rewards.refetch()} compact />
      ) : sorted.length === 0 ? (
        <EmptyState compact icon={Award} title="No rewards yet" description="Add a role reward to give members something to level up for." />
      ) : (
        <ul className="divide-y divide-ink-700/60">
          {sorted.map((reward) => (
            <li key={reward.id} className="flex items-center gap-3 px-5 py-2.5">
              <span className="w-20 shrink-0 font-mono text-13 text-zinc-300">Lvl {reward.level}</span>
              <span className="flex-1">
                <RoleName id={reward.roleId} />
              </span>
              <Badge tone="success">Active</Badge>
              {canConfigure ? (
                <button type="button" aria-label="Remove reward" onClick={() => setRemove(reward.id)} className="btn-icon h-7 w-7 text-zinc-500 hover:text-red-400">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <div className="border-t border-ink-700 px-5 py-3">
        <p className="hint">To change a reward's level or role, remove it and add a new one — the API has no edit or reorder endpoint for rewards. INFERA needs Manage Roles and a role above each reward role.</p>
      </div>
      <ConfirmDialog open={Boolean(remove)} onClose={() => setRemove(null)} onConfirm={() => remove && del.mutate(remove)} loading={del.isPending} title="Remove this reward?" description="Members who already have the role keep it. New members reaching the level won't receive it." confirmLabel="Remove reward" />
    </Card>
  );
}

function Exclusions() {
  const { guildId, canConfigure } = useGuild();
  const exclusions = useExclusions(guildId);
  const queryClient = useQueryClient();
  const toast = useToast();
  const [type, setType] = useState<"user" | "channel" | "role">("channel");
  const [target, setTarget] = useState<string | null>(null);
  const refresh = () => void queryClient.invalidateQueries({ queryKey: keys.exclusions(guildId) });
  const add = useMutation({
    mutationFn: () => engagementApi.addExclusion(guildId, type, target!),
    onSuccess: () => {
      toast.success("Exclusion added");
      setTarget(null);
      refresh();
    },
    onError: (error) => toast.error("Couldn't add the exclusion", errorMessage(error)),
  });
  const del = useMutation({
    mutationFn: (id: string) => engagementApi.removeExclusion(guildId, id),
    onSuccess: () => {
      toast.success("Exclusion removed");
      refresh();
    },
    onError: (error) => toast.error("Couldn't remove the exclusion", errorMessage(error)),
  });
  return (
    <Card>
      <CardHeader title="XP exclusions" description="Channels and members that never earn XP." icon={<Ban className="h-4 w-4" />} />
      {canConfigure ? (
        <div className="space-y-3 border-b border-ink-700 p-5">
          <Segmented
            value={type}
            onChange={(value) => {
              setType(value);
              setTarget(null);
            }}
            size="sm"
            options={[
              { value: "channel", label: "Channel" },
              { value: "role", label: "Role" },
              { value: "user", label: "Member" },
            ]}
          />
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="flex-1">
              {type === "channel" ? (
                <ChannelPicker value={target} onChange={setTarget} />
              ) : type === "role" ? (
                <RolePicker value={target} onChange={setTarget} />
              ) : (
                <MemberPicker value={target} onChange={(id) => setTarget(id)} />
              )}
            </div>
            <Button icon={<Plus className="h-3.5 w-3.5" />} loading={add.isPending} disabled={!target} onClick={() => add.mutate()}>
              Exclude
            </Button>
          </div>
        </div>
      ) : null}
      {exclusions.isLoading ? (
        <SkeletonRows className="p-4" rows={2} />
      ) : (exclusions.data ?? []).length === 0 ? (
        <EmptyState compact title="No exclusions" description="Everyone earns XP everywhere." />
      ) : (
        <ul className="divide-y divide-ink-700/60">
          {(exclusions.data ?? []).map((entry) => (
            <li key={entry.id} className="flex items-center gap-3 px-5 py-2.5">
              {entry.targetType === "channel" ? (
                <Hash className="h-3.5 w-3.5 text-zinc-500" />
              ) : entry.targetType === "role" ? (
                <Award className="h-3.5 w-3.5 text-zinc-500" />
              ) : (
                <UserRound className="h-3.5 w-3.5 text-zinc-500" />
              )}
              <span className="flex-1">
                {entry.targetType === "channel" ? (
                  <ChannelName id={entry.targetId} />
                ) : entry.targetType === "role" ? (
                  <RoleName id={entry.targetId} />
                ) : (
                  <UserChip userId={entry.targetId} />
                )}
              </span>
              <span className="text-2xs text-zinc-600">{timeAgo(entry.createdAt)}</span>
              {canConfigure ? (
                <button type="button" aria-label="Remove exclusion" onClick={() => del.mutate(entry.id)} className="btn-icon h-7 w-7 text-zinc-500 hover:text-red-400">
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

function RankCardPreview({ color, background }: { color: string; background: string }) {
  const { user } = useAuth();
  const { detail } = useGuild();
  const valid = /^https:\/\//.test(background);
  return (
    <div className="relative overflow-hidden rounded-xl border border-ink-600" style={{ background: valid ? `center / cover url(${background})` : "#111115" }}>
      <div className="relative flex items-center gap-4 bg-black/55 p-5">
        <Avatar src={user?.avatarUrl} name={user?.username ?? "?"} size={64} className="ring-4" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <p className="truncate text-base font-semibold text-white">{user?.globalName ?? user?.username ?? "member"}</p>
            <p className="shrink-0 text-xs text-zinc-300">
              RANK <span className="text-lg font-semibold text-white">#3</span> · LEVEL{" "}
              <span className="text-lg font-semibold" style={{ color }}>
                12
              </span>
            </p>
          </div>
          <div className="mt-2 h-3 overflow-hidden rounded-full bg-white/15">
            <div className="h-full rounded-full" style={{ width: "62%", background: color }} />
          </div>
          <p className="mt-1.5 flex justify-between text-2xs text-zinc-300">
            <span>{detail.guild.name}</span>
            <span>1,240 / 2,000 XP</span>
          </p>
        </div>
      </div>
    </div>
  );
}

function Leaderboard() {
  const { guildId, canConfigure } = useGuild();
  const [type, setType] = useState<"xp" | "messages" | "voice">("xp");
  const [page, setPage] = useState(1);
  const board = useLeaderboard(guildId, type, page);
  const queryClient = useQueryClient();
  const toast = useToast();
  const [resetTarget, setResetTarget] = useState<{ scope: "guild" } | { scope: "user"; userId: string } | null>(null);
  const reset = useMutation({
    mutationFn: () => engagementApi.resetLevels(guildId, resetTarget!),
    onSuccess: (result) => {
      toast.success("XP reset", `${formatNumber(result.reset)} member record${result.reset === 1 ? "" : "s"} reset.`);
      setResetTarget(null);
      void queryClient.invalidateQueries({ queryKey: keys.leveling(guildId) });
    },
    onError: (error) => toast.error("Couldn't reset XP", errorMessage(error)),
  });
  const offset = (page - 1) * (board.data?.pageSize ?? 15);

  return (
    <Card>
      <CardHeader
        title="Leaderboard"
        description="Real rankings from the leveling database."
        icon={<Trophy className="h-4 w-4" />}
        action={
          canConfigure ? (
            <Button size="sm" variant="danger-ghost" icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={() => setResetTarget({ scope: "guild" })}>
              Reset all
            </Button>
          ) : null
        }
      />
      <div className="flex flex-wrap items-center gap-3 border-b border-ink-700 px-5 py-3">
        <Segmented
          value={type}
          size="sm"
          onChange={(value) => {
            setType(value);
            setPage(1);
          }}
          options={[
            { value: "xp", label: "All-time XP" },
            { value: "messages", label: "Messages" },
            { value: "voice", label: "Voice" },
          ]}
        />
        <Segmented
          value="none"
          size="sm"
          onChange={() => undefined}
          options={[
            { value: "weekly", label: "Weekly", disabled: true, title: "The API has no time-windowed leaderboard yet" },
            { value: "monthly", label: "Monthly", disabled: true, title: "The API has no time-windowed leaderboard yet" },
          ]}
        />
      </div>
      <DataTable
        loading={board.isFetching}
        rows={board.data?.items}
        rowKey={(row) => row.userId}
        empty={<EmptyState compact icon={Trophy} title="No ranked members yet" />}
        columns={[
          { id: "rank", header: "#", className: "w-12 font-mono text-zinc-500", cell: (row) => offset + (board.data?.items.indexOf(row) ?? 0) + 1 },
          { id: "user", header: "Member", cell: (row) => <UserChip userId={row.userId} /> },
          { id: "level", header: "Level", cell: (row) => <span className="font-semibold text-zinc-100">{row.level}</span> },
          { id: "xp", header: "XP", cell: (row) => formatNumber(row.totalXp) },
          { id: "messages", header: "Messages", cell: (row) => formatNumber(row.messages) },
          { id: "voice", header: "Voice min", cell: (row) => formatNumber(row.voiceMinutes) },
          {
            id: "actions",
            header: "",
            className: "w-10",
            cell: (row) =>
              canConfigure ? (
                <button type="button" aria-label="Reset member XP" onClick={() => setResetTarget({ scope: "user", userId: row.userId })} className="btn-icon h-7 w-7 text-zinc-600 hover:text-red-400">
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              ) : null,
          },
        ]}
      />
      {board.data ? <Pagination page={page} pageSize={board.data.pageSize} total={board.data.total} onChange={setPage} /> : null}
      <ResetDialog target={resetTarget} onClose={() => setResetTarget(null)} onConfirm={() => reset.mutate()} loading={reset.isPending} />
    </Card>
  );
}

function ResetDialog({ target, onClose, onConfirm, loading }: { target: { scope: "guild" } | { scope: "user"; userId: string } | null; onClose: () => void; onConfirm: () => void; loading: boolean }) {
  const { guildId } = useGuild();
  const user = useResolvedUser(guildId, target?.scope === "user" ? target.userId : null);
  return (
    <ConfirmDialog
      open={Boolean(target)}
      onClose={onClose}
      onConfirm={onConfirm}
      loading={loading}
      title={target?.scope === "guild" ? "Reset XP for everyone?" : `Reset XP for ${displayName(user.data, target?.scope === "user" ? target.userId : "")}?`}
      description="XP, levels and message counts are permanently set back to zero. Reward roles already granted are not removed."
      confirmLabel="Reset XP"
      confirmText={target?.scope === "guild" ? "reset" : undefined}
    />
  );
}

export function LevelingPage() {
  const { values } = useGuild();
  const min = Number(values["leveling.message_xp_min"] ?? 0);
  const max = Number(values["leveling.message_xp_max"] ?? 0);
  return (
    <ConfigPage>
      <PageHeader title="Leveling" icon={TrendingUp} description="XP for chatting and voice, level-up announcements, rewards and leaderboards." />
      <Overview />
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="space-y-4">
          <SettingsSection
            id="leveling-core"
            title="XP settings"
            description="How members earn XP."
            icon={<Sparkles className="h-4 w-4" />}
            configKeys={["leveling.enabled", "leveling.message_xp_min", "leveling.message_xp_max", "leveling.message_cooldown", "leveling.voice_xp_enabled", "leveling.voice_xp_rate", "leveling.xp_multiplier", "leveling.daily_cap", "leveling.level_formula"]}
          >
            {(draft) =>
              Number(draft.values["leveling.message_xp_min"]) > Number(draft.values["leveling.message_xp_max"]) ? (
                <Callout tone="warning">Minimum XP is higher than maximum XP. The bot will award the maximum.</Callout>
              ) : (
                <p className="hint">
                  Each message awards {min}–{max} XP (saved values), at most once per cooldown.
                </p>
              )
            }
          </SettingsSection>
          <SettingsSection
            id="leveling-announce"
            title="Level-up announcements"
            description="Supports {user} and {level}."
            icon={<MessageSquare className="h-4 w-4" />}
            configKeys={["leveling.announcement_channel", "leveling.announcement_message", "leveling.leaderboard_enabled", "leveling.global_opt_in"]}
          />
          <SettingsSection id="leveling-card" title="Rank card" description="Appearance of the rank card the bot renders." icon={<Award className="h-4 w-4" />} configKeys={["leveling.rank_card_color", "leveling.rank_card_background"]}>
            {(draft) => (
              <div className="space-y-2">
                <RankCardPreview color={String(draft.values["leveling.rank_card_color"] ?? "#8B5CF6")} background={String(draft.values["leveling.rank_card_background"] ?? "")} />
                <p className="hint">Approximate preview — the bot draws the final card. Backgrounds must be https image URLs. Text colour, progress bar style and avatar display aren't configurable in the backend.</p>
              </div>
            )}
          </SettingsSection>
        </div>
        <div className="space-y-4">
          <Rewards />
          <Exclusions />
        </div>
      </div>
      <div className="mt-4">
        <Leaderboard />
      </div>
    </ConfigPage>
  );
}
