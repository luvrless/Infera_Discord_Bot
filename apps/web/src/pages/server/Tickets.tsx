import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Download, Hand, Inbox, LayoutPanelTop, Lock, Pencil, Plus, RotateCcw, Send, SlidersHorizontal, Ticket as TicketIcon, Trash2, UserMinus, UserPlus } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { MetricCard, PageHeader, StatGrid } from "../../components/cards";
import { ConfigPage, SettingsSection } from "../../components/config/engine";
import { DiscordMessagePreview } from "../../components/discord/Preview";
import { ChannelName, ChannelPicker, MemberPicker, UserChip } from "../../components/ui/pickers";
import { Badge, Button, Callout, Card, CardHeader, ColorInput, Field, NativeSelect, Tabs, TextArea, TextInput, Unsupported, type Tone } from "../../components/ui/primitives";
import { ConfirmDialog, Drawer, Modal } from "../../components/ui/overlays";
import { EmptyState, ErrorState, SkeletonRows } from "../../components/ui/states";
import { DataTable, SearchInput } from "../../components/ui/table";
import { useToast } from "../../components/ui/toast";
import { errorMessage } from "../../lib/api/client";
import { communityApi, useTickets } from "../../lib/api/community";
import { keys } from "../../lib/api/keys";
import type { Ticket, TicketPanel } from "../../lib/api/types";
import { serverPath } from "../../lib/nav";
import { formatDate, timeAgo } from "../../lib/utils";
import { useGuild } from "../../hooks/useGuild";

const PRIORITY_TONE: Record<string, Tone> = { low: "neutral", normal: "info", high: "warning", urgent: "danger" };

function TicketsDisabledNotice() {
  const { guildId, values } = useGuild();
  if (values["tickets.enabled"]) return null;
  return (
    <Callout tone="warning" className="mb-4" title="The ticket system is disabled" action={<Link to={serverPath(guildId, "tickets/settings")} className="btn-secondary btn-sm">Configure</Link>}>
      Members can't open new tickets until it's enabled. Existing tickets can still be managed.
    </Callout>
  );
}

// ---------------------------------------------------------------- inbox

