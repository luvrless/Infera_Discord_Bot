import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, RotateCcw, Save } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ApiError, errorMessage } from "../../lib/api/client";
import { guildApi, invalidateConfig, useSchema } from "../../lib/api/guilds";
import { keys } from "../../lib/api/keys";
import type { SchemaKey, SettingsResponse } from "../../lib/api/types";
import { cn, formatDuration, keyLabel } from "../../lib/utils";
import { useGuild } from "../../hooks/useGuild";
import { ChannelPicker, MultiChannelPicker, MultiMemberPicker, MultiRolePicker, RolePicker } from "../ui/pickers";
import { Button, ColorInput, NativeSelect, TagInput, TextArea, TextInput, Toggle } from "../ui/primitives";
import { useToast } from "../ui/toast";

// ------------------------------------------------------------ draft state

export interface ConfigDraft {
  values: Record<string, unknown>;
  get: <T = unknown>(key: string) => T;
  set: (key: string, value: unknown) => void;
  dirtyKeys: string[];
  dirty: boolean;
  errors: Record<string, string>;
  saving: boolean;
  save: () => Promise<boolean>;
  reset: () => void;
  conflict: boolean;
  reload: () => void;
  canEdit: boolean;
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Local draft over a set of configuration keys. Saves only changed keys via
 * PATCH /guilds/:id/config with optimistic concurrency (`expectedVersion`).
 */
export function useConfigDraft(configKeys: readonly string[]): ConfigDraft {
  const { guildId, settings, canConfigure } = useGuild();
  const queryClient = useQueryClient();
  const toast = useToast();
  const server = settings?.values ?? {};
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);
  const keyList = configKeys.join("|");

  // Drop draft entries that now match the server (e.g. after a refetch).
  useEffect(() => {
    setDraft((current) => {
      const next: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(current)) if (!same(value, server[key])) next[key] = value;
      return Object.keys(next).length === Object.keys(current).length ? current : next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.version]);

  const values = useMemo(() => {
    const merged: Record<string, unknown> = {};
    for (const key of keyList.split("|")) merged[key] = key in draft ? draft[key] : server[key];
    return merged;
  }, [draft, server, keyList]);

  const dirtyKeys = Object.keys(draft).filter((key) => !same(draft[key], server[key]));

  const set = useCallback((key: string, value: unknown) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }, []);

  const save = useCallback(async () => {
    if (dirtyKeys.length === 0) return true;
    const patch: Record<string, unknown> = {};
    for (const key of dirtyKeys) patch[key] = draft[key];
    setSaving(true);
    setErrors({});
    try {
      const result = await guildApi.patchConfig(guildId, patch, settings?.version);
      queryClient.setQueryData<SettingsResponse>(keys.settings(guildId), (current) =>
        current ? { ...current, values: result.snapshot.values, version: result.snapshot.version, updatedAt: result.snapshot.updatedAt } : current,
      );
      setDraft({});
      invalidateConfig(queryClient, guildId);
      toast.success("Changes saved", `${result.changed.length} setting${result.changed.length === 1 ? "" : "s"} updated. INFERA applies them live.`);
      return true;
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setConflict(true);
        toast.error("Save blocked by a newer change", "Someone else saved this server's settings. Review the latest values, then save again.");
      } else if (error instanceof ApiError && error.issues.length > 0) {
        const next: Record<string, string> = {};
        for (const issue of error.issues) if (issue.key) next[issue.key] = String(issue.message ?? "Invalid value");
        setErrors(next);
        toast.error("Some values are invalid", error);
      } else {
        toast.error("Your changes could not be saved", error);
      }
      return false;
    } finally {
      setSaving(false);
    }
  }, [dirtyKeys, draft, guildId, queryClient, settings?.version, toast]);

  const reload = useCallback(() => {
    setConflict(false);
    void queryClient.invalidateQueries({ queryKey: keys.settings(guildId) });
  }, [guildId, queryClient]);

  return {
    values,
    get: <T,>(key: string) => values[key] as T,
    set,
    dirtyKeys,
    dirty: dirtyKeys.length > 0,
    errors,
    saving,
    save,
    reset: () => {
      setDraft({});
      setErrors({});
    },
    conflict,
    reload,
    canEdit: canConfigure,
  };
}

// --------------------------------------------- shared save bar (one per page)

interface SaveRegistry {
  register: (id: string, ref: { current: ConfigDraft }) => void;
  unregister: (id: string) => void;
  notify: () => void;
}

const SaveBarContext = createContext<SaveRegistry | null>(null);

