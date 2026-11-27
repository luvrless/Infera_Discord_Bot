import { useQuery } from "@tanstack/react-query";
import { AtSign, Check, ChevronDown, Folder, Hash, Megaphone, Search, Shield, UserRound, Volume2, X } from "lucide-react";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { guildApi, useChannels, useRoles } from "../../lib/api/guilds";
import { keys } from "../../lib/api/keys";
import type { Channel, ResolvedUser, Role } from "../../lib/api/types";
import { cn, isSnowflake, roleColor } from "../../lib/utils";
import { displayName, useResolvedUser } from "../../hooks/useUsers";
import { useGuild } from "../../hooks/useGuild";
import { Avatar, Spinner, useClickOutside } from "./primitives";

// ------------------------------------------------------- shared listbox

interface Option {
  id: string;
  label: string;
  icon?: ReactNode;
  hint?: string;
  group?: string;
  disabled?: boolean;
  disabledReason?: string;
}

function Listbox({
  options,
  selected,
  multiple,
  onPick,
  placeholder,
  renderValue,
  disabled,
  loading,
  emptyLabel = "Nothing found",
  allowClear,
  onClear,
  invalid,
}: {
  options: Option[];
  selected: string[];
  multiple?: boolean;
  onPick: (id: string) => void;
  placeholder: string;
  renderValue: () => ReactNode;
  disabled?: boolean;
  loading?: boolean;
  emptyLabel?: string;
  allowClear?: boolean;
  onClear?: () => void;
  invalid?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const ref = useClickOutside<HTMLDivElement>(open, () => setOpen(false));
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase();
    return text ? options.filter((option) => option.label.toLowerCase().includes(text) || option.id === text) : options;
  }, [options, query]);

  const choose = (option: Option | undefined) => {
    if (!option || option.disabled) return;
    onPick(option.id);
    if (!multiple) {
      setOpen(false);
      setQuery("");
    }
  };

  let lastGroup: string | undefined;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          setOpen((value) => !value);
          setActive(0);
          window.setTimeout(() => inputRef.current?.focus(), 0);
        }}
        className={cn("input flex h-auto min-h-9 items-center gap-2 py-1.5 text-left", invalid && "input-error")}
      >
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          {selected.length === 0 ? <span className="text-zinc-600">{placeholder}</span> : renderValue()}
        </span>
        {allowClear && selected.length > 0 && !disabled ? (
          <span
            role="button"
            tabIndex={-1}
            aria-label="Clear"
            onClick={(event) => {
              event.stopPropagation();
              onClear?.();
            }}
            className="rounded p-0.5 text-zinc-500 hover:text-zinc-200"
          >
            <X className="h-3.5 w-3.5" />
          </span>
        ) : null}
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
      </button>
      {open ? (
        <div className="absolute left-0 right-0 z-50 mt-1 animate-fade-in overflow-hidden rounded-lg border border-ink-600 bg-ink-800 shadow-pop">
          <div className="flex items-center gap-2 border-b border-ink-700 px-2.5">
            <Search className="h-3.5 w-3.5 text-zinc-500" />
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActive(0);
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setActive((value) => Math.min(filtered.length - 1, value + 1));
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setActive((value) => Math.max(0, value - 1));
                } else if (event.key === "Enter") {
                  event.preventDefault();
                  choose(filtered[active]);
                }
              }}
              placeholder="Search…"
              className="h-9 w-full bg-transparent text-13 text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
            />
            {loading ? <Spinner className="h-3.5 w-3.5" /> : null}
          </div>
          <ul role="listbox" aria-multiselectable={multiple} className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 ? <li className="px-3 py-6 text-center text-xs text-zinc-500">{loading ? "Loading…" : emptyLabel}</li> : null}
            {filtered.map((option, index) => {
              const isSelected = selected.includes(option.id);
              const header = option.group && option.group !== lastGroup ? option.group : null;
              lastGroup = option.group;
              return (
                <li key={option.id}>
                  {header ? <p className="px-3 pb-1 pt-2 text-2xs font-semibold uppercase tracking-wider text-zinc-600">{header}</p> : null}
                  <button
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    disabled={option.disabled}
                    title={option.disabledReason}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => choose(option)}
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-1.5 text-left text-13 disabled:cursor-not-allowed disabled:opacity-40",
                      index === active ? "bg-ink-700 text-zinc-100" : "text-zinc-300",
                    )}
                  >
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center text-zinc-500">{option.icon}</span>
                    <span className="min-w-0 flex-1 truncate">{option.label}</span>
                    {option.hint ? <span className="text-2xs text-zinc-600">{option.hint}</span> : null}
                    {isSelected ? <Check className="h-3.5 w-3.5 text-accent-soft" /> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------- channels

export type ChannelKind = "text" | "voice" | "category" | "any";

function channelIcon(channel: Channel) {
  if (channel.type === 2) return <Volume2 className="h-3.5 w-3.5" />;
  if (channel.type === 4) return <Folder className="h-3.5 w-3.5" />;
  if (channel.type === 5) return <Megaphone className="h-3.5 w-3.5" />;
  return <Hash className="h-3.5 w-3.5" />;
}

function matchesKind(channel: Channel, kind: ChannelKind): boolean {
  if (kind === "any") return true;
  if (kind === "text") return channel.type === 0 || channel.type === 5;
  if (kind === "voice") return channel.type === 2;
  return channel.type === 4;
}

function channelOptions(channels: Channel[], kind: ChannelKind): Option[] {
  const categories = new Map(channels.filter((channel) => channel.type === 4).map((channel) => [channel.id, channel.name]));
  return channels
    .filter((channel) => matchesKind(channel, kind))
    .map((channel) => ({
      id: channel.id,
      label: channel.name,
      icon: channelIcon(channel),
      group: kind === "category" ? undefined : channel.parentId ? categories.get(channel.parentId) ?? "Other" : "No category",
    }))
    .sort((a, b) => (a.group ?? "").localeCompare(b.group ?? ""));
}

export function ChannelPicker({
  value,
  onChange,
  kind = "text",
  placeholder,
  disabled,
  allowClear = true,
  invalid,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  kind?: ChannelKind;
  placeholder?: string;
  disabled?: boolean;
  allowClear?: boolean;
  invalid?: boolean;
}) {
  const { guildId } = useGuild();
  const channels = useChannels(guildId);
  const options = useMemo(() => channelOptions(channels.data ?? [], kind), [channels.data, kind]);
  const current = channels.data?.find((channel) => channel.id === value);
  return (
    <Listbox
      options={options}
      selected={value ? [value] : []}
      onPick={(id) => onChange(id)}
      placeholder={placeholder ?? (kind === "category" ? "Select a category" : kind === "voice" ? "Select a voice channel" : "Select a channel")}
      loading={channels.isLoading}
      disabled={disabled}
      allowClear={allowClear}
      onClear={() => onChange(null)}
      invalid={invalid || (Boolean(value) && channels.isSuccess && !current)}
      renderValue={() =>
        current ? (
          <span className="flex items-center gap-1.5 text-zinc-100">
            <span className="text-zinc-500">{channelIcon(current)}</span>
            {current.name}
          </span>
        ) : (
          <span className="font-mono text-xs text-amber-300">Deleted channel ({value})</span>
        )
      }
    />
  );
}

export function MultiChannelPicker({
  value,
  onChange,
  kind = "text",
  placeholder = "Select channels",
  disabled,
}: {
  value: string[];
  onChange: (value: string[]) => void;
  kind?: ChannelKind;
  placeholder?: string;
  disabled?: boolean;
}) {
  const { guildId } = useGuild();
  const channels = useChannels(guildId);
  const options = useMemo(() => channelOptions(channels.data ?? [], kind), [channels.data, kind]);
  const byId = new Map((channels.data ?? []).map((channel) => [channel.id, channel]));
  return (
    <Listbox
      multiple
      options={options}
      selected={value}
      onPick={(id) => onChange(value.includes(id) ? value.filter((entry) => entry !== id) : [...value, id])}
      placeholder={placeholder}
      loading={channels.isLoading}
      disabled={disabled}
      allowClear
      onClear={() => onChange([])}
      renderValue={() =>
        value.map((id) => {
          const channel = byId.get(id);
          return (
            <span key={id} className="inline-flex items-center gap-1 rounded-md border border-ink-600 bg-ink-750 px-1.5 py-0.5 text-xs text-zinc-200">
              <Hash className="h-3 w-3 text-zinc-500" />
              {channel?.name ?? <span className="font-mono text-amber-300">{id}</span>}
            </span>
          );
        })
      }
    />
  );
}

// ---------------------------------------------------------------- roles

function roleOptions(roles: Role[], excludeManaged: boolean): Option[] {
  return roles.map((role) => ({
    id: role.id,
    label: role.name,
    icon: <span className="h-2.5 w-2.5 rounded-full" style={{ background: roleColor(role.color) }} />,
    hint: role.managed ? "integration" : undefined,
    disabled: excludeManaged && role.managed,
    disabledReason: role.managed ? "Managed by an integration — it can't be assigned" : undefined,
  }));
}

export function RoleTag({ role, id }: { role?: Role; id: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-ink-600 bg-ink-750 px-1.5 py-0.5 text-xs text-zinc-200">
      <span className="h-2 w-2 rounded-full" style={{ background: role ? roleColor(role.color) : "#666" }} />
      {role?.name ?? <span className="font-mono text-amber-300">Deleted role</span>}
    </span>
  );
}

export function RolePicker({
  value,
  onChange,
  placeholder = "Select a role",
  disabled,
  assignable = true,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  assignable?: boolean;
}) {
  const { guildId } = useGuild();
  const roles = useRoles(guildId);
  const options = useMemo(() => roleOptions(roles.data ?? [], assignable), [roles.data, assignable]);
  const current = roles.data?.find((role) => role.id === value);
  return (
    <Listbox
      options={options}
      selected={value ? [value] : []}
      onPick={(id) => onChange(id)}
      placeholder={placeholder}
      loading={roles.isLoading}
      disabled={disabled}
      allowClear
      onClear={() => onChange(null)}
      renderValue={() => <RoleTag role={current} id={value ?? ""} />}
    />
  );
}

export function MultiRolePicker({
  value,
  onChange,
  placeholder = "Select roles",
  disabled,
  assignable = false,
}: {
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  assignable?: boolean;
}) {
  const { guildId } = useGuild();
  const roles = useRoles(guildId);
  const options = useMemo(() => roleOptions(roles.data ?? [], assignable), [roles.data, assignable]);
  const byId = new Map((roles.data ?? []).map((role) => [role.id, role]));
  return (
    <Listbox
      multiple
      options={options}
      selected={value}
      onPick={(id) => onChange(value.includes(id) ? value.filter((entry) => entry !== id) : [...value, id])}
      placeholder={placeholder}
      loading={roles.isLoading}
      disabled={disabled}
      allowClear
      onClear={() => onChange([])}
      renderValue={() => value.map((id) => <RoleTag key={id} id={id} role={byId.get(id)} />)}
    />
  );
}

// -------------------------------------------------------------- members

export function UserChip({ userId, size = 20, showId, className }: { userId: string | null | undefined; size?: number; showId?: boolean; className?: string }) {
  const { guildId } = useGuild();
  const user = useResolvedUser(guildId, userId);
  if (!userId) return <span className="text-zinc-600">—</span>;
  const name = displayName(user.data, null);
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5", className)} title={userId}>
      <Avatar src={user.data?.avatarUrl} name={user.data ? name : "?"} size={size} />
      <span className="min-w-0 truncate text-zinc-200">
        {user.isLoading ? <span className="text-zinc-600">Loading…</span> : user.data ? name : <span className="font-mono text-xs text-zinc-400">{userId}</span>}
      </span>
      {user.data?.bot ? <span className="rounded bg-accent/20 px-1 text-[10px] font-semibold text-accent-soft">BOT</span> : null}
      {showId ? <span className="font-mono text-2xs text-zinc-600">{userId}</span> : null}
    </span>
  );
}

/**
 * Member search backed by Discord's guild member search via the API.
 * Accepts a pasted user ID for members who left the server.
 */
export function MemberPicker({
  value,
  onChange,
  placeholder = "Search members by name or paste an ID",
  disabled,
}: {
  value: string | null;
  onChange: (value: string | null, user?: ResolvedUser | null) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const { guildId } = useGuild();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [debounced, setDebounced] = useState("");
  const ref = useClickOutside<HTMLDivElement>(open, () => setOpen(false));
  const timer = useRef<number | undefined>(undefined);

  const search = useQuery({
    queryKey: keys.memberSearch(guildId, debounced),
    queryFn: ({ signal }) => guildApi.searchMembers(guildId, debounced, signal),
    enabled: debounced.length >= 2,
    staleTime: 30_000,
  });

  const update = (text: string) => {
    setQuery(text);
    setOpen(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setDebounced(text.trim()), 250);
  };

  if (value) {
    return (
      <div className="input flex items-center justify-between gap-2">
        <UserChip userId={value} showId />
        {!disabled ? (
          <button type="button" aria-label="Clear member" onClick={() => onChange(null)} className="rounded p-0.5 text-zinc-500 hover:text-zinc-200">
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
    );
  }

  const members = search.data?.members ?? [];
  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <AtSign className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
        <input
          value={query}
          disabled={disabled}
          onChange={(event) => update(event.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && isSnowflake(query.trim())) {
              event.preventDefault();
              onChange(query.trim());
              setQuery("");
            }
          }}
          placeholder={placeholder}
          className="input pl-8"
        />
      </div>
      {open && query.trim().length >= 2 ? (
        <div className="absolute left-0 right-0 z-50 mt-1 overflow-hidden rounded-lg border border-ink-600 bg-ink-800 shadow-pop">
          <ul className="max-h-64 overflow-y-auto py-1">
            {search.isFetching && members.length === 0 ? (
              <li className="flex items-center justify-center gap-2 px-3 py-5 text-xs text-zinc-500">
                <Spinner className="h-3.5 w-3.5" /> Searching…
              </li>
            ) : null}
            {search.error ? <li className="px-3 py-4 text-center text-xs text-red-400">Member search failed. Paste a user ID instead.</li> : null}
            {!search.isFetching && !search.error && members.length === 0 ? (
              <li className="px-3 py-4 text-center text-xs text-zinc-500">
                {isSnowflake(query.trim()) ? "Press Enter to use this ID" : "No members match"}
              </li>
            ) : null}
            {members.map((member) => (
              <li key={member.id}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(member.id, member);
                    setQuery("");
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left hover:bg-ink-700"
                >
                  <Avatar src={member.avatarUrl} name={displayName(member)} size={24} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-13 text-zinc-100">{displayName(member)}</span>
                    <span className="block truncate text-2xs text-zinc-500">@{member.username}</span>
                  </span>
                  {member.bot ? <Shield className="h-3.5 w-3.5 text-accent-soft" /> : <UserRound className="h-3.5 w-3.5 text-zinc-600" />}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function MultiMemberPicker({ value, onChange, disabled }: { value: string[]; onChange: (value: string[]) => void; disabled?: boolean }) {
  return (
    <div className="space-y-2">
      {value.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {value.map((id) => (
            <span key={id} className="inline-flex items-center gap-1.5 rounded-md border border-ink-600 bg-ink-750 py-0.5 pl-1.5 pr-1 text-xs">
              <UserChip userId={id} size={16} />
              {!disabled ? (
                <button type="button" aria-label="Remove" onClick={() => onChange(value.filter((entry) => entry !== id))} className="rounded p-0.5 text-zinc-500 hover:text-zinc-100">
                  <X className="h-3 w-3" />
                </button>
              ) : null}
            </span>
          ))}
        </div>
      ) : null}
      <MemberPicker value={null} disabled={disabled} onChange={(id) => id && !value.includes(id) && onChange([...value, id])} placeholder="Add a member…" />
    </div>
  );
}

export function ChannelName({ id }: { id: string | null | undefined }) {
  const { guildId } = useGuild();
  const channels = useChannels(guildId);
  if (!id) return <span className="text-zinc-600">—</span>;
  const channel = channels.data?.find((entry) => entry.id === id);
  return (
    <span className="inline-flex items-center gap-1 text-zinc-300">
      <Hash className="h-3 w-3 text-zinc-500" />
      {channel?.name ?? <span className="font-mono text-xs text-zinc-500">{id}</span>}
    </span>
  );
}

export function RoleName({ id }: { id: string }) {
  const { guildId } = useGuild();
  const roles = useRoles(guildId);
  return <RoleTag id={id} role={roles.data?.find((role) => role.id === id)} />;
}
