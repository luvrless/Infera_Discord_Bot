import { z } from "zod";
import { PermissionLevel } from "../permissions";
import type {
  ConfigCategory,
  ConfigDefinition,
  ConfigPatchResult,
  ConfigValueType,
  WarningThreshold,
} from "./types";

const SNOWFLAKE_RE = /^\d{17,20}$/;
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

const snowflakeSchema = z.string().regex(SNOWFLAKE_RE, "Expected a Discord snowflake");
const colorSchema = z.string().regex(HEX_COLOR_RE, "Expected a #RRGGBB colour");
const snowflakeListSchema = z.array(snowflakeSchema).max(100);
const stringListSchema = z.array(z.string().max(200)).max(100);

interface CommonOptions {
  editableBy?: PermissionLevel;
  sensitive?: boolean;
  requiresRestart?: boolean;
  liveUpdate?: boolean;
  version?: number;
  options?: readonly string[];
}

function base<T>(
  key: string,
  category: ConfigCategory,
  type: ConfigValueType,
  defaultValue: T,
  description: string,
  schema: z.ZodType<T>,
  opts: CommonOptions = {},
): ConfigDefinition<T> {
  return {
    key,
    category,
    type,
    default: defaultValue,
    description,
    schema,
    editableBy: opts.editableBy ?? PermissionLevel.Admin,
    sensitive: opts.sensitive ?? false,
    requiresRestart: opts.requiresRestart ?? false,
    liveUpdate: opts.liveUpdate ?? true,
    version: opts.version ?? 1,
    ...(opts.options ? { options: opts.options } : {}),
  };
}

function str(
  key: string,
  category: ConfigCategory,
  defaultValue: string,
  description: string,
  opts: CommonOptions & { max?: number } = {},
): ConfigDefinition<string> {
  return base(key, category, "string", defaultValue, description, z.string().max(opts.max ?? 2000), opts);
}

function bool(
  key: string,
  category: ConfigCategory,
  defaultValue: boolean,
  description: string,
  opts: CommonOptions = {},
): ConfigDefinition<boolean> {
  return base(key, category, "boolean", defaultValue, description, z.boolean(), opts);
}

function num(
  key: string,
  category: ConfigCategory,
  defaultValue: number,
  description: string,
  opts: CommonOptions & { min?: number; max?: number; integer?: boolean } = {},
): ConfigDefinition<number> {
  let schema = z.number();
  if (opts.integer !== false) schema = schema.int();
  if (opts.min !== undefined) schema = schema.min(opts.min);
  if (opts.max !== undefined) schema = schema.max(opts.max);
  return base(key, category, "number", defaultValue, description, schema, opts);
}

function color(
  key: string,
  category: ConfigCategory,
  defaultValue: string,
  description: string,
  opts: CommonOptions = {},
): ConfigDefinition<string> {
  return base(key, category, "color", defaultValue, description, colorSchema, opts);
}

function snowflake(
  key: string,
  category: ConfigCategory,
  description: string,
  opts: CommonOptions = {},
): ConfigDefinition<string | null> {
  return base(key, category, "snowflake", null, description, snowflakeSchema.nullable(), opts);
}

function snowflakeList(
  key: string,
  category: ConfigCategory,
  description: string,
  opts: CommonOptions = {},
): ConfigDefinition<string[]> {
  return base(key, category, "snowflake[]", [], description, snowflakeListSchema, opts);
}

function stringList(
  key: string,
  category: ConfigCategory,
  description: string,
  opts: CommonOptions = {},
): ConfigDefinition<string[]> {
  return base(key, category, "string[]", [], description, stringListSchema, opts);
}

function enumOf<T extends string>(
  key: string,
  category: ConfigCategory,
  options: readonly T[],
  defaultValue: T,
  description: string,
  opts: CommonOptions = {},
): ConfigDefinition<T> {
  const schema = z.string().refine((value): value is T => (options as readonly string[]).includes(value), {
    message: `Expected one of: ${options.join(", ")}`,
  }) as unknown as z.ZodType<T>;
  return base(key, category, "enum", defaultValue, description, schema, { ...opts, options });
}

const warningThresholdSchema = z
  .array(
    z.object({
      count: z.number().int().positive().max(100),
      action: z.enum(["timeout", "kick", "ban"]),
      durationSeconds: z.number().int().min(0).max(31_536_000).default(0),
    }),
  )
  .max(10);

