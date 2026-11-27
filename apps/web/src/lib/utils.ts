import { clsx, type ClassValue } from "clsx";

export function cn(...values: ClassValue[]): string {
  return clsx(values);
}

const numberFormat = new Intl.NumberFormat("en-US");
const compactFormat = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return numberFormat.format(value);
}

export function formatCompact(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return Math.abs(value) < 10_000 ? numberFormat.format(value) : compactFormat.format(value);
}

export function formatDate(value: string | Date | null | undefined, withTime = true): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

export function timeAgo(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  const diff = Date.now() - date.getTime();
  if (Number.isNaN(diff)) return "—";
  const future = diff < 0;
  const s = Math.round(Math.abs(diff) / 1000);
  if (s < 10) return future ? "in a moment" : "just now";
  let text: string;
  if (s < 60) text = `${s}s`;
  else if (s < 3600) text = `${Math.floor(s / 60)}m`;
  else if (s < 86_400) text = `${Math.floor(s / 3600)}h`;
  else if (s < 86_400 * 30) text = `${Math.floor(s / 86_400)}d`;
  else if (s < 86_400 * 365) text = `${Math.floor(s / (86_400 * 30))}mo`;
  else text = `${Math.floor(s / (86_400 * 365))}y`;
  return future ? `in ${text}` : `${text} ago`;
}

export function formatDuration(totalSeconds: number | null | undefined): string {
  if (totalSeconds === null || totalSeconds === undefined) return "—";
  if (totalSeconds <= 0) return "0s";
  const parts: string[] = [];
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (seconds && !days) parts.push(`${seconds}s`);
  return parts.slice(0, 2).join(" ");
}

/** Parses "10m", "2h", "1d 4h", "45" (seconds) into seconds. */
export function parseDuration(input: string): number | null {
  const text = input.trim().toLowerCase();
  if (!text) return null;
  if (/^\d+$/.test(text)) return Number(text);
  const pattern = /(\d+(?:\.\d+)?)\s*(w|d|h|m|s)/g;
  let total = 0;
  let matched = false;
  for (const match of text.matchAll(pattern)) {
    matched = true;
    const value = Number(match[1]);
    const unit = match[2];
    total += value * (unit === "w" ? 604_800 : unit === "d" ? 86_400 : unit === "h" ? 3600 : unit === "m" ? 60 : 1);
  }
  return matched ? Math.round(total) : null;
}

export function humanize(value: string): string {
  const text = value.replace(/[._]/g, " ").replace(/\bid\b/gi, "").trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Human label for a configuration key (last segment, or last two when generic). */
export function keyLabel(key: string): string {
  const parts = key.split(".");
  const last = parts[parts.length - 1] ?? key;
  const generic = ["enabled", "action", "threshold", "message", "color", "list", "patterns", "window_seconds"];
  const base = generic.includes(last) && parts.length > 2 ? `${parts[parts.length - 2]} ${last}` : last;
  return humanize(base);
}

export function guildIconUrl(guildId: string, icon: string | null | undefined, size = 96): string | null {
  if (!icon) return null;
  return `https://cdn.discordapp.com/icons/${guildId}/${icon}.${icon.startsWith("a_") ? "gif" : "png"}?size=${size}`;
}

export function guildBannerUrl(guildId: string, banner: string | null | undefined): string | null {
  if (!banner) return null;
  return `https://cdn.discordapp.com/banners/${guildId}/${banner}.${banner.startsWith("a_") ? "gif" : "png"}?size=1024`;
}

export function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

export function roleColor(color: number): string {
  return color ? `#${color.toString(16).padStart(6, "0")}` : "#99aab5";
}

export const SNOWFLAKE = /^\d{17,20}$/;

export function isSnowflake(value: unknown): value is string {
  return typeof value === "string" && SNOWFLAKE.test(value);
}

export function botInviteUrl(clientId: string, guildId?: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    scope: "bot applications.commands",
    permissions: "8",
  });
  if (guildId) {
    params.set("guild_id", guildId);
    params.set("disable_guild_select", "true");
  }
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

export function parseJsonList(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export function safeParse<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function readLocal<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(`infera:${key}`);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeLocal(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(`infera:${key}`, JSON.stringify(value));
  } catch {
    // storage unavailable
  }
}

export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
