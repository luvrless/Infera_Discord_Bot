import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Pencil, Plus, Repeat, Sparkles, Trash2 } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "../../components/cards";
import { DiscordMessagePreview } from "../../components/discord/Preview";
import { ChannelName, ChannelPicker, UserChip } from "../../components/ui/pickers";
import { Badge, Button, Card, Checkbox, Field, NativeSelect, TextArea, TextInput, Toggle, Unsupported } from "../../components/ui/primitives";
import { ConfirmDialog, Modal } from "../../components/ui/overlays";
import { EmptyState, ErrorState, SkeletonRows } from "../../components/ui/states";
import { DataTable } from "../../components/ui/table";
import { useToast } from "../../components/ui/toast";
import { errorMessage } from "../../lib/api/client";
import { communityApi, useAutoresponders, useCustomCommands, useSchedules } from "../../lib/api/community";
import { keys } from "../../lib/api/keys";
import type { Autoresponder, CustomCommand, ScheduledMessage } from "../../lib/api/types";
import { LEVEL_NAMES } from "../../lib/api/types";
import { formatDate, formatNumber, timeAgo } from "../../lib/utils";
import { useGuild } from "../../hooks/useGuild";

// ------------------------------------------------------- custom commands

function CommandModal({ command, open, onClose }: { command: CustomCommand | null; open: boolean; onClose: () => void }) {
  const { guildId, values } = useGuild();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState(command?.name ?? "");
  const [description, setDescription] = useState(command?.description ?? "");
  const [response, setResponse] = useState(command?.response ?? "");
  const [embed, setEmbed] = useState(command?.embed ?? false);
  const [level, setLevel] = useState(command?.level ?? 0);
  const [enabled, setEnabled] = useState(command?.enabled ?? true);
  const prefix = String(values["general.prefix"] ?? ".");
  const nameValid = /^[\w-]{1,32}$/.test(name.trim());
  const save = useMutation({
    mutationFn: () =>
      command
        ? communityApi.updateCustomCommand(guildId, command.id, { description, response, embed, level, enabled })
        : communityApi.createCustomCommand(guildId, { name: name.trim().toLowerCase(), description, response, embed, level, enabled }),
    onSuccess: () => {
      toast.success(command ? "Command updated" : "Command created", `Members can use ${prefix}${name.trim().toLowerCase()} now.`);
      void queryClient.invalidateQueries({ queryKey: keys.customCommands(guildId) });
      onClose();
    },
    onError: (error) => toast.error(command ? "Couldn't update the command" : "Couldn't create the command", errorMessage(error)),
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={command ? `Edit ${prefix}${command.name}` : "New custom command"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!nameValid || !response.trim()} loading={save.isPending} onClick={() => save.mutate()}>
            {command ? "Save command" : "Create command"}
          </Button>
        </>
      }
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <Field label="Name" required hint={command ? "Names can't be changed after creation." : "1–32 letters, numbers, dashes or underscores."} error={name && !nameValid ? "Invalid name" : null}>
            <div className="flex items-center">
              <span className="flex h-9 items-center rounded-l-lg border border-r-0 border-ink-600 bg-ink-800 px-2.5 font-mono text-13 text-zinc-500">{prefix}</span>
              <TextInput className="rounded-l-none font-mono" value={name} disabled={Boolean(command)} maxLength={32} onChange={(event) => setName(event.target.value)} placeholder="rules" />
            </div>
          </Field>
          <Field label="Description">
            <TextInput value={description} maxLength={200} onChange={(event) => setDescription(event.target.value)} placeholder="Shows the server rules" />
          </Field>
          <Field label="Response" required hint={`${response.length}/2000`}>
            <TextArea rows={6} maxLength={2000} value={response} onChange={(event) => setResponse(event.target.value)} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Who can use it">
              <NativeSelect value={level} onChange={(event) => setLevel(Number(event.target.value))}>
                {[0, 1, 2, 3, 4, 5].map((value) => (
                  <option key={value} value={value}>
                    {LEVEL_NAMES[value]}+
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <div className="flex flex-col justify-end gap-2 pb-1">
              <Checkbox checked={embed} onChange={setEmbed} label="Reply with an embed" />
              <Checkbox checked={enabled} onChange={setEnabled} label="Enabled" />
            </div>
          </div>
        </div>
        <div>
          <p className="label mb-2">Preview</p>
          <DiscordMessagePreview content={embed ? "" : response} embed={embed ? { description: response } : null} />
        </div>
      </div>
    </Modal>
  );
}

export function CustomCommandsPage() {
  const { guildId, canConfigure, values } = useGuild();
  const commands = useCustomCommands(guildId);
  const queryClient = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState<CustomCommand | null>(null);
  const [creating, setCreating] = useState(false);
  const [remove, setRemove] = useState<CustomCommand | null>(null);
  const prefix = String(values["general.prefix"] ?? ".");
  const toggle = useMutation({
    mutationFn: (command: CustomCommand) => communityApi.updateCustomCommand(guildId, command.id, { enabled: !command.enabled }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: keys.customCommands(guildId) }),
    onError: (error) => toast.error("Couldn't update the command", errorMessage(error)),
  });
  const del = useMutation({
    mutationFn: (id: string) => communityApi.deleteCustomCommand(guildId, id),
    onSuccess: () => {
      toast.success("Command deleted");
      setRemove(null);
      void queryClient.invalidateQueries({ queryKey: keys.customCommands(guildId) });
    },
    onError: (error) => toast.error("Couldn't delete the command", errorMessage(error)),
  });
  return (
    <div>
      <PageHeader
        title="Custom commands"
        icon={Sparkles}
        description="Your own prefix commands that reply with a message you write."
        actions={canConfigure ? <Button variant="primary" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setCreating(true)}>New command</Button> : null}
      />
      <Card>
        {commands.error ? (
          <ErrorState error={commands.error} onRetry={() => void commands.refetch()} />
        ) : (
          <DataTable<CustomCommand>
            loading={commands.isLoading}
            rows={commands.data}
            rowKey={(row) => row.id}
            onRowClick={canConfigure ? (row) => setEditing(row) : undefined}
            empty={<EmptyState icon={Sparkles} title="No custom commands yet" description="Create commands like .rules or .apply with a custom response." action={canConfigure ? <Button variant="primary" onClick={() => setCreating(true)}>Create a command</Button> : undefined} />}
            columns={[
              { id: "name", header: "Command", cell: (row) => <span className="font-mono text-zinc-100">{prefix}{row.name}</span> },
              { id: "response", header: "Response", className: "max-w-[320px]", cell: (row) => <span className="line-clamp-1 text-zinc-400">{row.response}</span> },
              { id: "type", header: "Type", cell: (row) => <Badge>{row.embed ? "embed" : "text"}</Badge> },
              { id: "level", header: "Access", cell: (row) => <span className="text-xs text-zinc-400">{LEVEL_NAMES[row.level]}+</span> },
              { id: "uses", header: "Uses", cell: (row) => formatNumber(row.uses) },
              { id: "enabled", header: "Enabled", cell: (row) => <span onClick={(event) => event.stopPropagation()}><Toggle size="sm" label={`Enable ${row.name}`} checked={row.enabled} disabled={!canConfigure} loading={toggle.isPending && toggle.variables?.id === row.id} onChange={() => toggle.mutate(row)} /></span> },
              {
                id: "actions",
                header: "",
                className: "w-20",
                cell: (row) =>
                  canConfigure ? (
                    <div className="flex justify-end gap-1" onClick={(event) => event.stopPropagation()}>
                      <button type="button" aria-label="Edit" onClick={() => setEditing(row)} className="btn-icon h-7 w-7">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" aria-label="Delete" onClick={() => setRemove(row)} className="btn-icon h-7 w-7 hover:text-red-400">
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
        <Unsupported title="Triggers, variables, cooldowns and channel/role restrictions">
          The custom command engine supports a name, a text or embed response and a minimum permission level. Advanced triggers and per-channel restrictions need backend support.
        </Unsupported>
      </div>
      <CommandModal key={editing?.id ?? (creating ? "new" : "closed")} command={editing} open={creating || Boolean(editing)} onClose={() => { setCreating(false); setEditing(null); }} />
      <ConfirmDialog open={Boolean(remove)} onClose={() => setRemove(null)} onConfirm={() => remove && del.mutate(remove.id)} loading={del.isPending} title={`Delete ${prefix}${remove?.name}?`} confirmLabel="Delete command" />
    </div>
  );
}

// -------------------------------------------------------- autoresponders

function ResponderModal({ responder, open, onClose }: { responder: Autoresponder | null; open: boolean; onClose: () => void }) {
  const { guildId } = useGuild();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [trigger, setTrigger] = useState(responder?.trigger ?? "");
  const [matchType, setMatchType] = useState<Autoresponder["matchType"]>(responder?.matchType ?? "contains");
  const [response, setResponse] = useState(responder?.response ?? "");
  const [enabled, setEnabled] = useState(responder?.enabled ?? true);
  const save = useMutation({
    mutationFn: () => (responder ? communityApi.updateAutoresponder(guildId, responder.id, { trigger, matchType, response, enabled }) : communityApi.createAutoresponder(guildId, { trigger, matchType, response, enabled })),
    onSuccess: () => {
      toast.success(responder ? "Auto responder updated" : "Auto responder created");
      void queryClient.invalidateQueries({ queryKey: keys.autoresponders(guildId) });
      onClose();
    },
    onError: (error) => toast.error("Couldn't save the auto responder", errorMessage(error)),
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={responder ? "Edit auto responder" : "New auto responder"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!trigger.trim() || !response.trim()} loading={save.isPending} onClick={() => save.mutate()}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-[1fr_150px]">
          <Field label="Trigger" required>
            <TextInput value={trigger} maxLength={200} onChange={(event) => setTrigger(event.target.value)} placeholder="how do i apply" />
          </Field>
          <Field label="Match">
            <NativeSelect value={matchType} onChange={(event) => setMatchType(event.target.value as Autoresponder["matchType"])}>
              <option value="contains">Contains</option>
              <option value="exact">Exact message</option>
              <option value="starts_with">Starts with</option>
            </NativeSelect>
          </Field>
        </div>
        <Field label="Response" required hint={`${response.length}/2000`}>
          <TextArea rows={4} maxLength={2000} value={response} onChange={(event) => setResponse(event.target.value)} />
        </Field>
        <Checkbox checked={enabled} onChange={setEnabled} label="Enabled" />
      </div>
    </Modal>
  );
}

export function AutorespondersPage() {
  const { guildId, canConfigure } = useGuild();
  const responders = useAutoresponders(guildId);
  const queryClient = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState<Autoresponder | null>(null);
  const [creating, setCreating] = useState(false);
  const [remove, setRemove] = useState<Autoresponder | null>(null);
  const toggle = useMutation({
    mutationFn: (row: Autoresponder) => communityApi.updateAutoresponder(guildId, row.id, { enabled: !row.enabled }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: keys.autoresponders(guildId) }),
    onError: (error) => toast.error("Couldn't update the auto responder", errorMessage(error)),
  });
  const del = useMutation({
    mutationFn: (id: string) => communityApi.deleteAutoresponder(guildId, id),
    onSuccess: () => {
      toast.success("Auto responder deleted");
      setRemove(null);
      void queryClient.invalidateQueries({ queryKey: keys.autoresponders(guildId) });
    },
    onError: (error) => toast.error("Couldn't delete the auto responder", errorMessage(error)),
  });
  return (
    <div>
      <PageHeader title="Auto responders" icon={Repeat} description="Reply automatically when a message matches a trigger." actions={canConfigure ? <Button variant="primary" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setCreating(true)}>New responder</Button> : null} />
      <Card>
        {responders.error ? (
          <ErrorState error={responders.error} onRetry={() => void responders.refetch()} />
        ) : (
          <DataTable<Autoresponder>
            loading={responders.isLoading}
            rows={responders.data}
            rowKey={(row) => row.id}
            onRowClick={canConfigure ? (row) => setEditing(row) : undefined}
            empty={<EmptyState icon={Repeat} title="No auto responders yet" description="Answer common questions automatically." action={canConfigure ? <Button variant="primary" onClick={() => setCreating(true)}>Create one</Button> : undefined} />}
            columns={[
              { id: "trigger", header: "Trigger", cell: (row) => <span className="font-mono text-xs text-zinc-100">{row.trigger}</span> },
              { id: "match", header: "Match", cell: (row) => <Badge>{row.matchType.replace("_", " ")}</Badge> },
              { id: "response", header: "Response", className: "max-w-[320px]", cell: (row) => <span className="line-clamp-1 text-zinc-400">{row.response}</span> },
              { id: "uses", header: "Uses", cell: (row) => formatNumber(row.uses) },
              { id: "enabled", header: "Enabled", cell: (row) => <span onClick={(event) => event.stopPropagation()}><Toggle size="sm" label="Enabled" checked={row.enabled} disabled={!canConfigure} onChange={() => toggle.mutate(row)} /></span> },
              {
                id: "actions",
                header: "",
                className: "w-12",
                cell: (row) =>
                  canConfigure ? (
                    <button type="button" aria-label="Delete" onClick={(event) => { event.stopPropagation(); setRemove(row); }} className="btn-icon h-7 w-7 hover:text-red-400">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  ) : null,
              },
            ]}
          />
        )}
      </Card>
      <ResponderModal key={editing?.id ?? (creating ? "new" : "closed")} responder={editing} open={creating || Boolean(editing)} onClose={() => { setCreating(false); setEditing(null); }} />
      <ConfirmDialog open={Boolean(remove)} onClose={() => setRemove(null)} onConfirm={() => remove && del.mutate(remove.id)} loading={del.isPending} title="Delete this auto responder?" confirmLabel="Delete" />
    </div>
  );
}

// -------------------------------------------------------------- schedules

function toLocalInput(date: Date): string {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

export function SchedulesPage() {
  const { guildId, canConfigure, values } = useGuild();
  const schedules = useSchedules(guildId);
  const queryClient = useQueryClient();
  const toast = useToast();
  const [channelId, setChannelId] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [runAt, setRunAt] = useState(() => toLocalInput(new Date(Date.now() + 60 * 60_000)));
  const [remove, setRemove] = useState<ScheduledMessage | null>(null);
  const when = new Date(runAt);
  const timeInvalid = Number.isNaN(when.getTime()) || when.getTime() < Date.now() + 60_000 || when.getTime() > Date.now() + 365 * 86_400_000;
  const create = useMutation({
    mutationFn: () => communityApi.createSchedule(guildId, { channelId: channelId!, content: content.trim(), runAt: when.toISOString() }),
    onSuccess: () => {
      toast.success("Message scheduled", `It will be posted ${formatDate(when)}.`);
      setContent("");
      void queryClient.invalidateQueries({ queryKey: keys.schedules(guildId) });
    },
    onError: (error) => toast.error("Couldn't schedule the message", errorMessage(error)),
  });
  const del = useMutation({
    mutationFn: (id: string) => communityApi.deleteSchedule(guildId, id),
    onSuccess: () => {
      toast.success("Scheduled message cancelled");
      setRemove(null);
      void queryClient.invalidateQueries({ queryKey: keys.schedules(guildId) });
    },
    onError: (error) => toast.error("Couldn't cancel it", errorMessage(error)),
  });
  return (
    <div>
      <PageHeader title="Schedules" icon={CalendarClock} description={`One-off messages posted by the INFERA worker. Times use your browser's timezone; the server timezone is ${String(values["general.timezone"] ?? "UTC")}.`} />
      <div className="grid gap-4 xl:grid-cols-[1fr_1.3fr]">
        {canConfigure ? (
          <Card className="space-y-4 p-5">
            <p className="text-sm font-semibold text-zinc-100">Schedule a message</p>
            <Field label="Channel" required>
              <ChannelPicker value={channelId} onChange={setChannelId} />
            </Field>
            <Field label="Post at" required error={timeInvalid ? "Pick a time between 1 minute and 1 year from now" : null}>
              <TextInput type="datetime-local" value={runAt} onChange={(event) => setRunAt(event.target.value)} invalid={timeInvalid} />
            </Field>
            <Field label="Message" required hint={`${content.length}/2000`}>
              <TextArea rows={5} maxLength={2000} value={content} onChange={(event) => setContent(event.target.value)} />
            </Field>
            <div className="flex justify-end">
              <Button variant="primary" icon={<CalendarClock className="h-3.5 w-3.5" />} disabled={!channelId || !content.trim() || timeInvalid} loading={create.isPending} onClick={() => create.mutate()}>
                Schedule
              </Button>
            </div>
            <p className="hint">Recurring schedules and embeds aren't supported by the schedule API.</p>
          </Card>
        ) : null}
        <Card>
          <div className="border-b border-ink-700 px-5 py-4">
            <p className="text-sm font-semibold text-zinc-100">Upcoming</p>
          </div>
          {schedules.isLoading ? (
            <SkeletonRows className="p-4" rows={3} />
          ) : schedules.error ? (
            <ErrorState error={schedules.error} compact onRetry={() => void schedules.refetch()} />
          ) : (schedules.data ?? []).length === 0 ? (
            <EmptyState compact icon={CalendarClock} title="Nothing scheduled" />
          ) : (
            <ul className="divide-y divide-ink-700/60">
              {(schedules.data ?? []).map((task) => (
                <li key={task.id} className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    <ChannelName id={task.channelId} />
                    <span className="text-xs text-zinc-500">{task.runAt ? `${formatDate(task.runAt)} · ${timeAgo(task.runAt)}` : "—"}</span>
                    <span className="ml-auto flex items-center gap-2">
                      <UserChip userId={task.userId} size={16} className="text-xs" />
                      {canConfigure ? (
                        <button type="button" aria-label="Cancel scheduled message" onClick={() => setRemove(task)} className="btn-icon h-7 w-7 hover:text-red-400">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </span>
                  </div>
                  <p className="mt-1.5 line-clamp-2 whitespace-pre-wrap text-13 text-zinc-300">{task.content}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <ConfirmDialog open={Boolean(remove)} onClose={() => setRemove(null)} onConfirm={() => remove && del.mutate(remove.id)} loading={del.isPending} title="Cancel this scheduled message?" confirmLabel="Cancel message" />
    </div>
  );
}
