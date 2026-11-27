import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpRight,
  Check,
  Coins,
  Crown,
  Gift,
  Lightbulb,
  Plus,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  TrendingUp,
  Trophy,
  Users,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { ConfigForm } from "../components/ConfigForm";
import { DiscordPreview } from "../components/DiscordPreview";
import { useGuildData } from "../components/GuildGate";
import { useToast } from "../components/Toast";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
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
  SearchInput,
  Select,
  Skeleton,
  Stat,
  Tabs,
  Textarea,
  Toggle,
  cn,
} from "../components/ui";
import { api } from "../lib/api";
import {
  qk,
  useChannels,
  useRoles,
  useSaveConfig,
  useSchema,
  useSession,
  useSettings,
} from "../lib/hooks";
import type {
  ConfigKey,
  EconomyItem,
  EconomyTransaction,
  Giveaway,
  LevelExclusion,
  LevelReward,
  LevelingStats,
  LeaderboardEntry,
  Paginated,
  Suggestion,
} from "../lib/types";
import { compactNumber, formatDate, relativeTime } from "../lib/utils";

function useDefinitions(prefixes: string[]): ConfigKey[] {
  const schema = useSchema();
  return useMemo(
    () =>
      (schema.data?.schema.keys ?? []).filter((definition) =>
        prefixes.some((prefix) => definition.key === prefix || definition.key.startsWith(`${prefix}.`)),
      ),
    [schema.data, prefixes],
  );
}

/* ---------------------------------------------------------------- welcome */

export function WelcomePage() {
  const { guildId } = useGuildData();
  const settings = useSettings(guildId);
  const schema = useSchema();
  const channels = useChannels(guildId);
  const roles = useRoles(guildId);
  const save = useSaveConfig(guildId);
  const goodbyeDefinitions = (schema.data?.schema.keys ?? []).filter((definition) => definition.key.startsWith("goodbye."));

  return (
    <div>
      <PageHeader
        title="Welcome & goodbye"
        description="Messages, embeds and autoroles sent when members join or leave. The preview updates as you type."
      />
      {settings.isError ? <ErrorState error={settings.error} onRetry={() => void settings.refetch()} /> : null}
      {!settings.data ? (
        <Skeleton className="h-96" />
      ) : (
        <WelcomeEditor
          key={settings.data.version}
          guildId={guildId}
          values={settings.data.values}
          channels={channels.data?.channels ?? []}
          roles={roles.data?.roles ?? []}
          saving={save.isPending}
          onSave={async (patch) => {
            await save.mutateAsync(patch);
          }}
        />
      )}
      <Card className="mt-4 p-4">
        <h2 className="mb-3 text-sm font-semibold text-zinc-200">Goodbye message</h2>
        {settings.data ? (
          <ConfigForm
            key={`goodbye-${settings.data.version}`}
            definitions={goodbyeDefinitions}
            values={settings.data.values}
            channels={channels.data?.channels ?? []}
            saving={save.isPending}
            onSave={async (patch) => {
              await save.mutateAsync(patch);
            }}
          />
        ) : null}
      </Card>
      <div className="mt-3">
        <InfoNote>
          The welcome image generator is not implemented by this bot build, so image settings are hidden rather than
          pretending to work. Messages, embeds, DMs and autoroles are delivered by the bot.
        </InfoNote>
      </div>
    </div>
  );
}

