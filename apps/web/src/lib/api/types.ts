/**
 * Response types mirroring the INFERA API implementation (apps/api/src/routes).
 * Dates arrive as ISO strings.
 */

export type PermissionLevel = 0 | 1 | 2 | 3 | 4 | 5;
export type DashboardScope =
  | "view_server"
  | "view_analytics"
  | "configure_modules"
  | "manage_moderation"
  | "manage_security"
  | "manage_integrations";

export const LEVEL_NAMES: Record<number, string> = {
  0: "Member",
  1: "Trusted",
  2: "Moderator",
  3: "Administrator",
  4: "Server Owner",
  5: "Platform Owner",
};

export interface PublicUser {
  id: string;
  username: string;
  globalName: string | null;
  avatar: string | null;
  avatarUrl: string;
  locale: string | null;
}

export interface SessionResponse {
  user: PublicUser;
  expiresAt: string;
  createdAt: string;
  clientId: string;
}

export interface BotStatus {
  online: boolean;
  lastSeenAt: string | null;
  guilds: number;
  commands: number;
  user: string | null;
}

export interface GuildListItem {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  permissions: string;
  botInstalled: boolean;
  botOnline: boolean;
  memberCount: number;
}

export interface GuildsResponse {
  guilds: GuildListItem[];
  bot: BotStatus;
}

export interface GuildDetail {
  guild: {
    id: string;
    name: string;
    icon: string | null;
    banner: string | null;
    description: string | null;
    ownerId: string | null;
    memberCount: number;
    premiumTier: number;
    createdAt: string;
    botInstalled: boolean;
    botOnline: boolean;
    userIsOwner: boolean;
  };
  level: PermissionLevel;
  scopes: DashboardScope[];
  bot: BotStatus;
}

export interface ModuleState {
  id: string;
  name: string;
  enabled: boolean;
  configurable: boolean;
  configKey: string | null;
}

export type ConfigValues = Record<string, unknown>;

export interface SettingsResponse {
  values: ConfigValues;
  version: number;
  updatedAt: string;
  modules: ModuleState[];
  level: PermissionLevel;
  scopes: DashboardScope[];
}

export interface ConfigSnapshot {
  guildId: string;
  version: number;
  values: ConfigValues;
  updatedAt: string;
}

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

export interface SchemaKey {
  key: string;
  category: string;
  type: ConfigValueType;
  default: unknown;
  description: string;
  editableBy: number;
  sensitive: boolean;
  requiresRestart: boolean;
  liveUpdate: boolean;
  version: number;
  options?: string[];
}

export interface SchemaDocument {
  version: number;
  categories: string[];
  keys: SchemaKey[];
}

export interface Channel {
  id: string;
  name: string;
  /** 0 text, 2 voice, 4 category, 5 announcement */
  type: number;
  parentId: string | null;
}

export interface Role {
  id: string;
  name: string;
  color: number;
  position: number;
  managed: boolean;
}

export interface ResolvedUser {
  id: string;
  username: string;
  globalName: string | null;
  nick: string | null;
  avatarUrl: string;
  bot: boolean;
  inGuild: boolean;
  roles: string[];
  joinedAt: string | null;
  timedOutUntil: string | null;
}

export interface AuditRow {
  id: string;
  action: string;
  actorId: string | null;
  targetId: string | null;
  createdAt: string;
}

export interface AnalyticsHistoryEntry {
  date: string;
  memberJoins: number;
  memberLeaves: number;
  messages: number;
  commands: number;
  commandFails?: number;
  moderation: number;
  automod: number;
  tickets: number;
  economy?: number;
  voiceMinutes: number;
}

export interface OverviewResponse {
  analytics: {
    guild: { id: string; name: string; memberCount: number; joinedAt: string } | null;
    totals: Record<string, number>;
    current: { openTickets: number; activeGiveaways: number; activeWarnings: number; cases: number };
    topCommands: Array<{ command: string; uses: number }>;
    history: AnalyticsHistoryEntry[];
    dataAvailable: boolean;
  };
  modules: ModuleState[];
  stats: {
    members: number;
    levelingUsers: number;
    openTickets: number;
    activeGiveaways: number;
    moderationCases: number;
    enabledModules: number;
  };
  bot: BotStatus;
  recentAudit: AuditRow[];
}

export interface Alert {
  id: string;
  type: "bot" | "security" | "moderation" | "configuration" | "integration" | "system" | string;
  severity: "critical" | "high" | "warning" | "medium" | "low" | "info" | string;
  title: string;
  description: string;
  createdAt: string | null;
  guildId?: string | null;
  guildName?: string | null;
}

export interface StatusResponse {
  status: "operational" | "degraded";
  components: Array<{ id: string; name: string; status: string }>;
  bot: BotStatus;
  checkedAt: string;
  version: string;
}

