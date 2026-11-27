import { useMutation } from "@tanstack/react-query";
import { Hash, MessageSquare, Mic, Plug, ScrollText, Send, Shield, ShieldAlert, UserCog, Users, type LucideIcon } from "lucide-react";
import { PageHeader } from "../../components/cards";
import { ConfigPage, useConfigDraft, useRegisterDraft } from "../../components/config/engine";
import { ChannelPicker } from "../../components/ui/pickers";
import { Badge, Button, Callout, Card, CardHeader, Field, Toggle, Unsupported } from "../../components/ui/primitives";
import { useToast } from "../../components/ui/toast";
import { errorMessage } from "../../lib/api/client";
import { guildApi } from "../../lib/api/guilds";
import { cn } from "../../lib/utils";
import { useGuild } from "../../hooks/useGuild";

const CATEGORIES: Array<{ key: string; label: string; description: string; icon: LucideIcon; covers: string[] }> = [
  { key: "logging.message_events", label: "Message events", description: "Edits, deletions and bulk deletions.", icon: MessageSquare, covers: ["Message edited", "Message deleted", "Bulk delete"] },
  { key: "logging.member_events", label: "Member events", description: "Joins, leaves and member updates.", icon: Users, covers: ["Member joined", "Member left", "Nickname / roles changed"] },
  { key: "logging.role_events", label: "Role events", description: "Role creation, deletion and edits.", icon: UserCog, covers: ["Role created", "Role deleted", "Role updated"] },
  { key: "logging.channel_events", label: "Channel events", description: "Channel creation, deletion and edits.", icon: Hash, covers: ["Channel created", "Channel deleted", "Channel updated"] },
  { key: "logging.voice_events", label: "Voice events", description: "Joins, leaves and moves between voice channels.", icon: Mic, covers: ["Joined voice", "Left voice", "Moved"] },
  { key: "logging.moderation_events", label: "Moderation", description: "Bans, kicks, timeouts, warnings and purges.", icon: Shield, covers: ["Cases created", "Warnings", "Purges"] },
  { key: "logging.security_events", label: "Security", description: "Antinuke, antiraid and lockdown activity.", icon: ShieldAlert, covers: ["Antinuke triggers", "Raid detection", "Lockdowns"] },
  { key: "logging.integration_events", label: "Integration events", description: "Integration and webhook activity.", icon: Plug, covers: ["Integration changes"] },
];

const KEYS = ["logging.enabled", "logging.channel_id", ...CATEGORIES.map((category) => category.key)];

export function LoggingPage() {
  return (
    <ConfigPage>
      <PageHeader title="Logs" icon={ScrollText} description="Choose what INFERA records and where log entries are posted." />
      <LoggingEditor />
    </ConfigPage>
  );
}

function LoggingEditor() {
  const { guildId, canConfigure } = useGuild();
  const draft = useConfigDraft(KEYS);
  useRegisterDraft("logging", draft);
  const toast = useToast();
  const enabled = Boolean(draft.values["logging.enabled"]);
  const channelId = (draft.values["logging.channel_id"] as string | null) ?? null;
  const active = CATEGORIES.filter((category) => draft.values[category.key]).length;

  const test = useMutation({
    mutationFn: () =>
      guildApi.testMessage(guildId, {
        channelId: channelId!,
        message: "",
        embed: { enabled: true, title: "INFERA logging test", description: "If you can read this, INFERA can post log entries in this channel.", color: "#8B5CF6" },
      }),
    onSuccess: () => toast.success("Test log entry sent", "Check the log channel in Discord."),
    onError: (error) => toast.error("Couldn't post to the log channel", errorMessage(error)),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Log destination"
          description="All enabled categories are sent to this channel."
          icon={<ScrollText className="h-4 w-4" />}
          action={<Toggle label="Enable logging" checked={enabled} disabled={!canConfigure} onChange={(value) => draft.set("logging.enabled", value)} />}
        />
        <div className="space-y-4 p-5">
          <div id="test" className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Field label="Log channel" error={draft.errors["logging.channel_id"]}>
                <ChannelPicker value={channelId} onChange={(value) => draft.set("logging.channel_id", value)} disabled={!canConfigure} />
              </Field>
            </div>
            <Button icon={<Send className="h-3.5 w-3.5" />} disabled={!channelId || !canConfigure} loading={test.isPending} onClick={() => test.mutate()}>
              Send test entry
            </Button>
          </div>
          {enabled && !channelId ? <Callout tone="warning">Logging is enabled but no channel is set, so nothing is posted.</Callout> : null}
          {!enabled ? <Callout tone="neutral">Logging is off. Category switches below are kept for when you turn it on.</Callout> : null}
        </div>
      </Card>

      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-zinc-100">Event categories</p>
        <Badge tone={active ? "success" : "neutral"}>{active} of {CATEGORIES.length} enabled</Badge>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {CATEGORIES.map((category) => {
          const on = Boolean(draft.values[category.key]);
          const dirty = draft.dirtyKeys.includes(category.key);
          return (
            <div key={category.key} className={cn("card p-4", on && enabled && "border-ink-600")}>
              <div className="flex items-start justify-between gap-3">
                <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg border", on ? "border-accent/30 bg-accent/10 text-accent-soft" : "border-ink-600 bg-ink-800 text-zinc-500")}>
                  <category.icon className="h-4 w-4" />
                </div>
                <Toggle label={category.label} checked={on} disabled={!canConfigure} onChange={(value) => draft.set(category.key, value)} />
              </div>
              <p className="mt-3 flex items-center gap-2 text-13 font-medium text-zinc-100">
                {category.label}
                {dirty ? <span className="h-1.5 w-1.5 rounded-full bg-amber-400" /> : null}
              </p>
              <p className="mt-0.5 text-xs text-zinc-500">{category.description}</p>
              <ul className="mt-3 space-y-0.5 text-2xs text-zinc-600">
                {category.covers.map((entry) => (
                  <li key={entry}>· {entry}</li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      <Unsupported title="Per-category channels and recent log history">
        The backend sends every category to one channel and doesn't store a history of posted log entries. Recorded moderation and configuration history is available under Activity and Audit Log.
      </Unsupported>
    </div>
  );
}
