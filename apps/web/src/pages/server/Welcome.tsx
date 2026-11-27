import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Braces, Heart, ImageIcon, LogOut, Mail, Send, ShieldAlert, UserPlus } from "lucide-react";
import { useEffect, useRef, useState, type RefObject } from "react";
import { PageHeader } from "../../components/cards";
import { ConfigPage, ConfigRow, useConfigDraft, useRegisterDraft, type ConfigDraft } from "../../components/config/engine";
import { DiscordMessagePreview, previewSubstitutions } from "../../components/discord/Preview";
import { ChannelPicker, MultiRolePicker } from "../../components/ui/pickers";
import { Badge, Button, Callout, Card, CardHeader, ColorInput, Field, TextArea, TextInput, Toggle, Unsupported, useClickOutside } from "../../components/ui/primitives";
import { useToast } from "../../components/ui/toast";
import { errorMessage } from "../../lib/api/client";
import { guildApi, useRoles } from "../../lib/api/guilds";
import { communityApi, useAutoroles } from "../../lib/api/community";
import { keys } from "../../lib/api/keys";
import { useAuth } from "../../hooks/useAuth";
import { useGuild } from "../../hooks/useGuild";

const WELCOME_KEYS = [
  "welcome.enabled",
  "welcome.channel_id",
  "welcome.message",
  "welcome.embed.enabled",
  "welcome.embed.title",
  "welcome.embed.description",
  "welcome.embed.color",
  "welcome.image.enabled",
  "welcome.dm.enabled",
  "welcome.dm.message",
] as const;

const GOODBYE_KEYS = ["goodbye.enabled", "goodbye.channel_id", "goodbye.message", "goodbye.embed.enabled", "goodbye.embed.color"] as const;

function usePlaceholders() {
  const { guildId } = useGuild();
  return useQuery({
    queryKey: keys.welcome(guildId),
    queryFn: ({ signal }) => guildApi.welcome(guildId, signal),
    select: (data) => data.placeholders,
    staleTime: 5 * 60_000,
  });
}

function VariableMenu({ targetRef, onInsert, disabled }: { targetRef: RefObject<HTMLTextAreaElement | HTMLInputElement>; onInsert: (next: string) => void; disabled?: boolean }) {
  const placeholders = usePlaceholders();
  const [open, setOpen] = useState(false);
  const ref = useClickOutside<HTMLDivElement>(open, () => setOpen(false));
  const insert = (token: string) => {
    const element = targetRef.current;
    if (!element) return;
    const start = element.selectionStart ?? element.value.length;
    const end = element.selectionEnd ?? element.value.length;
    const next = element.value.slice(0, start) + token + element.value.slice(end);
    onInsert(next);
    setOpen(false);
    window.setTimeout(() => {
      element.focus();
      element.setSelectionRange(start + token.length, start + token.length);
    }, 0);
  };
  return (
    <div ref={ref} className="relative">
      <button type="button" disabled={disabled} onClick={() => setOpen((value) => !value)} className="btn-ghost btn-sm">
        <Braces className="h-3.5 w-3.5" /> Insert variable
      </button>
      {open ? (
        <div className="absolute right-0 z-40 mt-1 w-56 overflow-hidden rounded-lg border border-ink-600 bg-ink-800 p-1 shadow-pop">
          {(placeholders.data ?? []).map((token) => (
            <button key={token} type="button" onClick={() => insert(token)} className="block w-full rounded-md px-2.5 py-1.5 text-left font-mono text-xs text-zinc-300 hover:bg-ink-700 hover:text-zinc-100">
              {token}
            </button>
          ))}
          {placeholders.isLoading ? <p className="px-2.5 py-2 text-xs text-zinc-500">Loading…</p> : null}
        </div>
      ) : null}
    </div>
  );
}