// ------------------------------------------------------------ moderation

export interface ModerationCase {
  id: string;
  guildId: string;
  caseNumber: number;
  type: string;
  targetId: string;
  moderatorId: string;
  reason: string | null;
  status: string;
  metadata: string;
  createdAt: string;
  expiresAt: string | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
}

export interface CaseDetail extends ModerationCase {
  evidence: Array<{ id: string; url: string; addedBy: string; createdAt: string }>;
  metadataParsed: Record<string, unknown>;
}

export interface CasesPage {
  total: number;
  rows: ModerationCase[];
  page: number;
  pageSize: number;
}

export interface ModerationStats {
  total: number;
  last30Days: number;
  byType: Array<{ type: string; count: number }>;
  byModerator: Array<{ moderatorId: string; count: number }>;
  activeWarnings: number;
  pendingAppeals: number;
}

export interface Warning {
  id: string;
  caseId: string | null;
  userId: string;
  moderatorId: string;
  reason: string;
  active: boolean;
  createdAt: string;
  expiresAt: string | null;
  removedAt: string | null;
}

export interface Appeal {
  id: string;
  caseId: string;
  userId: string;
  status: "pending" | "approved" | "rejected" | string;
  answers: string;
  reviewerId: string | null;
  reviewNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ModAction = "ban" | "unban" | "kick" | "timeout" | "untimeout" | "warn" | "softban";

export interface WarningThreshold {
  count: number;
  action: "timeout" | "kick" | "ban";
  durationSeconds: number;
}

// --------------------------------------------------------------- automod

export interface AutomodRule {
  type: string;
  label: string;
  description: string;
  enabled: boolean;
  action: string | null;
  threshold: number | null;
  windowSeconds: number | null;
  list: string[] | null;
  supports: { action: boolean; threshold: boolean; window: boolean; list: boolean };
}

export interface AutomodResponse {
  enabled: boolean;
  rules: AutomodRule[];
  exemptions: { roles: string[]; channels: string[]; badWords: string[]; regex: string[] };
  actions: string[];
}

export interface AutomodTestResult {
  matches: Array<{ rule: string; label: string; action: string; reason: string }>;
  tested: number;
}

// -------------------------------------------------------------- security

export interface SecurityEvent {
  id: string;
  type: string;
  severity: string;
  actorId: string | null;
  detail: string;
  resolved: boolean;
  createdAt: string;
}

export interface WhitelistEntry {
  id: string;
  targetId: string;
  targetType: "user" | "role";
  addedBy: string;
  createdAt: string;
}

export interface SecurityResponse {
  values: ConfigValues;
  events: SecurityEvent[];
  whitelist: WhitelistEntry[];
}

export interface LockdownState {
  active: boolean;
  since: string | null;
  actorId: string | null;
  reason: string | null;
  channels: string[];
  lockedCount: number | null;
  source: string;
}

// -------------------------------------------------------------- leveling

export interface LevelingStats {
  members: number;
  totalXp: number;
  messages: number;
  highestLevel: number;
  rewards: number;
  exclusions: number;
  top: Array<{ userId: string; totalXp: number; level: number; messages: number }>;
}

export interface LeaderboardPage {
  items: Array<{ userId: string; totalXp: number; level: number; messages: number; voiceMinutes: number }>;
  total: number;
  page: number;
  pageSize: number;
  pages: number;
}

export interface LevelReward {
  id: string;
  level: number;
  roleId: string;
  createdAt: string;
}

export interface LevelExclusion {
  id: string;
  targetType: "user" | "channel" | "role";
  targetId: string;
  createdAt: string;
}

// --------------------------------------------------------------- economy

export interface EconomyTransaction {
  id: string;
  fromId: string | null;
  toId: string | null;
  amount: number;
  type: string;
  reference: string | null;
  createdAt: string;
}

export interface EconomyItem {
  id: string;
  name: string;
  description: string | null;
  category: string;
  price: number;
  stock: number | null;
  roleId: string | null;
  consumable: boolean;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface EconomyOverview {
  accounts: number;
  wallet: number;
  bank: number;
  lifetime: number;
  richest: Array<{ userId: string; wallet: number; bank: number }>;
  transactions: EconomyTransaction[];
  items: EconomyItem[];
}

export interface EconomyAccount {
  id: string;
  userId: string;
  wallet: number;
  bank: number;
  lifetime: number;
}

// --------------------------------------------------------------- tickets

export interface Ticket {
  id: string;
  panelId: string | null;
  number: number;
  channelId: string;
  userId: string;
  claimedBy: string | null;
  status: "open" | "closed" | string;
  priority: "low" | "normal" | "high" | "urgent" | string;
  subject: string | null;
  createdAt: string;
  closedAt: string | null;
  closedBy: string | null;
  transcript: string | null;
}

export interface TicketPanel {
  id: string;
  channelId: string | null;
  messageId: string | null;
  title: string;
  description: string | null;
  categoryId: string | null;
  createdAt: string;
}

export interface TicketsResponse {
  tickets: Ticket[];
  stats: { open: number; closed: number; total: number };
  panels: TicketPanel[];
}

// ------------------------------------------------------------- giveaways

export interface Giveaway {
  id: string;
  channelId: string;
  messageId: string | null;
  hostId: string;
  prize: string;
  winners: number;
  requiredRoles: string;
  excludedRoles: string;
  status: "active" | "ended" | "cancelled" | string;
  createdAt: string;
  endsAt: string;
  endedAt: string | null;
  entries: Array<{ userId: string; won: boolean }>;
}

// ----------------------------------------------------------- suggestions

export interface Suggestion {
  id: string;
  channelId: string | null;
  messageId: string | null;
  userId: string | null;
  content: string;
  anonymous: boolean;
  status: "pending" | "approved" | "denied" | string;
  reviewerId: string | null;
  reviewNote: string | null;
  upvotes: number;
  downvotes: number;
  createdAt: string;
}

// ----------------------------------------------------------------- roles

export interface RolePanel {
  id: string;
  channelId: string | null;
  messageId: string | null;
  title: string;
  description: string | null;
  mode: "button" | "select";
  createdAt: string;
  options: Array<{ id: string; roleId: string; label: string; emoji: string | null; position: number }>;
}

// ------------------------------------------------------------ automation

export interface CustomCommand {
  id: string;
  name: string;
  description: string | null;
  response: string;
  embed: boolean;
  level: number;
  enabled: boolean;
  uses: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Autoresponder {
  id: string;
  trigger: string;
  response: string;
  matchType: "contains" | "exact" | "starts_with";
  enabled: boolean;
  uses: number;
  createdAt: string;
}

export interface ScheduledMessage {
  id: string;
  runAt: string | null;
  channelId: string;
  content: string;
  userId: string;
}

// -------------------------------------------------------------- commands

export interface CommandDefinition {
  name: string;
  description: string;
  category: string;
  aliases: string[];
  defaultLevel: number;
  cooldownMs: number;
  guildOnly: boolean;
  enabled: boolean;
}

export interface GuildCommand {
  name: string;
  description: string;
  category: string;
  aliases: string[];
  defaultLevel: number;
  cooldownMs: number;
  enabled: boolean;
  level: number;
  effectiveCooldownMs: number;
  overridden: boolean;
  usage: { uses: number; failures: number };
}

// ------------------------------------------------------------- analytics

export interface AnalyticsResponse {
  days: number;
  since: string;
  totals: Record<string, number>;
  current: { openTickets: number; activeGiveaways: number; activeWarnings: number; cases: number };
  topCommands: Array<{ commandName: string; uses: number; failures: number }>;
  usage: Array<{ commandName: string; uses: number; failures: number }>;
  history: AnalyticsHistoryEntry[];
  dataAvailable: boolean;
  enabledModules: number;
  totalModules: number;
  modules: ModuleState[];
}

// ----------------------------------------------------------------- audit

export interface AuditEntry {
  id: string;
  actorId: string | null;
  action: string;
  targetId: string | null;
  metadata: Record<string, unknown>;
  ip: string | null;
  createdAt: string;
}

export interface AuditPage {
  entries: AuditEntry[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ActivityItem {
  id: string;
  kind: "moderation" | "security" | "audit";
  title: string;
  actorId: string | null;
  targetId: string | null;
  detail: string | null;
  createdAt: string;
}

// ---------------------------------------------------------- integrations

export interface SocialFeed {
  id: string;
  provider: string;
  sourceId: string;
  channelId: string;
  lastItemId: string | null;
  enabled: boolean;
  lastCheckedAt: string | null;
  createdAt: string;
}

export interface WebhookRow {
  id: string;
  url: string;
  events: string[];
  enabled: boolean;
  failures: number;
  createdAt: string;
}

export interface IntegrationsResponse {
  providers: Array<{ id: string; enabled: boolean; configKey: string | null }>;
  roblox: { enabled: boolean; cacheTtl: number; profileFormat: string };
  socialFeeds: SocialFeed[];
  webhooks: WebhookRow[];
  botInstalled: boolean;
}

// -------------------------------------------------------------- realtime

export interface RealtimeEnvelope<T = Record<string, unknown>> {
  event: string;
  guildId: string | null;
  timestamp: string;
  data: T;
  eventId: string;
}
