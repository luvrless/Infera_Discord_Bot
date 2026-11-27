import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, MessageSquare, Plus, Trash2, Zap } from "lucide-react";
import { useState } from "react";
import { useGuildData } from "../components/GuildGate";
import { useToast } from "../components/Toast";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Field,
  InfoNote,
  Input,
  Modal,
  PageHeader,
  Select,
  Skeleton,
  Tabs,
  Textarea,
  Toggle,
} from "../components/ui";
import { api } from "../lib/api";
import { useChannels } from "../lib/hooks";
import type { Autoresponder, CustomCommand, ScheduledMessage } from "../lib/types";

type DeleteTarget = { kind: "command" | "autoresponder"; id: string; label: string };

export function AutomationPage() {
  const { guildId } = useGuildData();
  const { push } = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("commands");
  const [commandOpen, setCommandOpen] = useState(false);
  const [autoOpen, setAutoOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [commandForm, setCommandForm] = useState({
    name: "",
    description: "",
    response: "",
    embed: false,
    level: 0,
  });
  const [autoForm, setAutoForm] = useState({ trigger: "", response: "", matchType: "contains" });
  const [scheduleForm, setScheduleForm] = useState({ channelId: "", content: "", runAt: "" });
  const channels = useChannels(guildId);

  const commands = useQuery({
    queryKey: ["custom-commands", guildId],
    queryFn: () => api.get<{ commands: CustomCommand[] }>(`/guilds/${guildId}/custom-commands`),
  });
  const autoresponders = useQuery({
    queryKey: ["autoresponders", guildId],
    queryFn: () => api.get<{ autoresponders: Autoresponder[] }>(`/guilds/${guildId}/autoresponders`),
  });

  const createCommand = useMutation({
    mutationFn: () => api.post(`/guilds/${guildId}/custom-commands`, commandForm),
    onSuccess: () => {
      setCommandOpen(false);
      setCommandForm({ name: "", description: "", response: "", embed: false, level: 0 });
      void queryClient.invalidateQueries({ queryKey: ["custom-commands", guildId] });
      push({ title: "Custom command created", tone: "success" });
    },
    onError: (error) => push({ title: "Could not create command", description: error.message, tone: "error" }),
  });

  const toggleCommand = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      api.patch(`/guilds/${guildId}/custom-commands/${id}`, { enabled }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["custom-commands", guildId] }),
    onError: (error) => push({ title: "Could not update command", description: error.message, tone: "error" }),
  });

  const scheduled = useQuery({
    queryKey: ["scheduled-messages", guildId],
    queryFn: () => api.get<{ messages: ScheduledMessage[] }>(`/guilds/${guildId}/scheduled-messages`),
  });

  const createSchedule = useMutation({
    mutationFn: () =>
      api.post(`/guilds/${guildId}/scheduled-messages`, {
        channelId: scheduleForm.channelId,
        content: scheduleForm.content,
        runAt: new Date(scheduleForm.runAt).toISOString(),
      }),
    onSuccess: () => {
      setScheduleOpen(false);
      setScheduleForm({ channelId: "", content: "", runAt: "" });
      void queryClient.invalidateQueries({ queryKey: ["scheduled-messages", guildId] });
      push({ title: "Message scheduled", tone: "success" });
    },
    onError: (error) => push({ title: "Could not schedule message", description: error.message, tone: "error" }),
  });

  const removeSchedule = useMutation({
    mutationFn: (id: string) => api.del(`/guilds/${guildId}/scheduled-messages/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["scheduled-messages", guildId] });
      push({ title: "Scheduled message cancelled", tone: "success" });
    },
    onError: (error) => push({ title: "Could not cancel message", description: error.message, tone: "error" }),
  });

  const createAutoresponder = useMutation({
    mutationFn: () => api.post(`/guilds/${guildId}/autoresponders`, autoForm),
    onSuccess: () => {
      setAutoOpen(false);
      setAutoForm({ trigger: "", response: "", matchType: "contains" });
      void queryClient.invalidateQueries({ queryKey: ["autoresponders", guildId] });
      push({ title: "Autoresponder created", tone: "success" });
    },
    onError: (error) => push({ title: "Could not create autoresponder", description: error.message, tone: "error" }),
  });

  const toggleAutoresponder = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      api.patch(`/guilds/${guildId}/autoresponders/${id}`, { enabled }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["autoresponders", guildId] }),
    onError: (error) => push({ title: "Could not update autoresponder", description: error.message, tone: "error" }),
  });

  const remove = useMutation({
    mutationFn: (target: DeleteTarget) =>
      target.kind === "command"
        ? api.del(`/guilds/${guildId}/custom-commands/${target.id}`)
        : api.del(`/guilds/${guildId}/autoresponders/${target.id}`),
    onSuccess: () => {
      const target = deleteTarget;
      setDeleteTarget(null);
      void queryClient.invalidateQueries({ queryKey: ["custom-commands", guildId] });
      void queryClient.invalidateQueries({ queryKey: ["autoresponders", guildId] });
      push({ title: target?.kind === "command" ? "Custom command deleted" : "Autoresponder deleted", tone: "success" });
    },
    onError: (error) => push({ title: "Could not delete", description: error.message, tone: "error" }),
  });

  return (
    <div>
      <PageHeader
        title="Automation"
        description="Prefix custom commands and automatic replies, stored per server and executed by the bot."
      />
      <Tabs
        items={[
          { id: "commands", label: "Custom commands", count: commands.data?.commands.length },
          { id: "autoresponders", label: "Autoresponders", count: autoresponders.data?.autoresponders.length },
          { id: "scheduled", label: "Scheduled", count: scheduled.data?.messages.length },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === "commands" ? (
        <Card className="mt-4 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-700 px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-zinc-200">Custom commands</h2>
              <p className="mt-0.5 text-xs text-zinc-500">
                Members run these with the server prefix, for example <code className="text-zinc-400">.rules</code>.
              </p>
            </div>
            <Button variant="primary" onClick={() => setCommandOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> New command
            </Button>
          </div>
          {commands.isLoading ? <Skeleton className="m-4 h-28" /> : null}
          {!commands.isLoading && (commands.data?.commands ?? []).length === 0 ? (
            <EmptyState
              compact
              icon={<MessageSquare className="h-6 w-6" />}
              title="No custom commands"
              description="Add a short response for your most common questions."
            />
          ) : null}
          <div className="divide-y divide-ink-800">
            {(commands.data?.commands ?? []).map((command) => (
              <div key={command.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="rounded bg-ink-800 px-1.5 py-0.5 text-xs text-zinc-300">{command.name}</code>
                    <Badge tone={command.enabled ? "success" : "neutral"}>{command.enabled ? "enabled" : "disabled"}</Badge>
                    {command.level > 0 ? <Badge tone="accent">level {command.level}+</Badge> : null}
                    <span className="text-2xs text-zinc-600">{command.uses} uses</span>
                  </div>
                  <p className="mt-1 line-clamp-2 max-w-2xl text-xs text-zinc-400">{command.response}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Toggle checked={command.enabled} onChange={(enabled) => toggleCommand.mutate({ id: command.id, enabled })} />
                  <Button
                    variant="ghost"
                    aria-label="Delete command"
                    onClick={() => setDeleteTarget({ kind: "command", id: command.id, label: command.name })}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : tab === "autoresponders" ? (
        <Card className="mt-4 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-700 px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-zinc-200">Autoresponders</h2>
              <p className="mt-0.5 text-xs text-zinc-500">Reply automatically when a message matches a trigger.</p>
            </div>
            <Button variant="primary" onClick={() => setAutoOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> New autoresponder
            </Button>
          </div>
          {autoresponders.isLoading ? <Skeleton className="m-4 h-28" /> : null}
          {!autoresponders.isLoading && (autoresponders.data?.autoresponders ?? []).length === 0 ? (
            <EmptyState
              compact
              icon={<Zap className="h-6 w-6" />}
              title="No autoresponders"
              description="Welcome new members or answer FAQs without a command."
            />
          ) : null}
          <div className="divide-y divide-ink-800">
            {(autoresponders.data?.autoresponders ?? []).map((row) => (
              <div key={row.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium text-zinc-200">{row.trigger}</span>
                    <Badge tone="neutral">{row.matchType.replace("_", " ")}</Badge>
                    <Badge tone={row.enabled ? "success" : "neutral"}>{row.enabled ? "enabled" : "disabled"}</Badge>
                    <span className="text-2xs text-zinc-600">{row.uses} replies</span>
                  </div>
                  <p className="mt-1 line-clamp-2 max-w-2xl text-xs text-zinc-400">{row.response}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Toggle checked={row.enabled} onChange={(enabled) => toggleAutoresponder.mutate({ id: row.id, enabled })} />
                  <Button
                    variant="ghost"
                    aria-label="Delete autoresponder"
                    onClick={() => setDeleteTarget({ kind: "autoresponder", id: row.id, label: row.trigger })}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : (
        <Card className="mt-4 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-700 px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-zinc-200">Scheduled messages</h2>
              <p className="mt-0.5 text-xs text-zinc-500">The bot posts these automatically at the chosen time.</p>
            </div>
            <Button
              variant="primary"
              onClick={() => {
                const next = new Date(Date.now() + 60 * 60 * 1000);
                const local = new Date(next.getTime() - next.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
                setScheduleForm({ channelId: "", content: "", runAt: local });
                setScheduleOpen(true);
              }}
            >
              <Plus className="h-3.5 w-3.5" /> Schedule message
            </Button>
          </div>
          {scheduled.isLoading ? <Skeleton className="m-4 h-28" /> : null}
          {!scheduled.isLoading && (scheduled.data?.messages ?? []).length === 0 ? (
            <EmptyState
              compact
              icon={<CalendarClock className="h-6 w-6" />}
              title="Nothing scheduled"
              description="Schedule announcements, reminders or event posts ahead of time."
            />
          ) : null}
          <div className="divide-y divide-ink-800">
            {(scheduled.data?.messages ?? []).map((row) => (
              <div key={row.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium text-zinc-200">#{channels.data?.channels.find((channel) => channel.id === row.channelId)?.name ?? row.channelId}</span>
                    <Badge tone="accent">{row.runAt ? new Date(row.runAt).toLocaleString() : "unknown time"}</Badge>
                  </div>
                  <p className="mt-1 line-clamp-2 max-w-2xl text-xs text-zinc-400">{row.content}</p>
                </div>
                <Button variant="ghost" aria-label="Cancel scheduled message" onClick={() => removeSchedule.mutate(row.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="mt-4">
        <InfoNote>
          Placeholders: <code>{"{user}"}</code> mentions the author, <code>{"{username}"}</code>, <code>{"{server}"}</code> and{" "}
          <code>{"{channel}"}</code> are replaced before sending. Autoresponders do not reply to commands.
        </InfoNote>
      </div>

      <Modal
        open={commandOpen}
        onClose={() => setCommandOpen(false)}
        title="New custom command"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCommandOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => createCommand.mutate()}
              loading={createCommand.isPending}
              disabled={!commandForm.name.trim() || !commandForm.response.trim()}
            >
              Create command
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Name (without prefix)">
            <Input
              value={commandForm.name}
              placeholder="rules"
              onChange={(event) => setCommandForm({ ...commandForm, name: event.target.value })}
            />
          </Field>
          <Field label="Response">
            <Textarea
              value={commandForm.response}
              rows={4}
              placeholder="Read the rules in #rules."
              onChange={(event) => setCommandForm({ ...commandForm, response: event.target.value })}
            />
          </Field>
          <Field label="Description (optional)">
            <Input
              value={commandForm.description}
              onChange={(event) => setCommandForm({ ...commandForm, description: event.target.value })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Required level">
              <Select
                value={String(commandForm.level)}
                onChange={(event) => setCommandForm({ ...commandForm, level: Number(event.target.value) })}
                options={[
                  { value: "0", label: "Everyone" },
                  { value: "1", label: "Trusted" },
                  { value: "2", label: "Moderator" },
                  { value: "3", label: "Administrator" },
                  { value: "4", label: "Server owner" },
                ]}
              />
            </Field>
            <div className="flex items-end pb-2">
              <Toggle
                checked={commandForm.embed}
                onChange={(embed) => setCommandForm({ ...commandForm, embed })}
                label="Send as embed"
              />
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        open={autoOpen}
        onClose={() => setAutoOpen(false)}
        title="New autoresponder"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAutoOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => createAutoresponder.mutate()}
              loading={createAutoresponder.isPending}
              disabled={!autoForm.trigger.trim() || !autoForm.response.trim()}
            >
              Create autoresponder
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Trigger">
            <Input
              value={autoForm.trigger}
              placeholder="how do I verify"
              onChange={(event) => setAutoForm({ ...autoForm, trigger: event.target.value })}
            />
          </Field>
          <Field label="Match">
            <Select
              value={autoForm.matchType}
              onChange={(event) => setAutoForm({ ...autoForm, matchType: event.target.value })}
              options={[
                { value: "contains", label: "Message contains the trigger" },
                { value: "exact", label: "Message matches exactly" },
                { value: "starts_with", label: "Message starts with the trigger" },
              ]}
            />
          </Field>
          <Field label="Response">
            <Textarea
              value={autoForm.response}
              rows={4}
              onChange={(event) => setAutoForm({ ...autoForm, response: event.target.value })}
            />
          </Field>
        </div>
      </Modal>

      <Modal
        open={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        title="Schedule a message"
        footer={
          <>
            <Button variant="secondary" onClick={() => setScheduleOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => createSchedule.mutate()}
              loading={createSchedule.isPending}
              disabled={!scheduleForm.channelId || !scheduleForm.content.trim() || !scheduleForm.runAt}
            >
              Schedule message
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Channel">
            <Select
              value={scheduleForm.channelId}
              onChange={(event) => setScheduleForm({ ...scheduleForm, channelId: event.target.value })}
              placeholder="Choose a channel"
              options={(channels.data?.channels ?? [])
                .filter((channel) => channel.type === 0 || channel.type === 5)
                .map((channel) => ({ value: channel.id, label: `# ${channel.name}` }))}
            />
          </Field>
          <Field label="Send at">
            <Input
              type="datetime-local"
              value={scheduleForm.runAt}
              onChange={(event) => setScheduleForm({ ...scheduleForm, runAt: event.target.value })}
            />
          </Field>
          <Field label="Message">
            <Textarea
              value={scheduleForm.content}
              rows={4}
              placeholder="Announcement text"
              onChange={(event) => setScheduleForm({ ...scheduleForm, content: event.target.value })}
            />
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && remove.mutate(deleteTarget)}
        loading={remove.isPending}
        destructive
        title={deleteTarget?.kind === "command" ? "Delete custom command?" : "Delete autoresponder?"}
        description={`"${deleteTarget?.label ?? ""}" will stop working immediately.`}
        confirmLabel="Delete"
      />
    </div>
  );
}