function MessageEditor({
  draft,
  messageKey,
  label,
  disabled,
}: {
  draft: ConfigDraft;
  messageKey: string;
  label: string;
  disabled: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const value = String(draft.values[messageKey] ?? "");
  return (
    <Field
      label={label}
      error={draft.errors[messageKey]}
      aside={<VariableMenu targetRef={ref} disabled={disabled} onInsert={(next) => draft.set(messageKey, next)} />}
      hint={`${value.length}/2000 characters · Discord markdown supported`}
    >
      <TextArea ref={ref} rows={4} value={value} maxLength={2000} disabled={disabled} onChange={(event) => draft.set(messageKey, event.target.value)} />
    </Field>
  );
}

function TestSender({ kind, draft }: { kind: "welcome" | "goodbye"; draft: ConfigDraft }) {
  const { guildId, canConfigure } = useGuild();
  const toast = useToast();
  const [channelId, setChannelId] = useState<string | null>(null);
  const configured = (draft.values[`${kind}.channel_id`] as string | null) ?? null;
  useEffect(() => setChannelId((current) => current ?? configured), [configured]);
  const send = useMutation({
    mutationFn: () =>
      guildApi.testMessage(guildId, {
        channelId: channelId!,
        message: String(draft.values[`${kind}.message`] ?? ""),
        embed: {
          enabled: Boolean(draft.values[`${kind}.embed.enabled`]),
          title: kind === "welcome" ? String(draft.values["welcome.embed.title"] ?? "") : undefined,
          // The bot falls back to the message when the embed description is empty.
          description: (kind === "welcome" ? String(draft.values["welcome.embed.description"] ?? "") : "") || undefined,
          color: String(draft.values[`${kind}.embed.color`] ?? "#8B5CF6"),
        },
      }),
    onSuccess: (result) => toast.success("Test message sent", result.messageId ? `Discord accepted message ${result.messageId}.` : undefined),
    onError: (error) => toast.error("Test message failed", errorMessage(error)),
  });
  return (
    <div id={kind === "welcome" ? "test" : undefined} className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <div className="flex-1">
        <Field label="Send a real test to" hint="Uses your unsaved edits and your own account as the sample member.">
          <ChannelPicker value={channelId} onChange={setChannelId} allowClear={false} />
        </Field>
      </div>
      <Button icon={<Send className="h-3.5 w-3.5" />} loading={send.isPending} disabled={!channelId || !canConfigure} onClick={() => send.mutate()}>
        Send test
      </Button>
    </div>
  );
}

export function AutorolesCard() {
  const { guildId, canConfigure } = useGuild();
  const autoroles = useAutoroles(guildId);
  const roles = useRoles(guildId);
  const queryClient = useQueryClient();
  const toast = useToast();
  const [value, setValue] = useState<string[] | null>(null);
  const current = value ?? autoroles.data ?? [];
  const dirty = value !== null && JSON.stringify(value) !== JSON.stringify(autoroles.data ?? []);
  const save = useMutation({
    mutationFn: () => communityApi.setAutoroles(guildId, current),
    onSuccess: (result) => {
      queryClient.setQueryData(keys.autoroles(guildId), { roleIds: result.roleIds });
      void queryClient.invalidateQueries({ queryKey: keys.settings(guildId) });
      setValue(null);
      toast.success("Autoroles saved", `${result.roleIds.length} role${result.roleIds.length === 1 ? "" : "s"} will be granted on join.`);
    },
    onError: (error) => toast.error("Couldn't save autoroles", errorMessage(error)),
  });
  const managed = current.filter((id) => roles.data?.find((role) => role.id === id)?.managed);
  const missing = current.filter((id) => roles.isSuccess && !roles.data?.some((role) => role.id === id));
  return (
    <Card>
      <CardHeader title="Autoroles" description="Roles INFERA grants automatically when a member joins." icon={<UserPlus className="h-4 w-4" />} action={<Badge>{current.length} roles</Badge>} />
      <div className="space-y-3 p-5">
        <MultiRolePicker value={current} onChange={setValue} assignable disabled={!canConfigure} />
        {managed.length > 0 ? <Callout tone="warning">Integration-managed roles can't be assigned by bots and will be skipped.</Callout> : null}
        {missing.length > 0 ? <Callout tone="warning">{missing.length} selected role{missing.length === 1 ? " no longer exists" : "s no longer exist"}. Remove them and save.</Callout> : null}
        <p className="hint">INFERA's highest role must be above every autorole in Server Settings → Roles. Discord rejects the assignment otherwise, and the bot logs it.</p>
        <div className="flex justify-end gap-2">
          {dirty ? (
            <Button variant="ghost" onClick={() => setValue(null)}>
              Discard
            </Button>
          ) : null}
          <Button variant="primary" disabled={!dirty || !canConfigure} loading={save.isPending} onClick={() => save.mutate()}>
            Save autoroles
          </Button>
        </div>
      </div>
    </Card>
  );
}

function WelcomeEditor() {
  const { detail, canConfigure } = useGuild();
  const { user } = useAuth();
  const welcome = useConfigDraft(WELCOME_KEYS);
  const goodbye = useConfigDraft(GOODBYE_KEYS);
  useRegisterDraft("welcome", welcome);
  useRegisterDraft("goodbye", goodbye);
  const subs = previewSubstitutions({
    username: user?.username ?? "member",
    userId: user?.id ?? "0",
    serverName: detail.guild.name,
    memberCount: detail.guild.memberCount,
  });
  const locked = !canConfigure;
  const embedOn = Boolean(welcome.values["welcome.embed.enabled"]);
  const message = String(welcome.values["welcome.message"] ?? "");

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
        <Card>
          <CardHeader
            title="Welcome message"
            description="Sent to the welcome channel when a member joins."
            icon={<Heart className="h-4 w-4" />}
            action={<Toggle label="Enable welcome" checked={Boolean(welcome.values["welcome.enabled"])} disabled={locked} onChange={(value) => welcome.set("welcome.enabled", value)} />}
          />
          <div className="space-y-4 p-5">
            <Field label="Welcome channel" error={welcome.errors["welcome.channel_id"]}>
              <ChannelPicker value={(welcome.values["welcome.channel_id"] as string | null) ?? null} onChange={(value) => welcome.set("welcome.channel_id", value)} disabled={locked} />
            </Field>
            {welcome.values["welcome.enabled"] && !welcome.values["welcome.channel_id"] ? <Callout tone="warning">Welcome is on but no channel is selected, so nothing will be posted.</Callout> : null}
            <MessageEditor draft={welcome} messageKey="welcome.message" label="Message content" disabled={locked} />
            <div className="rounded-lg border border-ink-700 bg-ink-900/50">
              <div className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-13 font-medium text-zinc-200">Send as an embed</p>
                  <p className="text-xs text-zinc-500">Title, description and colour. The joining member's avatar is used as the thumbnail.</p>
                </div>
                <Toggle label="Embed" checked={embedOn} disabled={locked} onChange={(value) => welcome.set("welcome.embed.enabled", value)} />
              </div>
              {embedOn ? (
                <div className="space-y-3 border-t border-ink-700 px-4 py-4">
                  <Field label="Title" error={welcome.errors["welcome.embed.title"]}>
                    <TextInput maxLength={256} value={String(welcome.values["welcome.embed.title"] ?? "")} disabled={locked} onChange={(event) => welcome.set("welcome.embed.title", event.target.value)} />
                  </Field>
                  <MessageEditor draft={welcome} messageKey="welcome.embed.description" label="Description (falls back to the message)" disabled={locked} />
                  <Field label="Colour">
                    <ColorInput value={String(welcome.values["welcome.embed.color"] ?? "#8B5CF6")} disabled={locked} onChange={(value) => welcome.set("welcome.embed.color", value)} />
                  </Field>
                  <Unsupported title="Author, footer, fields, image and timestamp aren't stored">
                    The backend welcome schema supports title, description and colour only.
                  </Unsupported>
                </div>
              ) : null}
            </div>
          </div>
          <div className="border-t border-ink-700 px-5 py-4">
            <TestSender kind="welcome" draft={welcome} />
          </div>
        </Card>

        <div className="space-y-4 xl:sticky xl:top-20 xl:self-start">
          <Card>
            <CardHeader title="Live preview" description="Placeholders filled with your account as a sample member." />
            <div className="p-4">
              <DiscordMessagePreview
                substitutions={subs}
                content={embedOn ? (welcome.values["welcome.embed.description"] ? message : "") : message}
                embed={
                  embedOn
                    ? {
                        color: String(welcome.values["welcome.embed.color"] ?? "#8B5CF6"),
                        title: String(welcome.values["welcome.embed.title"] ?? ""),
                        description: String(welcome.values["welcome.embed.description"] || message),
                        thumbnail: user?.avatarUrl ?? null,
                      }
                    : null
                }
              />
            </div>
          </Card>
          <Card>
            <CardHeader title="Direct message" description="Optionally DM new members privately." icon={<Mail className="h-4 w-4" />} action={<Toggle label="Enable welcome DM" checked={Boolean(welcome.values["welcome.dm.enabled"])} disabled={locked} onChange={(value) => welcome.set("welcome.dm.enabled", value)} />} />
            <div className="p-5">
              <MessageEditor draft={welcome} messageKey="welcome.dm.message" label="DM content" disabled={locked || !welcome.values["welcome.dm.enabled"]} />
              <p className="hint mt-2">Members with DMs closed won't receive it — that's expected and not an error.</p>
            </div>
          </Card>
          <Card>
            <CardHeader title="Welcome image" icon={<ImageIcon className="h-4 w-4" />} />
            <div className="divide-y divide-ink-700/70 px-5">
              <ConfigRow draft={welcome} configKey="welcome.image.enabled" />
            </div>
            <div className="px-5 pb-5">
              <Unsupported title="Welcome card rendering isn't implemented in the bot">
                The <span className="font-mono">welcome.image.enabled</span> setting is stored, but the bot doesn't generate welcome cards yet, and there are no keys for backgrounds, avatar position or text colour.
              </Unsupported>
            </div>
          </Card>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
        <Card>
          <CardHeader
            title="Goodbye message"
            description="Posted when a member leaves the server."
            icon={<LogOut className="h-4 w-4" />}
            action={<Toggle label="Enable goodbye" checked={Boolean(goodbye.values["goodbye.enabled"])} disabled={locked} onChange={(value) => goodbye.set("goodbye.enabled", value)} />}
          />
          <div className="space-y-4 p-5">
            <Field label="Goodbye channel">
              <ChannelPicker value={(goodbye.values["goodbye.channel_id"] as string | null) ?? null} onChange={(value) => goodbye.set("goodbye.channel_id", value)} disabled={locked} />
            </Field>
            <MessageEditor draft={goodbye} messageKey="goodbye.message" label="Message content" disabled={locked} />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Toggle label="Goodbye embed" checked={Boolean(goodbye.values["goodbye.embed.enabled"])} disabled={locked} onChange={(value) => goodbye.set("goodbye.embed.enabled", value)} />
                <span className="text-13 text-zinc-300">Send as an embed</span>
              </div>
              {goodbye.values["goodbye.embed.enabled"] ? <ColorInput value={String(goodbye.values["goodbye.embed.color"] ?? "#8B5CF6")} disabled={locked} onChange={(value) => goodbye.set("goodbye.embed.color", value)} /> : null}
            </div>
          </div>
          <div className="border-t border-ink-700 px-5 py-4">
            <TestSender kind="goodbye" draft={goodbye} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Goodbye preview" />
          <div className="p-4">
            <DiscordMessagePreview
              substitutions={subs}
              content={goodbye.values["goodbye.embed.enabled"] ? "" : String(goodbye.values["goodbye.message"] ?? "")}
              embed={goodbye.values["goodbye.embed.enabled"] ? { color: String(goodbye.values["goodbye.embed.color"] ?? "#8B5CF6"), description: String(goodbye.values["goodbye.message"] ?? "") } : null}
            />
          </div>
        </Card>
      </div>

      <AutorolesCard />
      <p className="flex items-center gap-1.5 text-2xs text-zinc-600">
        <ShieldAlert className="h-3 w-3" /> Test messages are sent by the API through Discord and confirmed with the message ID Discord returns.
      </p>
    </div>
  );
}

export function WelcomePage() {
  return (
    <ConfigPage>
      <PageHeader title="Welcome & Goodbye" icon={Heart} description="Greet members as they join, say goodbye when they leave, and give new members roles automatically." />
      <WelcomeEditor />
    </ConfigPage>
  );
}