/** Collects every draft on the page into one sticky "unsaved changes" bar. */
export function ConfigPage({ children }: { children: ReactNode }) {
  const refs = useRef(new Map<string, { current: ConfigDraft }>());
  const [, setTick] = useState(0);
  const registry = useMemo<SaveRegistry>(
    () => ({
      register: (id, ref) => {
        refs.current.set(id, ref);
      },
      unregister: (id) => {
        refs.current.delete(id);
        setTick((value) => value + 1);
      },
      notify: () => setTick((value) => value + 1),
    }),
    [],
  );
  const drafts = Array.from(refs.current.values()).map((ref) => ref.current);
  const dirty = drafts.filter((draft) => draft.dirty);
  const count = dirty.reduce((sum, draft) => sum + draft.dirtyKeys.length, 0);
  const saving = drafts.some((draft) => draft.saving);
  const conflict = drafts.some((draft) => draft.conflict);

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    if (count === 0) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [count]);

  return (
    <SaveBarContext.Provider value={registry}>
      {children}
      {count > 0 || conflict
        ? createPortal(
            <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4 lg:pl-[255px]">
              <div className="pointer-events-auto flex w-full max-w-2xl animate-slide-up items-center gap-3 rounded-xl border border-ink-600 bg-ink-800/95 px-4 py-2.5 shadow-pop backdrop-blur">
                {conflict ? (
                  <>
                    <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
                    <p className="flex-1 text-13 text-zinc-200">This server's settings changed elsewhere. Reload to see the latest values.</p>
                    <Button size="sm" onClick={() => drafts.forEach((draft) => draft.reload())}>
                      Reload
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="h-2 w-2 shrink-0 rounded-full bg-amber-400" />
                    <p className="flex-1 text-13 text-zinc-200">
                      {count} unsaved change{count === 1 ? "" : "s"}
                    </p>
                    <Button size="sm" variant="ghost" icon={<RotateCcw className="h-3.5 w-3.5" />} disabled={saving} onClick={() => dirty.forEach((draft) => draft.reset())}>
                      Discard
                    </Button>
                    <Button
                      size="sm"
                      variant="primary"
                      loading={saving}
                      icon={<Save className="h-3.5 w-3.5" />}
                      onClick={async () => {
                        for (const draft of dirty) {
                          const ok = await draft.save();
                          if (!ok) break;
                        }
                      }}
                    >
                      Save changes
                    </Button>
                  </>
                )}
              </div>
            </div>,
            document.body,
          )
        : null}
    </SaveBarContext.Provider>
  );
}

/** Registers a draft with the page-level save bar. */
export function useRegisterDraft(id: string, draft: ConfigDraft): void {
  const registry = useContext(SaveBarContext);
  const ref = useRef(draft);
  ref.current = draft;
  useEffect(() => {
    registry?.register(id, ref);
    return () => registry?.unregister(id);
  }, [id, registry]);
  const signature = `${draft.dirtyKeys.join(",")}|${draft.saving}|${draft.conflict}`;
  useEffect(() => {
    registry?.notify();
  }, [signature, registry]);
}

// ------------------------------------------------------------ schema field

type Widget =
  | "toggle"
  | "text"
  | "textarea"
  | "number"
  | "duration"
  | "select"
  | "color"
  | "channel"
  | "voice-channel"
  | "category"
  | "role"
  | "roles"
  | "channels"
  | "users"
  | "tags"
  | "json";

export function widgetFor(def: SchemaKey): Widget {
  const key = def.key;
  switch (def.type) {
    case "boolean":
      return "toggle";
    case "enum":
      return "select";
    case "color":
      return "color";
    case "number":
      if (/(seconds|cooldown|duration)$/.test(key) || key.endsWith("window_seconds")) return "duration";
      return "number";
    case "snowflake":
      if (key.includes("category")) return "category";
      if (key.includes("lobby")) return "voice-channel";
      if (key.includes("role")) return "role";
      return "channel";
    case "snowflake[]":
      if (key.includes("channel")) return "channels";
      if (key.includes("role")) return "roles";
      if (key === "security.whitelist") return "users";
      return "roles";
    case "string[]":
      return "tags";
    case "object":
      return "json";
    case "string":
    default:
      if (/(message|description|notice)$/.test(key)) return "textarea";
      return "text";
  }
}

