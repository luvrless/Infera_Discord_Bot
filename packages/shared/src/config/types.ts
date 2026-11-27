import type { z } from "zod";
import type { PermissionLevel } from "../permissions";

export type ConfigCategory =
  | "general"
  | "moderation"
  | "automod"
  | "security"
  | "welcome"
  | "goodbye"
  | "logging"
  | "leveling"
  | "economy"
  | "tickets"
  | "giveaways"
  | "suggestions"
  | "confessions"
  | "starboard"
  | "voice"
  | "music"
  | "roblox"
  | "social"
  | "permissions";

export type ConfigValueType =
  | "string"
  | "number"
  | "boolean"
  | "string[]"
  | "enum"
  | "snowflake"
  | "snowflake[]"
  | "color"
  | "duration"
  | "object";

export interface ConfigDefinition<T = unknown> {
  /** Dot-path key, e.g. `moderation.log_channel`. Stable public contract. */
  key: string;
  category: ConfigCategory;
  type: ConfigValueType;
  default: T;
  description: string;
  schema: z.ZodType<T>;
  editableBy: PermissionLevel;
  /** Sensitive values are redacted in logs and require elevated access. */
  sensitive: boolean;
  requiresRestart: boolean;
  liveUpdate: boolean;
  /** Schema version for this key. */
  version: number;
  options?: readonly string[];
}

export interface WarningThreshold {
  count: number;
  action: "timeout" | "kick" | "ban";
  durationSeconds: number;
}

export interface ConfigValidationIssue {
  key: string;
  message: string;
}

export interface ConfigPatchResult {
  values: Record<string, unknown>;
  issues: ConfigValidationIssue[];
}