const permissionOverridesSchema = z.record(z.union([z.boolean(), z.number().int().min(0).max(5)]));

const Admin = PermissionLevel.Admin;
const Moderator = PermissionLevel.Moderator;

/**
 * The single source of truth for every guild setting. The dashboard must use
 * these exact keys; unknown keys are rejected by the API.
 */
export const CONFIG_DEFINITIONS: ConfigDefinition[] = [
  // ---------------------------------------------------------------- general
  str("general.prefix", "general", ".", "Command prefix used for message commands.", { max: 5 }),
  enumOf("general.language", "general", ["en"], "en", "Guild language."),
  str("general.timezone", "general", "UTC", "IANA timezone used for scheduling and timestamps.", { max: 64 }),
  color("general.color", "general", "#8B5CF6", "Primary embed accent colour."),
  enumOf("general.command_mode", "general", ["slash", "prefix", "hybrid"], "hybrid", "Which command interfaces are accepted."),
  str("general.maintenance_notice", "general", "", "Shown when the guild has maintenance mode enabled.", { max: 500 }),
  color("general.default_embed_color", "general", "#8B5CF6", "Fallback embed colour."),

  // ------------------------------------------------------------- moderation
  bool("moderation.enabled", "moderation", true, "Enable moderation commands and automation."),
  snowflake("moderation.log_channel", "moderation", "Channel that receives moderation case logs."),
  bool("moderation.dm_users", "moderation", true, "DM users when a punishment is applied."),
  bool("moderation.require_reason", "moderation", false, "Require a reason for punishments."),
  enumOf("moderation.case_numbering", "moderation", ["incremental", "random"], "incremental", "Case ID strategy."),
  bool("moderation.appeals_enabled", "moderation", false, "Allow users to submit appeals."),
  num("moderation.warning_expiration_days", "moderation", 0, "Days before a warning expires. 0 never expires.", { min: 0, max: 3650 }),
  base<WarningThreshold[]>(
    "moderation.warning_thresholds",
    "moderation",
    "object",
    [],
    "Automatic escalation rules triggered by warning counts.",
    warningThresholdSchema as unknown as z.ZodType<WarningThreshold[]>,
    { editableBy: Admin },
  ),
  snowflakeList("moderation.staff_roles", "moderation", "Roles treated as staff."),
  snowflakeList("moderation.exempt_roles", "moderation", "Roles exempt from moderation automation."),
  snowflakeList("moderation.exempt_channels", "moderation", "Channels exempt from moderation automation."),

  // ---------------------------------------------------------------- automod
  bool("automod.enabled", "automod", true, "Master switch for the automod engine."),
  bool("automod.anti_spam.enabled", "automod", true, "Detect message flooding."),
  num("automod.anti_spam.threshold", "automod", 5, "Messages allowed inside the window.", { min: 2, max: 50 }),
  num("automod.anti_spam.window_seconds", "automod", 5, "Detection window in seconds.", { min: 1, max: 300 }),
  enumOf("automod.anti_spam.action", "automod", ["delete", "warn", "timeout", "kick", "ban"], "delete", "Action taken on trigger."),
  bool("automod.anti_link.enabled", "automod", false, "Block external links."),
  enumOf("automod.anti_link.action", "automod", ["delete", "warn", "timeout", "kick", "ban"], "delete", "Action taken on trigger."),
  bool("automod.anti_invite.enabled", "automod", true, "Block Discord invite links."),
  enumOf("automod.anti_invite.action", "automod", ["delete", "warn", "timeout", "kick", "ban"], "delete", "Action taken on trigger."),
  bool("automod.anti_caps.enabled", "automod", false, "Block excessive capitalisation."),
  num("automod.anti_caps.threshold", "automod", 70, "Minimum percentage of capital letters.", { min: 10, max: 100 }),
  bool("automod.anti_emoji.enabled", "automod", false, "Block emoji spam."),
  bool("automod.anti_mention.enabled", "automod", false, "Block excessive mentions."),
  bool("automod.anti_phishing.enabled", "automod", true, "Block known phishing and scam indicators."),
  bool("automod.bad_words.enabled", "automod", false, "Enable the bad word filter."),
  stringList("automod.bad_words.list", "automod", "Blocked words and phrases."),
  bool("automod.regex.enabled", "automod", false, "Enable custom regex filters."),
  stringList("automod.regex.patterns", "automod", "Custom regular expressions."),
  snowflakeList("automod.exempt_roles", "automod", "Roles exempt from automod."),
  snowflakeList("automod.exempt_channels", "automod", "Channels exempt from automod."),

  // --------------------------------------------------------------- security
  bool("security.antinuke.enabled", "security", false, "Detect destructive administrative actions."),
  num("security.antinuke.threshold", "security", 3, "Destructive actions allowed in the window.", { min: 1, max: 50 }),
  num("security.antinuke.window_seconds", "security", 10, "Detection window in seconds.", { min: 3, max: 600 }),
  enumOf("security.antinuke.action", "security", ["alert", "remove_permissions", "kick", "ban"], "alert", "Response to a detected nuke attempt."),
  bool("security.antiraid.enabled", "security", false, "Detect mass joins and raid behaviour."),
  num("security.antiraid.join_threshold", "security", 10, "Joins allowed in the window.", { min: 2, max: 500 }),
  num("security.antiraid.window_seconds", "security", 10, "Detection window in seconds.", { min: 3, max: 600 }),
  num("security.antiraid.account_age_days", "security", 7, "Minimum account age in days. 0 disables the check.", { min: 0, max: 365 }),
  bool("security.lockdown.enabled", "security", false, "Allow lockdown mode."),
  snowflakeList("security.whitelist", "security", "Users exempt from antinuke enforcement."),
  snowflakeList("security.trusted_roles", "security", "Roles exempt from antinuke enforcement."),
  snowflake("security.alert_channel", "security", "Channel that receives security alerts."),
  bool("security.restore_deleted_channels", "security", true, "Attempt to restore deleted channels."),
  bool("security.restore_deleted_roles", "security", true, "Attempt to restore deleted roles."),
  bool("security.verification_enabled", "security", false, "Enable the verification role gate."),
  snowflake("security.verification_role", "security", "Role granted when a member verifies."),

  // ---------------------------------------------------------------- welcome
  bool("welcome.enabled", "welcome", false, "Send a message when members join."),
  snowflake("welcome.channel_id", "welcome", "Channel for welcome messages."),
  str("welcome.message", "welcome", "Welcome {user} to **{server}**!", "Welcome message. Supports placeholders."),
  bool("welcome.embed.enabled", "welcome", false, "Render the welcome message as an embed."),
  str("welcome.embed.title", "welcome", "", "Welcome embed title.", { max: 256 }),
  str("welcome.embed.description", "welcome", "", "Welcome embed description."),
  color("welcome.embed.color", "welcome", "#8B5CF6", "Welcome embed colour."),
  bool("welcome.image.enabled", "welcome", false, "Generate a welcome card image."),
  bool("welcome.dm.enabled", "welcome", false, "Also DM the welcome message."),
  str("welcome.dm.message", "welcome", "", "Direct message sent on join."),
  snowflakeList("welcome.autoroles", "welcome", "Roles granted automatically on join."),

  // ---------------------------------------------------------------- goodbye
  // Server boost notifications (independent from welcome/goodbye).
  bool("boost.enabled", "welcome", false, "Announce when someone boosts the server."),
  snowflake("boost.channel_id", "welcome", "Channel for boost notifications."),
  str("boost.message", "welcome", "{user} just boosted **{server}**! 💎", "Message text. Supports placeholders."),
  bool("boost.mention", "welcome", true, "Mention the booster above the embed."),
  bool("boost.embed.enabled", "welcome", true, "Send the boost notification as an embed."),
  str("boost.embed.title", "welcome", "Thank you for boosting! 💎", "Boost embed title.", { max: 256 }),
  str("boost.embed.description", "welcome", "{user} boosted **{server}**. We now have **{server.boost.count}** boosts!", "Boost embed description.", { max: 4000 }),
  color("boost.embed.color", "welcome", "#F47FFF", "Boost embed colour."),
  str("boost.embed.footer", "welcome", "", "Boost embed footer.", { max: 2048 }),
  bool("boost.embed.avatar", "welcome", true, "Show the booster's avatar as the thumbnail."),
  str("boost.embed.image", "welcome", "", "Optional large image URL.", { max: 500 }),
  bool("goodbye.enabled", "goodbye", false, "Send a message when members leave."),
  snowflake("goodbye.channel_id", "goodbye", "Channel for goodbye messages."),
  str("goodbye.message", "goodbye", "**{user}** left the server.", "Goodbye message. Supports placeholders."),
  bool("goodbye.embed.enabled", "goodbye", false, "Render the goodbye message as an embed."),
  color("goodbye.embed.color", "goodbye", "#8B5CF6", "Goodbye embed colour."),

  // ---------------------------------------------------------------- logging
  bool("logging.enabled", "logging", false, "Enable event logging."),
  snowflake("logging.channel_id", "logging", "Channel that receives log entries."),
  bool("logging.message_events", "logging", true, "Log message events."),
  bool("logging.member_events", "logging", true, "Log member events."),
  bool("logging.role_events", "logging", true, "Log role events."),
  bool("logging.channel_events", "logging", true, "Log channel events."),
  bool("logging.voice_events", "logging", true, "Log voice events."),
  bool("logging.moderation_events", "logging", true, "Log moderation events."),
  bool("logging.security_events", "logging", true, "Log security events."),
  bool("logging.integration_events", "logging", true, "Log integration events."),

  // --------------------------------------------------------------- leveling
  bool("leveling.enabled", "leveling", true, "Enable XP and leveling."),
  num("leveling.message_xp_min", "leveling", 15, "Minimum XP per message.", { min: 0, max: 1000 }),
  num("leveling.message_xp_max", "leveling", 25, "Maximum XP per message.", { min: 0, max: 1000 }),
  num("leveling.message_cooldown", "leveling", 60, "Seconds between XP grants.", { min: 0, max: 86_400 }),
  bool("leveling.voice_xp_enabled", "leveling", true, "Grant XP for voice activity."),
  num("leveling.voice_xp_rate", "leveling", 5, "XP per minute in voice.", { min: 0, max: 1000 }),
  num("leveling.xp_multiplier", "leveling", 1, "Global XP multiplier.", { min: 0, max: 10, integer: false }),
  num("leveling.daily_cap", "leveling", 5000, "Maximum XP per user per day. 0 disables.", { min: 0, max: 1_000_000 }),
  enumOf("leveling.level_formula", "leveling", ["balanced", "sqrt", "linear", "quadratic"], "balanced", "XP curve used to compute levels. Balanced: about 50 messages per level."),
  snowflake("leveling.announcement_channel", "leveling", "Channel for level-up announcements."),
  str(
    "leveling.announcement_message",
    "leveling",
    "GG {user}, you reached level **{level}**!",
    "Message sent when a member levels up. Supports {user} and {level}.",
  ),
  color("leveling.rank_card_color", "leveling", "#8B5CF6", "Rank card accent colour."),
  str("leveling.rank_card_background", "leveling", "", "Custom rank card background URL.", { max: 500 }),
  bool("leveling.leaderboard_enabled", "leveling", true, "Enable server leaderboards."),
  bool("leveling.global_opt_in", "leveling", false, "Opt in to the global leaderboard."),

  // ---------------------------------------------------------------- economy
  bool("economy.enabled", "economy", true, "Enable the virtual economy."),
  str("economy.currency_name", "economy", "coins", "Display name of the currency.", { max: 32 }),
  str("economy.currency_symbol", "economy", "🪙", "Currency symbol.", { max: 8 }),
  num("economy.starting_balance", "economy", 100, "Balance granted on first use.", { min: 0, max: 1_000_000 }),
  num("economy.daily_reward", "economy", 100, "Daily reward amount.", { min: 0, max: 1_000_000 }),
  num("economy.weekly_reward", "economy", 500, "Weekly reward amount.", { min: 0, max: 10_000_000 }),
  num("economy.work_cooldown", "economy", 3600, "Seconds between work commands.", { min: 0, max: 86_400 }),
  num("economy.transfer_limit", "economy", 10_000, "Maximum single transfer.", { min: 0, max: 100_000_000 }),
  bool("economy.bank_enabled", "economy", true, "Enable bank deposits."),
  bool("economy.shop_enabled", "economy", true, "Enable the shop."),
  bool("economy.trading_enabled", "economy", true, "Enable player trading."),
  bool("economy.gambling_enabled", "economy", true, "Enable gambling games with virtual currency."),

  // ---------------------------------------------------------------- tickets
  bool("tickets.enabled", "tickets", false, "Enable the ticket system."),
  snowflake("tickets.category_id", "tickets", "Category where tickets are created."),
  snowflake("tickets.transcript_channel", "tickets", "Channel that receives transcripts."),
  snowflakeList("tickets.staff_roles", "tickets", "Roles allowed to manage tickets."),
  bool("tickets.claim_enabled", "tickets", true, "Allow staff to claim tickets."),
  num("tickets.max_open_per_user", "tickets", 3, "Maximum open tickets per user.", { min: 1, max: 25 }),
  bool("tickets.close_dm", "tickets", true, "DM the transcript when a ticket closes."),
  enumOf("tickets.default_priority", "tickets", ["low", "normal", "high", "urgent"], "normal", "Default ticket priority."),
  enumOf("tickets.close_action", "tickets", ["delete", "lock"], "delete", "Delete the channel on close, or lock it so it can be reopened."),
  snowflake("tickets.log_channel", "tickets", "Channel that receives ticket activity logs."),
  num("tickets.auto_close_hours", "tickets", 0, "Close tickets with no messages for this many hours. 0 disables.", { min: 0, max: 720 }),
  stringList("tickets.close_reasons", "tickets", "Preset reasons offered when closing a ticket."),
  str("tickets.close_message", "tickets", "This ticket has been closed. Thanks for reaching out!", "Message DMed to the ticket owner on close.", { max: 1000 }),

  // -------------------------------------------------------------- giveaways
  bool("giveaways.enabled", "giveaways", true, "Enable giveaways."),
  num("giveaways.default_duration", "giveaways", 86_400, "Default duration in seconds.", { min: 10, max: 2_592_000 }),
  num("giveaways.default_winners", "giveaways", 1, "Default winner count.", { min: 1, max: 100 }),
  snowflakeList("giveaways.required_roles", "giveaways", "Roles required to enter."),
  snowflakeList("giveaways.excluded_roles", "giveaways", "Roles excluded from entering."),

  // ------------------------------------------------------------- suggestions
  bool("suggestions.enabled", "suggestions", false, "Enable suggestions."),
  snowflake("suggestions.channel_id", "suggestions", "Channel where suggestions are posted."),
  snowflake("suggestions.review_channel", "suggestions", "Channel for staff review."),
  snowflakeList("suggestions.approval_roles", "suggestions", "Roles allowed to review suggestions."),
  bool("suggestions.allow_anonymous", "suggestions", true, "Allow anonymous suggestions."),

  // ------------------------------------------------------------- confessions
  bool("confessions.enabled", "confessions", false, "Allow members to post anonymous confessions."),
  snowflake("confessions.channel_id", "confessions", "Channel that receives confessions."),

  // --------------------------------------------------------------- starboard
  bool("starboard.enabled", "starboard", false, "Enable the starboard."),
  snowflake("starboard.channel_id", "starboard", "Starboard channel."),
  num("starboard.threshold", "starboard", 3, "Reactions required to pin.", { min: 1, max: 100 }),
  str("starboard.emoji", "starboard", "⭐", "Emoji used for starring.", { max: 64 }),
  bool("starboard.ignore_self_reactions", "starboard", true, "Ignore reactions from the author."),

  // ------------------------------------------------------------------- voice
  bool("voice.enabled", "voice", false, "Enable temporary voice channels."),
  snowflake("voice.lobby_channel_id", "voice", "Join-to-create lobby channel."),
  snowflake("voice.category_id", "voice", "Category for temporary channels."),
  num("voice.default_limit", "voice", 0, "Default user limit. 0 is unlimited.", { min: 0, max: 99 }),
  num("voice.default_bitrate", "voice", 64_000, "Default bitrate in bits per second.", { min: 8000, max: 384_000 }),
  bool("voice.allow_user_control", "voice", true, "Allow owners to manage their channel."),

  // ------------------------------------------------------------------- music
  bool("music.enabled", "music", false, "Enable the music module."),
  num("music.default_volume", "music", 80, "Default volume percentage.", { min: 0, max: 200 }),
  num("music.max_volume", "music", 200, "Maximum volume percentage.", { min: 10, max: 500 }),
  snowflakeList("music.dj_roles", "music", "Roles allowed to control playback."),
  num("music.queue_limit", "music", 100, "Maximum queue length.", { min: 1, max: 1000 }),
  enumOf("music.provider", "music", ["youtube", "soundcloud", "auto"], "auto", "Preferred audio provider."),

  // ------------------------------------------------------------------ roblox
  bool("integrations.roblox.enabled", "roblox", true, "Enable Roblox lookups."),
  num("integrations.roblox.cache_ttl", "roblox", 300, "Roblox cache lifetime in seconds.", { min: 0, max: 86_400 }),
  enumOf("integrations.roblox.default_profile_format", "roblox", ["embed", "text"], "embed", "Default Roblox profile output."),

  // ------------------------------------------------------------------ social
  bool("social.youtube.enabled", "social", false, "Enable YouTube feeds."),
  bool("social.twitch.enabled", "social", false, "Enable Twitch feeds."),
  bool("social.twitter.enabled", "social", false, "Enable Twitter/X feeds."),
  bool("social.instagram.enabled", "social", false, "Enable Instagram feeds."),
  bool("social.tiktok.enabled", "social", false, "Enable TikTok feeds."),
  bool("social.reddit.enabled", "social", false, "Enable Reddit feeds."),

  // ------------------------------------------------------------- permissions
  num("permissions.default_level", "permissions", 0, "Default permission level for members.", { min: 0, max: 3 }),
  snowflakeList("permissions.admin_roles", "permissions", "Roles granted administrator level."),
  snowflakeList("permissions.moderator_roles", "permissions", "Roles granted moderator level."),
  base<Record<string, boolean | number>>(
    "permissions.command_overrides",
    "permissions",
    "object",
    {},
    "Per-command permission overrides.",
    permissionOverridesSchema,
    { editableBy: Admin },
  ),
  base<Record<string, boolean | number>>(
    "permissions.channel_overrides",
    "permissions",
    "object",
    {},
    "Per-channel command overrides.",
    permissionOverridesSchema,
    { editableBy: Admin },
  ),
  base<Record<string, boolean | number>>(
    "permissions.user_overrides",
    "permissions",
    "object",
    {},
    "Per-user permission overrides.",
    permissionOverridesSchema,
    { editableBy: Admin },
  ),
];

