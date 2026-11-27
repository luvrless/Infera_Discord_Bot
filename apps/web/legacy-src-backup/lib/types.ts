export interface SessionUser {
  id: string;
  username: string;
  globalName: string | null;
  avatar: string | null;
  avatarUrl: string;
  locale: string | null;
}

export interface SessionResponse {
  user: SessionUser;
  expiresAt: string;
  createdAt: string;
  clientId?: string;
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
  level: number;
  scopes: string[];
  bot: BotStatus;
}

export interface ModuleState {
  id: string;
  name: string;
  enabled: boolean;
  configurable: boolean;
  configKey: string | null;
}

export type ConfigValueType =
  | "string"
  | "number"
  | "boolean"
  | "enum"
  | "color"
  | "snowflake"
  | "snowflake[]"
  | "string[]"
  | "object";

export interface ConfigKey {
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
  keys: ConfigKey[];
}

export interface SettingsResponse {
  values: Record<string, unknown>;
  version: number;
  updatedAt: string;
  modules: ModuleState[];
  level: number;
  scopes: string[];
}

export interface Channel {
  id: string;
  name: string;
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

export interface Alert {
  id: string;
  type: string;
  severity: string;
  title: string;
  description?: string;
  guildId?: string | null;
  guildName?: string | null;
  createdAt?: string | null;
}

export interface OverviewResponse {
  analytics: AnalyticsResponse;
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
  recentAudit: Array<{
    id: string;
    action: string;
    actorId: string | null;
    targetId: string | null;
    createdAt: string;
  }>;
}

export interface AnalyticsPoint {
  date: string;
  memberJoins: number;
  memberLeaves: number;
  messages: number;
  commands: number;
  moderation: number;
  automod: number;
  tickets: number;
  voiceMinutes: number;
}

export interface AnalyticsResponse {
  days: number;
  since: string;
  totals: Record<string, number>;
  current: {
    openTickets: number;
    activeGiveaways: number;
    activeWarnings: number;
    cases: number;
  };
  topCommands: Array<{ command: string; uses: number }>;
  usage: Array<{ commandName: string; uses: number; failures: number }>;
  history: AnalyticsPoint[];
  dataAvailable: boolean;
  enabledModules: number;
  totalModules: number;
  modules: ModuleState[];
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
}

export interface ModerationCase {
  id: string;
  caseNumber: number;
  type: string;
  targetId: string;
  moderatorId: string;
  reason: string | null;
  status: string;
  createdAt: string;
  expiresAt: string | null;
  metadata: string;
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
  userId: string;
  moderatorId: string;
  reason: string;
  active: boolean;
  createdAt: string;
  expiresAt: string | null;
}

export interface Appeal {
  id: string;
  caseId: string;
  userId: string;
  status: string;
  answers: string;
  reviewerId: string | null;
  reviewNotes: string | null;
  createdAt: string;
}

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
  exemptions: {
    roles: string[];
    channels: string[];
    badWords: string[];
    regex: string[];
  };
  actions: string[];
}

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
  targetType: string;
  addedBy: string;
  createdAt: string;
}

export interface LevelingStats {
  members: number;
  totalXp: number;
  messages: number;
  highestLevel: number;
  rewards: number;
  exclusions: number;
  top: Array<{ userId: string; totalXp: number; level: number; messages: number }>;
}

export interface LeaderboardEntry {
  userId: string;
  totalXp: number;
  level: number;
  messages: number;
  voiceMinutes: number;
}

export interface LevelReward {
  id: string;
  level: number;
  roleId: string;
  createdAt: string;
}

export interface LevelExclusion {
  id: string;
  targetType: string;
  targetId: string;
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
}

export interface EconomyTransaction {
  id: string;
  fromId: string | null;
  toId: string | null;
  amount: number;
  type: string;
  createdAt: string;
}

export interface Ticket {
  id: string;
  number: number;
  channelId: string;
  userId: string;
  claimedBy: string | null;
  status: string;
  priority: string;
  subject: string | null;
  createdAt: string;
  closedAt: string | null;
}

export interface TicketPanel {
  id: string;
  title: string;
  description: string | null;
  channelId: string | null;
  categoryId: string | null;
  messageId: string | null;
  createdAt: string;
}

export interface Giveaway {
  id: string;
  prize: string;
  channelId: string;
  hostId: string;
  winners: number;
  status: string;
  createdAt: string;
  endsAt: string;
  endedAt: string | null;
  entries: Array<{ userId: string; won: boolean }>;
}

export interface Suggestion {
  id: string;
  content: string;
  status: string;
  anonymous: boolean;
  upvotes: number;
  downvotes: number;
  reviewerId: string | null;
  reviewNote: string | null;
  createdAt: string;
}

export interface RolePanel {
  id: string;
  title: string;
  description: string | null;
  mode: string;
  channelId: string | null;
  createdAt: string;
  options: Array<{ id: string; roleId: string; label: string; emoji: string | null }>;
}

export interface CommandInfo {
  name: string;
  description: string;
  category: string;
  aliases: string[];
  defaultLevel: number;
  cooldownMs: number;
  enabled: boolean;
  level?: number;
  effectiveCooldownMs?: number;
  overridden?: boolean;
  usage?: { uses: number; failures: number };
}

export interface AuditEntry {
  id: string;
  actorId: string | null;
  action: string;
  targetId: string | null;
  metadata: Record<string, unknown>;
  ip: string | null;
  createdAt: string;
}

export interface SocialFeed {
  id: string;
  provider: string;
  sourceId: string;
  channelId: string;
  enabled: boolean;
}

export interface WebhookInfo {
  id: string;
  url: string;
  events: string[];
  enabled: boolean;
  failures: number;
  createdAt: string;
}

export interface StatusResponse {
  status: string;
  components: Array<{ id: string; name: string; status: string }>;
  bot: BotStatus;
  checkedAt: string;
  version: string;
}

export interface CustomCommand {
  id: string;
  guildId: string;
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

export interface ScheduledMessage {
  id: string;
  runAt: string | null;
  channelId: string;
  content: string;
  userId: string;
}

export interface Autoresponder {
  id: string;
  guildId: string;
  trigger: string;
  response: string;
  matchType: string;
  enabled: boolean;
  uses: number;
  createdAt: string;
  updatedAt: string;
}
