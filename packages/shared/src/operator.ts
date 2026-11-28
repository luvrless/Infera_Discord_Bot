/**
 * The INFERA operator (platform owner). This is the ONLY account that can use
 * the operator panel and the /v1/operator API. Hard-coded on purpose so it
 * can't be changed by editing environment variables.
 */
export const OPERATOR_IDS: readonly string[] = Object.freeze(["409564774444171265"]);

export function isOperator(userId: string | null | undefined): boolean {
  return typeof userId === "string" && OPERATOR_IDS.includes(userId);
}

export type PresenceStatus = "online" | "idle" | "dnd" | "invisible";
export type PresenceActivity = "playing" | "watching" | "listening" | "competing" | "custom" | "none";

export interface PlatformState {
  maintenance: { enabled: boolean; message: string };
  presence: { status: PresenceStatus; activity: PresenceActivity; text: string };
  /** Command names disabled in every server. */
  disabledCommands: string[];
  /** Banner shown at the top of every dashboard page (empty = hidden). */
  dashboardBanner: { text: string; tone: "info" | "warning" | "danger" };
  /** When off, the bot leaves new servers immediately. */
  allowNewServers: boolean;
}

export const DEFAULT_PLATFORM_STATE: PlatformState = {
  maintenance: { enabled: false, message: "INFERA is under maintenance. Please try again in a few minutes." },
  presence: { status: "online", activity: "watching", text: "infera.wtf" },
  disabledCommands: [],
  dashboardBanner: { text: "", tone: "info" },
  allowNewServers: true,
};

const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(value as T) ? (value as T) : fallback);
const str = (value: unknown, max: number, fallback: string) => (typeof value === "string" ? value.slice(0, max) : fallback);

export function normalizePlatformState(raw: Partial<Record<keyof PlatformState, unknown>>): PlatformState {
  const d = DEFAULT_PLATFORM_STATE;
  const m = (raw.maintenance ?? {}) as Record<string, unknown>;
  const p = (raw.presence ?? {}) as Record<string, unknown>;
  const b = (raw.dashboardBanner ?? {}) as Record<string, unknown>;
  return {
    maintenance: { enabled: typeof m.enabled === "boolean" ? m.enabled : d.maintenance.enabled, message: str(m.message, 500, d.maintenance.message) || d.maintenance.message },
    presence: {
      status: pick(p.status, ["online", "idle", "dnd", "invisible"] as const, d.presence.status),
      activity: pick(p.activity, ["playing", "watching", "listening", "competing", "custom", "none"] as const, d.presence.activity),
      text: str(p.text, 128, d.presence.text),
    },
    disabledCommands: Array.isArray(raw.disabledCommands)
      ? [...new Set(raw.disabledCommands.filter((name): name is string => typeof name === "string" && /^[a-z0-9_-]{1,40}$/.test(name)))].slice(0, 300)
      : [],
    dashboardBanner: { text: str(b.text, 300, ""), tone: pick(b.tone, ["info", "warning", "danger"] as const, "info") },
    allowNewServers: typeof raw.allowNewServers === "boolean" ? raw.allowNewServers : d.allowNewServers,
  };
}
