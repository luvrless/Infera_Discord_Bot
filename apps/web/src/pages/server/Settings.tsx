import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Bot, Check, Copy, Download, Gamepad2, History, KeyRound, Plug, Plus, RotateCcw, Shield, SlidersHorizontal, Trash2, UserCog, Webhook, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { PageHeader } from "../../components/cards";
import { ConfigPage, SettingsSection } from "../../components/config/engine";
import { MemberPicker, UserChip } from "../../components/ui/pickers";
import { Badge, Button, Callout, Card, CardHeader, Checkbox, Field, NativeSelect, StatusDot, TextInput, Toggle, Unsupported } from "../../components/ui/primitives";
import { ConfirmDialog, Drawer, Modal } from "../../components/ui/overlays";
import { EmptyState, ErrorState, PageSkeleton } from "../../components/ui/states";
import { DataTable, FilterBar, Pagination, SearchInput } from "../../components/ui/table";
import { useToast } from "../../components/ui/toast";
import { errorMessage } from "../../lib/api/client";
import { communityApi, useIntegrations } from "../../lib/api/community";
import { guildApi, invalidateConfig, useSchema } from "../../lib/api/guilds";
import { keys } from "../../lib/api/keys";
import { useAudit } from "../../lib/api/system";
import type { AuditEntry, SettingsResponse, WebhookRow } from "../../lib/api/types";
import { LEVEL_NAMES } from "../../lib/api/types";
import { REALTIME_EVENTS } from "../../lib/events";
import { serverPath } from "../../lib/nav";
import { downloadJson, formatDate, humanize, timeAgo } from "../../lib/utils";
import { useAuth } from "../../hooks/useAuth";
import { useGuild } from "../../hooks/useGuild";
import { PROVIDERS } from "./Social";

// ---------------------------------------------------------------- general

const SECTIONS = ["general", "moderation", "automod", "security", "welcome", "goodbye", "logging", "leveling", "economy", "tickets", "giveaways", "suggestions", "confessions", "starboard", "voice", "music", "roblox", "social", "permissions"];

export function GeneralSettingsPage() {
  const { guildId, values, settings, canConfigure, detail } = useGuild();
  const schema = useSchema();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [section, setSection] = useState("general");
  const [resetting, setResetting] = useState(false);
  const [browse, setBrowse] = useState("general");
  const reset = useMutation({
    mutationFn: () => guildApi.resetConfig(guildId, section),
    onSuccess: (data) => {
      queryClient.setQueryData<SettingsResponse>(keys.settings(guildId), (current) => (current ? { ...current, values: data.snapshot.values, version: data.snapshot.version } : current));
      invalidateConfig(queryClient, guildId);
      toast.success(`${humanize(section)} reset to defaults`);
      setResetting(false);
    },
    onError: (error) => toast.error("Reset failed", errorMessage(error)),
  });
  const browseKeys = (schema.data?.keys ?? []).filter((entry) => entry.category === browse).map((entry) => entry.key);

  return (
    <ConfigPage>
      <PageHeader
        title="General settings"
        icon={SlidersHorizontal}
        description="Server-wide defaults used by every INFERA module."
        meta={settings ? <span className="text-2xs text-zinc-500">Configuration version {settings.version} · updated {timeAgo(settings.updatedAt)}</span> : null}
        actions={
          <Button icon={<Download className="h-3.5 w-3.5" />} onClick={() => downloadJson(`infera-${guildId}-config.json`, { guildId, guild: detail.guild.name, version: settings?.version, exportedAt: new Date().toISOString(), values })}>
            Export settings
          </Button>
        }
      />
      <div className="grid gap-4 xl:grid-cols-2">
        <SettingsSection
          id="general"
          title="Server defaults"
          icon={<SlidersHorizontal className="h-4 w-4" />}
          configKeys={["general.prefix", "general.language", "general.timezone", "general.color", "general.default_embed_color", "general.command_mode", "general.maintenance_notice"]}
          overrides={{
            "general.prefix": { description: "Prefix for message commands, e.g. . or !. Up to 5 characters." },
            "general.timezone": { description: "IANA timezone such as Europe/London or America/New_York." },
          }}
        />
        <div className="space-y-4">
          <Card>
            <CardHeader title="Reset a section" description="Restore one configuration section to INFERA's defaults. Other sections are untouched." icon={<RotateCcw className="h-4 w-4" />} />
            <div className="flex flex-col gap-2 p-5 sm:flex-row">
              <NativeSelect value={section} onChange={(event) => setSection(event.target.value)} aria-label="Section">
                {SECTIONS.map((entry) => (
                  <option key={entry} value={entry}>
                    {humanize(entry)}
                  </option>
                ))}
              </NativeSelect>
              <Button variant="danger-ghost" disabled={!canConfigure} onClick={() => setResetting(true)}>
                Reset section
              </Button>
            </div>
          </Card>
          <Card>
            <CardHeader title="All settings" description="Every key in the backend schema, editable by category." icon={<KeyRound className="h-4 w-4" />} />
            <div className="p-5">
              <NativeSelect value={browse} onChange={(event) => setBrowse(event.target.value)} aria-label="Category">
                {(schema.data?.categories ?? []).map((entry) => (
                  <option key={entry} value={entry}>
                    {humanize(entry)} ({(schema.data?.keys ?? []).filter((key) => key.category === entry).length})
                  </option>
                ))}
              </NativeSelect>
            </div>
          </Card>
        </div>
      </div>
      {browseKeys.length ? (
        <div className="mt-4">
          <SettingsSection key={browse} id={`browse-${browse}`} title={`${humanize(browse)} — all keys`} description="Schema-driven editor. Keys and validation come straight from the backend registry." configKeys={browseKeys} />
        </div>
      ) : null}
      <ConfirmDialog open={resetting} onClose={() => setResetting(false)} onConfirm={() => reset.mutate()} loading={reset.isPending} title={`Reset ${humanize(section)} to defaults?`} description="Every setting in this section returns to its default value. This can't be undone, but you can export your settings first." confirmLabel="Reset section" confirmText={section} />
    </ConfigPage>
  );
}