export function TicketInboxPage() {
  const { guildId, canModerate } = useGuild();
  const [filter, setFilter] = useState<"open" | "claimed" | "unassigned" | "closed" | "all">("open");
  const [priority, setPriority] = useState("");
  const [query, setQuery] = useState("");
  const [params, setParams] = useSearchParams();
  const selectedId = params.get("ticket");
  const status = filter === "closed" ? "closed" : filter === "all" ? "all" : "open";
  const tickets = useTickets(guildId, status);

  const rows = useMemo(() => {
    const text = query.trim().toLowerCase();
    return (tickets.data?.tickets ?? [])
      .filter((ticket) => (filter === "claimed" ? Boolean(ticket.claimedBy) : filter === "unassigned" ? !ticket.claimedBy : true))
      .filter((ticket) => !priority || ticket.priority === priority)
      .filter((ticket) => !text || String(ticket.number).includes(text) || (ticket.subject ?? "").toLowerCase().includes(text) || ticket.userId.includes(text));
  }, [tickets.data, filter, priority, query]);

  const selected = tickets.data?.tickets.find((ticket) => ticket.id === selectedId) ?? null;
  const open = (id: string | null) =>
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (id) next.set("ticket", id);
      else next.delete("ticket");
      return next;
    });

  if (!canModerate) {
    return (
      <div>
        <PageHeader title="Ticket inbox" icon={Inbox} />
        <Card>
          <EmptyState title="Moderator access required" description="Ticket management is limited to staff." />
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Ticket inbox" icon={Inbox} description="Every ticket opened through INFERA. Actions here update the Discord channel too." />
      <TicketsDisabledNotice />
      <StatGrid className="mb-4">
        <MetricCard label="Open" value={tickets.data?.stats.open} icon={Inbox} tone="accent" loading={tickets.isLoading} />
        <MetricCard label="Unassigned (open)" value={tickets.data ? (status === "open" ? tickets.data.tickets.filter((ticket) => !ticket.claimedBy).length : null) : null} unavailable={status === "open" ? undefined : "Open view only"} icon={Hand} loading={tickets.isLoading} />
        <MetricCard label="Closed" value={tickets.data?.stats.closed} icon={Lock} loading={tickets.isLoading} />
        <MetricCard label="All time" value={tickets.data?.stats.total} icon={TicketIcon} loading={tickets.isLoading} />
      </StatGrid>
      <Card>
        <Tabs
          className="px-2"
          value={filter}
          onChange={setFilter}
          tabs={[
            { id: "open", label: "Open" },
            { id: "unassigned", label: "Unassigned" },
            { id: "claimed", label: "Claimed" },
            { id: "closed", label: "Closed" },
            { id: "all", label: "All" },
          ]}
        />
        <div className="flex flex-wrap items-center gap-2 border-b border-ink-700 px-4 py-3">
          <SearchInput value={query} onChange={setQuery} placeholder="Search # or subject" className="w-full sm:w-64" />
          <div className="w-36">
            <NativeSelect value={priority} onChange={(event) => setPriority(event.target.value)} aria-label="Priority">
              <option value="">Any priority</option>
              <option value="urgent">Urgent</option>
              <option value="high">High</option>
              <option value="normal">Normal</option>
              <option value="low">Low</option>
            </NativeSelect>
          </div>
          <span className="ml-auto text-2xs text-zinc-600">Showing the latest 100 tickets</span>
        </div>
        {tickets.error ? (
          <ErrorState error={tickets.error} compact onRetry={() => void tickets.refetch()} />
        ) : (
          <DataTable<Ticket>
            loading={tickets.isFetching}
            rows={rows}
            rowKey={(row) => row.id}
            onRowClick={(row) => open(row.id)}
            empty={<EmptyState compact icon={Inbox} title="No tickets here" description="Tickets created from a panel or the ticket command appear in this inbox." />}
            columns={[
              { id: "id", header: "Ticket", className: "font-mono text-zinc-400", cell: (row) => `#${row.number}` },
              { id: "user", header: "User", cell: (row) => <UserChip userId={row.userId} /> },
              { id: "subject", header: "Category", cell: (row) => <span className="text-zinc-400">{row.subject ?? "General"}</span> },
              { id: "staff", header: "Assigned", cell: (row) => (row.claimedBy ? <UserChip userId={row.claimedBy} /> : <span className="text-zinc-600">Unassigned</span>) },
              { id: "priority", header: "Priority", cell: (row) => <Badge tone={PRIORITY_TONE[row.priority] ?? "neutral"}>{row.priority}</Badge> },
              { id: "status", header: "Status", cell: (row) => <Badge tone={row.status === "open" ? "success" : "neutral"} dot>{row.status}</Badge> },
              { id: "created", header: "Created", cell: (row) => <span className="text-zinc-500" title={formatDate(row.createdAt)}>{timeAgo(row.createdAt)}</span> },
            ]}
          />
        )}
      </Card>
      <TicketDrawer ticket={selected} onClose={() => open(null)} />
    </div>
  );
}

