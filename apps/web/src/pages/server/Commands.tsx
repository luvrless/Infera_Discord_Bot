import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BarChart3, Clock, Shield, Terminal } from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { MetricCard, PageHeader, StatGrid } from "../../components/cards";
import { Badge, Button, Callout, Card, Field, NativeSelect, Segmented, TextInput, Toggle, Unsupported } from "../../components/ui/primitives";
import { Drawer } from "../../components/ui/overlays";
import { EmptyState, ErrorState, PageSkeleton } from "../../components/ui/states";
import { DataTable, FilterBar, Pagination, SearchInput } from "../../components/ui/table";
import { useToast } from "../../components/ui/toast";
import { errorMessage } from "../../lib/api/client";
import { keys } from "../../lib/api/keys";
import { systemApi, useGuildCommands } from "../../lib/api/system";
import type { GuildCommand } from "../../lib/api/types";
import { LEVEL_NAMES } from "../../lib/api/types";
import { formatDuration, formatNumber } from "../../lib/utils";
import { useGuild } from "../../hooks/useGuild";

const PAGE_SIZE = 40;

function CommandDrawer({ command, onClose }: { command: GuildCommand | null; onClose: () => void }) {
  const { guildId, canConfigure, values } = useGuild();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [level, setLevel] = useState<number | null>(null);
  const [cooldown, setCooldown] = useState<string | null>(null);
  const prefix = String(values["general.prefix"] ?? ".");
  const update = useMutation({
    mutationFn: (body: { enabled?: boolean; level?: number; cooldownMs?: number }) => systemApi.updateCommand(guildId, command!.name, body),
    onSuccess: (_data, body) => {
      toast.success(typeof body.enabled === "boolean" ? `${command?.name} ${body.enabled ? "enabled" : "disabled"}` : "Command override saved");
      setLevel(null);
      setCooldown(null);
      void queryClient.invalidateQueries({ queryKey: keys.guildCommands(guildId) });
    },
    onError: (error) => toast.error("Couldn't update the command", errorMessage(error)),
  });
  if (!command) return <Drawer open={false} onClose={onClose} title="">{null}</Drawer>;
  const levelValue = level ?? command.level;
  const cooldownSeconds = cooldown ?? String(Math.round(command.effectiveCooldownMs / 1000));
  const cooldownNumber = Number(cooldownSeconds);
  const changed = levelValue !== command.level || cooldownNumber * 1000 !== command.effectiveCooldownMs;
  return (
    <Drawer
      open
      onClose={onClose}
      title={<span className="font-mono">{prefix}{command.name}</span>}
      subtitle={<span className="flex items-center gap-2"><Badge>{command.category}</Badge>{command.overridden ? <Badge tone="accent">overridden</Badge> : null}</span>}
      footer={
        canConfigure ? (
          <Button variant="primary" disabled={!changed || !Number.isFinite(cooldownNumber) || cooldownNumber < 0 || cooldownNumber > 600} loading={update.isPending} onClick={() => update.mutate({ level: levelValue, cooldownMs: Math.round(cooldownNumber * 1000) })}>
            Save override
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-5">
        <p className="text-13 text-zinc-300">{command.description}</p>
        <div className="flex items-center justify-between rounded-lg border border-ink-700 px-4 py-3">
          <div>
            <p className="text-13 font-medium text-zinc-200">Enabled in this server</p>
            <p className="text-xs text-zinc-500">Disabled commands are ignored for prefix and slash use.</p>
          </div>
          <Toggle label="Enabled" checked={command.enabled} disabled={!canConfigure} loading={update.isPending && update.variables?.enabled !== undefined} onChange={(enabled) => update.mutate({ enabled })} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="eyebrow">Usage (30 days)</p>
            <p className="mt-1 text-lg font-semibold text-zinc-100">{formatNumber(command.usage.uses)}</p>
            <p className="text-2xs text-zinc-500">{formatNumber(command.usage.failures)} failed</p>
          </div>
          <div>
            <p className="eyebrow">Aliases</p>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {command.aliases.length ? command.aliases.map((alias) => <span key={alias} className="rounded border border-ink-600 px-1.5 py-0.5 font-mono text-2xs text-zinc-300">{prefix}{alias}</span>) : <span className="text-xs text-zinc-600">None</span>}
            </div>
            <p className="mt-1 text-2xs text-zinc-600">Aliases run the same command — they aren't separate commands.</p>
          </div>
        </div>
        <Field label="Required permission level" hint={`Default: ${LEVEL_NAMES[command.defaultLevel]}`}>
          <NativeSelect value={levelValue} disabled={!canConfigure} onChange={(event) => setLevel(Number(event.target.value))}>
            {[0, 1, 2, 3, 4, 5].map((value) => (
              <option key={value} value={value}>
                {LEVEL_NAMES[value]} ({value})
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Cooldown (seconds)" hint={`Default: ${formatDuration(command.cooldownMs / 1000) || "none"} · max 600s`}>
          <TextInput type="number" min={0} max={600} value={cooldownSeconds} disabled={!canConfigure} onChange={(event) => setCooldown(event.target.value)} />
        </Field>
        <div>
          <p className="eyebrow mb-1.5">Usage</p>
          <code className="block rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 font-mono text-xs text-zinc-300">
            {prefix}{command.name} · /{command.name}
          </code>
        </div>
        <Unsupported title="Syntax, arguments, examples and role/channel/user restrictions">
          The commands API returns name, description, category, aliases, level and cooldown. Per-role, per-channel and per-user restrictions need a command-permission endpoint that accepts targets.
        </Unsupported>
      </div>
    </Drawer>
  );
}

export function CommandsPage() {
  const { guildId, values } = useGuild();
  const prefix = String(values["general.prefix"] ?? ".");
  const commands = useGuildCommands(guildId);
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(params.get("command") ?? "");
  const [category, setCategory] = useState("");
  const [level, setLevel] = useState("");
  const [status, setStatus] = useState<"all" | "enabled" | "disabled">("all");
  const [page, setPage] = useState(1);
  const selectedName = params.get("command");

  const list = useMemo(() => {
    const text = query.trim().toLowerCase().replace(/^[./]/, "");
    return (commands.data?.commands ?? []).filter(
      (command) =>
        (!category || command.category === category) &&
        (!level || command.level === Number(level)) &&
        (status === "all" || (status === "enabled" ? command.enabled : !command.enabled)) &&
        (!text || command.name.includes(text) || command.aliases.some((alias) => alias.includes(text)) || command.description.toLowerCase().includes(text)),
    );
  }, [commands.data, query, category, level, status]);
  const categories = useMemo(() => Array.from(new Set((commands.data?.commands ?? []).map((command) => command.category))).sort(), [commands.data]);
  const selected = commands.data?.commands.find((command) => command.name === selectedName) ?? null;
  const open = (name: string | null) =>
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (name) next.set("command", name);
      else next.delete("command");
      return next;
    });

  if (commands.isLoading) return <PageSkeleton />;
  if (commands.error || !commands.data) return <ErrorState error={commands.error} onRetry={() => void commands.refetch()} />;
  const all = commands.data.commands;
  const disabled = all.filter((command) => !command.enabled).length;
  const uses = all.reduce((sum, command) => sum + command.usage.uses, 0);
  const paged = list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div>
      <PageHeader title="Commands" icon={Terminal} description="Every canonical INFERA command. Overrides apply to both prefix and slash usage in this server." />
      <StatGrid className="mb-4">
        <MetricCard label="Commands" value={all.length} icon={Terminal} hint={`${categories.length} categories`} />
        <MetricCard label="Disabled here" value={disabled} icon={Shield} tone={disabled ? "warning" : "neutral"} />
        <MetricCard label="Overridden" value={all.filter((command) => command.overridden).length} icon={Clock} />
        <MetricCard label="Uses (30 days)" value={uses} icon={BarChart3} tone="accent" />
      </StatGrid>
      {all.length === 0 ? <Callout tone="warning" className="mb-4">The command catalogue is empty. The bot syncs command definitions to the database on startup.</Callout> : null}
      <Card>
        <FilterBar>
          <SearchInput value={query} onChange={(value) => { setQuery(value); setPage(1); }} placeholder="Search name, alias or description" className="w-full sm:w-72" />
          <div className="w-40">
            <NativeSelect value={category} onChange={(event) => { setCategory(event.target.value); setPage(1); }} aria-label="Category">
              <option value="">All categories</option>
              {categories.map((entry) => (
                <option key={entry} value={entry}>
                  {entry}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="w-44">
            <NativeSelect value={level} onChange={(event) => { setLevel(event.target.value); setPage(1); }} aria-label="Permission">
              <option value="">Any permission</option>
              {[0, 1, 2, 3, 4, 5].map((value) => (
                <option key={value} value={value}>
                  {LEVEL_NAMES[value]}
                </option>
              ))}
            </NativeSelect>
          </div>
          <Segmented value={status} onChange={(value) => { setStatus(value); setPage(1); }} size="sm" options={[{ value: "all", label: "All" }, { value: "enabled", label: "Enabled" }, { value: "disabled", label: "Disabled" }]} />
        </FilterBar>
        <DataTable<GuildCommand>
          rows={paged}
          rowKey={(row) => row.name}
          onRowClick={(row) => open(row.name)}
          dense
          empty={<EmptyState compact icon={Terminal} title="No commands match" />}
          columns={[
            { id: "name", header: "Command", cell: (row) => <span className="font-mono text-13 text-zinc-100">{row.name}</span> },
            { id: "description", header: "Description", className: "max-w-[340px]", cell: (row) => <span className="line-clamp-1 text-zinc-400">{row.description}</span> },
            { id: "category", header: "Category", cell: (row) => <Badge>{row.category}</Badge> },
            { id: "usage", header: "Prefix / Slash", cell: (row) => <span className="font-mono text-2xs text-zinc-500">{prefix}{row.name} · /{row.name}</span> },
            { id: "level", header: "Permission", cell: (row) => <span className="text-xs text-zinc-400">{LEVEL_NAMES[row.level]}</span> },
            { id: "cooldown", header: "Cooldown", cell: (row) => <span className="text-xs text-zinc-500">{row.effectiveCooldownMs ? formatDuration(row.effectiveCooldownMs / 1000) : "—"}</span> },
            { id: "uses", header: "Uses", cell: (row) => <span className="tabular-nums text-zinc-400">{formatNumber(row.usage.uses)}</span> },
            { id: "status", header: "Status", cell: (row) => <Badge tone={row.enabled ? "success" : "neutral"} dot>{row.enabled ? "enabled" : "disabled"}</Badge> },
          ]}
        />
        <Pagination page={page} pageSize={PAGE_SIZE} total={list.length} onChange={setPage} />
      </Card>
      <p className="mt-3 text-2xs text-zinc-600">Slash availability depends on Discord registration; the API doesn't report which commands are registered as slash commands, so both forms are shown.</p>
      <CommandDrawer key={selected?.name ?? "none"} command={selected} onClose={() => open(null)} />
    </div>
  );
}
