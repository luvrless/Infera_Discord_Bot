export interface Preset {
  id: string;
  name: string;
  description: string;
  patch: Record<string, unknown>;
  modules?: Record<string, boolean>;
}

/**
 * Presets only touch keys the bot actually reads. Anything not listed here is
 * left exactly as the server owner configured it.
 */
export const PRESETS: Preset[] = [
  {
    id: "community_starter",
    name: "Community Starter",
    description: "Welcome messages, leveling, logging and invite protection for a new community.",
    patch: {
      "welcome.enabled": true,
      "welcome.message": "Welcome {user} to **{server}**! Say hi in #general.",
      "welcome.embed.enabled": true,
      "goodbye.enabled": true,
      "goodbye.message": "**{user}** left the server.",
      "leveling.enabled": true,
      "leveling.announcement_message": "GG {user}, you reached level **{level}**!",
      "logging.enabled": true,
      "logging.member_events": true,
      "automod.enabled": true,
      "automod.anti_invite.enabled": true,
      "moderation.enabled": true,
    },
  },
  {
    id: "gaming",
    name: "Gaming Community",
    description: "Leveling, giveaway defaults and mention limits tuned for busy gaming servers.",
    patch: {
      "leveling.enabled": true,
      "leveling.xp_multiplier": 1.25,
      "leveling.message_cooldown": 30,
      "giveaways.enabled": true,
      "giveaways.default_winners": 3,
      "automod.enabled": true,
      "automod.anti_spam.enabled": true,
      "automod.anti_mention.enabled": true,
      "general.color": "#8B5CF6",
    },
  },
  {
    id: "creator",
    name: "Creator / Streamer",
    description: "Social feed toggles, welcome flow and relaxed chat rules.",
    patch: {
      "social.youtube.enabled": true,
      "social.twitch.enabled": true,
      "welcome.enabled": true,
      "welcome.embed.enabled": true,
      "welcome.embed.title": "Welcome to the stream community!",
      "logging.enabled": false,
      "automod.anti_link.enabled": false,
    },
  },
  {
    id: "competitive",
    name: "Competitive Gaming",
    description: "Strict automod, moderation logging and leveling for ranked communities.",
    patch: {
      "automod.enabled": true,
      "automod.anti_spam.enabled": true,
      "automod.anti_caps.enabled": true,
      "automod.anti_mention.enabled": true,
      "automod.anti_phishing.enabled": true,
      "moderation.enabled": true,
      "moderation.dm_users": true,
      "logging.enabled": true,
      "leveling.enabled": true,
    },
  },
  {
    id: "support",
    name: "Support Server",
    description: "Tickets, staff logging and a professional welcome message.",
    patch: {
      "tickets.enabled": true,
      "tickets.claim_enabled": true,
      "tickets.default_priority": "normal",
      "moderation.enabled": true,
      "logging.enabled": true,
      "welcome.enabled": true,
      "welcome.embed.enabled": true,
      "welcome.embed.title": "Thanks for joining support",
    },
  },
  {
    id: "marketplace",
    name: "Marketplace",
    description: "Economy, shop, anti-link and anti-invite protections.",
    patch: {
      "economy.enabled": true,
      "economy.shop_enabled": true,
      "economy.currency_name": "credits",
      "economy.currency_symbol": "💳",
      "automod.enabled": true,
      "automod.anti_link.enabled": true,
      "automod.anti_invite.enabled": true,
      "automod.anti_phishing.enabled": true,
    },
  },
  {
    id: "developer",
    name: "Developer Community",
    description: "Commands, leveling, suggestions and logging for technical servers.",
    patch: {
      "leveling.enabled": true,
      "suggestions.enabled": true,
      "suggestions.allow_anonymous": false,
      "logging.enabled": true,
      "automod.enabled": true,
      "automod.anti_invite.enabled": false,
    },
  },
  {
    id: "roleplay",
    name: "Roleplay Community",
    description: "Welcome flow, leveling and softer automod for creative servers.",
    patch: {
      "welcome.enabled": true,
      "welcome.embed.enabled": true,
      "welcome.embed.title": "Welcome, adventurer",
      "leveling.enabled": true,
      "automod.enabled": false,
      "moderation.enabled": true,
    },
  },
  {
    id: "minimal",
    name: "Minimal Setup",
    description: "Only moderation and invite filtering. Everything optional is switched off.",
    patch: {
      "welcome.enabled": false,
      "goodbye.enabled": false,
      "leveling.enabled": false,
      "economy.enabled": false,
      "giveaways.enabled": false,
      "suggestions.enabled": false,
      "tickets.enabled": false,
      "logging.enabled": false,
      "starboard.enabled": false,
      "voice.enabled": false,
      "music.enabled": false,
      "automod.enabled": true,
      "automod.anti_invite.enabled": true,
      "automod.anti_phishing.enabled": true,
    },
  },
  {
    id: "custom",
    name: "Custom",
    description: "No changes. Configure each module yourself.",
    patch: {},
  },
];