function TicketDrawer({ ticket, onClose }: { ticket: Ticket | null; onClose: () => void }) {
  const { guildId, values } = useGuild();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [closing, setClosing] = useState(false);
  const [reason, setReason] = useState("");
  const [rename, setRename] = useState("");
  const [member, setMember] = useState<string | null>(null);
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: keys.ticketsAll(guildId) });
    void queryClient.invalidateQueries({ queryKey: keys.overview(guildId) });
  };
  const action = useMutation({
    mutationFn: (input: { action: "claim" | "close" | "reopen" | "priority"; body?: Record<string, unknown> }) => communityApi.ticketAction(guildId, ticket!.id, input.action, input.body),
    onSuccess: (_data, input) => {
      toast.success(input.action === "claim" ? "Ticket claimed" : input.action === "close" ? "Ticket closed" : input.action === "reopen" ? "Ticket reopened" : "Priority updated");
      setClosing(false);
      setReason("");
      refresh();
    },
    onError: (error) => toast.error("The ticket action failed", errorMessage(error)),
  });
  const manage = useMutation({
    mutationFn: (body: { action: "rename" | "add" | "remove"; name?: string; userId?: string }) => communityApi.manageTicket(guildId, ticket!.id, body),
    onSuccess: (_data, body) => {
      toast.success(body.action === "rename" ? "Channel renamed" : body.action === "add" ? "Member added to the ticket" : "Member removed from the ticket");
      setRename("");
      setMember(null);
    },
    onError: (error) => toast.error("Couldn't update the ticket channel", errorMessage(error)),
  });
  const downloadTranscript = () => {
    if (!ticket?.transcript) return;
    const blob = new Blob([ticket.transcript], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `ticket-${ticket.number}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Drawer
      open={Boolean(ticket)}
      onClose={onClose}
      width="lg"
      title={ticket ? `Ticket #${ticket.number}` : "Ticket"}
      subtitle={ticket ? <span className="flex items-center gap-2"><Badge tone={ticket.status === "open" ? "success" : "neutral"} dot>{ticket.status}</Badge> opened {formatDate(ticket.createdAt)}</span> : null}
      footer={
        ticket ? (
          ticket.status === "open" ? (
            <>
              {!ticket.claimedBy && values["tickets.claim_enabled"] !== false ? (
                <Button icon={<Hand className="h-3.5 w-3.5" />} loading={action.isPending && action.variables?.action === "claim"} onClick={() => action.mutate({ action: "claim" })}>
                  Claim
                </Button>
              ) : null}
              <Button variant="danger" icon={<Lock className="h-3.5 w-3.5" />} onClick={() => setClosing(true)}>
                Close ticket
              </Button>
            </>
          ) : (
            <Button icon={<RotateCcw className="h-3.5 w-3.5" />} loading={action.isPending} onClick={() => action.mutate({ action: "reopen" })}>
              Reopen
            </Button>
          )
        ) : undefined
      }
    >
      {ticket ? (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="eyebrow">Opened by</p>
              <div className="mt-1.5">
                <UserChip userId={ticket.userId} size={24} showId />
              </div>
            </div>
            <div>
              <p className="eyebrow">Assigned staff</p>
              <div className="mt-1.5">{ticket.claimedBy ? <UserChip userId={ticket.claimedBy} size={24} /> : <span className="text-13 text-zinc-500">Unassigned</span>}</div>
            </div>
            <div>
              <p className="eyebrow">Channel</p>
              <div className="mt-1.5">
                <ChannelName id={ticket.channelId} />
              </div>
            </div>
            <div>
              <p className="eyebrow">Priority</p>
              <div className="mt-1.5 w-36">
                <NativeSelect value={ticket.priority} disabled={action.isPending} onChange={(event) => action.mutate({ action: "priority", body: { priority: event.target.value } })}>
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </NativeSelect>
              </div>
            </div>
            {ticket.closedAt ? (
              <div className="col-span-2">
                <p className="eyebrow">Closed</p>
                <p className="mt-1.5 flex items-center gap-2 text-13 text-zinc-300">
                  {formatDate(ticket.closedAt)} {ticket.closedBy ? <>by <UserChip userId={ticket.closedBy} size={16} /></> : null}
                </p>
              </div>
            ) : null}
          </div>

          {ticket.status === "open" ? (
            <div className="space-y-3 rounded-lg border border-ink-700 p-4">
              <p className="text-xs font-medium text-zinc-300">Channel management</p>
              <div className="flex gap-2">
                <TextInput value={rename} maxLength={100} onChange={(event) => setRename(event.target.value)} placeholder="Rename channel, e.g. billing-issue" />
                <Button icon={<Pencil className="h-3.5 w-3.5" />} disabled={!rename.trim()} loading={manage.isPending && manage.variables?.action === "rename"} onClick={() => manage.mutate({ action: "rename", name: rename.trim() })}>
                  Rename
                </Button>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="flex-1">
                  <MemberPicker value={member} onChange={(id) => setMember(id)} placeholder="Add or remove a member" />
                </div>
                <Button icon={<UserPlus className="h-3.5 w-3.5" />} disabled={!member} onClick={() => manage.mutate({ action: "add", userId: member! })}>
                  Add
                </Button>
                <Button variant="danger-ghost" icon={<UserMinus className="h-3.5 w-3.5" />} disabled={!member} onClick={() => manage.mutate({ action: "remove", userId: member! })}>
                  Remove
                </Button>
              </div>
            </div>
          ) : null}

          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="eyebrow">Transcript</p>
              {ticket.transcript ? (
                <Button size="sm" variant="ghost" icon={<Download className="h-3.5 w-3.5" />} onClick={downloadTranscript}>
                  Download
                </Button>
              ) : null}
            </div>
            {ticket.transcript ? (
              <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-lg border border-ink-700 bg-ink-900 p-3 font-mono text-2xs leading-relaxed text-zinc-400">{ticket.transcript}</pre>
            ) : (
              <p className="text-xs text-zinc-500">{ticket.status === "open" ? "A transcript is generated when the ticket closes." : "No transcript was stored for this ticket."}</p>
            )}
          </div>
          <Unsupported title="Live messages and internal notes">The ticket API returns transcripts for closed tickets only and has no internal-notes endpoint.</Unsupported>
        </div>
      ) : null}
      <ConfirmDialog
        open={closing}
        onClose={() => setClosing(false)}
        onConfirm={() => action.mutate({ action: "close", body: { reason: reason.trim() || undefined } })}
        loading={action.isPending}
        title={`Close ticket #${ticket?.number}?`}
        description="INFERA saves a transcript, locks the channel and DMs the transcript if enabled."
        confirmLabel="Close ticket"
      >
        <Field label="Reason (optional)">
          <TextInput value={reason} onChange={(event) => setReason(event.target.value)} />
        </Field>
      </ConfirmDialog>
    </Drawer>
  );
}