function WelcomeEditor({
  guildId,
  values,
  channels,
  roles,
  saving,
  onSave,
}: {
  guildId: string;
  values: Record<string, unknown>;
  channels: Array<{ id: string; name: string; type: number }>;
  roles: Array<{ id: string; name: string }>;
  saving: boolean;
  onSave: (patch: Record<string, unknown>) => Promise<void>;
}) {
  const session = useSession();
  const { push } = useToast();
  const [enabled, setEnabled] = useState(Boolean(values["welcome.enabled"]));
  const [channelId, setChannelId] = useState(String(values["welcome.channel_id"] ?? ""));
  const [message, setMessage] = useState(String(values["welcome.message"] ?? ""));
  const [embedEnabled, setEmbedEnabled] = useState(Boolean(values["welcome.embed.enabled"]));
  const [title, setTitle] = useState(String(values["welcome.embed.title"] ?? ""));
  const [description, setDescription] = useState(String(values["welcome.embed.description"] ?? ""));
  const [color, setColor] = useState(String(values["welcome.embed.color"] ?? "#8B5CF6"));
  const [dmEnabled, setDmEnabled] = useState(Boolean(values["welcome.dm.enabled"]));
  const [dmMessage, setDmMessage] = useState(String(values["welcome.dm.message"] ?? ""));
  const [autoroles, setAutoroles] = useState<string[]>(
    Array.isArray(values["welcome.autoroles"]) ? (values["welcome.autoroles"] as string[]) : [],
  );
  const [testing, setTesting] = useState(false);
  const [testChannel, setTestChannel] = useState(channelId);

  const channelName = channels.find((channel) => channel.id === channelId)?.name ?? "welcome";
  const user = session.data?.user;

  const patch: Record<string, unknown> = {};
  const consider = (key: string, value: unknown) => {
    if (JSON.stringify(values[key]) !== JSON.stringify(value)) patch[key] = value;
  };
  consider("welcome.enabled", enabled);
  consider("welcome.channel_id", channelId || null);
  consider("welcome.message", message);
  consider("welcome.embed.enabled", embedEnabled);
  consider("welcome.embed.title", title);
  consider("welcome.embed.description", description);
  consider("welcome.embed.color", color);
  consider("welcome.dm.enabled", dmEnabled);
  consider("welcome.dm.message", dmMessage);
  consider("welcome.autoroles", autoroles);
  const dirty = Object.keys(patch).length;

  const insert = (variable: string) => setMessage((current) => `${current}${current.endsWith(" ") || !current ? "" : " "}${variable}`);

  const save = async () => {
    try {
      await onSave(patch);
      push({ title: "Welcome configuration saved", tone: "success" });
    } catch (error) {
      push({ title: "Could not save", description: error instanceof Error ? error.message : "Unknown error", tone: "error" });
    }
  };

  const test = async () => {
    if (!testChannel) {
      push({ title: "Pick a channel for the test", tone: "error" });
      return;
    }
    setTesting(true);
    try {
      await api.post(`/guilds/${guildId}/test-message`, {
        channelId: testChannel,
        message,
        embed: { enabled: embedEnabled, title, description, color },
      });
      push({ title: "Test message sent", description: "Check the selected channel in Discord.", tone: "success" });
    } catch (error) {
      push({ title: "Test failed", description: error instanceof Error ? error.message : "Unknown error", tone: "error" });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[1.15fr_1fr]">
      <Card className="p-4">
        <div className="space-y-4">
          <Toggle
            checked={enabled}
            onChange={setEnabled}
            label="Welcome messages"
            description="Send a message when a member joins."
          />
          <Field label="Destination channel">
            <Select
              value={channelId}
              onChange={(event) => setChannelId(event.target.value)}
              placeholder="Select a channel"
              options={channels
                .filter((channel) => channel.type !== 4)
                .map((channel) => ({ value: channel.id, label: `# ${channel.name}` }))}
            />
          </Field>
          <Field label="Message" hint="Placeholders are replaced per member.">
            <Textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={3} />
          </Field>
          <div className="flex flex-wrap gap-1">
            {["{user}", "{username}", "{server}", "{member_count}", "{joined_at}", "{inviter}"].map((variable) => (
              <button
                key={variable}
                type="button"
                onClick={() => insert(variable)}
                className="chip font-mono hover:border-accent/40 hover:text-accent-soft"
              >
                {variable}
              </button>
            ))}
          </div>

          <div className="rounded-lg border border-ink-700 bg-ink-850/60 p-3">
            <Toggle checked={embedEnabled} onChange={setEmbedEnabled} label="Send as embed" />
            {embedEnabled ? (
              <div className="mt-3 grid gap-3">
                <Field label="Embed title">
                  <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Welcome!" />
                </Field>
                <Field label="Embed description">
                  <Textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} />
                </Field>
                <Field label="Accent colour">
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={/^#[0-9a-fA-F]{6}$/.test(color) ? color : "#8b5cf6"}
                      onChange={(event) => setColor(event.target.value.toUpperCase())}
                      className="h-9 w-12 rounded-md border border-ink-600 bg-ink-900"
                    />
                    <Input value={color} onChange={(event) => setColor(event.target.value)} className="font-mono" />
                  </div>
                </Field>
              </div>
            ) : null}
          </div>

          <div className="rounded-lg border border-ink-700 bg-ink-850/60 p-3">
            <Toggle checked={dmEnabled} onChange={setDmEnabled} label="Also send a direct message" />
            {dmEnabled ? (
              <Field className="mt-3" label="DM message">
                <Textarea value={dmMessage} onChange={(event) => setDmMessage(event.target.value)} rows={2} />
              </Field>
            ) : null}
          </div>

          <Field label="Autoroles" hint="Roles granted automatically when a member joins.">
            {roles.length === 0 ? (
              <p className="text-xs text-zinc-500">Role list unavailable.</p>
            ) : (
              <MultiSelect values={autoroles} onChange={setAutoroles}>
                {roles.slice(0, 40).map((role) => (
                  <MultiOption key={role.id} value={role.id} label={role.name} />
                ))}
              </MultiSelect>
            )}
          </Field>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-700 pt-3">
            <p className={cn("text-xs", dirty > 0 ? "text-amber-400" : "text-zinc-500")}>
              {dirty > 0 ? `${dirty} unsaved change${dirty === 1 ? "" : "s"}` : "Everything is saved"}
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setTesting(true)} disabled={!channelId && !testChannel}>
                Send test
              </Button>
              <Button variant="primary" onClick={() => void save()} loading={saving} disabled={dirty === 0}>
                <Check className="h-3.5 w-3.5" /> Save
              </Button>
            </div>
          </div>
        </div>
      </Card>

      <div className="space-y-3">
        <Card className="p-4">
          <h2 className="mb-3 text-sm font-semibold text-zinc-200">Live preview</h2>
          <DiscordPreview
            content={message}
            username={user?.globalName ?? user?.username ?? "New member"}
            avatarUrl={user?.avatarUrl ?? "https://cdn.discordapp.com/embed/avatars/0.png"}
            channelName={channelName}
            embed={{ enabled: embedEnabled, title, description, color }}
          />
        </Card>
        <Card className="p-4">
          <h2 className="text-sm font-semibold text-zinc-200">Autoroles preview</h2>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {autoroles.length === 0 ? <p className="text-xs text-zinc-500">No autoroles configured.</p> : null}
            {autoroles.map((roleId) => (
              <span key={roleId} className="chip">
                {roles.find((role) => role.id === roleId)?.name ?? roleId}
              </span>
            ))}
          </div>
        </Card>
      </div>

      <Modal
        open={testing}
        onClose={() => setTesting(false)}
        title="Send a test welcome"
        description="This sends a real Discord message through the bot."
        footer={
          <>
            <Button variant="secondary" onClick={() => setTesting(false)}>
              Cancel
            </Button>
            <Button variant="primary" loading={testing} onClick={() => void test()}>
              Send test
            </Button>
          </>
        }
      >
        <Field label="Channel">
          <Select
            value={testChannel}
            onChange={(event) => setTestChannel(event.target.value)}
            placeholder="Select a channel"
            options={channels
              .filter((channel) => channel.type !== 4)
              .map((channel) => ({ value: channel.id, label: `# ${channel.name}` }))}
          />
        </Field>
      </Modal>
    </div>
  );
}

