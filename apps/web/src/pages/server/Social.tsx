import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AtSign, Camera, Music2, Plus, Radio, Trash2, Tv, Youtube, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "../../components/cards";
import { ChannelName, ChannelPicker } from "../../components/ui/pickers";
import { Badge, Button, Callout, Card, CardHeader, Field, NativeSelect, TextInput, Toggle, Unsupported } from "../../components/ui/primitives";
import { ConfirmDialog } from "../../components/ui/overlays";
import { EmptyState, ErrorState, PageSkeleton } from "../../components/ui/states";
import { DataTable } from "../../components/ui/table";
import { useToast } from "../../components/ui/toast";
import { errorMessage } from "../../lib/api/client";
import { communityApi, useIntegrations } from "../../lib/api/community";
import { invalidateConfig } from "../../lib/api/guilds";
import { keys } from "../../lib/api/keys";
import type { SocialFeed } from "../../lib/api/types";
import { timeAgo } from "../../lib/utils";
import { useGuild } from "../../hooks/useGuild";

export const PROVIDERS: Array<{ id: string; name: string; icon: LucideIcon; placeholder: string }> = [
  { id: "youtube", name: "YouTube", icon: Youtube, placeholder: "Channel ID, e.g. UC_x5XG1OV2P6uZZ5FSM9Ttw" },
  { id: "twitch", name: "Twitch", icon: Tv, placeholder: "Twitch username" },
  { id: "twitter", name: "Twitter / X", icon: AtSign, placeholder: "@handle" },
  { id: "instagram", name: "Instagram", icon: Camera, placeholder: "Instagram username" },
  { id: "tiktok", name: "TikTok", icon: Music2, placeholder: "@username" },
  { id: "reddit", name: "Reddit", icon: Radio, placeholder: "Subreddit, e.g. gaming" },
];

