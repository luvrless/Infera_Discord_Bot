import { Plus, RotateCcw, Save, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useToast } from "./Toast";
import { Button, Field, Input, Select, Textarea, Toggle, cn } from "./ui";
import type { Channel, ConfigKey, Role } from "../lib/types";

interface ConfigFormProps {
  definitions: ConfigKey[];
  values: Record<string, unknown>;
  channels?: Channel[];
  roles?: Role[];
  onSave: (patch: Record<string, unknown>) => Promise<unknown> | unknown;
  saving?: boolean;
  onReset?: () => void;
  resetLabel?: string;
}

function humanize(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function labelFor(definition: ConfigKey): string {
  const parts = definition.key.split(".");
  return humanize(parts.slice(1).join(" ") || parts[0] || definition.key);
}

function isChannelKey(key: string): boolean {
  return /channel|category|lobby/i.test(key);
}

function isRoleKey(key: string): boolean {
  return /role/i.test(key) && !/user/i.test(key);
}

function initialDraft(definitions: ConfigKey[], values: Record<string, unknown>): Record<string, unknown> {
  const draft: Record<string, unknown> = {};
  for (const definition of definitions) {
    draft[definition.key] = values[definition.key] ?? definition.default;
  }
  return draft;
}

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function IdList({
  ids,
  options,
  onChange,
  placeholder,
}: {
  ids: string[];
  options: Array<{ id: string; name: string }>;
  onChange: (ids: string[]) => void;
  placeholder: string;
}) {
  const [manual, setManual] = useState("");
  const nameById = useMemo(() => new Map(options.map((option) => [option.id, option.name])), [options]);
  const available = options.filter((option) => !ids.includes(option.id));

  const add = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || ids.includes(trimmed)) return;
    onChange([...ids, trimmed]);
    setManual("");
  };

  return (
    <div className="space-y-2">
      {ids.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {ids.map((id) => (
            <span key={id} className="chip">
              {nameById.get(id) ?? id}
              <button
                type="button"
                onClick={() => onChange(ids.filter((entry) => entry !== id))}
                className="text-zinc-500 hover:text-zinc-200"
                aria-label={`Remove ${nameById.get(id) ?? id}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <div className="flex gap-2">
        {available.length > 0 ? (
          <Select
            value=""
            onChange={(event) => add(event.target.value)}
            options={available.map((option) => ({ value: option.id, label: option.name }))}
            placeholder={placeholder}
          />
        ) : null}
        <div className="flex min-w-[160px] flex-1 gap-1.5">
          <Input
            value={manual}
            onChange={(event) => setManual(event.target.value)}
            placeholder="Discord ID"
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                add(manual);
              }
            }}
          />
          <Button type="button" variant="secondary" onClick={() => add(manual)} aria-label="Add ID">
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function StringList({ values, onChange }: { values: string[]; onChange: (values: string[]) => void }) {
  const [entry, setEntry] = useState("");
  const add = () => {
    const trimmed = entry.trim();
    if (!trimmed) return;
    onChange([...values, trimmed]);
    setEntry("");
  };
  return (
    <div className="space-y-2">
      {values.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {values.map((value, index) => (
            <span key={`${value}-${index}`} className="chip">
              <span className="max-w-[220px] truncate">{value}</span>
              <button
                type="button"
                onClick={() => onChange(values.filter((_, position) => position !== index))}
                className="text-zinc-500 hover:text-zinc-200"
                aria-label="Remove entry"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <div className="flex gap-1.5">
        <Input
          value={entry}
          onChange={(event) => setEntry(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              add();
            }
          }}
          placeholder="Add entry and press Enter"
        />
        <Button type="button" variant="secondary" onClick={add} aria-label="Add entry">
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

function JsonField({
  value,
  onChange,
}: {
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const [raw, setRaw] = useState(() => JSON.stringify(value ?? {}, null, 2));
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <Textarea
        value={raw}
        className="min-h-[120px] font-mono text-xs"
        onChange={(event) => {
          const next = event.target.value;
          setRaw(next);
          try {
            onChange(JSON.parse(next));
            setError(null);
          } catch {
            setError("Invalid JSON — the value is not saved until it parses.");
          }
        }}
      />
      {error ? <p className="mt-1 text-xs text-red-400">{error}</p> : null}
    </div>
  );
}

export function ConfigForm({
  definitions,
  values,
  channels = [],
  roles = [],
  onSave,
  saving,
  onReset,
  resetLabel = "Reset section",
}: ConfigFormProps) {
  const { push } = useToast();
  const [draft, setDraft] = useState(() => initialDraft(definitions, values));
  const [busy, setBusy] = useState(false);

  const dirty = definitions.filter((definition) => !sameValue(draft[definition.key], values[definition.key] ?? definition.default));

  const set = (key: string, value: unknown) => setDraft((current) => ({ ...current, [key]: value }));

  const save = async () => {
    if (dirty.length === 0) return;
    const patch = Object.fromEntries(dirty.map((definition) => [definition.key, draft[definition.key]]));
    setBusy(true);
    try {
      await onSave(patch);
      push({ title: "Settings saved", description: `${dirty.length} value${dirty.length === 1 ? "" : "s"} updated.`, tone: "success" });
    } catch (error) {
      push({ title: "Could not save", description: error instanceof Error ? error.message : "Unknown error", tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  const groups = useMemo(() => {
    const map = new Map<string, ConfigKey[]>();
    for (const definition of definitions) {
      const group = definition.key.split(".")[0] ?? "general";
      map.set(group, [...(map.get(group) ?? []), definition]);
    }
    return [...map.entries()];
  }, [definitions]);

  return (
    <div className="space-y-5">
      {groups.map(([group, entries]) => (
        <div key={group} className="space-y-4">
          {groups.length > 1 ? (
            <h3 className="border-b border-ink-700 pb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
              {humanize(group)}
            </h3>
          ) : null}
          <div className="grid gap-4 md:grid-cols-2">
            {entries.map((definition) => {
              const value = draft[definition.key];
              const shortKey = definition.key.split(".").slice(-1)[0] ?? definition.key;
              const common = {
                label: labelFor(definition),
                hint: definition.description,
              };
              if (definition.type === "boolean") {
                return (
                  <div key={definition.key} className="rounded-lg border border-ink-700 bg-ink-850/60 px-3.5 py-3 md:col-span-2">
                    <Toggle
                      checked={Boolean(value)}
                      onChange={(next) => set(definition.key, next)}
                      label={common.label}
                      description={common.hint}
                    />
                  </div>
                );
              }
              return (
                <Field
                  key={definition.key}
                  label={
                    <span className="flex items-center gap-2">
                      {common.label}
                      <span className="font-mono text-2xs font-normal text-zinc-600">{shortKey}</span>
                    </span>
                  }
                  hint={common.hint}
                  className={definition.type === "object" || definition.type === "string[]" || definition.type === "snowflake[]" ? "md:col-span-2" : undefined}
                >
                  {definition.type === "number" ? (
                    <Input
                      type="number"
                      value={typeof value === "number" ? value : Number(value ?? 0)}
                      onChange={(event) => set(definition.key, event.target.value === "" ? 0 : Number(event.target.value))}
                    />
                  ) : null}
                  {definition.type === "string" ? (
                    /message|description|notice/i.test(definition.key) ? (
                      <Textarea
                        value={String(value ?? "")}
                        onChange={(event) => set(definition.key, event.target.value)}
                        rows={definition.key.includes("message") ? 3 : 2}
                      />
                    ) : (
                      <Input value={String(value ?? "")} onChange={(event) => set(definition.key, event.target.value)} />
                    )
                  ) : null}
                  {definition.type === "enum" ? (
                    <Select
                      value={String(value ?? "")}
                      onChange={(event) => set(definition.key, event.target.value)}
                      options={(definition.options ?? []).map((option) => ({ value: option, label: humanize(option) }))}
                    />
                  ) : null}
                  {definition.type === "color" ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        className="h-9 w-12 cursor-pointer rounded-md border border-ink-600 bg-ink-900"
                        value={/^#[0-9a-fA-F]{6}$/.test(String(value ?? "")) ? String(value) : "#8b5cf6"}
                        onChange={(event) => set(definition.key, event.target.value.toUpperCase())}
                      />
                      <Input
                        value={String(value ?? "")}
                        onChange={(event) => set(definition.key, event.target.value)}
                        className="font-mono"
                      />
                    </div>
                  ) : null}
                  {definition.type === "snowflake" ? (
                    isChannelKey(definition.key) && channels.length > 0 ? (
                      <Select
                        value={String(value ?? "")}
                        onChange={(event) => set(definition.key, event.target.value || null)}
                        placeholder="Not configured"
                        options={channels.map((channel) => ({
                          value: channel.id,
                          label: `${channel.type === 2 ? "🔊" : channel.type === 4 ? "📁" : "#"} ${channel.name}`,
                        }))}
                      />
                    ) : isRoleKey(definition.key) && roles.length > 0 ? (
                      <Select
                        value={String(value ?? "")}
                        onChange={(event) => set(definition.key, event.target.value || null)}
                        placeholder="Not configured"
                        options={roles.map((role) => ({ value: role.id, label: role.name }))}
                      />
                    ) : (
                      <Input
                        value={String(value ?? "")}
                        onChange={(event) => set(definition.key, event.target.value.trim() || null)}
                        placeholder="Discord ID"
                      />
                    )
                  ) : null}
                  {definition.type === "snowflake[]" ? (
                    <IdList
                      ids={Array.isArray(value) ? (value as string[]) : []}
                      options={
                        isChannelKey(definition.key)
                          ? channels.map((channel) => ({ id: channel.id, name: `# ${channel.name}` }))
                          : roles.map((role) => ({ id: role.id, name: role.name }))
                      }
                      onChange={(ids) => set(definition.key, ids)}
                      placeholder={isChannelKey(definition.key) ? "Add channel" : "Add role"}
                    />
                  ) : null}
                  {definition.type === "string[]" ? (
                    <StringList
                      values={Array.isArray(value) ? (value as string[]) : []}
                      onChange={(next) => set(definition.key, next)}
                    />
                  ) : null}
                  {definition.type === "object" ? <JsonField value={value} onChange={(next) => set(definition.key, next)} /> : null}
                </Field>
              );
            })}
          </div>
        </div>
      ))}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-700 pt-4">
        <p className={cn("text-xs", dirty.length > 0 ? "text-amber-400" : "text-zinc-500")}>
          {dirty.length > 0 ? `${dirty.length} unsaved change${dirty.length === 1 ? "" : "s"}` : "Everything is saved"}
        </p>
        <div className="flex items-center gap-2">
          {onReset ? (
            <Button variant="ghost" onClick={onReset} title={resetLabel}>
              <RotateCcw className="h-3.5 w-3.5" />
              {resetLabel}
            </Button>
          ) : null}
          <Button
            variant="ghost"
            disabled={dirty.length === 0 || busy}
            onClick={() => setDraft(initialDraft(definitions, values))}
          >
            Discard
          </Button>
          <Button variant="primary" onClick={() => void save()} loading={busy || saving} disabled={dirty.length === 0}>
            <Save className="h-3.5 w-3.5" />
            Save changes
          </Button>
        </div>
      </div>
    </div>
  );
}
