/**
 * Server presets. Every key below exists in the backend config registry
 * (packages/shared/src/config/registry.ts) and is validated by the API.
 * Applying a preset only writes the keys listed — nothing else is touched.
 */
export interface Preset {
  id: string;
  name: string;
  description: string;
  /** Exact configuration values written by the preset. */
  patch: Record<string, unknown>;
  /** Channel/role settings the preset expects you to fill in afterwards. */
  requires: Array<{ key: string; kind: "channel" | "category" | "role"; why: string }>;
  /** Discord permissions INFERA needs for the enabled modules. */
  permissions: string[];
}

export const PRESETS: Preset[] = [
  {
    id: "community_starter",
    name: "Community Starter",
    description: "Welcome and goodbye messages, leveling, logging and invite protection for a new community.",
    patch: {
      "welcome.enabled": true,
      "welcome.message": "Welcome {user} to **{server}**! You're member #{member_count}.",
      "welcome.embed.enabled": true,
      "goodbye.enabled": true,
      "leveling.enabled": true,
      "logging.enabled": true,
      "logging.member_events": true,
      "logging.moderation_events": true,
      "moderation.enabled": true,
      "automod.enabled": true,
      "automod.anti_invite.enabled": true,
      "automod.anti_phishing.enabled": true,
    },
    requires: [
      { key: "welcome.channel_id", kind: "channel", why: "Where welcome messages are posted" },
      { key: "goodbye.channel_id", kind: "channel", why: "Where goodbye messages are posted" },
      { key: "logging.channel_id", kind: "channel", why: "Where log entries are sent" },
    ],
    permissions: ["Send Messages", "Embed Links", "Manage Messages", "View Audit Log"],
  },
  {
    id: "gaming",
    name: "Gaming Community",
    description: "Faster leveling, multi-winner giveaways and spam and mention limits for busy chat.",
    patch: {
      "leveling.enabled": true,
      "leveling.xp_multiplier": 1.25,
      "leveling.message_cooldown": 30,
      "leveling.voice_xp_enabled": true,
      "giveaways.enabled": true,
      "giveaways.default_winners": 3,
      "automod.enabled": true,
      "automod.anti_spam.enabled": true,
      "automod.anti_mention.enabled": true,
      "voice.enabled": true,
    },
    requires: [
      { key: "leveling.announcement_channel", kind: "channel", why: "Level-up announcements" },
      { key: "voice.lobby_channel_id", kind: "channel", why: "Join-to-create voice lobby" },
      { key: "voice.category_id", kind: "category", why: "Category for temporary voice channels" },
    ],
    permissions: ["Manage Channels", "Move Members", "Manage Messages", "Moderate Members"],
  },
  {
    id: "creator",
    name: "Creator / Streamer",
    description: "YouTube and Twitch feed toggles, an embedded welcome and relaxed link rules for sharing content.",
    patch: {
      "social.youtube.enabled": true,
      "social.twitch.enabled": true,
      "welcome.enabled": true,
      "welcome.embed.enabled": true,
      "welcome.embed.title": "Welcome to the community!",
      "automod.anti_link.enabled": false,
      "starboard.enabled": true,
      "giveaways.enabled": true,
    },
    requires: [
      { key: "welcome.channel_id", kind: "channel", why: "Welcome messages" },
      { key: "starboard.channel_id", kind: "channel", why: "Starred highlights" },
    ],
    permissions: ["Send Messages", "Embed Links", "Add Reactions"],
  },
  {
    id: "competitive",
    name: "Competitive Gaming",
    description: "Strict moderation, warning escalation and raid protection for ranked or tournament servers.",
    patch: {
      "moderation.enabled": true,
      "moderation.require_reason": true,
      "moderation.dm_users": true,
      "moderation.warning_thresholds": [
        { count: 3, action: "timeout", durationSeconds: 3600 },
        { count: 5, action: "kick", durationSeconds: 0 },
        { count: 7, action: "ban", durationSeconds: 0 },
      ],
      "automod.enabled": true,
      "automod.anti_spam.enabled": true,
      "automod.anti_spam.action": "timeout",
      "security.antiraid.enabled": true,
      "security.antiraid.account_age_days": 7,
      "leveling.enabled": true,
    },
    requires: [
      { key: "moderation.log_channel", kind: "channel", why: "Moderation case log" },
      { key: "security.alert_channel", kind: "channel", why: "Raid alerts" },
    ],
    permissions: ["Ban Members", "Kick Members", "Moderate Members", "Manage Messages"],
  },
  {
    id: "support",
    name: "Support Server",
    description: "Ticket system with claiming and transcripts, suggestions and logging for product support.",
    patch: {
      "tickets.enabled": true,
      "tickets.claim_enabled": true,
      "tickets.close_dm": true,
      "tickets.max_open_per_user": 2,
      "suggestions.enabled": true,
      "suggestions.allow_anonymous": false,
      "logging.enabled": true,
      "moderation.enabled": true,
    },
    requires: [
      { key: "tickets.category_id", kind: "category", why: "Where ticket channels are created" },
      { key: "tickets.transcript_channel", kind: "channel", why: "Closed ticket transcripts" },
      { key: "suggestions.channel_id", kind: "channel", why: "Suggestion posts" },
      { key: "tickets.staff_roles", kind: "role", why: "Who can see and manage tickets" },
    ],
    permissions: ["Manage Channels", "Manage Roles", "Send Messages", "Attach Files"],
  },
  {
    id: "marketplace",
    name: "Marketplace",
    description: "Economy with shop and trading, scam and phishing protection, and invite blocking.",
    patch: {
      "economy.enabled": true,
      "economy.shop_enabled": true,
      "economy.trading_enabled": true,
      "economy.gambling_enabled": false,
      "automod.enabled": true,
      "automod.anti_phishing.enabled": true,
      "automod.anti_invite.enabled": true,
      "automod.anti_link.enabled": true,
      "moderation.enabled": true,
      "tickets.enabled": true,
    },
    requires: [{ key: "tickets.category_id", kind: "category", why: "Trade dispute tickets" }],
    permissions: ["Manage Messages", "Manage Channels", "Moderate Members"],
  },
  {
    id: "developer",
    name: "Developer Community",
    description: "Suggestions with review, logging, light automod and a code-friendly caps threshold.",
    patch: {
      "suggestions.enabled": true,
      "logging.enabled": true,
      "automod.enabled": true,
      "automod.anti_caps.enabled": false,
      "automod.anti_spam.enabled": true,
      "automod.anti_phishing.enabled": true,
      "leveling.enabled": true,
      "integrations.roblox.enabled": true,
    },
    requires: [
      { key: "suggestions.channel_id", kind: "channel", why: "Feature requests" },
      { key: "suggestions.review_channel", kind: "channel", why: "Staff review queue" },
    ],
    permissions: ["Send Messages", "Embed Links", "Add Reactions"],
  },
  {
    id: "roleplay",
    name: "Roleplay Community",
    description: "Anonymous confessions, starboard, economy and self-role friendly settings.",
    patch: {
      "confessions.enabled": true,
      "starboard.enabled": true,
      "starboard.threshold": 4,
      "economy.enabled": true,
      "leveling.enabled": true,
      "welcome.enabled": true,
    },
    requires: [
      { key: "confessions.channel_id", kind: "channel", why: "Anonymous confessions" },
      { key: "starboard.channel_id", kind: "channel", why: "Starboard" },
    ],
    permissions: ["Send Messages", "Embed Links", "Manage Roles"],
  },
  {
    id: "minimal",
    name: "Minimal Setup",
    description: "Only moderation and essential automod — everything else is switched off.",
    patch: {
      "moderation.enabled": true,
      "automod.enabled": true,
      "automod.anti_phishing.enabled": true,
      "leveling.enabled": false,
      "economy.enabled": false,
      "giveaways.enabled": false,
      "welcome.enabled": false,
      "goodbye.enabled": false,
      "suggestions.enabled": false,
      "starboard.enabled": false,
    },
    requires: [],
    permissions: ["Moderate Members", "Manage Messages"],
  },
];

/** Module switches offered by the "Custom" preset. */
export const CUSTOM_PRESET_KEYS: Array<{ key: string; label: string }> = [
  { key: "moderation.enabled", label: "Moderation" },
  { key: "automod.enabled", label: "AutoMod" },
  { key: "security.antinuke.enabled", label: "Antinuke" },
  { key: "security.antiraid.enabled", label: "Antiraid" },
  { key: "logging.enabled", label: "Logging" },
  { key: "welcome.enabled", label: "Welcome" },
  { key: "goodbye.enabled", label: "Goodbye" },
  { key: "leveling.enabled", label: "Leveling" },
  { key: "economy.enabled", label: "Economy" },
  { key: "tickets.enabled", label: "Tickets" },
  { key: "giveaways.enabled", label: "Giveaways" },
  { key: "suggestions.enabled", label: "Suggestions" },
  { key: "confessions.enabled", label: "Confessions" },
  { key: "starboard.enabled", label: "Starboard" },
  { key: "voice.enabled", label: "Temporary voice" },
  { key: "music.enabled", label: "Music" },
];
