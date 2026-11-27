/**
 * Permission model shared by the bot, API and dashboard.
 *
 * Levels are ordered; a higher level always satisfies a lower requirement.
 * Guild-configured roles map onto these levels through GuildConfig.
 */
export const PermissionLevel = {
  Member: 0,
  Trusted: 1,
  Moderator: 2,
  Admin: 3,
  GuildOwner: 4,
  PlatformOwner: 5,
} as const;

export type PermissionLevel = (typeof PermissionLevel)[keyof typeof PermissionLevel];

export const PERMISSION_LEVEL_NAMES: Record<PermissionLevel, string> = {
  0: "Member",
  1: "Trusted",
  2: "Moderator",
  3: "Administrator",
  4: "Guild Owner",
  5: "Platform Owner",
};

export function isAtLeast(level: PermissionLevel, required: PermissionLevel): boolean {
  return level >= required;
}

export function highestLevel(levels: readonly PermissionLevel[]): PermissionLevel {
  return levels.reduce<PermissionLevel>((max, level) => (level > max ? level : max), 0);
}

/** Dashboard capabilities derived from a member's guild permission level. */
export const DashboardScope = {
  ViewServer: "view_server",
  ViewAnalytics: "view_analytics",
  ConfigureModules: "configure_modules",
  ManageModeration: "manage_moderation",
  ManageSecurity: "manage_security",
  ManageIntegrations: "manage_integrations",
} as const;

export type DashboardScope = (typeof DashboardScope)[keyof typeof DashboardScope];

const SCOPE_REQUIREMENTS: Record<DashboardScope, PermissionLevel> = {
  view_server: PermissionLevel.Trusted,
  view_analytics: PermissionLevel.Moderator,
  configure_modules: PermissionLevel.Admin,
  manage_moderation: PermissionLevel.Moderator,
  manage_security: PermissionLevel.Admin,
  manage_integrations: PermissionLevel.Admin,
};

export function scopesForLevel(level: PermissionLevel): DashboardScope[] {
  return (Object.keys(SCOPE_REQUIREMENTS) as DashboardScope[]).filter(
    (scope) => level >= SCOPE_REQUIREMENTS[scope],
  );
}

export function hasScope(level: PermissionLevel, scope: DashboardScope): boolean {
  return level >= SCOPE_REQUIREMENTS[scope];
}

/**
 * Discord permission flags used for bot-permission preflight checks.
 * Values mirror discord.js PermissionFlagsBits.
 */
export const DiscordPermissions = {
  CreateInstantInvite: 1n << 0n,
  KickMembers: 1n << 1n,
  BanMembers: 1n << 2n,
  Administrator: 1n << 3n,
  ManageChannels: 1n << 4n,
  ManageGuild: 1n << 5n,
  AddReactions: 1n << 6n,
  ViewAuditLog: 1n << 7n,
  PrioritySpeaker: 1n << 8n,
  Stream: 1n << 9n,
  ViewChannel: 1n << 10n,
  SendMessages: 1n << 11n,
  SendTTSMessages: 1n << 12n,
  ManageMessages: 1n << 13n,
  EmbedLinks: 1n << 14n,
  AttachFiles: 1n << 15n,
  ReadMessageHistory: 1n << 16n,
  MentionEveryone: 1n << 17n,
  UseExternalEmojis: 1n << 18n,
  ViewGuildInsights: 1n << 19n,
  Connect: 1n << 20n,
  Speak: 1n << 21n,
  MuteMembers: 1n << 22n,
  DeafenMembers: 1n << 23n,
  MoveMembers: 1n << 24n,
  UseVAD: 1n << 25n,
  ChangeNickname: 1n << 26n,
  ManageNicknames: 1n << 27n,
  ManageRoles: 1n << 28n,
  ManageWebhooks: 1n << 29n,
  ManageGuildExpressions: 1n << 30n,
  UseApplicationCommands: 1n << 31n,
  RequestToSpeak: 1n << 32n,
  ManageEvents: 1n << 33n,
  ManageThreads: 1n << 34n,
  CreatePublicThreads: 1n << 35n,
  CreatePrivateThreads: 1n << 36n,
  UseExternalStickers: 1n << 37n,
  SendMessagesInThreads: 1n << 38n,
  UseEmbeddedActivities: 1n << 39n,
  ModerateMembers: 1n << 40n,
} as const;

export const DISCORD_PERMISSION_NAMES: Record<string, bigint> = { ...DiscordPermissions };

/** Combine several flags into a single bitfield. */
export function permissionBits(...flags: bigint[]): bigint {
  return flags.reduce((acc, flag) => acc | flag, 0n);
}