// --------------------------------------------------------------- panels

export function TicketPanelsPage() {
  const { guildId, canConfigure } = useGuild();
  const tickets = useTickets(guildId, "open");
  const queryClient = useQueryClient();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [publish, setPublish] = useState<TicketPanel | null>(null);
  const [remove, setRemove] = useState<TicketPanel | null>(null);
  const refresh = () => void queryClient.invalidateQueries({ queryKey: keys.ticketsAll(guildId) });
  const del = useMutation({
    mutationFn: (id: string) => communityApi.deleteTicketPanel(guildId, id),
    onSuccess: () => {
      toast.success("Panel deleted", "The Discord message, if published, isn't removed automatically.");
      setRemove(null);
      refresh();
    },
    onError: (error) => toast.error("Couldn't delete the panel", errorMessage(error)),
  });
  const panels = tickets.data?.panels ?? [];
  return (
    <div>
      <PageHeader
        title="Ticket panels"
        icon={LayoutPanelTop}
        description="Messages with an Open ticket button that members click to create a private ticket."
        actions={canConfigure ? <Button variant="primary" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setCreating(true)}>New panel</Button> : null}
      />
      <TicketsDisabledNotice />
      {tickets.isLoading ? (
        <SkeletonRows />
      ) : tickets.error ? (
        <Card>
          <ErrorState error={tickets.error} onRetry={() => void tickets.refetch()} />
        </Card>
      ) : panels.length === 0 ? (
        <Card>
          <EmptyState icon={LayoutPanelTop} title="No ticket panels yet" description="Create a panel, preview it, then publish it to a channel." action={canConfigure ? <Button variant="primary" onClick={() => setCreating(true)}>Create a panel</Button> : undefined} />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {panels.map((panel) => (
            <Card key={panel.id} className="flex flex-col">
              <div className="flex items-start justify-between gap-3 px-5 pt-4">
                <div>
                  <p className="text-sm font-medium text-zinc-100">{panel.title}</p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs text-zinc-500">
                    {panel.messageId ? <Badge tone="success" dot>Published</Badge> : <Badge>Draft</Badge>}
                    {panel.channelId ? <ChannelName id={panel.channelId} /> : null}
                  </p>
                </div>
              </div>
              <div className="flex-1 p-4">
                <DiscordMessagePreview embed={{ title: panel.title, description: panel.description || "Press the button below to open a ticket.", footer: "INFERA tickets" }} buttons={[{ label: "Open ticket", style: "primary" }]} />
              </div>
              {canConfigure ? (
                <div className="flex justify-end gap-2 border-t border-ink-700 px-5 py-3">
                  <Button variant="danger-ghost" size="sm" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => setRemove(panel)}>
                    Delete
                  </Button>
                  <Button variant="primary" size="sm" icon={<Send className="h-3.5 w-3.5" />} onClick={() => setPublish(panel)}>
                    {panel.messageId ? "Publish again" : "Publish"}
                  </Button>
                </div>
              ) : null}
            </Card>
          ))}
        </div>
      )}
      <p className="mt-4 text-2xs text-zinc-600">Panel editing isn't supported by the API — delete and recreate a panel to change its text. Per-panel staff roles, categories and limits use the shared ticket configuration.</p>
      <CreatePanelModal open={creating} onClose={() => setCreating(false)} onCreated={refresh} />
      <PublishPanelModal panel={publish} onClose={() => setPublish(null)} onPublished={refresh} />
      <ConfirmDialog open={Boolean(remove)} onClose={() => setRemove(null)} onConfirm={() => remove && del.mutate(remove.id)} loading={del.isPending} title={`Delete “${remove?.title}”?`} description="Buttons on an already-published panel will stop working." confirmLabel="Delete panel" />
    </div>
  );
}

function CreatePanelModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const { guildId } = useGuild();
  const toast = useToast();
  const [title, setTitle] = useState("Need help?");
  const [description, setDescription] = useState("Open a ticket and our team will get back to you shortly.");
  const [channelId, setChannelId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: () => communityApi.createTicketPanel(guildId, { title: title.trim(), description: description.trim() || undefined, channelId: channelId ?? undefined, categoryId: categoryId ?? undefined }),
    onSuccess: () => {
      toast.success("Panel created", "Publish it to post it in Discord.");
      onCreated();
      onClose();
    },
    onError: (error) => toast.error("Couldn't create the panel", errorMessage(error)),
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title="New ticket panel"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!title.trim()} loading={create.isPending} onClick={() => create.mutate()}>
            Create panel
          </Button>
        </>
      }
    >
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-4">
          <Field label="Panel title" required>
            <TextInput value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} />
          </Field>
          <Field label="Description">
            <TextArea rows={4} maxLength={2000} value={description} onChange={(event) => setDescription(event.target.value)} />
          </Field>
          <Field label="Default channel" hint="Where the panel is posted. You can change it when publishing.">
            <ChannelPicker value={channelId} onChange={setChannelId} />
          </Field>
          <Field label="Ticket category" hint="Stored with the panel. Tickets are currently created in the category from Ticket Configuration.">
            <ChannelPicker kind="category" value={categoryId} onChange={setCategoryId} />
          </Field>
        </div>
        <div>
          <p className="label mb-2">Preview</p>
          <DiscordMessagePreview embed={{ title, description: description || "Press the button below to open a ticket.", footer: "INFERA tickets" }} buttons={[{ label: "Open ticket", style: "primary" }]} />
        </div>
      </div>
    </Modal>
  );
}

function PublishPanelModal({ panel, onClose, onPublished }: { panel: TicketPanel | null; onClose: () => void; onPublished: () => void }) {
  const { guildId } = useGuild();
  const toast = useToast();
  const [channelId, setChannelId] = useState<string | null>(null);
  const [label, setLabel] = useState("Open ticket");
  const [color, setColor] = useState("#8B5CF6");
  const target = channelId ?? panel?.channelId ?? null;
  const publish = useMutation({
    mutationFn: () => communityApi.publishTicketPanel(guildId, panel!.id, { channelId: target ?? undefined, buttonLabel: label, color }),
    onSuccess: (data) => {
      toast.success("Panel published", `Discord confirmed message ${data.messageId}.`);
      onPublished();
      onClose();
    },
    onError: (error) => toast.error("Discord didn't accept the panel", errorMessage(error)),
  });
  return (
    <Modal
      open={Boolean(panel)}
      onClose={onClose}
      size="lg"
      title={`Publish “${panel?.title}”`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" icon={<Send className="h-3.5 w-3.5" />} disabled={!target} loading={publish.isPending} onClick={() => publish.mutate()}>
            Publish to Discord
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Channel" required>
          <ChannelPicker value={target} onChange={setChannelId} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Button label">
            <TextInput value={label} maxLength={80} onChange={(event) => setLabel(event.target.value)} />
          </Field>
          <Field label="Embed colour">
            <ColorInput value={color} onChange={setColor} />
          </Field>
        </div>
        {panel ? <DiscordMessagePreview embed={{ color, title: panel.title, description: panel.description || "Press the button below to open a ticket.", footer: "INFERA tickets" }} buttons={[{ label, style: "primary" }]} /> : null}
        <p className="hint">The panel is only marked published once Discord returns the message ID.</p>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------- settings

export function TicketSettingsPage() {
  return (
    <ConfigPage>
      <PageHeader title="Ticket configuration" icon={SlidersHorizontal} description="Where tickets are created, who can see them and how they close." />
      <div className="grid gap-4 xl:grid-cols-2">
        <SettingsSection
          id="tickets-core"
          title="Ticket system"
          icon={<TicketIcon className="h-4 w-4" />}
          configKeys={["tickets.enabled", "tickets.category_id", "tickets.staff_roles", "tickets.max_open_per_user", "tickets.default_priority"]}
          overrides={{ "tickets.category_id": { label: "Ticket category", description: "New ticket channels are created inside this category." } }}
        />
        <SettingsSection
          id="tickets-flow"
          title="Claiming & transcripts"
          icon={<Lock className="h-4 w-4" />}
          configKeys={["tickets.claim_enabled", "tickets.transcript_channel", "tickets.close_dm"]}
        />
      </div>
    </ConfigPage>
  );
}