function DurationField({ value, onChange, disabled, invalid }: { value: number; onChange: (value: number) => void; disabled?: boolean; invalid?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <TextInput
        type="number"
        min={0}
        value={Number.isFinite(value) ? value : 0}
        disabled={disabled}
        invalid={invalid}
        onChange={(event) => onChange(event.target.value === "" ? 0 : Number(event.target.value))}
        className="w-32"
      />
      <span className="text-xs text-zinc-500">seconds{value > 0 ? ` · ${formatDuration(value)}` : ""}</span>
    </div>
  );
}

function JsonField({ value, onChange, disabled }: { value: unknown; onChange: (value: unknown) => void; disabled?: boolean }) {
  const [text, setText] = useState(() => JSON.stringify(value ?? {}, null, 2));
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setText(JSON.stringify(value ?? {}, null, 2)), [value]);
  return (
    <div>
      <TextArea
        rows={5}
        value={text}
        disabled={disabled}
        invalid={Boolean(error)}
        className="font-mono text-xs"
        onChange={(event) => {
          setText(event.target.value);
          try {
            onChange(JSON.parse(event.target.value));
            setError(null);
          } catch {
            setError("Invalid JSON — changes are not applied until it parses.");
          }
        }}
      />
      {error ? <p className="mt-1 text-xs text-amber-400">{error}</p> : null}
    </div>
  );
}

export function ConfigControl({
  def,
  value,
  onChange,
  disabled,
  invalid,
}: {
  def: SchemaKey;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
  invalid?: boolean;
}) {
  const widget = widgetFor(def);
  switch (widget) {
    case "toggle":
      return <Toggle checked={Boolean(value)} onChange={onChange} disabled={disabled} label={keyLabel(def.key)} />;
    case "select":
      return (
        <NativeSelect value={String(value ?? def.default ?? "")} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
          {(def.options ?? []).map((option) => (
            <option key={option} value={option}>
              {option.replace(/_/g, " ")}
            </option>
          ))}
        </NativeSelect>
      );
    case "color":
      return <ColorInput value={String(value ?? def.default ?? "#8B5CF6")} onChange={onChange} disabled={disabled} />;
    case "number":
      return (
        <TextInput
          type="number"
          step={def.key.endsWith("multiplier") ? 0.05 : 1}
          value={typeof value === "number" ? value : Number(value ?? 0)}
          disabled={disabled}
          invalid={invalid}
          onChange={(event) => onChange(event.target.value === "" ? 0 : Number(event.target.value))}
          className="w-40"
        />
      );
    case "duration":
      return <DurationField value={Number(value ?? 0)} onChange={onChange} disabled={disabled} invalid={invalid} />;
    case "channel":
      return <ChannelPicker value={(value as string | null) ?? null} onChange={onChange} disabled={disabled} invalid={invalid} />;
    case "voice-channel":
      return <ChannelPicker kind="voice" value={(value as string | null) ?? null} onChange={onChange} disabled={disabled} />;
    case "category":
      return <ChannelPicker kind="category" value={(value as string | null) ?? null} onChange={onChange} disabled={disabled} />;
    case "role":
      return <RolePicker value={(value as string | null) ?? null} onChange={onChange} disabled={disabled} />;
    case "roles":
      return <MultiRolePicker value={(value as string[]) ?? []} onChange={onChange} disabled={disabled} assignable={def.key.includes("autorole")} />;
    case "channels":
      return <MultiChannelPicker value={(value as string[]) ?? []} onChange={onChange} disabled={disabled} />;
    case "users":
      return <MultiMemberPicker value={(value as string[]) ?? []} onChange={onChange} disabled={disabled} />;
    case "tags":
      return (
        <TagInput
          value={(value as string[]) ?? []}
          onChange={onChange}
          disabled={disabled}
          placeholder={def.key.includes("regex") ? "Add a pattern and press Enter" : "Type and press Enter"}
          validate={
            def.key.includes("regex")
              ? (entry) => {
                  try {
                    new RegExp(entry);
                    return null;
                  } catch {
                    return "That isn't a valid regular expression";
                  }
                }
              : undefined
          }
        />
      );
    case "json":
      return <JsonField value={value} onChange={onChange} disabled={disabled} />;
    case "textarea":
      return <TextArea rows={3} value={String(value ?? "")} disabled={disabled} invalid={invalid} onChange={(event) => onChange(event.target.value)} />;
    case "text":
    default:
      return <TextInput value={String(value ?? "")} disabled={disabled} invalid={invalid} onChange={(event) => onChange(event.target.value)} />;
  }
}

export interface FieldOverride {
  label?: string;
  description?: ReactNode;
  render?: (props: { value: unknown; onChange: (value: unknown) => void; disabled: boolean }) => ReactNode;
}