export const CONFIG_REGISTRY: ReadonlyMap<string, ConfigDefinition> = new Map(
  CONFIG_DEFINITIONS.map((definition) => [definition.key, definition]),
);

export const CONFIG_KEYS: readonly string[] = CONFIG_DEFINITIONS.map((definition) => definition.key);

export function getConfigDefinition(key: string): ConfigDefinition | undefined {
  return CONFIG_REGISTRY.get(key);
}

export function definitionsByCategory(): Record<string, ConfigDefinition[]> {
  const grouped: Record<string, ConfigDefinition[]> = {};
  for (const definition of CONFIG_DEFINITIONS) {
    (grouped[definition.category] ??= []).push(definition);
  }
  return grouped;
}

function clone<T>(value: T): T {
  if (Array.isArray(value)) return value.map((entry) => clone(entry)) as unknown as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, clone(entry)]),
    ) as T;
  }
  return value;
}

/** A fresh object containing every default value. */
export function defaultConfig(): Record<string, unknown> {
  const snapshot: Record<string, unknown> = {};
  for (const definition of CONFIG_DEFINITIONS) snapshot[definition.key] = clone(definition.default);
  return snapshot;
}

/**
 * Validate a flat dot-path patch against the registry. Unknown keys and
 * invalid values are reported rather than silently ignored.
 */
