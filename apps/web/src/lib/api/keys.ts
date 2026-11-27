/**
 * Query keys. Every guild-scoped key starts with ["g", guildId] so switching
 * servers can drop a whole guild's cache in one call and stale data from one
 * guild can never satisfy a query for another.
 */
export const keys = {
  session: ["session"] as const,
  guilds: ["guilds"] as const,
  status: ["status"] as const,
  schema: ["config-schema"] as const,
  commandCatalogue: ["commands"] as const,
  commandCategories: ["commands", "categories"] as const,
  accountAlerts: ["notifications"] as const,

  guild: (g: string) => ["g", g] as const,
  detail: (g: string) => ["g", g, "detail"] as const,
  settings: (g: string) => ["g", g, "settings"] as const,
  modules: (g: string) => ["g", g, "modules"] as const,
  overview: (g: string) => ["g", g, "overview"] as const,
  channels: (g: string) => ["g", g, "channels"] as const,
  roles: (g: string) => ["g", g, "roles"] as const,
  alerts: (g: string) => ["g", g, "alerts"] as const,
  welcome: (g: string) => ["g", g, "welcome"] as const,
  user: (g: string, id: string) => ["g", g, "user", id] as const,
  memberSearch: (g: string, q: string) => ["g", g, "member-search", q] as const,
  activity: (g: string) => ["g", g, "activity"] as const,

  moderation: (g: string) => ["g", g, "moderation"] as const,
  modStats: (g: string) => ["g", g, "moderation", "stats"] as const,
  cases: (g: string, params: object) => ["g", g, "moderation", "cases", params] as const,
  caseDetail: (g: string, id: string) => ["g", g, "moderation", "case", id] as const,
  warnings: (g: string, params: object) => ["g", g, "moderation", "warnings", params] as const,
  appeals: (g: string, status: string) => ["g", g, "moderation", "appeals", status] as const,
  history: (g: string, user: string) => ["g", g, "moderation", "history", user] as const,

  automod: (g: string) => ["g", g, "automod"] as const,
  security: (g: string) => ["g", g, "security"] as const,
  lockdown: (g: string) => ["g", g, "security", "lockdown"] as const,

  leveling: (g: string) => ["g", g, "leveling"] as const,
  levelStats: (g: string) => ["g", g, "leveling", "stats"] as const,
  leaderboard: (g: string, type: string, page: number) => ["g", g, "leveling", "leaderboard", type, page] as const,
  rewards: (g: string) => ["g", g, "leveling", "rewards"] as const,
  exclusions: (g: string) => ["g", g, "leveling", "exclusions"] as const,

  economy: (g: string) => ["g", g, "economy"] as const,
  economyOverview: (g: string) => ["g", g, "economy", "overview"] as const,
  transactions: (g: string, page: number) => ["g", g, "economy", "transactions", page] as const,
  economyUser: (g: string, user: string) => ["g", g, "economy", "user", user] as const,

  tickets: (g: string, status: string) => ["g", g, "tickets", status] as const,
  ticketsAll: (g: string) => ["g", g, "tickets"] as const,
  giveaways: (g: string) => ["g", g, "giveaways"] as const,
  suggestions: (g: string) => ["g", g, "suggestions"] as const,

  autoroles: (g: string) => ["g", g, "roles", "autoroles"] as const,
  rolePanels: (g: string) => ["g", g, "roles", "panels"] as const,

  customCommands: (g: string) => ["g", g, "custom-commands"] as const,
  autoresponders: (g: string) => ["g", g, "autoresponders"] as const,
  schedules: (g: string) => ["g", g, "schedules"] as const,

  guildCommands: (g: string) => ["g", g, "commands"] as const,
  analytics: (g: string, days: number) => ["g", g, "analytics", days] as const,
  analyticsAll: (g: string) => ["g", g, "analytics"] as const,
  audit: (g: string, params: object) => ["g", g, "audit", params] as const,
  auditAll: (g: string) => ["g", g, "audit"] as const,

  integrations: (g: string) => ["g", g, "integrations"] as const,
};
