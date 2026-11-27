import type { PrismaClient } from "@infera/database";
import type { Cache } from "@infera/shared";
import { AnalyticsService } from "./analytics-service";
import { AuditService } from "./audit-service";
import { GuildConfigService } from "./config-service";
import { DiscordApi } from "./discord-api";
import { EconomyService } from "./economy-service";
import { GiveawayService } from "./giveaway-service";
import { LevelingService } from "./leveling-service";
import { ModerationService } from "./moderation-service";
import { PermissionService } from "./permission-service";
import { RealtimeService } from "./realtime-service";
import { ReminderService } from "./reminder-service";
import { SchedulerService } from "./scheduler-service";
import { SuggestionService } from "./suggestion-service";
import { PlatformNotificationService } from "./platform-notification-service";
import { TicketService } from "./ticket-service";

export interface ServiceContainer {
  db: PrismaClient;
  cache: Cache;
  discord: DiscordApi;
  realtime: RealtimeService;
  audit: AuditService;
  analytics: AnalyticsService;
  config: GuildConfigService;
  permissions: PermissionService;
  moderation: ModerationService;
  leveling: LevelingService;
  economy: EconomyService;
  tickets: TicketService;
  giveaways: GiveawayService;
  suggestions: SuggestionService;
  platformNotifications: PlatformNotificationService;
  reminders: ReminderService;
  scheduler: SchedulerService;
}

export interface ServiceOptions {
  db: PrismaClient;
  cache: Cache;
  discordToken: string;
  /** The bot's own user ID, required for ticket channel overwrites. */
  botUserId: string;
  /**
   * Persist realtime envelopes to the database so other processes can relay
   * them. Enable when REDIS_URL is not configured.
   */
  realtimeOutbox?: boolean;
}

/** Wire every service once; all processes share this container shape. */
export function createServices(options: ServiceOptions): ServiceContainer {
  const { db, cache, discordToken, botUserId } = options;
  const discord = new DiscordApi(discordToken);
  const realtime = new RealtimeService(cache, options.realtimeOutbox ? { outbox: db } : {});
  const audit = new AuditService(db);
  const analytics = new AnalyticsService(db, realtime);
  const config = new GuildConfigService(db, cache, realtime);
  const permissions = new PermissionService(config);
  const moderation = new ModerationService(db, discord, config, realtime, audit, analytics, cache);
  const leveling = new LevelingService(db, config, realtime, analytics, cache, discord);
  const economy = new EconomyService(db, config, realtime, analytics, cache);
  const tickets = new TicketService(db, discord, config, realtime, analytics, audit, cache, botUserId);
  const giveaways = new GiveawayService(db, discord, config, realtime, analytics);
  const suggestions = new SuggestionService(db, discord, config, realtime);
  const platformNotifications = new PlatformNotificationService(db);
  const reminders = new ReminderService(db);
  const scheduler = new SchedulerService(db, discord);

  return {
    db,
    cache,
    discord,
    realtime,
    audit,
    analytics,
    config,
    permissions,
    moderation,
    leveling,
    economy,
    tickets,
    giveaways,
    suggestions,
    platformNotifications,
    reminders,
    scheduler,
  };
}

export * from "./types";
export type {
  DiscordChannel,
  DiscordGuild,
  DiscordMember,
  DiscordMessage,
  DiscordRole,
  DiscordUser,
} from "./discord-api";
export { AnalyticsService } from "./analytics-service";
export { AuditService } from "./audit-service";
export { GuildConfigService, MODULES } from "./config-service";
export { PlatformNotificationService, type PlatformNotificationView } from "./platform-notification-service";
export { DiscordApi, guildMemberCount } from "./discord-api";
export { EconomyService } from "./economy-service";
export { GiveawayService } from "./giveaway-service";
export { LevelingService, levelFromXp, xpForLevel } from "./leveling-service";
export { ModerationService } from "./moderation-service";
export { PermissionService } from "./permission-service";
export { REALTIME_OUTBOX_SOURCE, RealtimeService } from "./realtime-service";
export { ReminderService } from "./reminder-service";
export { SchedulerService } from "./scheduler-service";
export { SuggestionService } from "./suggestion-service";
export { TicketService } from "./ticket-service";