export function validateConfigPatch(patch: Record<string, unknown>): ConfigPatchResult {
  const values: Record<string, unknown> = {};
  const issues: ConfigPatchResult["issues"] = [];

  for (const [key, rawValue] of Object.entries(patch)) {
    const definition = CONFIG_REGISTRY.get(key);
    if (!definition) {
      issues.push({ key, message: "Unknown configuration key" });
      continue;
    }
    const parsed = definition.schema.safeParse(rawValue);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        issues.push({ key, message: issue.message });
      }
      continue;
    }
    values[key] = parsed.data;
  }

  return { values, issues };
}

/** Machine-readable schema document for the dashboard. */
export function configSchemaDocument(): Record<string, unknown> {
  return {
    version: 1,
    categories: Array.from(new Set(CONFIG_DEFINITIONS.map((definition) => definition.category))),
    keys: CONFIG_DEFINITIONS.map((definition) => ({
      key: definition.key,
      category: definition.category,
      type: definition.type,
      default: definition.default,
      description: definition.description,
      editableBy: definition.editableBy,
      sensitive: definition.sensitive,
      requiresRestart: definition.requiresRestart,
      liveUpdate: definition.liveUpdate,
      version: definition.version,
      ...(definition.options ? { options: definition.options } : {}),
    })),
  };
}

export { Moderator };