// ------------------------------------------------------------ permissions

const LEVEL_ROWS = [
  { level: 0, who: "Everyone", can: "Use member commands" },
  { level: 1, who: "Trusted", can: "View the server in the dashboard" },
  { level: 2, who: "Moderator roles", can: "Moderation, tickets, giveaways, analytics" },
  { level: 3, who: "Administrator roles & Discord admins", can: "Configure modules, security, integrations, audit log" },
  { level: 4, who: "Server owner", can: "Everything in the server" },
  { level: 5, who: "INFERA platform owners", can: "Platform operations (environment allowlist only)" },
];

export function PermissionsPage() {
  const { level, scopes } = useGuild();
  return (
    <ConfigPage>
      <PageHeader title="Permissions" icon={UserCog} description="Map Discord roles onto INFERA permission levels. The backend checks these on every command and dashboard request." meta={<Badge tone="accent">You: {LEVEL_NAMES[level]}</Badge>} />
      <div className="grid gap-4 xl:grid-cols-[1fr_1.1fr]">
        <div className="space-y-4">
          <SettingsSection id="permissions-roles" title="Role levels" icon={<Shield className="h-4 w-4" />} configKeys={["permissions.default_level", "permissions.admin_roles", "permissions.moderator_roles"]} />
          <SettingsSection
            id="permissions-overrides"
            title="Overrides"
            description="Advanced: JSON maps of command → enabled (true/false) or minimum level (0–5)."
            icon={<KeyRound className="h-4 w-4" />}
            configKeys={["permissions.command_overrides", "permissions.channel_overrides", "permissions.user_overrides"]}
          />
        </div>
        <div className="space-y-4">
          <Card>
            <CardHeader title="Permission levels" description="Higher levels always include lower ones." />
            <table className="w-full">
              <tbody>
                {LEVEL_ROWS.map((row) => (
                  <tr key={row.level} className="border-t border-ink-700/60 first:border-0">
                    <td className="px-5 py-2.5 font-mono text-xs text-zinc-500">{row.level}</td>
                    <td className="px-2 py-2.5">
                      <p className="text-13 text-zinc-200">{LEVEL_NAMES[row.level]}</p>
                      <p className="text-2xs text-zinc-500">{row.who}</p>
                    </td>
                    <td className="px-5 py-2.5 text-xs text-zinc-400">{row.can}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <Card className="p-5">
            <p className="text-13 font-medium text-zinc-200">Your dashboard scopes</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {scopes.length ? scopes.map((scope) => <Badge key={scope} tone="accent">{scope.replace(/_/g, " ")}</Badge>) : <span className="text-xs text-zinc-500">View only</span>}
            </div>
            <p className="hint mt-3">Discord Administrator never grants INFERA platform-owner access. Per-command enable/level/cooldown overrides are easiest to manage on the Commands page.</p>
          </Card>
        </div>
      </div>
    </ConfigPage>
  );
}

// ----------------------------------------------------------- integrations

export function IntegrationsPage() {
  const { guildId, detail, level, scopes, modules, canConfigure } = useGuild();
  const { session } = useAuth();
  const integrations = useIntegrations(guildId);
  const queryClient = useQueryClient();
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const roblox = modules.find((module) => module.id === "roblox")?.enabled ?? integrations.data?.roblox.enabled ?? false;
  return (
    <ConfigPage>
      <PageHeader title="Integrations" icon={Plug} description="Connections between INFERA, Discord and external services." />
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Discord" description="The bot connection and your dashboard authorization." icon={<Bot className="h-4 w-4" />} />
          <dl className="grid gap-4 p-5 sm:grid-cols-2">
            <div>
              <dt className="eyebrow">Bot connection</dt>
              <dd className="mt-1.5 flex items-center gap-2 text-13 text-zinc-200">
                <StatusDot tone={detail.guild.botOnline ? "success" : "danger"} pulse={detail.guild.botOnline} />
                {detail.guild.botOnline ? "Connected" : "Disconnected"} {detail.bot.user ? <span className="font-mono text-xs text-zinc-500">{detail.bot.user}</span> : null}
              </dd>
            </div>
            <div>
              <dt className="eyebrow">OAuth session</dt>
              <dd className="mt-1.5 text-13 text-zinc-200">{session ? `Active until ${formatDate(session.expiresAt)}` : "—"}</dd>
            </div>
            <div>
              <dt className="eyebrow">Your access</dt>
              <dd className="mt-1.5 text-13 text-zinc-200">{LEVEL_NAMES[level]} · {scopes.length} scopes</dd>
            </div>
            <div>
              <dt className="eyebrow">Last heartbeat</dt>
              <dd className="mt-1.5 text-13 text-zinc-200">{detail.bot.lastSeenAt ? timeAgo(detail.bot.lastSeenAt) : "Never"}</dd>
            </div>
          </dl>
          <div className="border-t border-ink-700 px-5 py-3 text-2xs leading-relaxed text-zinc-500">
            Required gateway intents: Guilds, Guild Members, Guild Messages, Message Content, Guild Voice States, Guild Moderation and Guild Message Reactions — enable the privileged ones in the Discord Developer Portal.
          </div>
        </Card>

        <SettingsSection
          id="roblox"
          title="Roblox"
          description="User, game and group lookups through official Roblox endpoints."
          icon={<Gamepad2 className="h-4 w-4" />}
          configKeys={["integrations.roblox.cache_ttl", "integrations.roblox.default_profile_format"]}
          action={
            <Toggle
              label="Enable Roblox"
              checked={roblox}
              loading={pending}
              disabled={!canConfigure}
              onChange={async (enabled) => {
                setPending(true);
                try {
                  await guildApi.setModule(guildId, "roblox", enabled);
                  invalidateConfig(queryClient, guildId);
                  toast.success(`Roblox ${enabled ? "enabled" : "disabled"}`);
                } catch (error) {
                  toast.error("Couldn't change Roblox", errorMessage(error));
                } finally {
                  setPending(false);
                }
              }}
            />
          }
          footer={
            <div className="flex items-center justify-between gap-3">
              <p className="text-2xs text-zinc-500">Test live connectivity to official Roblox APIs.</p>
              <Button
                size="sm"
                onClick={async () => {
                  try {
                    const res = await communityApi.testRoblox(guildId);
                    toast.success("Roblox API connected", `Resolved @${res.sampleUser.name} (#${res.sampleUser.id})`);
                  } catch (error) {
                    toast.error("Roblox test failed", errorMessage(error));
                  }
                }}
              >
                Test connection
              </Button>
            </div>
          }
        />

        <Card>
          <CardHeader title="Social providers" icon={<Plug className="h-4 w-4" />} action={<Link to={serverPath(guildId, "social")} className="btn-ghost btn-sm">Manage</Link>} />
          {integrations.isLoading ? (
            <PageSkeleton />
          ) : (
            <ul className="divide-y divide-ink-700/60">
              {PROVIDERS.map((provider) => {
                const enabled = integrations.data?.providers.find((entry) => entry.id === provider.id)?.enabled ?? false;
                const feeds = integrations.data?.socialFeeds.filter((feed) => feed.provider === provider.id).length ?? 0;
                return (
                  <li key={provider.id} className="flex items-center gap-3 px-5 py-2.5">
                    <provider.icon className="h-4 w-4 text-zinc-500" />
                    <span className="flex-1 text-13 text-zinc-200">{provider.name}</span>
                    <span className="text-2xs text-zinc-500">{feeds} feeds</span>
                    <Badge tone={enabled ? "warning" : "neutral"}>{enabled ? "enabled · not delivering" : "off"}</Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Webhooks" icon={<Webhook className="h-4 w-4" />} action={<Link to={serverPath(guildId, "webhooks")} className="btn-ghost btn-sm">Manage</Link>} />
          <div className="p-5 text-13 text-zinc-300">
            {integrations.data ? `${integrations.data.webhooks.length} webhook${integrations.data.webhooks.length === 1 ? "" : "s"} configured.` : "—"}
            <p className="mt-1 text-xs text-zinc-500">Signed outgoing webhooks for INFERA events.</p>
          </div>
        </Card>
      </div>
    </ConfigPage>
  );
}

// --------------------------------------------------------------- webhooks

function EventPicker({ value, onChange }: { value: string[]; onChange: (value: string[]) => void }) {
  const [query, setQuery] = useState("");
  const text = query.trim().toLowerCase();
  return (
    <div className="rounded-lg border border-ink-700">
      <div className="flex items-center gap-2 border-b border-ink-700 p-2">
        <SearchInput value={query} onChange={setQuery} placeholder="Filter events" className="flex-1" delay={0} />
        <span className="shrink-0 px-2 text-2xs text-zinc-500">{value.length} selected</span>
      </div>
      <div className="max-h-64 space-y-3 overflow-y-auto p-3">
        {Object.entries(REALTIME_EVENTS).map(([group, events]) => {
          const visible = events.filter((event) => !text || event.includes(text));
          if (!visible.length) return null;
          const all = visible.every((event) => value.includes(event));
          return (
            <div key={group}>
              <div className="mb-1.5 flex items-center justify-between">
                <p className="eyebrow">{group}</p>
                <button type="button" className="text-2xs text-accent-soft hover:underline" onClick={() => onChange(all ? value.filter((event) => !visible.includes(event)) : Array.from(new Set([...value, ...visible])))}>
                  {all ? "Clear" : "Select all"}
                </button>
              </div>
              <div className="grid gap-1 sm:grid-cols-2">
                {visible.map((event) => (
                  <Checkbox key={event} checked={value.includes(event)} onChange={(checked) => onChange(checked ? [...value, event] : value.filter((entry) => entry !== event))} label={<span className="font-mono text-xs">{event}</span>} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function WebhooksPage() {
  const { guildId, canConfigure } = useGuild();
  const integrations = useIntegrations(guildId);
  const queryClient = useQueryClient();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<string[]>(["moderation.case.created", "security.alert.created"]);
  const [secret, setSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState<WebhookRow | null>(null);
  const [editEvents, setEditEvents] = useState<string[]>([]);
  const [remove, setRemove] = useState<WebhookRow | null>(null);
  const [deliveriesFor, setDeliveriesFor] = useState<WebhookRow | null>(null);
  const [deliveries, setDeliveries] = useState<Array<{ id: string; event: string; status: string; responseStatus: number | null; lastError: string | null; createdAt: string }>>([]);
  const [testingId, setTestingId] = useState<string | null>(null);
  const refresh = () => void queryClient.invalidateQueries({ queryKey: keys.integrations(guildId) });
  const urlValid = /^https:\/\/[^\s]+$/.test(url.trim());

  const create = useMutation({
    mutationFn: () => communityApi.createWebhook(guildId, { url: url.trim(), events }),
    onSuccess: (data) => {
      setCreating(false);
      setUrl("");
      setSecret(data.secret);
      refresh();
    },
    onError: (error) => toast.error("Couldn't create the webhook", errorMessage(error)),
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { enabled?: boolean; events?: string[] } }) => communityApi.updateWebhook(guildId, id, body),
    onSuccess: (_data, variables) => {
      toast.success(variables.body.events ? "Subscriptions updated" : variables.body.enabled ? "Webhook enabled" : "Webhook disabled");
      setEditing(null);
      refresh();
    },
    onError: (error) => toast.error("Couldn't update the webhook", errorMessage(error)),
  });
  const del = useMutation({
    mutationFn: (id: string) => communityApi.deleteWebhook(guildId, id),
    onSuccess: () => {
      toast.success("Webhook deleted");
      setRemove(null);
      refresh();
    },
    onError: (error) => toast.error("Couldn't delete the webhook", errorMessage(error)),
  });

  return (
    <div>
      <PageHeader title="Webhooks" icon={Webhook} description="Send INFERA events to your own HTTPS endpoint, signed with HMAC-SHA256." actions={canConfigure ? <Button variant="primary" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setCreating(true)}>New webhook</Button> : null} />
      <Card>
        {integrations.error ? (
          <ErrorState error={integrations.error} onRetry={() => void integrations.refetch()} />
        ) : (
          <DataTable<WebhookRow>
            loading={integrations.isLoading}
            rows={integrations.data?.webhooks}
            rowKey={(row) => row.id}
            empty={<EmptyState icon={Webhook} title="No webhooks" description="Create one to subscribe an endpoint to INFERA events." />}
            columns={[
              { id: "url", header: "Destination", className: "max-w-[320px]", cell: (row) => <span className="block truncate font-mono text-xs text-zinc-200">{row.url}</span> },
              { id: "events", header: "Events", cell: (row) => <Badge>{row.events.length} events</Badge> },
              { id: "secret", header: "Secret", cell: () => <span className="flex items-center gap-1 text-xs text-zinc-500"><KeyRound className="h-3 w-3" /> whsec_••••••</span> },
              { id: "failures", header: "Failures", cell: (row) => (row.failures ? <Badge tone="danger">{row.failures}</Badge> : <span className="text-zinc-600">0</span>) },
              { id: "created", header: "Created", cell: (row) => <span className="text-zinc-500">{timeAgo(row.createdAt)}</span> },
              { id: "enabled", header: "Enabled", cell: (row) => <Toggle size="sm" label="Enabled" checked={row.enabled} disabled={!canConfigure} onChange={(enabled) => update.mutate({ id: row.id, body: { enabled } })} /> },
              {
                id: "actions",
                header: "",
                className: "w-56",
                cell: (row) =>
                  canConfigure ? (
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        loading={testingId === row.id}
                        onClick={async () => {
                          setTestingId(row.id);
                          try {
                            const res = await communityApi.testWebhook(guildId, row.id);
                            if (res.delivery.status === "delivered") {
                              toast.success("Test delivered", `HTTP ${res.delivery.responseStatus ?? 200}`);
                            } else {
                              toast.error("Test delivery failed", res.delivery.lastError ?? "Endpoint error");
                            }
                          } catch (error) {
                            toast.error("Test failed", errorMessage(error));
                          } finally {
                            setTestingId(null);
                          }
                        }}
                      >
                        Test
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          setDeliveriesFor(row);
                          try {
                            const res = await communityApi.webhookDeliveries(guildId, row.id);
                            setDeliveries(res.deliveries);
                          } catch (error) {
                            toast.error("Failed to load deliveries", errorMessage(error));
                          }
                        }}
                      >
                        Logs
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => { setEditing(row); setEditEvents(row.events); }}>
                        Events
                      </Button>
                      <button type="button" aria-label="Delete webhook" onClick={() => setRemove(row)} className="btn-icon h-7 w-7 hover:text-red-400">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : null,
              },
            ]}
          />
        )}
      </Card>
      <div className="mt-4">
        <Card className="p-5 text-xs leading-relaxed text-zinc-400">
          <p className="mb-2 text-13 font-medium text-zinc-200">Verifying signatures</p>
          Each delivery carries <span className="font-mono text-zinc-300">X-Infera-Event</span>, <span className="font-mono text-zinc-300">X-Infera-Delivery</span>, <span className="font-mono text-zinc-300">X-Infera-Timestamp</span> and <span className="font-mono text-zinc-300">X-Infera-Signature</span>. Compute HMAC-SHA256 of <span className="font-mono">timestamp.body</span> with your secret and compare in constant time.
        </Card>
      </div>
      <Modal
        open={Boolean(deliveriesFor)}
        onClose={() => setDeliveriesFor(null)}
        size="lg"
        title="Webhook deliveries"
        description={deliveriesFor?.url}
      >
        {deliveries.length === 0 ? (
          <EmptyState compact title="No deliveries yet" description="Send a test delivery to verify your endpoint." />
        ) : (
          <ul className="divide-y divide-ink-700/60 text-xs">
            {deliveries.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 py-2.5">
                <div>
                  <span className="font-mono text-zinc-200">{d.event}</span>
                  {d.lastError ? <p className="text-2xs text-red-400">{d.lastError}</p> : null}
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={d.status === "delivered" ? "success" : "danger"}>{d.responseStatus ?? d.status}</Badge>
                  <span className="text-2xs text-zinc-500">{timeAgo(d.createdAt)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Modal>

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        size="lg"
        title="New webhook"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button variant="primary" disabled={!urlValid || events.length === 0} loading={create.isPending} onClick={() => create.mutate()}>
              Create webhook
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Destination URL" required hint="Must be https. Private, loopback and internal network addresses are rejected." error={url && !urlValid ? "Enter a valid https URL" : null}>
            <TextInput value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://example.com/infera/webhook" invalid={Boolean(url) && !urlValid} />
          </Field>
          <Field label="Events">
            <EventPicker value={events} onChange={setEvents} />
          </Field>
        </div>
      </Modal>

      <Modal
        open={Boolean(secret)}
        onClose={() => { setSecret(null); setCopied(false); }}
        size="md"
        title="Save your signing secret"
        description="This is the only time the secret is shown. INFERA stores it securely and never displays it again."
        footer={<Button variant="primary" onClick={() => { setSecret(null); setCopied(false); }}>I've saved it</Button>}
      >
        <div className="flex items-center gap-2 rounded-lg border border-ink-600 bg-ink-900 px-3 py-2.5">
          <code className="min-w-0 flex-1 break-all font-mono text-xs text-zinc-100">{secret}</code>
          <button
            type="button"
            aria-label="Copy secret"
            onClick={async () => {
              if (!secret) return;
              await navigator.clipboard.writeText(secret);
              setCopied(true);
            }}
            className="btn-icon h-7 w-7"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        </div>
      </Modal>

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        size="lg"
        title="Event subscriptions"
        description={editing?.url}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button variant="primary" loading={update.isPending} onClick={() => editing && update.mutate({ id: editing.id, body: { events: editEvents } })}>
              Save subscriptions
            </Button>
          </>
        }
      >
        <EventPicker value={editEvents} onChange={setEditEvents} />
      </Modal>

      <ConfirmDialog open={Boolean(remove)} onClose={() => setRemove(null)} onConfirm={() => remove && del.mutate(remove.id)} loading={del.isPending} title="Delete this webhook?" description={remove?.url} confirmLabel="Delete webhook" />
    </div>
  );
}

// ------------------------------------------------------------------ audit

export function AuditPage() {
  const { guildId, level } = useGuild();
  const [params, setParams] = useSearchParams();
  const [page, setPage] = useState(1);
  const [action, setAction] = useState(params.get("action") ?? "");
  const [prefix, setPrefix] = useState(params.has("action"));
  const [actorId, setActorId] = useState<string | null>(null);
  const [selected, setSelected] = useState<AuditEntry | null>(null);
  const query = useMemo(() => ({ page, pageSize: 25, ...(action.trim() ? { action: action.trim(), prefix: prefix ? "true" : undefined } : {}), ...(actorId ? { actorId } : {}) }), [page, action, prefix, actorId]);
  const audit = useAudit(guildId, query);

  if (level < 3) {
    return (
      <div>
        <PageHeader title="Audit log" icon={History} />
        <Card>
          <EmptyState icon={History} title="Administrator access required" description="Only administrators can read the audit log." />
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Audit log"
        icon={History}
        description="A read-only record of configuration and moderation changes, from Discord and the dashboard."
        actions={
          <Button icon={<Download className="h-3.5 w-3.5" />} disabled={!audit.data?.entries.length} onClick={() => downloadJson(`infera-${guildId}-audit-page-${page}.json`, audit.data?.entries ?? [])}>
            Export page
          </Button>
        }
      />
      <Card>
        <FilterBar>
          <div className="flex items-center gap-2">
            <SearchInput value={action} onChange={(value) => { setAction(value); setPage(1); setParams({}); }} placeholder="Action, e.g. config.update" className="w-64" />
            <Checkbox checked={prefix} onChange={(value) => { setPrefix(value); setPage(1); }} label={<span className="text-xs">Starts with</span>} />
          </div>
          <div className="w-full sm:w-64">
            <MemberPicker value={actorId} onChange={(id) => { setActorId(id); setPage(1); }} placeholder="Filter by actor" />
          </div>
          {action || actorId ? (
            <Button size="sm" variant="ghost" icon={<X className="h-3.5 w-3.5" />} onClick={() => { setAction(""); setActorId(null); setPrefix(false); setPage(1); setParams({}); }}>
              Clear
            </Button>
          ) : null}
        </FilterBar>
        {audit.error ? (
          <ErrorState error={audit.error} compact onRetry={() => void audit.refetch()} />
        ) : (
          <DataTable<AuditEntry>
            loading={audit.isFetching}
            rows={audit.data?.entries}
            rowKey={(row) => row.id}
            onRowClick={setSelected}
            empty={<EmptyState compact icon={History} title="No audit entries found" />}
            columns={[
              { id: "actor", header: "Actor", cell: (row) => (row.actorId ? <UserChip userId={row.actorId} /> : <span className="text-zinc-600">System</span>) },
              { id: "action", header: "Action", cell: (row) => <span className="font-mono text-xs text-zinc-100">{row.action}</span> },
              { id: "module", header: "Module", cell: (row) => <Badge>{row.action.split(".")[0]}</Badge> },
              { id: "target", header: "Target", cell: (row) => <span className="font-mono text-2xs text-zinc-500">{row.targetId ?? "—"}</span> },
              { id: "time", header: "Time", cell: (row) => <span className="text-zinc-500" title={formatDate(row.createdAt)}>{timeAgo(row.createdAt)}</span> },
            ]}
          />
        )}
        {audit.data ? <Pagination page={page} pageSize={25} total={audit.data.total} onChange={setPage} /> : null}
        <div className="border-t border-ink-700 px-4 py-2.5 text-2xs text-zinc-600">Audit entries can't be edited or deleted. Date-range filtering isn't supported by the audit API.</div>
      </Card>
      <Drawer open={Boolean(selected)} onClose={() => setSelected(null)} title={<span className="font-mono">{selected?.action}</span>} subtitle={selected ? formatDate(selected.createdAt) : null}>
        {selected ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="eyebrow">Actor</p>
                <div className="mt-1.5">{selected.actorId ? <UserChip userId={selected.actorId} size={22} showId /> : "System"}</div>
              </div>
              <div>
                <p className="eyebrow">Target</p>
                <p className="mt-1.5 break-all font-mono text-xs text-zinc-300">{selected.targetId ?? "—"}</p>
              </div>
              <div>
                <p className="eyebrow">Result</p>
                <p className="mt-1.5"><Badge tone="success">recorded</Badge></p>
              </div>
              {selected.ip ? (
                <div>
                  <p className="eyebrow">IP</p>
                  <p className="mt-1.5 font-mono text-xs text-zinc-300">{selected.ip}</p>
                </div>
              ) : null}
            </div>
            <div>
              <p className="eyebrow mb-1.5">Details</p>
              <pre className="max-h-96 overflow-auto rounded-lg border border-ink-700 bg-ink-900 p-3 font-mono text-2xs text-zinc-300">{JSON.stringify(selected.metadata, null, 2)}</pre>
            </div>
            <p className="font-mono text-2xs text-zinc-600">{selected.id}</p>
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
