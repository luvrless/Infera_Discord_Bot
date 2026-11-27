import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FlaskConical, Save, ShieldAlert, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { PageHeader } from "../../components/cards";
import { ConfigPage, SettingsSection } from "../../components/config/engine";
import { Badge, Button, Callout, Card, CardHeader, Field, NativeSelect, TagInput, TextArea, TextInput, Toggle, Unsupported } from "../../components/ui/primitives";
import { EmptyState, ErrorState, PageSkeleton } from "../../components/ui/states";
import { useToast } from "../../components/ui/toast";
import { errorMessage } from "../../lib/api/client";
import { guildApi, invalidateConfig } from "../../lib/api/guilds";
import { keys } from "../../lib/api/keys";
import { moderationApi, useAutomod } from "../../lib/api/moderation";
import type { AutomodRule, AutomodTestResult } from "../../lib/api/types";
import { cn } from "../../lib/utils";
import { useGuild } from "../../hooks/useGuild";
import { ActionBadge } from "./Moderation";

const LIMITS: Record<string, { threshold?: [number, number, string]; window?: [number, number] }> = {
  anti_spam: { threshold: [2, 50, "messages"], window: [1, 300] },
  anti_caps: { threshold: [10, 100, "% capitals"] },
};

function RuleCard({ rule, actions, masterOn }: { rule: AutomodRule; actions: string[]; masterOn: boolean }) {
  const { guildId, canConfigure } = useGuild();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [action, setAction] = useState(rule.action ?? "delete");
  const [threshold, setThreshold] = useState(rule.threshold ?? 0);
  const [windowSeconds, setWindowSeconds] = useState(rule.windowSeconds ?? 0);
  const [list, setList] = useState<string[]>(rule.list ?? []);
  useEffect(() => {
    setAction(rule.action ?? "delete");
    setThreshold(rule.threshold ?? 0);
    setWindowSeconds(rule.windowSeconds ?? 0);
    setList(rule.list ?? []);
  }, [rule]);

  const update = useMutation({
    mutationFn: (body: Parameters<typeof moderationApi.updateRule>[2]) => moderationApi.updateRule(guildId, rule.type, body),
    onSuccess: (_data, body) => {
      void queryClient.invalidateQueries({ queryKey: keys.automod(guildId) });
      void queryClient.invalidateQueries({ queryKey: keys.settings(guildId) });
      toast.success(typeof body.enabled === "boolean" && Object.keys(body).length === 1 ? `${rule.label} ${body.enabled ? "enabled" : "disabled"}` : `${rule.label} saved`);
    },
    onError: (error) => toast.error(`Couldn't update ${rule.label}`, errorMessage(error)),
  });

  const limits = LIMITS[rule.type];
  const dirty =
    (rule.supports.action && action !== rule.action) ||
    (rule.supports.threshold && threshold !== rule.threshold) ||
    (rule.supports.window && windowSeconds !== rule.windowSeconds) ||
    (rule.supports.list && JSON.stringify(list) !== JSON.stringify(rule.list ?? []));
  const thresholdInvalid = Boolean(limits?.threshold && (threshold < limits.threshold[0] || threshold > limits.threshold[1]));
  const windowInvalid = Boolean(limits?.window && (windowSeconds < limits.window[0] || windowSeconds > limits.window[1]));
  const hasSettings = rule.supports.action || rule.supports.threshold || rule.supports.window || rule.supports.list;

  return (
    <Card className={cn("flex flex-col", !rule.enabled && "opacity-90")}>
      <div className="flex items-start gap-3 p-4">
        <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border", rule.enabled && masterOn ? "border-accent/30 bg-accent/10 text-accent-soft" : "border-ink-600 bg-ink-800 text-zinc-500")}>
          <ShieldAlert className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-zinc-100">{rule.label}</p>
            {rule.enabled && !masterOn ? <Badge tone="warning">paused</Badge> : null}
          </div>
          <p className="mt-0.5 text-xs text-zinc-500">{rule.description}</p>
        </div>
        <Toggle label={`Enable ${rule.label}`} checked={rule.enabled} disabled={!canConfigure} loading={update.isPending && update.variables?.enabled !== undefined} onChange={(enabled) => update.mutate({ enabled })} />
      </div>
      {hasSettings ? (
        <div className="space-y-3 border-t border-ink-700 p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            {rule.supports.action ? (
              <Field label="Action">
                <NativeSelect value={action} disabled={!canConfigure} onChange={(event) => setAction(event.target.value)}>
                  {actions.map((entry) => (
                    <option key={entry} value={entry}>
                      {entry === "delete" ? "Delete message" : entry}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            ) : null}
            {rule.supports.threshold ? (
              <Field label={`Threshold${limits?.threshold ? ` (${limits.threshold[2]})` : ""}`} error={thresholdInvalid && limits?.threshold ? `${limits.threshold[0]}–${limits.threshold[1]}` : null}>
                <TextInput type="number" value={threshold} disabled={!canConfigure} invalid={thresholdInvalid} onChange={(event) => setThreshold(Number(event.target.value))} />
              </Field>
            ) : null}
            {rule.supports.window ? (
              <Field label="Window (seconds)" error={windowInvalid && limits?.window ? `${limits.window[0]}–${limits.window[1]}` : null}>
                <TextInput type="number" value={windowSeconds} disabled={!canConfigure} invalid={windowInvalid} onChange={(event) => setWindowSeconds(Number(event.target.value))} />
              </Field>
            ) : null}
          </div>
          {!rule.supports.action ? <p className="text-2xs text-zinc-600">This rule always deletes the matching message.</p> : null}
          {rule.supports.list ? (
            <Field label={rule.type === "regex" ? "Patterns" : "Blocked words"} hint={rule.type === "regex" ? "JavaScript regular expressions, matched case-insensitively." : "Matched case-insensitively anywhere in a message."}>
              <TagInput
                value={list}
                onChange={setList}
                disabled={!canConfigure}
                placeholder={rule.type === "regex" ? "e.g. free\\s+nitro" : "Add a word and press Enter"}
                validate={
                  rule.type === "regex"
                    ? (entry) => {
                        try {
                          new RegExp(entry, "i");
                          return null;
                        } catch {
                          return "Invalid regular expression";
                        }
                      }
                    : undefined
                }
              />
            </Field>
          ) : null}
          {dirty ? (
            <div className="flex justify-end gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setAction(rule.action ?? "delete");
                  setThreshold(rule.threshold ?? 0);
                  setWindowSeconds(rule.windowSeconds ?? 0);
                  setList(rule.list ?? []);
                }}
              >
                Discard
              </Button>
              <Button
                size="sm"
                variant="primary"
                icon={<Save className="h-3.5 w-3.5" />}
                loading={update.isPending}
                disabled={thresholdInvalid || windowInvalid}
                onClick={() =>
                  update.mutate({
                    ...(rule.supports.action ? { action } : {}),
                    ...(rule.supports.threshold ? { threshold } : {}),
                    ...(rule.supports.window ? { windowSeconds } : {}),
                    ...(rule.supports.list ? { list } : {}),
                  })
                }
              >
                Save rule
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}

function Tester() {
  const { guildId, canConfigure } = useGuild();
  const toast = useToast();
  const [content, setContent] = useState("");
  const [result, setResult] = useState<AutomodTestResult | null>(null);
  const test = useMutation({
    mutationFn: () => moderationApi.testAutomod(guildId, content),
    onSuccess: setResult,
    onError: (error) => toast.error("The test couldn't run", errorMessage(error)),
  });
  return (
    <Card>
      <div id="test" />
      <CardHeader title="Rule tester" description="Runs sample text through this server's saved rules on the backend. Nothing is posted or punished." icon={<FlaskConical className="h-4 w-4" />} />
      <div className="space-y-3 p-5">
        <TextArea rows={3} value={content} maxLength={2000} onChange={(event) => setContent(event.target.value)} placeholder="Paste a message to test, e.g. FREE NITRO at discord.gg/abc" />
        <div className="flex justify-end">
          <Button variant="primary" icon={<FlaskConical className="h-3.5 w-3.5" />} loading={test.isPending} disabled={!content.trim() || !canConfigure} onClick={() => test.mutate()}>
            Run test
          </Button>
        </div>
        {result ? (
          result.matches.length === 0 ? (
            <Callout tone="success" title="No rules matched">
              This message would be allowed ({result.tested} characters checked).
            </Callout>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-zinc-400">
                {result.matches.length} rule{result.matches.length === 1 ? "" : "s"} matched. The first match decides the action.
              </p>
              {result.matches.map((match, index) => (
                <div key={`${match.rule}-${index}`} className="flex items-center gap-3 rounded-lg border border-ink-700 bg-ink-900 px-3 py-2">
                  <ShieldAlert className="h-4 w-4 text-amber-400" />
                  <span className="flex-1">
                    <span className="block text-13 text-zinc-100">{match.label}</span>
                    <span className="block text-xs text-zinc-500">{match.reason}</span>
                  </span>
                  <ActionBadge type={match.action === "delete" ? "purge" : match.action} />
                </div>
              ))}
            </div>
          )
        ) : null}
      </div>
    </Card>
  );
}

export function AutomodPage() {
  const { guildId, canConfigure, modules } = useGuild();
  const automod = useAutomod(guildId);
  const queryClient = useQueryClient();
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const masterOn = modules.find((module) => module.id === "automod")?.enabled ?? Boolean(automod.data?.enabled);

  if (automod.isLoading) return <PageSkeleton />;
  if (automod.error || !automod.data) return <ErrorState error={automod.error} onRetry={() => void automod.refetch()} />;
  const active = automod.data.rules.filter((rule) => rule.enabled).length;

  return (
    <ConfigPage>
      <PageHeader
        title="AutoMod"
        icon={ShieldAlert}
        description="Rules the bot applies to every message in real time."
        meta={<Badge tone={masterOn ? "success" : "neutral"} dot>{masterOn ? `${active} of ${automod.data.rules.length} rules active` : "AutoMod is off"}</Badge>}
        actions={
          <div className="flex items-center gap-2.5 rounded-lg border border-ink-700 bg-ink-850 px-3 py-1.5">
            <span className="text-13 text-zinc-300">AutoMod engine</span>
            <Toggle
              label="AutoMod engine"
              checked={masterOn}
              loading={pending}
              disabled={!canConfigure}
              onChange={async (enabled) => {
                setPending(true);
                try {
                  await guildApi.setModule(guildId, "automod", enabled);
                  invalidateConfig(queryClient, guildId);
                  toast.success(`AutoMod ${enabled ? "enabled" : "disabled"}`);
                } catch (error) {
                  toast.error("Couldn't change AutoMod", errorMessage(error));
                } finally {
                  setPending(false);
                }
              }}
            />
          </div>
        }
      />
      {!masterOn ? (
        <Callout tone="warning" className="mb-4" title="AutoMod is switched off">
          Individual rules keep their settings but none of them run until the engine is enabled.
        </Callout>
      ) : null}
      {automod.data.rules.length === 0 ? (
        <Card>
          <EmptyState icon={ShieldCheck} title="No AutoMod rules available" />
        </Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          {automod.data.rules.map((rule) => (
            <RuleCard key={rule.type} rule={rule} actions={automod.data.actions} masterOn={masterOn} />
          ))}
        </div>
      )}
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Tester />
        <div className="space-y-4">
          <SettingsSection id="automod-exempt" title="Exemptions" description="Applied to every AutoMod rule." icon={<ShieldCheck className="h-4 w-4" />} configKeys={["automod.exempt_roles", "automod.exempt_channels"]} />
          <Unsupported title="Not available in the AutoMod backend yet">
            Per-rule exemptions, exempt users, custom responses, per-rule logging, priorities, escalation, and the anti-flood, duplicate-message, suspicious-attachment and account-age rules. Account age is enforced by Antiraid under Security.
          </Unsupported>
        </div>
      </div>
    </ConfigPage>
  );
}
