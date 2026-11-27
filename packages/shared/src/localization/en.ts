/**
 * English string catalogue. Keys are the public localisation contract used by
 * the bot, the API and (eventually) the dashboard.
 */
export const en: Record<string, string> = {
  // Generic
  "common.success": "Success.",
  "common.cancelled": "Cancelled.",
  "common.confirm": "Confirm",
  "common.cancel": "Cancel",
  "common.none": "None",
  "common.unknown": "Unknown",
  "common.enabled": "Enabled",
  "common.disabled": "Disabled",
  "common.yes": "Yes",
  "common.no": "No",
  "common.page": "Page {page} of {pages}",
  "common.loading": "Loading…",

  // Errors
  "errors.generic": "Something went wrong. Please try again.",
  "errors.permission_denied": "You do not have permission to use this command.",
  "errors.invalid_argument": "That argument is not valid.",
  "errors.invalid_guild": "This command can only be used in a server.",
  "errors.guild_not_found": "That server could not be found.",
  "errors.feature_disabled": "The **{feature}** module is disabled in this server.",
  "errors.rate_limited": "You are doing that too quickly. Try again in {time}.",
  "errors.external_api_unavailable": "An external service is unavailable right now. Try again shortly.",
  "errors.database_unavailable": "The database is unavailable right now.",
  "errors.bot_missing_permission": "I need the **{permission}** permission to do that.",
  "errors.target_not_found": "I could not find that member.",
  "errors.role_hierarchy": "That member has a role equal to or higher than mine.",
  "errors.self_target": "You cannot target yourself.",
  "errors.bot_target": "You cannot target a bot.",
  "errors.owner_only": "This command is restricted to INFERA platform owners.",
  "errors.cooldown": "This command is on cooldown. Try again in {time}.",
  "errors.unknown_command": "Unknown command. Try `{prefix}help`.",

  // General
  "commands.general.ping.response": "Pong! Gateway: **{gateway}ms** · Round trip: **{roundtrip}ms**",
  "commands.general.uptime.response": "I have been online for **{uptime}**.",
  "commands.general.help.title": "INFERA Command Directory",
  "commands.general.help.description": "Use `{prefix}help <command>` for details on a specific command.",
  "commands.general.help.not_found": "I could not find a command called **{name}**.",
  "commands.general.invite.response": "Add INFERA to your server: {url}",
  "commands.general.support.response": "Join the INFERA support server: {url}",
  "commands.general.serverinfo.title": "Server Information",
  "commands.general.userinfo.title": "User Information",

  // Moderation
  "commands.moderation.ban.success": "Successfully banned **{user}**.",
  "commands.moderation.ban.failed": "I could not ban that member. Check my permissions and the target's role hierarchy.",
  "commands.moderation.unban.success": "Successfully unbanned **{user}**.",
  "commands.moderation.kick.success": "Successfully kicked **{user}**.",
  "commands.moderation.softban.success": "Successfully softbanned **{user}**.",
  "commands.moderation.timeout.success": "Timed out **{user}** for **{duration}**.",
  "commands.moderation.untimeout.success": "Removed the timeout from **{user}**.",
  "commands.moderation.warn.success": "Warned **{user}**. They now have **{count}** warning(s).",
  "commands.moderation.warn.dm": "You were warned in **{server}**: {reason}",
  "commands.moderation.purge.success": "Deleted **{count}** message(s).",
  "commands.moderation.slowmode.success": "Set slowmode to **{duration}** in {channel}.",
  "commands.moderation.lock.success": "Locked {channel}.",
  "commands.moderation.unlock.success": "Unlocked {channel}.",
  "commands.moderation.reason_required": "A reason is required for this action.",
  "commands.moderation.case.created": "Case **#{caseId}** created.",
  "commands.moderation.case.not_found": "Case **#{caseId}** was not found.",
  "commands.moderation.case.voided": "Case **#{caseId}** has been voided.",

  // Modules
  "modules.moderation.enabled": "The moderation module is now enabled.",
  "modules.moderation.disabled": "The moderation module is now disabled.",
  "modules.automod.enabled": "The automod module is now enabled.",
  "modules.automod.disabled": "The automod module is now disabled.",
  "modules.leveling.enabled": "The leveling module is now enabled.",
  "modules.leveling.disabled": "The leveling module is now disabled.",
  "modules.economy.enabled": "The economy module is now enabled.",
  "modules.economy.disabled": "The economy module is now disabled.",
  "modules.tickets.enabled": "The ticket module is now enabled.",
  "modules.tickets.disabled": "The ticket module is now disabled.",

  // Configuration
  "config.updated": "Configuration updated.",
  "config.reset": "Configuration section reset to defaults.",
  "config.invalid_key": "`{key}` is not a recognised configuration key.",
  "config.invalid_value": "`{key}`: {message}",
  "config.prefix.updated": "Command prefix updated to `{prefix}`.",
  "config.language.updated": "Language updated to **{language}**.",
  "config.timezone.updated": "Timezone updated to **{timezone}**.",

  // Leveling
  "commands.leveling.rank.title": "Rank Card",
  "commands.leveling.rank.position": "Rank **#{rank}** of **{total}**",
  "commands.leveling.level_up": "GG {user}, you reached level **{level}**!",
  "commands.leveling.disabled": "Leveling is disabled in this server.",
  "commands.leveling.no_data": "No XP data yet. Start chatting to earn XP!",

  // Economy
  "commands.economy.balance": "**{user}** has **{amount}** {currency}.",
  "commands.economy.daily.claimed": "You claimed your daily **{amount}** {currency}.",
  "commands.economy.daily.cooldown": "You already claimed your daily reward. Come back in **{time}**.",
  "commands.economy.insufficient_funds": "You do not have enough {currency}.",
  "commands.economy.transfer.success": "Transferred **{amount}** {currency} to **{user}**.",
  "commands.economy.disabled": "The economy is disabled in this server.",
  "commands.economy.gambling_disabled": "Gambling games are disabled in this server.",

  // Tickets
  "tickets.created": "Your ticket has been created: {channel}",
  "tickets.closed": "Ticket closed by {user}.",
  "tickets.claimed": "Ticket claimed by {user}.",
  "tickets.max_open": "You already have the maximum number of open tickets.",
  "tickets.disabled": "The ticket system is disabled in this server.",

  // Giveaways
  "giveaways.created": "Giveaway started in {channel}.",
  "giveaways.ended": "Giveaway ended. Winners: {winners}",
  "giveaways.no_entries": "No valid entries, so there are no winners.",
  "giveaways.disabled": "Giveaways are disabled in this server.",

  // Suggestions
  "suggestions.created": "Your suggestion has been submitted.",
  "suggestions.approved": "Suggestion approved.",
  "suggestions.denied": "Suggestion denied.",

  // Dashboard / API
  "dashboard.api.success": "OK",
  "dashboard.api.validation_error": "A valid value is required.",
  "dashboard.api.unauthorized": "Authentication is required.",
  "dashboard.api.forbidden": "You do not have access to this resource.",
  "dashboard.api.not_found": "The requested resource was not found.",
  "dashboard.api.rate_limited": "Too many requests. Try again shortly.",
  "dashboard.api.internal_error": "An internal error occurred.",

  // Security
  "security.lockdown.enabled": "Server lockdown enabled by {user}.",
  "security.lockdown.disabled": "Server lockdown lifted by {user}.",
  "security.antinuke.triggered": "Antinuke triggered: {detail}",
  "security.antiraid.triggered": "Antiraid triggered: {detail}",
  "security.alert.channel_missing": "No security alert channel is configured.",
};

export const LOCALES = ["en"] as const;
export type Locale = (typeof LOCALES)[number];
