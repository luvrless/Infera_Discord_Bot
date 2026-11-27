/**
 * Platform-wide constants shared by every INFERA process.
 */

export const INFERA_NAME = "INFERA";
export const INFERA_WEBSITE = "https://infera.wtf";
export const INFERA_API_URL = "https://api.infera.wtf";
export const INFERA_SUPPORT_SERVER = "https://discord.gg/gFF6GxXVmJ";

/** Brand accent used when a guild has not configured a colour. */
export const BRAND_COLOR = 0x8b5cf6;
export const BRAND_COLOR_HEX = "#8B5CF6";

export const DEFAULT_PREFIX = ".";

export const EMBED_FOOTER = "INFERA";

/** Hard limits enforced by Discord that INFERA validates against. */
export const DISCORD_LIMITS = {
  messageContent: 2000,
  embedDescription: 4096,
  embedFieldValue: 1024,
  embedFields: 25,
  embedTitle: 256,
  embedAuthorName: 256,
  embedFooterText: 2048,
  nickname: 32,
  topic: 1024,
  reason: 512,
  slowmodeMax: 21600,
  timeoutMaxMs: 28 * 24 * 60 * 60 * 1000,
  purgeMax: 1000,
  bulkDeleteMax: 100,
  voiceChannelName: 100,
} as const;

export const CACHE_PREFIX = "infera";

export const DEFAULT_COOLDOWN_MS = 3_000;

/** Maximum number of canonical commands the bot advertises. */
export const COMMAND_TARGET = 400;