/* --------------------------------------------------------------- leveling */

export function LevelingPage() {
  const { guildId } = useGuildData();
  const definitions = useDefinitions(["leveling"]);
  const settings = useSettings(guildId);
  const channels = useChannels(guildId);
  const roles = useRoles(guildId);
  const save = useSaveConfig(guildId);
  const { push } = useToast();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [type, setType] = useState("xp");
  const [rewardOpen, setRewardOpen] = useState(false);
  const [rewardLevel, setRewardLevel] = useState(10);
  const [rewardRole, setRewardRole] = useState("");
  const [exclusionOpen, setExclusionOpen] = useState(false);
  const [exclusionType, setExclusionType] = useState("channel");
  const [exclusionId, setExclusionId] = useState("");

  const stats = useQuery({
    queryKey: ["leveling-stats", guildId],
    queryFn: () => api.get<LevelingStats>(`/guilds/${guildId}/leveling/stats`),
  });
  const leaderboard = useQuery({
    queryKey: ["levelboard", guildId, page, type],
    queryFn: () =>
      api.get<Paginated<LeaderboardEntry>>(`/guilds/${guildId}/leveling/leaderboard?page=${page}&pageSize=10&type=${type}`),
  });
  const rewards = useQuery({
    queryKey: ["level-rewards", guildId],
    queryFn: () => api.get<{ rewards: LevelReward[] }>(`/guilds/${guildId}/leveling/rewards`),
  });
  const exclusions = useQuery({
    queryKey: ["level-exclusions", guildId],
    queryFn: () => api.get<{ exclusions: LevelExclusion[] }>(`/guilds/${guildId}/leveling/exclusions`),
  });

  const addReward = useMutation({
    mutationFn: () => api.post(`/guilds/${guildId}/leveling/rewards`, { level: rewardLevel, roleId: rewardRole }),
    onSuccess: () => {
      setRewardOpen(false);
      setRewardRole("");
      void queryClient.invalidateQueries({ queryKey: ["level-rewards", guildId] });
      push({ title: "Reward added", tone: "success" });
    },
    onError: (error) => push({ title: "Could not add reward", description: error.message, tone: "error" }),
  });
  const removeReward = useMutation({
    mutationFn: (rewardId: string) => api.del(`/guilds/${guildId}/leveling/rewards/${rewardId}`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["level-rewards", guildId] }),
  });
  const addExclusion = useMutation({
    mutationFn: () => api.post(`/guilds/${guildId}/leveling/exclusions`, { targetType: exclusionType, targetId: exclusionId }),
    onSuccess: () => {
      setExclusionOpen(false);
      setExclusionId("");
      void queryClient.invalidateQueries({ queryKey: ["level-exclusions", guildId] });
      push({ title: "Exclusion added", tone: "success" });
    },
    onError: (error) => push({ title: "Could not add exclusion", description: error.message, tone: "error" }),
  });
  const removeExclusion = useMutation({
    mutationFn: (id: string) => api.del(`/guilds/${guildId}/leveling/exclusions/${id}`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["level-exclusions", guildId] }),
  });

  return (
    <div>
      <PageHeader title="Leveling" description="XP rates, level curve, rewards and the real leaderboard." />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Members with XP" value={compactNumber(stats.data?.members ?? 0)} icon={<Users className="h-4 w-4" />} />
        <Stat label="Total XP" value={compactNumber(stats.data?.totalXp ?? 0)} icon={<TrendingUp className="h-4 w-4" />} />
        <Stat label="Highest level" value={stats.data?.highestLevel ?? 0} icon={<Crown className="h-4 w-4" />} />
        <Stat label="Role rewards" value={stats.data?.rewards ?? 0} hint={`${stats.data?.exclusions ?? 0} exclusions`} icon={<Trophy className="h-4 w-4" />} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <Card className="p-4">
          <h2 className="text-sm font-semibold text-zinc-200">Configuration</h2>
          {settings.data ? (
            <div className="mt-3">
              <ConfigForm
                key={`leveling-${settings.data.version}`}
                definitions={definitions}
                values={settings.data.values}
                channels={channels.data?.channels ?? []}
                roles={roles.data?.roles ?? []}
                saving={save.isPending}
                onSave={async (patch) => {
                  await save.mutateAsync(patch);
                }}
              />
            </div>
          ) : (
            <Skeleton className="mt-3 h-64" />
          )}
        </Card>

        <Card className="overflow-hidden">
          <div className="flex items-center justify-between gap-2 border-b border-ink-700 px-4 py-3">
            <h2 className="text-sm font-semibold text-zinc-200">Leaderboard</h2>
            <div className="w-36">
              <Select
                value={type}
                onChange={(event) => {
                  setType(event.target.value);
                  setPage(1);
                }}
                options={[
                  { value: "xp", label: "Total XP" },
                  { value: "messages", label: "Messages" },
                  { value: "voice", label: "Voice" },
                ]}
              />
            </div>
          </div>
          {leaderboard.isLoading ? <div className="p-4"><Skeleton className="h-48" /></div> : null}
          {leaderboard.data?.items.length === 0 ? (
            <EmptyState compact title="No XP recorded yet" description="Members earn XP once leveling is enabled." />
          ) : null}
          <div className="divide-y divide-ink-800">
            {(leaderboard.data?.items ?? []).map((entry, index) => (
              <div key={entry.userId} className="flex items-center gap-3 px-4 py-2.5">
                <span className="w-6 text-xs text-zinc-600">{(page - 1) * 10 + index + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-xs text-zinc-300">{entry.userId}</p>
                  <p className="text-2xs text-zinc-600">
                    Level {entry.level} · {entry.messages.toLocaleString()} messages · {entry.voiceMinutes} voice min
                  </p>
                </div>
                <Badge tone="accent">{entry.totalXp.toLocaleString()} XP</Badge>
              </div>
            ))}
          </div>
          {leaderboard.data ? (
            <Pagination page={leaderboard.data.page} pages={leaderboard.data.pages} onPage={setPage} total={leaderboard.data.total} />
          ) : null}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-ink-700 px-4 py-3">
            <h2 className="text-sm font-semibold text-zinc-200">Level rewards</h2>
            <Button variant="secondary" onClick={() => setRewardOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> Add reward
            </Button>
          </div>
          {(rewards.data?.rewards ?? []).length === 0 ? (
            <EmptyState compact title="No role rewards" description="Grant a role automatically when a level is reached." />
          ) : null}
          <div className="divide-y divide-ink-800">
            {(rewards.data?.rewards ?? []).map((reward) => (
              <div key={reward.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div>
                  <p className="text-xs text-zinc-300">Level {reward.level}</p>
                  <p className="font-mono text-2xs text-zinc-600">
                    {roles.data?.roles.find((role) => role.id === reward.roleId)?.name ?? reward.roleId}
                  </p>
                </div>
                <Button variant="ghost" onClick={() => removeReward.mutate(reward.id)} aria-label="Remove reward">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-ink-700 px-4 py-3">
            <h2 className="text-sm font-semibold text-zinc-200">XP exclusions</h2>
            <Button variant="secondary" onClick={() => setExclusionOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> Add
            </Button>
          </div>
          {(exclusions.data?.exclusions ?? []).length === 0 ? (
            <EmptyState compact title="No exclusions" description="XP is granted everywhere leveling is active." />
          ) : null}
          <div className="divide-y divide-ink-800">
            {(exclusions.data?.exclusions ?? []).map((exclusion) => (
              <div key={exclusion.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div>
                  <p className="text-xs capitalize text-zinc-300">{exclusion.targetType}</p>
                  <p className="font-mono text-2xs text-zinc-600">
                    {exclusion.targetType === "channel"
                      ? channels.data?.channels.find((channel) => channel.id === exclusion.targetId)?.name ?? exclusion.targetId
                      : exclusion.targetId}
                  </p>
                </div>
                <Button variant="ghost" onClick={() => removeExclusion.mutate(exclusion.id)} aria-label="Remove exclusion">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Modal
        open={rewardOpen}
        onClose={() => setRewardOpen(false)}
        title="Add level reward"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRewardOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => addReward.mutate()} loading={addReward.isPending} disabled={!rewardRole}>
              Add reward
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Level">
            <Input type="number" min={1} value={rewardLevel} onChange={(event) => setRewardLevel(Number(event.target.value))} />
          </Field>
          <Field label="Role">
            <Select
              value={rewardRole}
              onChange={(event) => setRewardRole(event.target.value)}
              placeholder="Select a role"
              options={(roles.data?.roles ?? []).map((role) => ({ value: role.id, label: role.name }))}
            />
          </Field>
        </div>
      </Modal>

      <Modal
        open={exclusionOpen}
        onClose={() => setExclusionOpen(false)}
        title="Add XP exclusion"
        footer={
          <>
            <Button variant="secondary" onClick={() => setExclusionOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => addExclusion.mutate()} loading={addExclusion.isPending} disabled={!exclusionId}>
              Add exclusion
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Type">
            <Select
              value={exclusionType}
              onChange={(event) => setExclusionType(event.target.value)}
              options={[
                { value: "channel", label: "Channel" },
                { value: "user", label: "User" },
              ]}
            />
          </Field>
          <Field label={exclusionType === "channel" ? "Channel" : "User ID"}>
            {exclusionType === "channel" ? (
              <Select
                value={exclusionId}
                onChange={(event) => setExclusionId(event.target.value)}
                placeholder="Select a channel"
                options={(channels.data?.channels ?? []).map((channel) => ({ value: channel.id, label: `# ${channel.name}` }))}
              />
            ) : (
              <Input value={exclusionId} onChange={(event) => setExclusionId(event.target.value)} placeholder="Discord user ID" />
            )}
          </Field>
        </div>
      </Modal>
    </div>
  );
}

/* ---------------------------------------------------------------- economy */

export function EconomyPage() {
  const { guildId } = useGuildData();
  const definitions = useDefinitions(["economy"]);
  const settings = useSettings(guildId);
  const save = useSaveConfig(guildId);
  const { push } = useToast();
  const queryClient = useQueryClient();
  const [itemModal, setItemModal] = useState<{ open: boolean; item?: EconomyItem }>({ open: false });
  const [form, setForm] = useState({ name: "", description: "", price: 100, category: "misc", stock: "", roleId: "" });

  const overview = useQuery({
    queryKey: ["economy", guildId],
    queryFn: () =>
      api.get<{
        accounts: number;
        wallet: number;
        bank: number;
        lifetime: number;
        richest: Array<{ userId: string; wallet: number; bank: number }>;
        transactions: EconomyTransaction[];
        items: EconomyItem[];
      }>(`/guilds/${guildId}/economy/overview`),
  });

  const saveItem = useMutation({
    mutationFn: async () => {
      const body = {
        name: form.name,
        description: form.description,
        price: Number(form.price),
        category: form.category,
        stock: form.stock === "" ? null : Number(form.stock),
        roleId: form.roleId || null,
      };
      if (itemModal.item) return api.patch(`/guilds/${guildId}/economy/items/${itemModal.item.id}`, body);
      return api.post(`/guilds/${guildId}/economy/items`, body);
    },
    onSuccess: () => {
      setItemModal({ open: false });
      setForm({ name: "", description: "", price: 100, category: "misc", stock: "", roleId: "" });
      void queryClient.invalidateQueries({ queryKey: ["economy", guildId] });
      push({ title: "Shop item saved", tone: "success" });
    },
    onError: (error) => push({ title: "Could not save item", description: error.message, tone: "error" }),
  });

  const deleteItem = useMutation({
    mutationFn: (id: string) => api.del(`/guilds/${guildId}/economy/items/${id}`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["economy", guildId] }),
  });

  return (
    <div>
      <PageHeader title="Economy" description="Currency, shop and the immutable transaction ledger." />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Accounts" value={compactNumber(overview.data?.accounts ?? 0)} icon={<Users className="h-4 w-4" />} />
        <Stat label="In wallets" value={compactNumber(overview.data?.wallet ?? 0)} icon={<Coins className="h-4 w-4" />} />
        <Stat label="In banks" value={compactNumber(overview.data?.bank ?? 0)} icon={<Coins className="h-4 w-4" />} />
        <Stat label="Lifetime earned" value={compactNumber(overview.data?.lifetime ?? 0)} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <Card className="p-4">
          <h2 className="text-sm font-semibold text-zinc-200">Configuration</h2>
          {settings.data ? (
            <div className="mt-3">
              <ConfigForm
                key={`economy-${settings.data.version}`}
                definitions={definitions}
                values={settings.data.values}
                saving={save.isPending}
                onSave={async (patch) => {
                  await save.mutateAsync(patch);
                }}
              />
            </div>
          ) : (
            <Skeleton className="mt-3 h-64" />
          )}
        </Card>
        <Card className="overflow-hidden">
          <div className="border-b border-ink-700 px-4 py-3">
            <h2 className="text-sm font-semibold text-zinc-200">Richest members</h2>
          </div>
          {(overview.data?.richest ?? []).length === 0 ? (
            <EmptyState compact title="No economy accounts yet" description="Balances appear after members use economy commands." />
          ) : null}
          <div className="divide-y divide-ink-800">
            {(overview.data?.richest ?? []).map((account, index) => (
              <div key={account.userId} className="flex items-center gap-3 px-4 py-2.5">
                <span className="w-5 text-xs text-zinc-600">{index + 1}</span>
                <p className="min-w-0 flex-1 truncate font-mono text-xs text-zinc-300">{account.userId}</p>
                <Badge tone="accent">{(account.wallet + account.bank).toLocaleString()}</Badge>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="mt-4 overflow-hidden">
        <div className="flex items-center justify-between border-b border-ink-700 px-4 py-3">
          <h2 className="text-sm font-semibold text-zinc-200">Shop items</h2>
          <Button
            variant="secondary"
            onClick={() => {
              setForm({ name: "", description: "", price: 100, category: "misc", stock: "", roleId: "" });
              setItemModal({ open: true });
            }}
          >
            <Plus className="h-3.5 w-3.5" /> New item
          </Button>
        </div>
        {(overview.data?.items ?? []).length === 0 ? (
          <EmptyState compact title="No shop items" description="Create items members can buy with their balance." />
        ) : null}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead className="border-b border-ink-700">
              <tr>
                <th className="table-head">Item</th>
                <th className="table-head">Category</th>
                <th className="table-head">Price</th>
                <th className="table-head">Stock</th>
                <th className="table-head">Status</th>
                <th className="table-head" />
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-800">
              {(overview.data?.items ?? []).map((item) => (
                <tr key={item.id}>
                  <td className="table-cell">
                    <p className="text-zinc-200">{item.name}</p>
                    <p className="text-2xs text-zinc-600">{item.description ?? "No description"}</p>
                  </td>
                  <td className="table-cell capitalize">{item.category}</td>
                  <td className="table-cell">{item.price.toLocaleString()}</td>
                  <td className="table-cell">{item.stock ?? "∞"}</td>
                  <td className="table-cell">
                    <Badge tone={item.enabled ? "success" : "neutral"}>{item.enabled ? "Enabled" : "Disabled"}</Badge>
                  </td>
                  <td className="table-cell text-right">
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setForm({
                          name: item.name,
                          description: item.description ?? "",
                          price: item.price,
                          category: item.category,
                          stock: item.stock === null ? "" : String(item.stock),
                          roleId: item.roleId ?? "",
                        });
                        setItemModal({ open: true, item });
                      }}
                    >
                      Edit
                    </Button>
                    <Button variant="ghost" onClick={() => deleteItem.mutate(item.id)} aria-label="Delete item">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="mt-4 overflow-hidden">
        <div className="border-b border-ink-700 px-4 py-3">
          <h2 className="text-sm font-semibold text-zinc-200">Recent transactions</h2>
        </div>
        {(overview.data?.transactions ?? []).length === 0 ? (
          <EmptyState compact title="No transactions yet" />
        ) : null}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px]">
            <thead className="border-b border-ink-700">
              <tr>
                <th className="table-head">Type</th>
                <th className="table-head">From</th>
                <th className="table-head">To</th>
                <th className="table-head">Amount</th>
                <th className="table-head">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-800">
              {(overview.data?.transactions ?? []).map((transaction) => (
                <tr key={transaction.id}>
                  <td className="table-cell capitalize">{transaction.type}</td>
                  <td className="table-cell font-mono text-2xs">{transaction.fromId ?? "—"}</td>
                  <td className="table-cell font-mono text-2xs">{transaction.toId ?? "—"}</td>
                  <td className="table-cell">{transaction.amount.toLocaleString()}</td>
                  <td className="table-cell text-2xs text-zinc-500">{relativeTime(transaction.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal
        open={itemModal.open}
        onClose={() => setItemModal({ open: false })}
        title={itemModal.item ? "Edit shop item" : "New shop item"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setItemModal({ open: false })}>Cancel</Button>
            <Button variant="primary" onClick={() => saveItem.mutate()} loading={saveItem.isPending} disabled={!form.name.trim()}>
              Save item
            </Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name" className="sm:col-span-2">
            <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </Field>
          <Field label="Description" className="sm:col-span-2">
            <Textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} rows={2} />
          </Field>
          <Field label="Price">
            <Input type="number" value={form.price} onChange={(event) => setForm({ ...form, price: Number(event.target.value) })} />
          </Field>
          <Field label="Category">
            <Input value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} />
          </Field>
          <Field label="Stock (empty = unlimited)">
            <Input type="number" value={form.stock} onChange={(event) => setForm({ ...form, stock: event.target.value })} />
          </Field>
          <Field label="Role reward">
            <Input value={form.roleId} onChange={(event) => setForm({ ...form, roleId: event.target.value })} placeholder="Discord role ID" />
          </Field>
        </div>
      </Modal>
    </div>
  );
}

/* -------------------------------------------------------------- giveaways */

export function GiveawaysPage() {
  const { guildId } = useGuildData();
  const channels = useChannels(guildId);
  const { push } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ prize: "", channelId: "", winners: 1, durationSeconds: 86_400 });
  const [confirm, setConfirm] = useState<{ giveaway: Giveaway; action: "end" | "cancel" } | null>(null);

  const query = useQuery({
    queryKey: ["giveaways", guildId],
    queryFn: () => api.get<{ giveaways: Giveaway[] }>(`/guilds/${guildId}/giveaways`),
  });

  const create = useMutation({
    mutationFn: () => api.post(`/guilds/${guildId}/giveaways`, form),
    onSuccess: () => {
      setOpen(false);
      setForm({ prize: "", channelId: "", winners: 1, durationSeconds: 86_400 });
      void queryClient.invalidateQueries({ queryKey: ["giveaways", guildId] });
      push({ title: "Giveaway created", tone: "success" });
    },
    onError: (error) => push({ title: "Could not create giveaway", description: error.message, tone: "error" }),
  });

  const act = useMutation({
    mutationFn: ({ giveaway, action }: { giveaway: Giveaway; action: "end" | "cancel" | "reroll" }) =>
      api.post(`/guilds/${guildId}/giveaways/${giveaway.id}/${action}`),
    onSuccess: () => {
      setConfirm(null);
      void queryClient.invalidateQueries({ queryKey: ["giveaways", guildId] });
      push({ title: "Giveaway updated", tone: "success" });
    },
    onError: (error) => push({ title: "Action failed", description: error.message, tone: "error" }),
  });

  return (
    <div>
      <PageHeader
        title="Giveaways"
        description="Create, end, cancel or reroll giveaways. Messages are posted by the bot."
        actions={
          <Button variant="primary" onClick={() => setOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> New giveaway
          </Button>
        }
      />
      {query.isError ? <ErrorState error={query.error} onRetry={() => void query.refetch()} /> : null}
      {query.isLoading ? <Skeleton className="h-64" /> : null}
      {(query.data?.giveaways ?? []).length === 0 && !query.isLoading ? (
        <Card>
          <EmptyState
            icon={<Gift className="h-6 w-6" />}
            title="No giveaways"
            description="Create the first giveaway; entries are recorded through the bot message."
          />
        </Card>
      ) : null}
      <div className="grid gap-3 lg:grid-cols-2">
        {(query.data?.giveaways ?? []).map((giveaway) => (
          <Card key={giveaway.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-zinc-100">{giveaway.prize}</p>
                <p className="mt-0.5 text-2xs text-zinc-500">
                  {giveaway.winners} winner{giveaway.winners === 1 ? "" : "s"} · {giveaway.entries.length} entries
                </p>
              </div>
              <Badge tone={giveaway.status === "active" ? "success" : giveaway.status === "cancelled" ? "danger" : "neutral"}>
                {giveaway.status}
              </Badge>
            </div>
            <p className="mt-2 text-2xs text-zinc-500">
              {giveaway.status === "active"
                ? `Ends ${relativeTime(giveaway.endsAt)}`
                : `Ended ${formatDate(giveaway.endedAt ?? giveaway.endsAt)}`}
            </p>
            {giveaway.entries.some((entry) => entry.won) ? (
              <p className="mt-1 truncate text-2xs text-emerald-400">
                Winners: {giveaway.entries.filter((entry) => entry.won).map((entry) => entry.userId).join(", ")}
              </p>
            ) : null}
            <div className="mt-3 flex gap-1.5 border-t border-ink-700 pt-3">
              {giveaway.status === "active" ? (
                <>
                  <Button variant="secondary" onClick={() => setConfirm({ giveaway, action: "end" })}>
                    End now
                  </Button>
                  <Button variant="ghost" onClick={() => setConfirm({ giveaway, action: "cancel" })}>
                    Cancel
                  </Button>
                </>
              ) : (
                <Button variant="secondary" onClick={() => act.mutate({ giveaway, action: "reroll" })}>
                  Reroll winners
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New giveaway"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => create.mutate()}
              loading={create.isPending}
              disabled={!form.prize.trim() || !form.channelId}
            >
              Create giveaway
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Prize">
            <Input value={form.prize} onChange={(event) => setForm({ ...form, prize: event.target.value })} />
          </Field>
          <Field label="Channel">
            <Select
              value={form.channelId}
              onChange={(event) => setForm({ ...form, channelId: event.target.value })}
              placeholder="Select a channel"
              options={(channels.data?.channels ?? [])
                .filter((channel) => channel.type === 0)
                .map((channel) => ({ value: channel.id, label: `# ${channel.name}` }))}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Winners">
              <Input type="number" min={1} value={form.winners} onChange={(event) => setForm({ ...form, winners: Number(event.target.value) })} />
            </Field>
            <Field label="Duration (seconds)">
              <Input
                type="number"
                min={10}
                value={form.durationSeconds}
                onChange={(event) => setForm({ ...form, durationSeconds: Number(event.target.value) })}
              />
            </Field>
          </div>
          <InfoNote>A message with an Enter button is posted by the bot. Ending early picks winners from real entries.</InfoNote>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm && act.mutate({ giveaway: confirm.giveaway, action: confirm.action })}
        loading={act.isPending}
        destructive={confirm?.action === "cancel"}
        title={confirm?.action === "cancel" ? "Cancel this giveaway?" : "End this giveaway now?"}
        description={
          confirm?.action === "cancel"
            ? "The giveaway message is edited to show it was cancelled. This cannot be undone."
            : "Winners are drawn from current entries and the message is edited."
        }
        confirmLabel={confirm?.action === "cancel" ? "Cancel giveaway" : "End giveaway"}
      />
    </div>
  );
}

/* ------------------------------------------------------------ suggestions */

export function SuggestionsPage() {
  const { guildId } = useGuildData();
  const definitions = useDefinitions(["suggestions"]);
  const settings = useSettings(guildId);
  const save = useSaveConfig(guildId);
  const channels = useChannels(guildId);
  const roles = useRoles(guildId);
  const { push } = useToast();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState("");
  const [review, setReview] = useState<{ suggestion: Suggestion; decision: "approved" | "denied" } | null>(null);
  const [note, setNote] = useState("");

  const query = useQuery({
    queryKey: ["suggestions", guildId, status],
    queryFn: () => api.get<{ suggestions: Suggestion[] }>(`/guilds/${guildId}/suggestions${status ? `?status=${status}` : ""}`),
  });

  const reviewMutation = useMutation({
    mutationFn: () =>
      api.post(`/guilds/${guildId}/suggestions/${review?.suggestion.id}/review`, {
        decision: review?.decision,
        note,
      }),
    onSuccess: () => {
      setReview(null);
      setNote("");
      void queryClient.invalidateQueries({ queryKey: ["suggestions", guildId] });
      push({ title: "Suggestion reviewed", tone: "success" });
    },
    onError: (error) => push({ title: "Review failed", description: error.message, tone: "error" }),
  });

  return (
    <div>
      <PageHeader title="Suggestions" description="Community feedback with real votes and staff review status." />
      <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {[
              ["", "All"],
              ["pending", "Pending"],
              ["approved", "Approved"],
              ["denied", "Denied"],
            ].map(([value, label]) => (
              <button
                key={label}
                type="button"
                onClick={() => setStatus(value)}
                className={cn(
                  "rounded-md border px-2.5 py-1 text-xs",
                  status === value
                    ? "border-accent/40 bg-accent/10 text-accent-soft"
                    : "border-ink-600 bg-ink-750 text-zinc-400 hover:text-zinc-200",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {query.isError ? <ErrorState error={query.error} onRetry={() => void query.refetch()} /> : null}
          {query.isLoading ? <Skeleton className="h-48" /> : null}
          {(query.data?.suggestions ?? []).length === 0 && !query.isLoading ? (
            <Card>
              <EmptyState icon={<Lightbulb className="h-6 w-6" />} title="No suggestions" description="Members submit suggestions through the bot." />
            </Card>
          ) : null}
          {(query.data?.suggestions ?? []).map((suggestion) => (
            <Card key={suggestion.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm text-zinc-200">{suggestion.content}</p>
                <Badge
                  tone={
                    suggestion.status === "approved" ? "success" : suggestion.status === "denied" ? "danger" : "warning"
                  }
                >
                  {suggestion.status}
                </Badge>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-2xs text-zinc-500">
                <span className="inline-flex items-center gap-1">
                  <ThumbsUp className="h-3 w-3" /> {suggestion.upvotes}
                </span>
                <span className="inline-flex items-center gap-1">
                  <ThumbsDown className="h-3 w-3" /> {suggestion.downvotes}
                </span>
                <span>{suggestion.anonymous ? "Anonymous" : suggestion.reviewerId ? `Reviewed by ${suggestion.reviewerId}` : "Community"}</span>
                <span>{formatDate(suggestion.createdAt)}</span>
                {suggestion.status === "pending" ? (
                  <span className="ml-auto flex gap-1.5">
                    <Button variant="secondary" onClick={() => setReview({ suggestion, decision: "approved" })}>
                      Approve
                    </Button>
                    <Button variant="ghost" onClick={() => setReview({ suggestion, decision: "denied" })}>
                      Deny
                    </Button>
                  </span>
                ) : null}
              </div>
            </Card>
          ))}
        </div>
        <Card className="p-4">
          <h2 className="text-sm font-semibold text-zinc-200">Configuration</h2>
          {settings.data ? (
            <div className="mt-3">
              <ConfigForm
                key={`suggestions-${settings.data.version}`}
                definitions={definitions}
                values={settings.data.values}
                channels={channels.data?.channels ?? []}
                roles={roles.data?.roles ?? []}
                saving={save.isPending}
                onSave={async (patch) => {
                  await save.mutateAsync(patch);
                }}
              />
            </div>
          ) : (
            <Skeleton className="mt-3 h-48" />
          )}
        </Card>
      </div>

      <Modal
        open={Boolean(review)}
        onClose={() => setReview(null)}
        title={review?.decision === "approved" ? "Approve suggestion" : "Deny suggestion"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setReview(null)}>Cancel</Button>
            <Button variant="primary" onClick={() => reviewMutation.mutate()} loading={reviewMutation.isPending}>
              {review?.decision === "approved" ? "Approve" : "Deny"}
            </Button>
          </>
        }
      >
        <Field label="Staff note (optional)">
          <Textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} />
        </Field>
      </Modal>
    </div>
  );
}