/** One row: label + description on the left, control on the right. */
export function ConfigRow({
  draft,
  configKey,
  override,
  layout = "auto",
}: {
  draft: ConfigDraft;
  configKey: string;
  override?: FieldOverride;
  layout?: "auto" | "stacked";
}) {
  const schema = useSchema();
  const { level } = useGuild();
  const def = schema.data?.keys.find((entry) => entry.key === configKey);
  if (!schema.data) return <div className="skeleton my-3 h-9" />;
  if (!def) {
    return <p className="py-3 font-mono text-xs text-amber-400">Unknown key in backend schema: {configKey}</p>;
  }
  const widget = widgetFor(def);
  const locked = !draft.canEdit || level < def.editableBy;
  const value = draft.values[configKey];
  const dirty = draft.dirtyKeys.includes(configKey);
  const error = draft.errors[configKey];
  const inline = layout === "auto" && (widget === "toggle" || widget === "color" || widget === "number" || widget === "duration" || widget === "select");
  const label = override?.label ?? keyLabel(configKey);
  const control = override?.render ? (
    override.render({ value, onChange: (next) => draft.set(configKey, next), disabled: locked })
  ) : (
    <ConfigControl def={def} value={value} onChange={(next) => draft.set(configKey, next)} disabled={locked} invalid={Boolean(error)} />
  );

  return (
    <div className={cn("py-3.5", inline ? "flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-6" : "space-y-2")}>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-13 font-medium text-zinc-200">{label}</p>
          {dirty ? <span className="h-1.5 w-1.5 rounded-full bg-amber-400" title="Unsaved" /> : null}
          {def.requiresRestart ? <span className="text-2xs text-amber-400">restart required</span> : null}
        </div>
        <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">{override?.description ?? def.description}</p>
        {error ? <p className="mt-1 text-xs text-red-400">{error}</p> : null}
      </div>
      <div className={cn(inline ? "shrink-0" : "w-full")}>{control}</div>
    </div>
  );
}

/** A card holding a list of schema-driven rows, wired into the page save bar. */
export function SettingsSection({
  id,
  title,
  description,
  icon,
  configKeys,
  overrides,
  action,
  children,
  footer,
}: {
  id: string;
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  configKeys: readonly string[];
  overrides?: Record<string, FieldOverride>;
  action?: ReactNode;
  children?: (draft: ConfigDraft) => ReactNode;
  footer?: ReactNode;
}) {
  const draft = useConfigDraft(configKeys);
  useRegisterDraft(id, draft);
  return (
    <section className="card">
      <div className="flex items-start justify-between gap-4 border-b border-ink-700 px-5 py-4">
        <div className="flex min-w-0 items-start gap-3">
          {icon ? (
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-ink-600 bg-ink-800 text-zinc-300">{icon}</div>
          ) : null}
          <div>
            <h3 className="text-sm font-semibold text-zinc-100">{title}</h3>
            {description ? <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">{description}</p> : null}
          </div>
        </div>
        {action}
      </div>
      <div className="divide-y divide-ink-700/70 px-5">
        {configKeys.map((key) => (
          <ConfigRow key={key} draft={draft} configKey={key} override={overrides?.[key]} />
        ))}
      </div>
      {children ? <div className="border-t border-ink-700 px-5 py-4">{children(draft)}</div> : null}
      {footer ? <div className="border-t border-ink-700 px-5 py-3">{footer}</div> : null}
    </section>
  );
}

/** A switch that persists immediately (for simple module toggles). */
export function InstantToggle({ configKey, label }: { configKey: string; label: string }) {
  const { guildId, values, canConfigure } = useGuild();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const checked = Boolean(values[configKey]);
  return (
    <Toggle
      label={label}
      checked={checked}
      loading={pending}
      disabled={!canConfigure}
      onChange={async (next) => {
        setPending(true);
        try {
          const result = await guildApi.patchConfig(guildId, { [configKey]: next });
          queryClient.setQueryData<SettingsResponse>(keys.settings(guildId), (current) =>
            current ? { ...current, values: result.snapshot.values, version: result.snapshot.version } : current,
          );
          invalidateConfig(queryClient, guildId);
          toast.success(`${label} ${next ? "enabled" : "disabled"}`);
        } catch (error) {
          toast.error(`Couldn't update ${label.toLowerCase()}`, errorMessage(error));
        } finally {
          setPending(false);
        }
      }}
    />
  );
}