export function SocialPage() {
  const { guildId, canConfigure } = useGuild();
  const integrations = useIntegrations(guildId);
  const queryClient = useQueryClient();
  const toast = useToast();
  const [provider, setProvider] = useState("youtube");
  const [source, setSource] = useState("");
  const [channelId, setChannelId] = useState<string | null>(null);
  const [remove, setRemove] = useState<SocialFeed | null>(null);
  const refresh = () => void queryClient.invalidateQueries({ queryKey: keys.integrations(guildId) });

  const toggleProvider = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => communityApi.toggleProvider(guildId, id, enabled),
    onSuccess: (data) => {
      toast.success(`${PROVIDERS.find((entry) => entry.id === data.provider)?.name} ${data.enabled ? "enabled" : "disabled"}`);
      invalidateConfig(queryClient, guildId);
    },
    onError: (error) => toast.error("Couldn't change the provider", errorMessage(error)),
  });
  const add = useMutation({
    mutationFn: () => communityApi.addFeed(guildId, { provider, sourceId: source.trim(), channelId: channelId! }),
    onSuccess: () => {
      toast.success("Feed saved");
      setSource("");
      refresh();
    },
    onError: (error) => toast.error("Couldn't add the feed", errorMessage(error)),
  });
  const pause = useMutation({
    mutationFn: (feed: SocialFeed) => communityApi.updateFeed(guildId, feed.id, { enabled: !feed.enabled }),
    onSuccess: (data) => {
      toast.success(data.feed.enabled ? "Feed resumed" : "Feed paused");
      refresh();
    },
    onError: (error) => toast.error("Couldn't update the feed", errorMessage(error)),
  });
  const del = useMutation({
    mutationFn: (id: string) => communityApi.removeFeed(guildId, id),
    onSuccess: () => {
      toast.success("Feed removed");
      setRemove(null);
      refresh();
    },
    onError: (error) => toast.error("Couldn't remove the feed", errorMessage(error)),
  });

  if (integrations.isLoading) return <PageSkeleton />;
  if (integrations.error || !integrations.data) return <ErrorState error={integrations.error} onRetry={() => void integrations.refetch()} />;
  const providerState = new Map(integrations.data.providers.map((entry) => [entry.id, entry.enabled]));
  const feeds = integrations.data.socialFeeds;
  const meta = PROVIDERS.find((entry) => entry.id === provider)!;

  return (
    <div>
      <PageHeader title="Social feeds" icon={Radio} description="Post new uploads, streams and posts from social platforms into Discord channels." />
      <Callout tone="warning" className="mb-4" title="Feed delivery isn't running yet">
        Feeds and provider switches are saved by the API, but the INFERA worker doesn't poll social platforms yet, so no posts are delivered. Feeds will start posting once the backend delivery engine ships — nothing here claims a provider is connected.
      </Callout>
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {PROVIDERS.map((entry) => {
          const enabled = providerState.get(entry.id) ?? false;
          const count = feeds.filter((feed) => feed.provider === entry.id).length;
          return (
            <Card key={entry.id} className="flex items-center gap-3 p-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-ink-600 bg-ink-800 text-zinc-300">
                <entry.icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-13 font-medium text-zinc-100">{entry.name}</p>
                <p className="text-2xs text-zinc-500">
                  {count} feed{count === 1 ? "" : "s"} · {enabled ? "enabled" : "disabled"}
                </p>
              </div>
              <Toggle label={`Enable ${entry.name}`} checked={enabled} disabled={!canConfigure} loading={toggleProvider.isPending && toggleProvider.variables?.id === entry.id} onChange={(value) => toggleProvider.mutate({ id: entry.id, enabled: value })} />
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader title="Feeds" description="Each feed watches one account and posts to one channel." icon={<Radio className="h-4 w-4" />} action={<Badge>{feeds.length}</Badge>} />
        {canConfigure ? (
          <div className="grid gap-3 border-b border-ink-700 p-5 md:grid-cols-[160px_1fr_1fr_auto] md:items-end">
            <Field label="Provider">
              <NativeSelect value={provider} onChange={(event) => setProvider(event.target.value)}>
                {PROVIDERS.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Account">
              <TextInput value={source} maxLength={200} onChange={(event) => setSource(event.target.value)} placeholder={meta.placeholder} />
            </Field>
            <Field label="Post to">
              <ChannelPicker value={channelId} onChange={setChannelId} />
            </Field>
            <Button variant="primary" icon={<Plus className="h-3.5 w-3.5" />} disabled={!source.trim() || !channelId} loading={add.isPending} onClick={() => add.mutate()}>
              Add feed
            </Button>
          </div>
        ) : null}
        <DataTable<SocialFeed>
          rows={feeds}
          rowKey={(row) => row.id}
          empty={<EmptyState compact icon={Radio} title="No feeds yet" description="Add an account above to save a feed." />}
          columns={[
            { id: "provider", header: "Provider", cell: (row) => <Badge>{PROVIDERS.find((entry) => entry.id === row.provider)?.name ?? row.provider}</Badge> },
            { id: "source", header: "Account", cell: (row) => <span className="font-mono text-xs text-zinc-200">{row.sourceId}</span> },
            { id: "channel", header: "Channel", cell: (row) => <ChannelName id={row.channelId} /> },
            { id: "status", header: "Status", cell: (row) => <Badge tone={row.enabled ? "warning" : "neutral"} dot>{row.enabled ? "Saved · awaiting delivery engine" : "Paused"}</Badge> },
            { id: "checked", header: "Last checked", cell: (row) => <span className="text-zinc-500">{row.lastCheckedAt ? timeAgo(row.lastCheckedAt) : "Never"}</span> },
            {
              id: "actions",
              header: "",
              className: "w-36",
              cell: (row) =>
                canConfigure ? (
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="ghost" loading={pause.isPending && pause.variables?.id === row.id} onClick={() => pause.mutate(row)}>
                      {row.enabled ? "Pause" : "Resume"}
                    </Button>
                    <button type="button" aria-label="Remove feed" onClick={() => setRemove(row)} className="btn-icon h-7 w-7 hover:text-red-400">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : null,
            },
          ]}
        />
      </Card>
      <div className="mt-4">
        <Unsupported title="Notification templates, test posts and delivery history">
          The social feed API stores provider, account and channel only. Custom templates, a test endpoint and delivery logs require the backend delivery engine.
        </Unsupported>
      </div>
      <ConfirmDialog open={Boolean(remove)} onClose={() => setRemove(null)} onConfirm={() => remove && del.mutate(remove.id)} loading={del.isPending} title="Remove this feed?" description={remove ? `${remove.sourceId} will no longer be tracked.` : undefined} confirmLabel="Remove feed" />
    </div>
  );
}
