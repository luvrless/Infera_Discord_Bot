import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  Copy,
  ExternalLink,
  Plus,
  Radio,
  Send,
  Ticket as TicketIcon,
  Trash2,
  Users,
  Webhook,
} from "lucide-react";
import { useState } from "react";
import { ConfigForm } from "../components/ConfigForm";
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
  Select,
  Skeleton,
  Stat,
  Tabs,
  Textarea,
  Toggle,
} from "../components/ui";
import { api } from "../lib/api";
import { qk, useChannels, useRoles, useSaveConfig, useSchema, useSettings } from "../lib/hooks";
import type { Role, RolePanel, SocialFeed, Ticket, TicketPanel, WebhookInfo } from "../lib/types";
import { formatDate, relativeTime } from "../lib/utils";

/* ------------------------------------------------------------------ roles */

export function RolesPage() {
  const { guildId } = useGuildData();
  const roles = useRoles(guildId);
  const channels = useChannels(guildId);
  const { push } = useToast();
  const queryClient = useQueryClient();
  const [autoroles, setAutoroles] = useState<string[] | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelForm, setPanelForm] = useState({ title: "", description: "", mode: "button", channelId: "", roles: [] as string[] });
  const [deletePanel, setDeletePanel] = useState<RolePanel | null>(null);

  const autorolesQuery = useQuery({
    queryKey: ["autoroles", guildId],
    queryFn: () => api.get<{ roleIds: string[] }>(`/guilds/${guildId}/roles/autoroles`),
  });
  const panels = useQuery({
    queryKey: ["role-panels", guildId],
    queryFn: () => api.get<{ panels: RolePanel[] }>(`/guilds/${guildId}/roles/panels`),
  });

  const selected = autoroles ?? autorolesQuery.data?.roleIds ?? [];

  const saveAutoroles = useMutation({
    mutationFn: () => api.put(`/guilds/${guildId}/roles/autoroles`, { roleIds: selected }),
    onSuccess: () => {
      setAutoroles(null);
      void queryClient.invalidateQueries({ queryKey: ["autoroles", guildId] });
      push({ title: "Autoroles updated", tone: "success" });
    },
    onError: (error) => push({ title: "Could not save autoroles", description: error.message, tone: "error" }),
  });

  const createPanel = useMutation({
    mutationFn: () =>
      api.post(`/guilds/${guildId}/roles/panels`, {
        title: panelForm.title,
        description: panelForm.description,
        mode: panelForm.mode,
        channelId: panelForm.channelId || undefined,
        options: panelForm.roles.map((roleId) => ({
          roleId,
          label: roles.data?.roles.find((role) => role.id === roleId)?.name ?? "Role",
        })),
      }),
    onSuccess: () => {
      setPanelOpen(false);
      setPanelForm({ title: "", description: "", mode: "button", channelId: "", roles: [] });
      void queryClient.invalidateQueries({ queryKey: ["role-panels", guildId] });
      push({ title: "Role panel created", tone: "success" });
    },
    onError: (error) => push({ title: "Could not create panel", description: error.message, tone: "error" }),
  });

  const publishPanel = useMutation({
    mutationFn: (id: string) => api.post<{ messageId: string }>(`/guilds/${guildId}/roles/panels/${id}/publish`, {}),
    onSuccess: () => push({ title: "Panel published", description: "Members can now use it in the selected channel.", tone: "success" }),
    onError: (error) => push({ title: "Could not publish panel", description: error.message, tone: "error" }),
  });

  const removePanel = useMutation({
    mutationFn: (id: string) => api.del(`/guilds/${guildId}/roles/panels/${id}`),
    onSuccess: () => {
      setDeletePanel(null);
      void queryClient.invalidateQueries({ queryKey: ["role-panels", guildId] });
      push({ title: "Panel deleted", tone: "success" });
    },
  });

  const roleName = (id: string) => roles.data?.roles.find((role: Role) => role.id === id)?.name ?? id;

  return (
    <div>
      <PageHeader title="Roles" description="Autoroles and self-assignable role panels." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h2 className="text-sm font-semibold text-zinc-200">Autoroles</h2>
          <p className="mt-0.5 text-xs text-zinc-500">Granted to every member the moment they join.</p>
          <div className="mt-3">
            {roles.data ? (
              <MultiSelect values={selected} onChange={setAutoroles}>
                {roles.data.roles.slice(0, 40).map((role) => (
                  <MultiOption key={role.id} value={role.id} label={role.name} />
                ))}
              </MultiSelect>
            ) : (
              <Skeleton className="h-20" />
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {selected.map((roleId) => (
              <span key={roleId} className="chip">
                {roleName(roleId)}
              </span>
            ))}
            {selected.length === 0 ? <p className="text-xs text-zinc-500">No autoroles configured.</p> : null}
          </div>
          <Button variant="primary" className="mt-4" onClick={() => saveAutoroles.mutate()} loading={saveAutoroles.isPending} disabled={!autoroles}>
            <Check className="h-3.5 w-3.5" /> Save autoroles
          </Button>
        </Card>

        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-ink-700 px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-zinc-200">Role panels</h2>
              <p className="text-xs text-zinc-500">Self-assignable roles with buttons or a select menu.</p>
            </div>
            <Button variant="secondary" onClick={() => setPanelOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> New panel
            </Button>
          </div>
          {(panels.data?.panels ?? []).length === 0 ? (
            <EmptyState compact icon={<Users className="h-6 w-6" />} title="No role panels" description="Create one to let members pick their own roles." />
          ) : null}
          <div className="divide-y divide-ink-800">
            {(panels.data?.panels ?? []).map((panel) => (
              <div key={panel.id} className="flex items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-zinc-200">{panel.title}</p>
                  <p className="text-2xs text-zinc-500">
                    {panel.mode} · {panel.options.length} roles · created {relativeTime(panel.createdAt ?? "")}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="secondary"
                    onClick={() => publishPanel.mutate(panel.id)}
                    loading={publishPanel.isPending && publishPanel.variables === panel.id}
                    aria-label="Publish panel"
                  >
                    <Send className="h-3.5 w-3.5" /> Publish
                  </Button>
                  <Button variant="ghost" onClick={() => setDeletePanel(panel)} aria-label="Delete panel">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Modal
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        title="New role panel"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPanelOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => createPanel.mutate()}
              loading={createPanel.isPending}
              disabled={!panelForm.title.trim() || panelForm.roles.length === 0}
            >
              Create panel
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Title">
            <Input value={panelForm.title} onChange={(event) => setPanelForm({ ...panelForm, title: event.target.value })} />
          </Field>
          <Field label="Description">
            <Textarea value={panelForm.description} onChange={(event) => setPanelForm({ ...panelForm, description: event.target.value })} rows={2} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Style">
              <Select
                value={panelForm.mode}
                onChange={(event) => setPanelForm({ ...panelForm, mode: event.target.value })}
                options={[
                  { value: "button", label: "Buttons" },
                  { value: "select", label: "Select menu" },
                ]}
              />
            </Field>
            <Field label="Channel">
              <Select
                value={panelForm.channelId}
                onChange={(event) => setPanelForm({ ...panelForm, channelId: event.target.value })}
                placeholder="No channel"
                options={(channels.data?.channels ?? []).filter((channel) => channel.type === 0).map((channel) => ({ value: channel.id, label: `# ${channel.name}` }))}
              />
            </Field>
          </div>
          <Field label="Roles">
            <MultiSelect values={panelForm.roles} onChange={(next) => setPanelForm({ ...panelForm, roles: next })}>
              {(roles.data?.roles ?? []).slice(0, 30).map((role) => (
                <MultiOption key={role.id} value={role.id} label={role.name} />
              ))}
            </MultiSelect>
          </Field>
          <InfoNote>Panels are stored for the bot's role module. Publishing a panel message requires the bot to be online with Manage Roles.</InfoNote>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(deletePanel)}
        onClose={() => setDeletePanel(null)}
        onConfirm={() => deletePanel && removePanel.mutate(deletePanel.id)}
        loading={removePanel.isPending}
        destructive
        title="Delete role panel?"
        description="Members will no longer be able to use this panel. Existing roles are not removed."
        confirmLabel="Delete panel"
      />
    </div>
  );
}

/* ---------------------------------------------------------------- tickets */

export function TicketsPage() {
  const { guildId } = useGuildData();
  const schema = useSchema();
  const settings = useSettings(guildId);
  const channels = useChannels(guildId);
  const roles = useRoles(guildId);
  const save = useSaveConfig(guildId);
  const { push } = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("inbox");
  const [status, setStatus] = useState("");
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelForm, setPanelForm] = useState({ title: "", description: "", channelId: "", categoryId: "" });
  const [closing, setClosing] = useState<Ticket | null>(null);

  const tickets = useQuery({
    queryKey: ["tickets", guildId, status],
    queryFn: () =>
      api.get<{ tickets: Ticket[]; stats: { open: number; closed: number; total: number }; panels: TicketPanel[] }>(
        `/guilds/${guildId}/tickets${status ? `?status=${status}` : ""}`,
      ),
  });

  const act = useMutation({
    mutationFn: ({ ticket, action }: { ticket: Ticket; action: "claim" | "close" | "reopen" }) =>
      api.post(`/guilds/${guildId}/tickets/${ticket.id}/${action}`),
    onSuccess: () => {
      setClosing(null);
      void queryClient.invalidateQueries({ queryKey: ["tickets", guildId] });
      push({ title: "Ticket updated", tone: "success" });
    },
    onError: (error) => push({ title: "Ticket action failed", description: error.message, tone: "error" }),
  });

  const createPanel = useMutation({
    mutationFn: () => api.post(`/guilds/${guildId}/tickets/panels`, panelForm),
    onSuccess: () => {
      setPanelOpen(false);
      setPanelForm({ title: "", description: "", channelId: "", categoryId: "" });
      void queryClient.invalidateQueries({ queryKey: ["tickets", guildId] });
      push({ title: "Ticket panel created", tone: "success" });
    },
    onError: (error) => push({ title: "Could not create panel", description: error.message, tone: "error" }),
  });

  const deletePanel = useMutation({
    mutationFn: (id: string) => api.del(`/guilds/${guildId}/tickets/panels/${id}`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["tickets", guildId] }),
  });

  const definitions = (schema.data?.schema.keys ?? []).filter((definition) => definition.key.startsWith("tickets."));

  return (
    <div>
      <PageHeader title="Tickets" description="Ticket inbox, panels and the ticket configuration." />
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Open" value={tickets.data?.stats.open ?? 0} icon={<TicketIcon className="h-4 w-4" />} />
        <Stat label="Closed" value={tickets.data?.stats.closed ?? 0} />
        <Stat label="Total" value={tickets.data?.stats.total ?? 0} />
      </div>

      <Card className="mt-4 overflow-hidden">
        <div className="px-3 pt-2">
          <Tabs
            items={[
              { id: "inbox", label: "Inbox", count: tickets.data?.tickets.length },
              { id: "panels", label: "Panels", count: tickets.data?.panels.length },
              { id: "config", label: "Configuration" },
            ]}
            active={tab}
            onChange={setTab}
          />
        </div>

        {tab === "inbox" ? (
          <div>
            <div className="flex items-center justify-between gap-2 px-4 py-3">
              <div className="w-40">
                <Select
                  value={status}
                  onChange={(event) => setStatus(event.target.value)}
                  placeholder="All tickets"
                  options={[
                    { value: "open", label: "Open" },
                    { value: "closed", label: "Closed" },
                  ]}
                />
              </div>
              <Button variant="ghost" onClick={() => void tickets.refetch()} loading={tickets.isFetching}>
                Refresh
              </Button>
            </div>
            {tickets.isError ? <ErrorState error={tickets.error} onRetry={() => void tickets.refetch()} /> : null}
            {(tickets.data?.tickets ?? []).length === 0 ? (
              <EmptyState icon={<TicketIcon className="h-6 w-6" />} title="No tickets" description="Members open tickets through the bot when the ticket module is enabled." />
            ) : null}
            <div className="divide-y divide-ink-800">
              {(tickets.data?.tickets ?? []).map((ticket) => (
                <div key={ticket.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-zinc-200">
                      #{ticket.number} · {ticket.subject ?? "No subject"}
                    </p>
                    <p className="mt-0.5 font-mono text-2xs text-zinc-600">
                      {ticket.userId} · {ticket.priority} · opened {relativeTime(ticket.createdAt)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge tone={ticket.status === "open" ? "success" : "neutral"}>{ticket.status}</Badge>
                    {ticket.claimedBy ? <Badge tone="info">Claimed</Badge> : null}
                    {ticket.status === "open" ? (
                      <>
                        {!ticket.claimedBy ? (
                          <Button variant="secondary" onClick={() => act.mutate({ ticket, action: "claim" })}>
                            Claim
                          </Button>
                        ) : null}
                        <Button variant="ghost" onClick={() => setClosing(ticket)}>
                          Close
                        </Button>
                      </>
                    ) : (
                      <Button variant="secondary" onClick={() => act.mutate({ ticket, action: "reopen" })}>
                        Reopen
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {tab === "panels" ? (
          <div>
            <div className="flex justify-end px-4 py-3">
              <Button variant="secondary" onClick={() => setPanelOpen(true)}>
                <Plus className="h-3.5 w-3.5" /> New panel
              </Button>
            </div>
            {(tickets.data?.panels ?? []).length === 0 ? (
              <EmptyState compact title="No ticket panels" description="Panels define where members open tickets." />
            ) : null}
            <div className="divide-y divide-ink-800">
              {(tickets.data?.panels ?? []).map((panel) => (
                <div key={panel.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <p className="text-xs font-medium text-zinc-200">{panel.title}</p>
                    <p className="text-2xs text-zinc-500">{panel.description ?? "No description"}</p>
                  </div>
                  <Button variant="ghost" onClick={() => deletePanel.mutate(panel.id)} aria-label="Delete panel">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {tab === "config" ? (
          <div className="p-4">
            {settings.data ? (
              <ConfigForm
                key={`tickets-${settings.data.version}`}
                definitions={definitions}
                values={settings.data.values}
                channels={channels.data?.channels ?? []}
                roles={roles.data?.roles ?? []}
                saving={save.isPending}
                onSave={async (patch) => {
                  await save.mutateAsync(patch);
                  void queryClient.invalidateQueries({ queryKey: ["tickets", guildId] });
                }}
              />
            ) : (
              <Skeleton className="h-64" />
            )}
          </div>
        ) : null}
      </Card>

      <Modal
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        title="New ticket panel"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPanelOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => createPanel.mutate()} loading={createPanel.isPending} disabled={!panelForm.title.trim()}>
              Create panel
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Title">
            <Input value={panelForm.title} onChange={(event) => setPanelForm({ ...panelForm, title: event.target.value })} />
          </Field>
          <Field label="Description">
            <Textarea value={panelForm.description} onChange={(event) => setPanelForm({ ...panelForm, description: event.target.value })} rows={2} />
          </Field>
          <Field label="Panel channel">
            <Select
              value={panelForm.channelId}
              onChange={(event) => setPanelForm({ ...panelForm, channelId: event.target.value })}
              placeholder="No channel"
              options={(channels.data?.channels ?? []).filter((channel) => channel.type === 0).map((channel) => ({ value: channel.id, label: `# ${channel.name}` }))}
            />
          </Field>
          <Field label="Ticket category" hint="Container category for ticket channels.">
            <Select
              value={panelForm.categoryId}
              onChange={(event) => setPanelForm({ ...panelForm, categoryId: event.target.value })}
              placeholder="No category"
              options={(channels.data?.channels ?? []).filter((channel) => channel.type === 4).map((channel) => ({ value: channel.id, label: channel.name }))}
            />
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(closing)}
        onClose={() => setClosing(null)}
        onConfirm={() => closing && act.mutate({ ticket: closing, action: "close" })}
        loading={act.isPending}
        destructive
        title="Close this ticket?"
        description="A transcript is saved, the channel is removed and the member is notified when configured."
        confirmLabel="Close ticket"
      />
    </div>
  );
}

/* ---------------------------------------------------------------- social */

const PROVIDER_LABELS: Record<string, string> = {
  youtube: "YouTube",
  twitch: "Twitch",
  twitter: "Twitter / X",
  instagram: "Instagram",
  tiktok: "TikTok",
  reddit: "Reddit",
  roblox: "Roblox",
};

export function SocialPage() {
  const { guildId } = useGuildData();
  const channels = useChannels(guildId);
  const { push } = useToast();
  const queryClient = useQueryClient();
  const [feedForm, setFeedForm] = useState({ provider: "youtube", sourceId: "", channelId: "" });
  const [webhookOpen, setWebhookOpen] = useState(false);
  const [webhookForm, setWebhookForm] = useState({ url: "", events: "config.updated" });
  const [secret, setSecret] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["integrations", guildId],
    queryFn: () =>
      api.get<{
        providers: Array<{ id: string; enabled: boolean; configKey: string | null }>;
        socialFeeds: SocialFeed[];
        webhooks: WebhookInfo[];
      }>(`/guilds/${guildId}/integrations`),
  });

  const toggleProvider = useMutation({
    mutationFn: ({ provider, enabled }: { provider: string; enabled: boolean }) =>
      api.patch(`/guilds/${guildId}/integrations/${provider}`, { enabled }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["integrations", guildId] });
      void queryClient.invalidateQueries({ queryKey: qk.settings(guildId) });
    },
    onError: (error) => push({ title: "Could not update provider", description: error.message, tone: "error" }),
  });

  const addFeed = useMutation({
    mutationFn: () => api.post(`/guilds/${guildId}/social-feeds`, feedForm),
    onSuccess: () => {
      setFeedForm({ ...feedForm, sourceId: "" });
      void queryClient.invalidateQueries({ queryKey: ["integrations", guildId] });
      push({ title: "Feed added", tone: "success" });
    },
    onError: (error) => push({ title: "Could not add feed", description: error.message, tone: "error" }),
  });

  const removeFeed = useMutation({
    mutationFn: (id: string) => api.del(`/guilds/${guildId}/social-feeds/${id}`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["integrations", guildId] }),
  });

  const addWebhook = useMutation({
    mutationFn: () =>
      api.post<{ webhook: WebhookInfo; secret: string }>(`/guilds/${guildId}/webhooks`, {
        url: webhookForm.url,
        events: webhookForm.events.split(",").map((entry) => entry.trim()).filter(Boolean),
      }),
    onSuccess: (result) => {
      setWebhookOpen(false);
      setSecret(result.secret);
      setWebhookForm({ url: "", events: "config.updated" });
      void queryClient.invalidateQueries({ queryKey: ["integrations", guildId] });
    },
    onError: (error) => push({ title: "Could not create webhook", description: error.message, tone: "error" }),
  });

  const removeWebhook = useMutation({
    mutationFn: (id: string) => api.del(`/guilds/${guildId}/webhooks/${id}`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["integrations", guildId] }),
  });

  return (
    <div>
      <PageHeader title="Social feeds" description="Announce new posts from connected platforms into Discord channels." />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {(query.data?.providers ?? [])
          .filter((provider) => provider.id !== "roblox")
          .map((provider) => (
            <Card key={provider.id} className="flex items-center justify-between p-4">
              <div>
                <p className="text-sm font-medium text-zinc-200">{PROVIDER_LABELS[provider.id] ?? provider.id}</p>
                <p className="text-2xs text-zinc-500">{provider.enabled ? "Enabled" : "Disabled"}</p>
              </div>
              <Toggle
                checked={provider.enabled}
                onChange={(enabled) => toggleProvider.mutate({ provider: provider.id, enabled })}
              />
            </Card>
          ))}
        {query.isLoading ? Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-20" />) : null}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-200">
            <Radio className="h-4 w-4 text-accent-soft" /> Connected feeds
          </h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <Select
              value={feedForm.provider}
              onChange={(event) => setFeedForm({ ...feedForm, provider: event.target.value })}
              options={Object.entries(PROVIDER_LABELS)
                .filter(([id]) => id !== "roblox")
                .map(([id, label]) => ({ value: id, label }))}
            />
            <Input value={feedForm.sourceId} onChange={(event) => setFeedForm({ ...feedForm, sourceId: event.target.value })} placeholder="Channel / handle / username" />
            <Select
              value={feedForm.channelId}
              onChange={(event) => setFeedForm({ ...feedForm, channelId: event.target.value })}
              placeholder="Discord channel"
              options={(channels.data?.channels ?? []).filter((channel) => channel.type === 0).map((channel) => ({ value: channel.id, label: `# ${channel.name}` }))}
            />
            <Button variant="secondary" onClick={() => addFeed.mutate()} loading={addFeed.isPending} disabled={!feedForm.sourceId || !feedForm.channelId}>
              <Plus className="h-3.5 w-3.5" /> Add feed
            </Button>
          </div>
          <div className="mt-4 divide-y divide-ink-800">
            {(query.data?.socialFeeds ?? []).map((feed) => (
              <div key={feed.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-xs text-zinc-300">
                    {PROVIDER_LABELS[feed.provider] ?? feed.provider} · {feed.sourceId}
                  </p>
                  <p className="text-2xs text-zinc-600">
                    #{channels.data?.channels.find((channel) => channel.id === feed.channelId)?.name ?? feed.channelId}
                  </p>
                </div>
                <Button variant="ghost" onClick={() => removeFeed.mutate(feed.id)} aria-label="Remove feed">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            {(query.data?.socialFeeds ?? []).length === 0 ? <p className="py-4 text-center text-xs text-zinc-500">No feeds configured.</p> : null}
          </div>
          <div className="mt-3">
            <InfoNote>Feed delivery depends on the provider integration being enabled and the bot being online.</InfoNote>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-200">
              <Webhook className="h-4 w-4 text-accent-soft" /> Webhooks
            </h2>
            <Button variant="secondary" onClick={() => setWebhookOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> Add
            </Button>
          </div>
          <p className="mt-0.5 text-xs text-zinc-500">Signed event deliveries to your own HTTPS endpoint.</p>
          <div className="mt-3 divide-y divide-ink-800">
            {(query.data?.webhooks ?? []).map((webhook) => (
              <div key={webhook.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate font-mono text-2xs text-zinc-300">{webhook.url}</p>
                  <p className="text-2xs text-zinc-600">
                    {webhook.events.length} events · {webhook.failures} failures
                  </p>
                </div>
                <Button variant="ghost" onClick={() => removeWebhook.mutate(webhook.id)} aria-label="Delete webhook">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            {(query.data?.webhooks ?? []).length === 0 ? <p className="py-4 text-center text-xs text-zinc-500">No webhooks.</p> : null}
          </div>
        </Card>
      </div>

      <Modal
        open={webhookOpen}
        onClose={() => setWebhookOpen(false)}
        title="Add webhook"
        footer={
          <>
            <Button variant="secondary" onClick={() => setWebhookOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => addWebhook.mutate()} loading={addWebhook.isPending} disabled={!webhookForm.url.startsWith("https://")}>
              Create webhook
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Endpoint URL">
            <Input value={webhookForm.url} onChange={(event) => setWebhookForm({ ...webhookForm, url: event.target.value })} placeholder="https://example.com/infera" />
          </Field>
          <Field label="Events" hint="Comma-separated realtime event names, e.g. config.updated, moderation.case.created">
            <Input value={webhookForm.events} onChange={(event) => setWebhookForm({ ...webhookForm, events: event.target.value })} />
          </Field>
        </div>
      </Modal>

      <Modal
        open={Boolean(secret)}
        onClose={() => setSecret(null)}
        title="Webhook secret"
        description="Copy it now. It is never shown again."
        footer={<Button variant="primary" onClick={() => setSecret(null)}>Done</Button>}
      >
        <div className="flex items-center gap-2 rounded-lg border border-ink-700 bg-ink-900 p-3">
          <code className="min-w-0 flex-1 break-all font-mono text-xs text-accent-soft">{secret}</code>
          <Button
            variant="ghost"
            onClick={() => {
              if (!secret) return;
              void navigator.clipboard.writeText(secret);
              push({ title: "Secret copied", tone: "success" });
            }}
            aria-label="Copy secret"
          >
            <Copy className="h-3.5 w-3.5" />
          </Button>
        </div>
      </Modal>
    </div>
  );
}

/* ---------------------------------------------------------- integrations */

export function IntegrationsPage() {
  const { guildId, guild } = useGuildData();
  const query = useQuery({
    queryKey: ["integrations", guildId],
    queryFn: () =>
      api.get<{
        providers: Array<{ id: string; enabled: boolean; configKey: string | null }>;
        roblox: { enabled: boolean; cacheTtl: number; profileFormat: string };
        socialFeeds: SocialFeed[];
        webhooks: WebhookInfo[];
        botInstalled: boolean;
      }>(`/guilds/${guildId}/integrations`),
  });
  const schema = useSchema();
  const settings = useSettings(guildId);
  const save = useSaveConfig(guildId);
  const { push } = useToast();
  const queryClient = useQueryClient();

  const robloxDefinitions = (schema.data?.schema.keys ?? []).filter((definition) => definition.key.startsWith("integrations.roblox"));

  const toggle = useMutation({
    mutationFn: ({ provider, enabled }: { provider: string; enabled: boolean }) =>
      api.patch(`/guilds/${guildId}/integrations/${provider}`, { enabled }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["integrations", guildId] });
      push({ title: "Integration updated", tone: "success" });
    },
    onError: (error) => push({ title: "Could not update integration", description: error.message, tone: "error" }),
  });

  return (
    <div>
      <PageHeader title="Integrations" description="Connected services, Roblox lookups and the Discord gateway binding." />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-zinc-200">Roblox</p>
              <p className="text-2xs text-zinc-500">Profile and game lookups</p>
            </div>
            <Toggle
              checked={Boolean(settings.data?.values["integrations.roblox.enabled"])}
              onChange={(enabled) => toggle.mutate({ provider: "roblox", enabled })}
            />
          </div>
        </Card>
        {(query.data?.providers ?? [])
          .filter((provider) => provider.id !== "roblox")
          .map((provider) => (
            <Card key={provider.id} className="flex items-center justify-between p-4">
              <div>
                <p className="text-sm font-medium text-zinc-200">{PROVIDER_LABELS[provider.id] ?? provider.id}</p>
                <p className="text-2xs text-zinc-500">{provider.enabled ? "Enabled" : "Disabled"}</p>
              </div>
              <Toggle checked={provider.enabled} onChange={(enabled) => toggle.mutate({ provider: provider.id, enabled })} />
            </Card>
          ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <Card className="p-4">
          <h2 className="text-sm font-semibold text-zinc-200">Roblox settings</h2>
          {settings.data ? (
            <div className="mt-3">
              <ConfigForm
                key={`roblox-${settings.data.version}`}
                definitions={robloxDefinitions}
                values={settings.data.values}
                saving={save.isPending}
                onSave={async (patch) => {
                  await save.mutateAsync(patch);
                  void queryClient.invalidateQueries({ queryKey: ["integrations", guildId] });
                }}
              />
            </div>
          ) : (
            <Skeleton className="mt-3 h-40" />
          )}
        </Card>
        <div className="space-y-4">
          <Card className="p-4">
            <h2 className="text-sm font-semibold text-zinc-200">Discord</h2>
            <div className="mt-3 space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-zinc-500">Bot installed</span>
                <Badge tone={guild.botInstalled ? "success" : "danger"}>{guild.botInstalled ? "Yes" : "No"}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-500">Gateway</span>
                <Badge tone={guild.botOnline ? "success" : "warning"}>{guild.botOnline ? "Connected" : "Offline"}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-500">OAuth</span>
                <Badge tone="success">Signed in</Badge>
              </div>
            </div>
            <a href={`https://discord.com/channels/${guildId}`} target="_blank" rel="noreferrer" className="btn-secondary mt-4 text-xs">
              Open server <ExternalLink className="h-3 w-3" />
            </a>
          </Card>
          <Card className="p-4">
            <h2 className="text-sm font-semibold text-zinc-200">Delivery</h2>
            <p className="mt-1 text-xs text-zinc-500">
              {query.data?.socialFeeds.length ?? 0} social feeds · {query.data?.webhooks.length ?? 0} webhooks configured.
            </p>
            <a href={`/dashboard/server/${guildId}/social`} className="btn-ghost mt-2 text-xs">
              Manage social feeds
            </a>
          </Card>
        </div>
      </div>
    </div>
  );
}
