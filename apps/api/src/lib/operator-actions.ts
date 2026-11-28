import { DiscordPermissions, ErrorCode, InferaError, isOperator, type PlatformState } from "@infera/shared";
import { MODULES } from "@infera/services";
import { db, services } from "./config";

/**
 * Operator action catalog. Every action does real work through Discord or the
 * database; nothing here is simulated. Actions are grouped into moderation,
 * normal and exclusive (platform-owner level) tools.
 */

export type ActionGroup = "moderation" | "normal" | "exclusive";
export type ActionScope = "server" | "member" | "user" | "channel" | "platform";
export type ParamType = "text" | "textarea" | "number" | "boolean" | "snowflake" | "select" | "url";

export interface ActionParam {
  key: string;
  label: string;
  type: ParamType;
  required?: boolean;
  placeholder?: string;
  options?: Array<{ value: string; label: string }>;
  min?: number;
  max?: number;
}

export interface ActionContext {
  actorId: string;
  ip: string | null;
  params: Record<string, unknown>;
}

export interface ActionResult {
  message: string;
  data?: unknown;
}

export interface OperatorAction {
  id: string;
  group: ActionGroup;
  scope: ActionScope;
  label: string;
  description: string;
  /** 0 = safe, 1 = confirm, 2 = type the action id to confirm */
  danger: 0 | 1 | 2;
  params: ActionParam[];
  run: (ctx: ActionContext) => Promise<ActionResult>;
}

// ----------------------------------------------------------------- helpers

const SNOWFLAKE = /^\d{17,20}$/;
const GUILD: ActionParam = { key: "guildId", label: "Server ID", type: "snowflake", required: true };
const USER: ActionParam = { key: "userId", label: "User ID", type: "snowflake", required: true };
const CHANNEL: ActionParam = { key: "channelId", label: "Channel ID", type: "snowflake", required: true };
const ROLE: ActionParam = { key: "roleId", label: "Role ID", type: "snowflake", required: true };
const REASON: ActionParam = { key: "reason", label: "Reason", type: "text", placeholder: "Stored in the audit log" };
const MODULE: ActionParam = { key: "module", label: "Module", type: "select", required: true, options: MODULES.map((m) => ({ value: m.id, label: m.name })) };

function str(ctx: ActionContext, key: string, max = 2000): string {
  const value = ctx.params[key];
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
function id(ctx: ActionContext, key: string): string {
  const value = str(ctx, key, 30);
  if (!SNOWFLAKE.test(value)) throw new InferaError(`A valid ${key.replace("Id", "")} ID is required`, { code: ErrorCode.VALIDATION_ERROR });
  return value;
}
function num(ctx: ActionContext, key: string, min: number, max: number, fallback: number): number {
  const value = Number(ctx.params[key]);
  return Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback;
}
function bool(ctx: ActionContext, key: string): boolean {
  return ctx.params[key] === true || ctx.params[key] === "true";
}
const reasonOf = (ctx: ActionContext) => str(ctx, "reason", 300) || "INFERA operator action";
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function activeGuildIds(): Promise<string[]> {
  return (await db.guild.findMany({ where: { leftAt: null }, select: { id: true } })).map((g) => g.id);
}

async function setConfig(guildId: string, patch: Record<string, unknown>, actorId: string): Promise<void> {
  await services.config.update(guildId, patch, actorId);
}

async function lockdown(guildId: string, locked: boolean): Promise<{ changed: number; total: number }> {
  const channels = await services.discord.getGuildChannels(guildId);
  const targets = channels.filter((channel) => channel.type === 0 || channel.type === 5);
  let changed = 0;
  for (const channel of targets) {
    await services.discord
      .setChannelPermission(channel.id, guildId, locked ? { type: 0, deny: DiscordPermissions.SendMessages.toString() } : { type: 0, allow: DiscordPermissions.SendMessages.toString() }, "INFERA operator lockdown")
      .then(() => {
        changed += 1;
      })
      .catch(() => undefined);
  }
  return { changed, total: targets.length };
}

async function closeTickets(where: { guildId?: string; userId?: string }, actorId: string, reason: string): Promise<number> {
  const open = await db.ticket.findMany({ where: { ...where, status: "open" }, select: { id: true, guildId: true }, take: 500 });
  let closed = 0;
  for (const ticket of open) {
    await services.tickets.close(ticket.guildId, ticket.id, actorId, reason).then(() => {
      closed += 1;
    }).catch(() => undefined);
  }
  return closed;
}

async function backup(guildId: string, reason: string, actorId: string) {
  return services.platform.backupConfig(guildId, reason, actorId);
}

async function ownerOf(guildId: string): Promise<string> {
  const guild = await db.guild.findUnique({ where: { id: guildId }, select: { ownerId: true } });
  if (!guild?.ownerId) throw new InferaError("The server owner isn't known yet", { code: ErrorCode.NOT_FOUND });
  return guild.ownerId;
}

function embed(title: string, description: string, color = 0x3b82f6) {
  return { embeds: [{ title: title.slice(0, 256), description: description.slice(0, 4000), color, footer: { text: "INFERA" }, timestamp: new Date().toISOString() }] };
}

async function setState(patch: Partial<PlatformState>, actorId: string) {
  return services.platform.setState(patch, actorId);
}

async function fetchImageDataUri(url: string): Promise<string> {
  if (!/^https:\/\//.test(url)) throw new InferaError("Use an https:// image URL", { code: ErrorCode.VALIDATION_ERROR });
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new InferaError("Couldn't download that image", { code: ErrorCode.VALIDATION_ERROR });
  const type = response.headers.get("content-type") ?? "image/png";
  if (!/^image\/(png|jpeg|gif|webp)/.test(type)) throw new InferaError("That URL isn't a PNG, JPEG, GIF or WebP image", { code: ErrorCode.VALIDATION_ERROR });
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > 8 * 1024 * 1024) throw new InferaError("The image is larger than 8 MB", { code: ErrorCode.VALIDATION_ERROR });
  return `data:${type.split(";")[0]};base64,${buffer.toString("base64")}`;
}

/** Runs long platform-wide jobs after the request returns. */
function background(task: () => Promise<unknown>): void {
  void task().catch(() => undefined);
}

// ------------------------------------------------------------------ catalog

const A = (action: OperatorAction) => action;

export const OPERATOR_ACTIONS: OperatorAction[] = [
  // ================================================= MODERATION · servers
  A({ id: "server.freeze", group: "moderation", scope: "server", label: "Freeze server", description: "Stops every INFERA feature in this server: commands, panels, buttons, automod, logs and its dashboard. Data is kept.", danger: 2, params: [GUILD, REASON], run: async (ctx) => {
    const guildId = id(ctx, "guildId");
    await services.platform.addBlacklist("frozen", guildId, reasonOf(ctx), ctx.actorId);
    return { message: "Server frozen. The bot ignores it within 20 seconds and its dashboard is locked." };
  } }),
  A({ id: "server.unfreeze", group: "moderation", scope: "server", label: "Unfreeze server", description: "Turns INFERA back on in a frozen server.", danger: 1, params: [GUILD], run: async (ctx) => {
    const count = await services.platform.removeByTarget("frozen", id(ctx, "guildId"));
    return { message: count ? "Server unfrozen." : "That server wasn't frozen." };
  } }),
  A({ id: "server.leave", group: "moderation", scope: "server", label: "Leave server", description: "INFERA leaves the server. Its configuration is kept.", danger: 2, params: [GUILD, REASON], run: async (ctx) => {
    const guildId = id(ctx, "guildId");
    await services.discord.leaveGuild(guildId);
    await services.config.markLeft(guildId).catch(() => undefined);
    return { message: "INFERA left the server." };
  } }),
  A({ id: "server.blacklist", group: "moderation", scope: "server", label: "Blacklist server", description: "INFERA leaves now and leaves again whenever it's re-added.", danger: 2, params: [GUILD, REASON], run: async (ctx) => {
    const guildId = id(ctx, "guildId");
    await services.platform.addBlacklist("guild", guildId, reasonOf(ctx), ctx.actorId);
    await services.discord.leaveGuild(guildId).catch(() => undefined);
    await services.config.markLeft(guildId).catch(() => undefined);
    return { message: "Server blacklisted and left." };
  } }),
  A({ id: "server.unblacklist", group: "moderation", scope: "server", label: "Remove server blacklist", description: "The server can add INFERA again.", danger: 1, params: [GUILD], run: async (ctx) => {
    const count = await services.platform.removeByTarget("guild", id(ctx, "guildId"));
    return { message: count ? "Removed from the blacklist." : "That server wasn't blacklisted." };
  } }),
  A({ id: "server.lockdown", group: "moderation", scope: "server", label: "Lock down server", description: "Stops @everyone from sending messages in every text and announcement channel.", danger: 2, params: [GUILD, REASON], run: async (ctx) => {
    const result = await lockdown(id(ctx, "guildId"), true);
    return { message: `Locked ${result.changed} of ${result.total} channels.` };
  } }),
  A({ id: "server.unlockdown", group: "moderation", scope: "server", label: "Lift lockdown", description: "Allows @everyone to send messages again in every text channel.", danger: 1, params: [GUILD], run: async (ctx) => {
    const result = await lockdown(id(ctx, "guildId"), false);
    return { message: `Unlocked ${result.changed} of ${result.total} channels.` };
  } }),
  A({ id: "server.module_disable", group: "moderation", scope: "server", label: "Disable a module", description: "Turns one INFERA module off in this server.", danger: 1, params: [GUILD, MODULE], run: async (ctx) => {
    await services.config.setModule(id(ctx, "guildId"), str(ctx, "module", 40), false, ctx.actorId);
    return { message: "Module disabled." };
  } }),
  A({ id: "server.module_enable", group: "moderation", scope: "server", label: "Enable a module", description: "Turns one INFERA module on in this server.", danger: 0, params: [GUILD, MODULE], run: async (ctx) => {
    await services.config.setModule(id(ctx, "guildId"), str(ctx, "module", 40), true, ctx.actorId);
    return { message: "Module enabled." };
  } }),
  A({ id: "server.modules_disable_all", group: "moderation", scope: "server", label: "Disable all modules", description: "Turns every switchable module off in this server.", danger: 2, params: [GUILD], run: async (ctx) => {
    const guildId = id(ctx, "guildId");
    let count = 0;
    for (const module of MODULES) {
      await services.config.setModule(guildId, module.id, false, ctx.actorId).then(() => {
        count += 1;
      }).catch(() => undefined);
    }
    return { message: `${count} modules disabled.` };
  } }),
  A({ id: "server.command_disable", group: "moderation", scope: "server", label: "Disable a command here", description: "Blocks one command (prefix and slash) in this server only.", danger: 1, params: [GUILD, { key: "command", label: "Command name", type: "text", required: true }], run: async (ctx) => {
    const guildId = id(ctx, "guildId");
    const commandName = str(ctx, "command", 40).toLowerCase();
    await db.commandOverride.upsert({ where: { guildId_commandName: { guildId, commandName } }, create: { guildId, commandName, enabled: false }, update: { enabled: false } });
    await services.config.invalidateCommandOverrides(guildId);
    return { message: `${commandName} disabled in this server.` };
  } }),
  A({ id: "server.command_enable", group: "moderation", scope: "server", label: "Enable a command here", description: "Allows a command again in this server.", danger: 0, params: [GUILD, { key: "command", label: "Command name", type: "text", required: true }], run: async (ctx) => {
    const guildId = id(ctx, "guildId");
    const commandName = str(ctx, "command", 40).toLowerCase();
    await db.commandOverride.updateMany({ where: { guildId, commandName }, data: { enabled: true } });
    await services.config.invalidateCommandOverrides(guildId);
    return { message: `${commandName} enabled in this server.` };
  } }),
  A({ id: "server.tickets_close_all", group: "moderation", scope: "server", label: "Close all open tickets", description: "Closes every open ticket in this server with transcripts.", danger: 2, params: [GUILD, REASON], run: async (ctx) => {
    const closed = await closeTickets({ guildId: id(ctx, "guildId") }, ctx.actorId, reasonOf(ctx));
    return { message: `${closed} tickets closed.` };
  } }),
  A({ id: "server.tickets_disable", group: "moderation", scope: "server", label: "Disable tickets", description: "Members can no longer open tickets here.", danger: 1, params: [GUILD], run: async (ctx) => {
    await setConfig(id(ctx, "guildId"), { "tickets.enabled": false }, ctx.actorId);
    return { message: "Tickets disabled." };
  } }),
  A({ id: "server.giveaways_cancel_all", group: "moderation", scope: "server", label: "Cancel all giveaways", description: "Cancels every running giveaway in this server.", danger: 2, params: [GUILD], run: async (ctx) => {
    const guildId = id(ctx, "guildId");
    const active = await db.giveaway.findMany({ where: { guildId, status: "active" }, select: { id: true } });
    let cancelled = 0;
    for (const giveaway of active) {
      await services.giveaways.cancel(giveaway.id, ctx.actorId).then(() => {
        cancelled += 1;
      }).catch(() => undefined);
    }
    return { message: `${cancelled} giveaways cancelled.` };
  } }),
  A({ id: "server.automod_disable", group: "moderation", scope: "server", label: "Disable automod", description: "Turns the automod engine off here.", danger: 1, params: [GUILD], run: async (ctx) => {
    await setConfig(id(ctx, "guildId"), { "automod.enabled": false }, ctx.actorId);
    return { message: "Automod disabled." };
  } }),
  A({ id: "server.automod_enable", group: "moderation", scope: "server", label: "Enable automod", description: "Turns the automod engine on here.", danger: 0, params: [GUILD], run: async (ctx) => {
    await setConfig(id(ctx, "guildId"), { "automod.enabled": true }, ctx.actorId);
    return { message: "Automod enabled." };
  } }),
  A({ id: "server.antinuke_enable", group: "moderation", scope: "server", label: "Enable anti-nuke", description: "Turns anti-nuke protection on here.", danger: 1, params: [GUILD], run: async (ctx) => {
    await setConfig(id(ctx, "guildId"), { "security.antinuke.enabled": true }, ctx.actorId);
    return { message: "Anti-nuke enabled." };
  } }),
  A({ id: "server.antinuke_disable", group: "moderation", scope: "server", label: "Disable anti-nuke", description: "Turns anti-nuke protection off here.", danger: 1, params: [GUILD], run: async (ctx) => {
    await setConfig(id(ctx, "guildId"), { "security.antinuke.enabled": false }, ctx.actorId);
    return { message: "Anti-nuke disabled." };
  } }),
  A({ id: "server.antiraid_enable", group: "moderation", scope: "server", label: "Enable anti-raid", description: "Turns anti-raid protection on here.", danger: 1, params: [GUILD], run: async (ctx) => {
    await setConfig(id(ctx, "guildId"), { "security.antiraid.enabled": true }, ctx.actorId);
    return { message: "Anti-raid enabled." };
  } }),
  A({ id: "server.antiraid_disable", group: "moderation", scope: "server", label: "Disable anti-raid", description: "Turns anti-raid protection off here.", danger: 1, params: [GUILD], run: async (ctx) => {
    await setConfig(id(ctx, "guildId"), { "security.antiraid.enabled": false }, ctx.actorId);
    return { message: "Anti-raid disabled." };
  } }),
  A({ id: "server.config_reset_section", group: "moderation", scope: "server", label: "Reset a config section", description: "Resets one settings section to defaults (a backup is saved first).", danger: 2, params: [GUILD, { key: "section", label: "Section", type: "text", required: true, placeholder: "e.g. tickets, welcome, leveling" }], run: async (ctx) => {
    const guildId = id(ctx, "guildId");
    const section = str(ctx, "section", 40).toLowerCase();
    if (!/^[a-z_]{2,40}$/.test(section)) throw new InferaError("Enter a section name like tickets", { code: ErrorCode.VALIDATION_ERROR });
    const saved = await backup(guildId, `Before reset of ${section}`, ctx.actorId);
    await services.config.reset(guildId, section, ctx.actorId);
    return { message: `${section} reset. Backup ${saved?.id ?? "skipped (no config)"}.` };
  } }),
  A({ id: "server.config_reset_all", group: "moderation", scope: "server", label: "Reset entire configuration", description: "Resets every setting to defaults (a backup is saved first).", danger: 2, params: [GUILD], run: async (ctx) => {
    const guildId = id(ctx, "guildId");
    const saved = await backup(guildId, "Before full reset", ctx.actorId);
    await services.config.reset(guildId, null, ctx.actorId);
    return { message: `Configuration reset. Backup ${saved?.id ?? "skipped (no config)"}.` };
  } }),
  A({ id: "server.config_restore", group: "moderation", scope: "server", label: "Restore a config backup", description: "Restores a saved backup (the current config is backed up first).", danger: 2, params: [GUILD, { key: "backupId", label: "Backup ID", type: "text", required: true }], run: async (ctx) => {
    const guildId = id(ctx, "guildId");
    const saved = await services.platform.backup(str(ctx, "backupId", 40));
    if (!saved || saved.guildId !== guildId) throw new InferaError("Backup not found for this server", { code: ErrorCode.NOT_FOUND });
    await backup(guildId, "Before restore", ctx.actorId);
    await services.config.restoreRaw(guildId, saved.data, ctx.actorId);
    return { message: "Backup restored." };
  } }),
  A({ id: "server.permissions_reset", group: "moderation", scope: "server", label: "Reset dashboard permissions", description: "Removes every custom dashboard permission (roles/users) in this server.", danger: 2, params: [GUILD], run: async (ctx) => {
    const guildId = id(ctx, "guildId");
    const rows = await db.guildPermission.findMany({ where: { guildId } });
    await services.platform.setSetting(`backup:permissions:${guildId}:${Date.now()}`, rows, ctx.actorId);
    const result = await db.guildPermission.deleteMany({ where: { guildId } });
    return { message: `${result.count} permission entries removed (a copy was saved).` };
  } }),
  A({ id: "server.command_overrides_reset", group: "moderation", scope: "server", label: "Reset command overrides", description: "Removes every per-command override in this server.", danger: 2, params: [GUILD], run: async (ctx) => {
    const guildId = id(ctx, "guildId");
    const rows = await db.commandOverride.findMany({ where: { guildId } });
    await services.platform.setSetting(`backup:overrides:${guildId}:${Date.now()}`, rows, ctx.actorId);
    const result = await db.commandOverride.deleteMany({ where: { guildId } });
    await services.config.invalidateCommandOverrides(guildId);
    return { message: `${result.count} overrides removed (a copy was saved).` };
  } }),
  A({ id: "server.leveling_reset", group: "moderation", scope: "server", label: "Reset all levels", description: "Wipes XP and levels of every member in this server.", danger: 2, params: [GUILD], run: async (ctx) => {
    const count = await services.leveling.resetGuild(id(ctx, "guildId"));
    return { message: `${count} members reset.` };
  } }),
  A({ id: "server.economy_reset", group: "moderation", scope: "server", label: "Reset economy", description: "Sets every wallet and bank in this server to 0.", danger: 2, params: [GUILD], run: async (ctx) => {
    const result = await db.economyAccount.updateMany({ where: { guildId: id(ctx, "guildId") }, data: { wallet: 0, bank: 0 } });
    return { message: `${result.count} accounts reset.` };
  } }),
  A({ id: "server.warn_owner", group: "moderation", scope: "server", label: "Warn the server owner", description: "DMs the owner an official warning from the INFERA team.", danger: 1, params: [GUILD, { key: "message", label: "Warning", type: "textarea", required: true }], run: async (ctx) => {
    const owner = await ownerOf(id(ctx, "guildId"));
    await services.discord.sendDm(owner, embed("⚠️ Warning from the INFERA team", str(ctx, "message", 3500), 0xf59e0b));
    return { message: "Warning sent to the owner." };
  } }),
  A({ id: "channel.purge", group: "moderation", scope: "channel", label: "Purge messages", description: "Deletes recent messages in a channel (max 100, newer than 14 days).", danger: 2, params: [GUILD, CHANNEL, { key: "count", label: "How many", type: "number", min: 1, max: 100 }], run: async (ctx) => {
    const deleted = await services.moderation.purge(id(ctx, "guildId"), id(ctx, "channelId"), ctx.actorId, num(ctx, "count", 1, 100, 50));
    return { message: `${deleted} messages deleted.` };
  } }),
  A({ id: "channel.lock", group: "moderation", scope: "channel", label: "Lock a channel", description: "Stops @everyone from sending messages in one channel.", danger: 1, params: [GUILD, CHANNEL], run: async (ctx) => {
    await services.moderation.setChannelLocked(id(ctx, "guildId"), id(ctx, "channelId"), true, ctx.actorId);
    return { message: "Channel locked." };
  } }),
  A({ id: "channel.unlock", group: "moderation", scope: "channel", label: "Unlock a channel", description: "Allows @everyone to send messages again.", danger: 0, params: [GUILD, CHANNEL], run: async (ctx) => {
    await services.moderation.setChannelLocked(id(ctx, "guildId"), id(ctx, "channelId"), false, ctx.actorId);
    return { message: "Channel unlocked." };
  } }),
  A({ id: "channel.slowmode", group: "moderation", scope: "channel", label: "Set slowmode", description: "Seconds between messages per member (0 turns it off).", danger: 0, params: [GUILD, CHANNEL, { key: "seconds", label: "Seconds", type: "number", min: 0, max: 21600 }], run: async (ctx) => {
    const value = await services.moderation.setSlowmode(id(ctx, "guildId"), id(ctx, "channelId"), num(ctx, "seconds", 0, 21600, 0), ctx.actorId);
    return { message: `Slowmode set to ${value}s.` };
  } }),

  // ================================================= MODERATION · members
  A({ id: "member.ban", group: "moderation", scope: "member", label: "Ban member", description: "Bans a user from this server (works even if they already left).", danger: 2, params: [GUILD, USER, REASON, { key: "deleteDays", label: "Delete messages (days)", type: "number", min: 0, max: 7 }], run: async (ctx) => {
    await services.moderation.ban(id(ctx, "guildId"), ctx.actorId, id(ctx, "userId"), { reason: reasonOf(ctx), deleteMessageSeconds: num(ctx, "deleteDays", 0, 7, 0) * 86400 });
    return { message: "Member banned." };
  } }),
  A({ id: "member.unban", group: "moderation", scope: "member", label: "Unban member", description: "Removes a ban in this server.", danger: 1, params: [GUILD, USER, REASON], run: async (ctx) => {
    await services.moderation.unban(id(ctx, "guildId"), ctx.actorId, id(ctx, "userId"), reasonOf(ctx));
    return { message: "Member unbanned." };
  } }),
  A({ id: "member.kick", group: "moderation", scope: "member", label: "Kick member", description: "Removes a member from this server.", danger: 2, params: [GUILD, USER, REASON], run: async (ctx) => {
    await services.moderation.kick(id(ctx, "guildId"), ctx.actorId, id(ctx, "userId"), { reason: reasonOf(ctx) });
    return { message: "Member kicked." };
  } }),
  A({ id: "member.softban", group: "moderation", scope: "member", label: "Softban member", description: "Bans and unbans to delete recent messages.", danger: 2, params: [GUILD, USER, REASON], run: async (ctx) => {
    await services.moderation.softban(id(ctx, "guildId"), ctx.actorId, id(ctx, "userId"), { reason: reasonOf(ctx), deleteMessageSeconds: 86400 });
    return { message: "Member softbanned." };
  } }),
  A({ id: "member.timeout", group: "moderation", scope: "member", label: "Timeout member", description: "Mutes a member for a number of minutes (max 28 days).", danger: 1, params: [GUILD, USER, { key: "minutes", label: "Minutes", type: "number", min: 1, max: 40320 }, REASON], run: async (ctx) => {
    await services.moderation.timeout(id(ctx, "guildId"), ctx.actorId, id(ctx, "userId"), { reason: reasonOf(ctx), durationMs: num(ctx, "minutes", 1, 40320, 60) * 60_000 });
    return { message: "Member timed out." };
  } }),
  A({ id: "member.untimeout", group: "moderation", scope: "member", label: "Remove timeout", description: "Ends a member's timeout now.", danger: 0, params: [GUILD, USER], run: async (ctx) => {
    await services.moderation.untimeout(id(ctx, "guildId"), ctx.actorId, id(ctx, "userId"), "INFERA operator");
    return { message: "Timeout removed." };
  } }),
  A({ id: "member.warn", group: "moderation", scope: "member", label: "Warn member", description: "Adds a warning and a moderation case.", danger: 0, params: [GUILD, USER, { ...REASON, required: true }], run: async (ctx) => {
    await services.moderation.warn(id(ctx, "guildId"), ctx.actorId, id(ctx, "userId"), reasonOf(ctx));
    return { message: "Warning added." };
  } }),
  A({ id: "member.nickname_reset", group: "moderation", scope: "member", label: "Reset nickname", description: "Clears a member's nickname.", danger: 0, params: [GUILD, USER], run: async (ctx) => {
    await services.discord.setNickname(id(ctx, "guildId"), id(ctx, "userId"), null, "INFERA operator");
    return { message: "Nickname reset." };
  } }),
  A({ id: "member.nickname_set", group: "moderation", scope: "member", label: "Set nickname", description: "Changes a member's nickname.", danger: 0, params: [GUILD, USER, { key: "nickname", label: "Nickname", type: "text", required: true }], run: async (ctx) => {
    await services.discord.setNickname(id(ctx, "guildId"), id(ctx, "userId"), str(ctx, "nickname", 32), "INFERA operator");
    return { message: "Nickname changed." };
  } }),
  A({ id: "member.role_add", group: "moderation", scope: "member", label: "Give a role", description: "Adds a role to a member.", danger: 0, params: [GUILD, USER, ROLE], run: async (ctx) => {
    await services.discord.addRole(id(ctx, "guildId"), id(ctx, "userId"), id(ctx, "roleId"), "INFERA operator");
    return { message: "Role added." };
  } }),
  A({ id: "member.role_remove", group: "moderation", scope: "member", label: "Remove a role", description: "Takes a role away from a member.", danger: 0, params: [GUILD, USER, ROLE], run: async (ctx) => {
    await services.discord.removeRole(id(ctx, "guildId"), id(ctx, "userId"), id(ctx, "roleId"), "INFERA operator");
    return { message: "Role removed." };
  } }),
  A({ id: "member.voice_disconnect", group: "moderation", scope: "member", label: "Disconnect from voice", description: "Kicks a member out of their voice channel.", danger: 0, params: [GUILD, USER], run: async (ctx) => {
    await services.discord.moveMember(id(ctx, "guildId"), id(ctx, "userId"), null);
    return { message: "Disconnected from voice." };
  } }),
  A({ id: "member.voice_mute", group: "moderation", scope: "member", label: "Server-mute in voice", description: "Mutes a member in voice channels.", danger: 0, params: [GUILD, USER], run: async (ctx) => {
    await services.discord.setVoiceMute(id(ctx, "guildId"), id(ctx, "userId"), true, "INFERA operator");
    return { message: "Voice-muted." };
  } }),
  A({ id: "member.voice_unmute", group: "moderation", scope: "member", label: "Remove voice mute", description: "Unmutes a member in voice channels.", danger: 0, params: [GUILD, USER], run: async (ctx) => {
    await services.discord.setVoiceMute(id(ctx, "guildId"), id(ctx, "userId"), false, "INFERA operator");
    return { message: "Voice mute removed." };
  } }),
  A({ id: "member.leveling_reset", group: "moderation", scope: "member", label: "Reset member level", description: "Sets a member's XP and level back to 0.", danger: 1, params: [GUILD, USER], run: async (ctx) => {
    await services.leveling.resetUser(id(ctx, "guildId"), id(ctx, "userId"));
    return { message: "Level reset." };
  } }),
  A({ id: "member.xp_set", group: "moderation", scope: "member", label: "Set member XP", description: "Sets a member's total XP (level is recalculated).", danger: 0, params: [GUILD, USER, { key: "xp", label: "Total XP", type: "number", min: 0, max: 100000000 }], run: async (ctx) => {
    await services.leveling.setXp(id(ctx, "guildId"), id(ctx, "userId"), num(ctx, "xp", 0, 100_000_000, 0));
    return { message: "XP updated." };
  } }),
  A({ id: "member.economy_wipe", group: "moderation", scope: "member", label: "Wipe member balance", description: "Sets a member's wallet and bank to 0.", danger: 1, params: [GUILD, USER], run: async (ctx) => {
    const result = await db.economyAccount.updateMany({ where: { guildId: id(ctx, "guildId"), userId: id(ctx, "userId") }, data: { wallet: 0, bank: 0 } });
    return { message: result.count ? "Balance wiped." : "That member has no account." };
  } }),
  A({ id: "member.warnings_clear", group: "moderation", scope: "member", label: "Clear warnings", description: "Removes all active warnings of a member.", danger: 1, params: [GUILD, USER], run: async (ctx) => {
    const guildId = id(ctx, "guildId");
    const warnings = await services.moderation.listWarnings(guildId, id(ctx, "userId"), true);
    for (const warning of warnings) await services.moderation.removeWarning(guildId, ctx.actorId, warning.id).catch(() => undefined);
    return { message: `${warnings.length} warnings removed.` };
  } }),
  A({ id: "member.tickets_close", group: "moderation", scope: "member", label: "Close member's tickets", description: "Closes every open ticket of a member in this server.", danger: 1, params: [GUILD, USER, REASON], run: async (ctx) => {
    const closed = await closeTickets({ guildId: id(ctx, "guildId"), userId: id(ctx, "userId") }, ctx.actorId, reasonOf(ctx));
    return { message: `${closed} tickets closed.` };
  } }),

  // ================================================= MODERATION · global users
  A({ id: "user.bot_ban", group: "moderation", scope: "user", label: "Ban from the bot", description: "INFERA ignores every command from this user, in every server.", danger: 2, params: [USER, REASON], run: async (ctx) => {
    const userId = id(ctx, "userId");
    if (isOperator(userId)) throw new InferaError("The operator can't be banned", { code: ErrorCode.VALIDATION_ERROR });
    await services.platform.addBlacklist("user", userId, reasonOf(ctx), ctx.actorId);
    return { message: "User banned from the bot." };
  } }),
  A({ id: "user.bot_unban", group: "moderation", scope: "user", label: "Unban from the bot", description: "The user can use INFERA again.", danger: 1, params: [USER], run: async (ctx) => {
    const count = await services.platform.removeByTarget("user", id(ctx, "userId"));
    return { message: count ? "User unbanned from the bot." : "That user wasn't banned." };
  } }),
  A({ id: "user.dashboard_ban", group: "moderation", scope: "user", label: "Ban from website & dashboard", description: "Signs the user out everywhere and blocks them from signing in to infera.wtf.", danger: 2, params: [USER, REASON], run: async (ctx) => {
    const userId = id(ctx, "userId");
    if (isOperator(userId)) throw new InferaError("The operator can't be banned", { code: ErrorCode.VALIDATION_ERROR });
    await services.platform.addBlacklist("dashboard", userId, reasonOf(ctx), ctx.actorId);
    const result = await db.oAuthSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    return { message: `User banned from the dashboard. ${result.count} sessions ended.` };
  } }),
  A({ id: "user.dashboard_unban", group: "moderation", scope: "user", label: "Unban from website & dashboard", description: "The user can sign in again.", danger: 1, params: [USER], run: async (ctx) => {
    const count = await services.platform.removeByTarget("dashboard", id(ctx, "userId"));
    return { message: count ? "User can sign in again." : "That user wasn't banned." };
  } }),
  A({ id: "user.sessions_revoke", group: "moderation", scope: "user", label: "Sign out everywhere", description: "Ends every dashboard session of this user.", danger: 1, params: [USER], run: async (ctx) => {
    const userId = id(ctx, "userId");
    if (userId === ctx.actorId) throw new InferaError("Use Sign out for your own sessions", { code: ErrorCode.VALIDATION_ERROR });
    const result = await db.oAuthSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    return { message: `${result.count} sessions ended.` };
  } }),
  A({ id: "user.network_ban", group: "moderation", scope: "user", label: "Network ban", description: "Bans the user from EVERY server INFERA is in (where it has Ban Members).", danger: 2, params: [USER, REASON], run: async (ctx) => {
    const userId = id(ctx, "userId");
    if (isOperator(userId)) throw new InferaError("The operator can't be banned", { code: ErrorCode.VALIDATION_ERROR });
    const guilds = await activeGuildIds();
    background(async () => {
      for (const guildId of guilds) {
        await services.discord.ban(guildId, userId, { reason: `INFERA network ban: ${reasonOf(ctx)}` }).catch(() => undefined);
        await sleep(400);
      }
    });
    return { message: `Banning in ${guilds.length} servers in the background.` };
  } }),
  A({ id: "user.network_unban", group: "moderation", scope: "user", label: "Network unban", description: "Removes the ban in every server INFERA is in.", danger: 1, params: [USER], run: async (ctx) => {
    const userId = id(ctx, "userId");
    const guilds = await activeGuildIds();
    background(async () => {
      for (const guildId of guilds) {
        await services.discord.unban(guildId, userId, "INFERA network unban").catch(() => undefined);
        await sleep(400);
      }
    });
    return { message: `Unbanning in ${guilds.length} servers in the background.` };
  } }),
  A({ id: "user.tickets_close_all", group: "moderation", scope: "user", label: "Close user's tickets everywhere", description: "Closes every open ticket of this user in every server.", danger: 1, params: [USER, REASON], run: async (ctx) => {
    const closed = await closeTickets({ userId: id(ctx, "userId") }, ctx.actorId, reasonOf(ctx));
    return { message: `${closed} tickets closed.` };
  } }),
  A({ id: "user.forget_dashboard_data", group: "moderation", scope: "user", label: "Delete dashboard data", description: "Deletes the user's dashboard sessions, preferences and notification states. Moderation records are kept.", danger: 2, params: [USER], run: async (ctx) => {
    const userId = id(ctx, "userId");
    if (isOperator(userId)) throw new InferaError("Not for the operator account", { code: ErrorCode.VALIDATION_ERROR });
    const [sessions, prefs, reads, deliveries] = await Promise.all([
      db.oAuthSession.deleteMany({ where: { userId } }),
      db.userPreference.deleteMany({ where: { userId } }),
      db.platformNotificationRead.deleteMany({ where: { userId } }),
      db.platformNotificationDelivery.deleteMany({ where: { userId } }),
    ]);
    return { message: `Deleted ${sessions.count} sessions, ${prefs.count} preferences, ${reads.count + deliveries.count} notification records.` };
  } }),

  // ================================================================ NORMAL
  A({ id: "platform.maintenance_on", group: "normal", scope: "platform", label: "Start maintenance", description: "Blocks commands for everyone but you. Optional automatic end.", danger: 1, params: [{ key: "message", label: "Message", type: "textarea" }, { key: "minutes", label: "End automatically after (minutes, 0 = manual)", type: "number", min: 0, max: 10080 }], run: async (ctx) => {
    const minutes = num(ctx, "minutes", 0, 10080, 0);
    const current = await services.platform.state();
    await setState({ maintenance: { enabled: true, message: str(ctx, "message", 500) || current.maintenance.message, until: minutes ? new Date(Date.now() + minutes * 60_000).toISOString() : null } }, ctx.actorId);
    return { message: minutes ? `Maintenance on for ${minutes} minutes.` : "Maintenance on." };
  } }),
  A({ id: "platform.maintenance_off", group: "normal", scope: "platform", label: "End maintenance", description: "Commands work again.", danger: 0, params: [], run: async (ctx) => {
    const current = await services.platform.state();
    await setState({ maintenance: { ...current.maintenance, enabled: false, until: null } }, ctx.actorId);
    return { message: "Maintenance ended." };
  } }),
  A({ id: "platform.presence", group: "normal", scope: "platform", label: "Set bot presence", description: "Status and activity on INFERA's profile.", danger: 0, params: [
    { key: "status", label: "Status", type: "select", options: [{ value: "online", label: "Online" }, { value: "idle", label: "Idle" }, { value: "dnd", label: "Do not disturb" }, { value: "invisible", label: "Invisible" }] },
    { key: "activity", label: "Activity", type: "select", options: ["watching", "playing", "listening", "competing", "custom", "none"].map((v) => ({ value: v, label: v })) },
    { key: "text", label: "Text", type: "text" },
  ], run: async (ctx) => {
    const current = await services.platform.state();
    await setState({ presence: { status: (str(ctx, "status") || current.presence.status) as PlatformState["presence"]["status"], activity: (str(ctx, "activity") || current.presence.activity) as PlatformState["presence"]["activity"], text: str(ctx, "text", 128) } }, ctx.actorId);
    return { message: "Presence updated (applied within a minute)." };
  } }),
  A({ id: "platform.banner_set", group: "normal", scope: "platform", label: "Show dashboard banner", description: "A notice at the top of every dashboard page.", danger: 0, params: [{ key: "text", label: "Text", type: "textarea", required: true }, { key: "tone", label: "Tone", type: "select", options: [{ value: "info", label: "Info" }, { value: "warning", label: "Warning" }, { value: "danger", label: "Critical" }] }], run: async (ctx) => {
    await setState({ dashboardBanner: { text: str(ctx, "text", 300), tone: (str(ctx, "tone") || "info") as PlatformState["dashboardBanner"]["tone"] } }, ctx.actorId);
    return { message: "Banner shown." };
  } }),
  A({ id: "platform.banner_clear", group: "normal", scope: "platform", label: "Hide dashboard banner", description: "Removes the banner.", danger: 0, params: [], run: async (ctx) => {
    await setState({ dashboardBanner: { text: "", tone: "info" } }, ctx.actorId);
    return { message: "Banner hidden." };
  } }),
  A({ id: "platform.new_servers_allow", group: "normal", scope: "platform", label: "Allow new servers", description: "INFERA can be added to new servers.", danger: 0, params: [], run: async (ctx) => {
    await setState({ allowNewServers: true }, ctx.actorId);
    return { message: "New servers allowed." };
  } }),
  A({ id: "platform.new_servers_block", group: "normal", scope: "platform", label: "Block new servers", description: "INFERA leaves any server it's added to.", danger: 1, params: [], run: async (ctx) => {
    await setState({ allowNewServers: false }, ctx.actorId);
    return { message: "New servers blocked." };
  } }),
  A({ id: "platform.command_disable", group: "normal", scope: "platform", label: "Disable a command everywhere", description: "Turns a command off in every server.", danger: 1, params: [{ key: "command", label: "Command name", type: "text", required: true }], run: async (ctx) => {
    const current = await services.platform.state();
    const name = str(ctx, "command", 40).toLowerCase();
    await setState({ disabledCommands: [...new Set([...current.disabledCommands, name])] }, ctx.actorId);
    return { message: `${name} disabled everywhere.` };
  } }),
  A({ id: "platform.command_enable", group: "normal", scope: "platform", label: "Enable a command everywhere", description: "Turns a globally disabled command back on.", danger: 0, params: [{ key: "command", label: "Command name", type: "text", required: true }], run: async (ctx) => {
    const current = await services.platform.state();
    const name = str(ctx, "command", 40).toLowerCase();
    await setState({ disabledCommands: current.disabledCommands.filter((c) => c !== name) }, ctx.actorId);
    return { message: `${name} enabled again.` };
  } }),
  A({ id: "platform.readonly_on", group: "normal", scope: "platform", label: "Dashboard read-only", description: "Nobody but you can change server settings on the dashboard.", danger: 1, params: [], run: async (ctx) => {
    await setState({ readOnly: true }, ctx.actorId);
    return { message: "Dashboard is read-only." };
  } }),
  A({ id: "platform.readonly_off", group: "normal", scope: "platform", label: "End read-only", description: "Server admins can change settings again.", danger: 0, params: [], run: async (ctx) => {
    await setState({ readOnly: false }, ctx.actorId);
    return { message: "Dashboard is editable again." };
  } }),
  A({ id: "server.backup", group: "normal", scope: "server", label: "Back up configuration", description: "Saves a restorable snapshot of the server's settings.", danger: 0, params: [GUILD], run: async (ctx) => {
    const saved = await backup(id(ctx, "guildId"), "Manual operator backup", ctx.actorId);
    if (!saved) throw new InferaError("This server has no stored configuration", { code: ErrorCode.NOT_FOUND });
    return { message: `Backup ${saved.id} saved.` };
  } }),
  A({ id: "server.export_config", group: "normal", scope: "server", label: "Export configuration", description: "Returns the server's raw configuration JSON.", danger: 0, params: [GUILD], run: async (ctx) => {
    const config = await db.guildConfig.findUnique({ where: { guildId: id(ctx, "guildId") } });
    return { message: config ? `Version ${config.version}.` : "No stored configuration.", data: config ? JSON.parse(config.data) : {} };
  } }),
  A({ id: "server.backups_list", group: "normal", scope: "server", label: "List backups", description: "Shows saved configuration backups.", danger: 0, params: [GUILD], run: async (ctx) => {
    const list = await services.platform.backups(id(ctx, "guildId"));
    return { message: `${list.length} backups.`, data: list };
  } }),
  A({ id: "server.sync", group: "normal", scope: "server", label: "Sync server info", description: "Refreshes name, icon, owner and member count from Discord.", danger: 0, params: [GUILD], run: async (ctx) => {
    const guildId = id(ctx, "guildId");
    const guild = await services.discord.getGuild(guildId);
    await services.config.ensureGuild({ id: guild.id, name: guild.name, icon: guild.icon ?? null, ownerId: guild.owner_id, memberCount: guild.approximate_member_count ?? undefined, premiumTier: guild.premium_tier ?? 0 });
    return { message: `${guild.name}: ${guild.approximate_member_count ?? "?"} members.` };
  } }),
  A({ id: "server.clear_cache", group: "normal", scope: "server", label: "Clear server caches", description: "Forces the bot to reload this server's settings.", danger: 0, params: [GUILD], run: async (ctx) => {
    const guildId = id(ctx, "guildId");
    const config = await db.guildConfig.findUnique({ where: { guildId } });
    if (config) await services.config.restoreRaw(guildId, config.data, ctx.actorId);
    else await services.config.invalidateCommandOverrides(guildId);
    return { message: "Caches cleared." };
  } }),
  A({ id: "server.invite", group: "normal", scope: "server", label: "Create an invite", description: "Creates a 1-hour invite so you can join the server.", danger: 0, params: [GUILD], run: async (ctx) => {
    const channels = await services.discord.getGuildChannels(id(ctx, "guildId"));
    const target = channels.find((channel) => channel.type === 0) ?? channels.find((channel) => channel.type === 2);
    if (!target) throw new InferaError("No channel to create an invite in", { code: ErrorCode.NOT_FOUND });
    const invite = await services.discord.createInvite(target.id, { maxAge: 3600, maxUses: 1, reason: "INFERA operator" });
    return { message: `https://discord.gg/${invite.code}`, data: { url: `https://discord.gg/${invite.code}` } };
  } }),
  A({ id: "server.message_owner", group: "normal", scope: "server", label: "Message the owner", description: "DMs the server owner from INFERA.", danger: 0, params: [GUILD, { key: "title", label: "Title", type: "text" }, { key: "message", label: "Message", type: "textarea", required: true }], run: async (ctx) => {
    await services.discord.sendDm(await ownerOf(id(ctx, "guildId")), embed(str(ctx, "title", 200) || "Message from the INFERA team", str(ctx, "message", 3500)));
    return { message: "Message sent." };
  } }),
  A({ id: "channel.post", group: "normal", scope: "channel", label: "Post as INFERA", description: "Sends a message in a channel as the bot.", danger: 1, params: [GUILD, CHANNEL, { key: "message", label: "Message", type: "textarea", required: true }, { key: "asEmbed", label: "Send as embed", type: "boolean" }], run: async (ctx) => {
    const text = str(ctx, "message", 3500);
    const message = await services.discord.sendMessage(id(ctx, "channelId"), bool(ctx, "asEmbed") ? embed("INFERA", text) : { content: text, allowed_mentions: { parse: [] } });
    return { message: `Posted (message ${message.id}).` };
  } }),
  A({ id: "server.note", group: "normal", scope: "server", label: "Set operator note", description: "A private note on this server, visible only to you.", danger: 0, params: [GUILD, { key: "note", label: "Note", type: "textarea" }], run: async (ctx) => {
    await services.platform.setSetting(`note:guild:${id(ctx, "guildId")}`, str(ctx, "note", 2000), ctx.actorId);
    return { message: "Note saved." };
  } }),
  A({ id: "server.info", group: "normal", scope: "server", label: "Live server info", description: "Fetches the server from Discord right now.", danger: 0, params: [GUILD], run: async (ctx) => {
    const guild = await services.discord.getGuild(id(ctx, "guildId"));
    return { message: guild.name, data: { id: guild.id, name: guild.name, ownerId: guild.owner_id, members: guild.approximate_member_count ?? null, online: guild.approximate_presence_count ?? null, boosts: guild.premium_subscription_count ?? 0, tier: guild.premium_tier ?? 0 } };
  } }),
  A({ id: "server.channels", group: "normal", scope: "server", label: "List channels", description: "Every channel with its ID.", danger: 0, params: [GUILD], run: async (ctx) => {
    const channels = await services.discord.getGuildChannels(id(ctx, "guildId"));
    return { message: `${channels.length} channels.`, data: channels.map((c) => ({ id: c.id, name: c.name, type: c.type })) };
  } }),
  A({ id: "server.roles", group: "normal", scope: "server", label: "List roles", description: "Every role with its ID.", danger: 0, params: [GUILD], run: async (ctx) => {
    const roles = await services.discord.getGuildRoles(id(ctx, "guildId"));
    return { message: `${roles.length} roles.`, data: roles.map((r) => ({ id: r.id, name: r.name, position: r.position })) };
  } }),
  A({ id: "server.bans", group: "normal", scope: "server", label: "List bans", description: "Users banned in this server.", danger: 0, params: [GUILD], run: async (ctx) => {
    const bans = await services.discord.getGuildBans(id(ctx, "guildId"));
    return { message: `${bans.length} bans.`, data: bans.slice(0, 200).map((b) => ({ userId: b.user.id, username: b.user.username, reason: b.reason ?? null })) };
  } }),
  A({ id: "member.lookup", group: "normal", scope: "member", label: "Member lookup", description: "Shows a member's roles, nickname and join date.", danger: 0, params: [GUILD, USER], run: async (ctx) => {
    const member = await services.discord.getGuildMember(id(ctx, "guildId"), id(ctx, "userId"));
    return { message: member.user?.username ?? "Member", data: { nickname: member.nick ?? null, roles: member.roles, joinedAt: member.joined_at, timeoutUntil: member.communication_disabled_until ?? null } };
  } }),
  A({ id: "user.dm", group: "normal", scope: "user", label: "DM a user", description: "Sends a DM from INFERA.", danger: 0, params: [USER, { key: "title", label: "Title", type: "text" }, { key: "message", label: "Message", type: "textarea", required: true }], run: async (ctx) => {
    await services.discord.sendDm(id(ctx, "userId"), embed(str(ctx, "title", 200) || "Message from the INFERA team", str(ctx, "message", 3500)));
    return { message: "DM sent." };
  } }),
  A({ id: "user.note", group: "normal", scope: "user", label: "Set user note", description: "A private note on a user, visible only to you.", danger: 0, params: [USER, { key: "note", label: "Note", type: "textarea" }], run: async (ctx) => {
    await services.platform.setSetting(`note:user:${id(ctx, "userId")}`, str(ctx, "note", 2000), ctx.actorId);
    return { message: "Note saved." };
  } }),
  A({ id: "user.servers", group: "normal", scope: "user", label: "Servers owned", description: "Servers with INFERA that this user owns.", danger: 0, params: [USER], run: async (ctx) => {
    const guilds = await db.guild.findMany({ where: { ownerId: id(ctx, "userId") }, select: { id: true, name: true, memberCount: true, leftAt: true } });
    return { message: `${guilds.length} servers.`, data: guilds };
  } }),
  A({ id: "platform.health", group: "normal", scope: "platform", label: "Health check", description: "Measures database, cache and Discord API latency right now.", danger: 0, params: [], run: async () => {
    const time = async (fn: () => Promise<unknown>) => {
      const start = Date.now();
      try {
        await fn();
        return { ok: true, ms: Date.now() - start };
      } catch (error) {
        return { ok: false, ms: Date.now() - start, error: error instanceof Error ? error.message : String(error) };
      }
    };
    const firstGuild = await db.guild.findFirst({ where: { leftAt: null }, select: { id: true } });
    const result = {
      database: await time(() => db.$queryRaw`SELECT 1`),
      cache: await time(() => services.platform.state()),
      discord: firstGuild ? await time(() => services.discord.getGuild(firstGuild.id)) : { ok: false, ms: 0, error: "No servers" },
    };
    return { message: Object.values(result).every((r) => r.ok) ? "Everything is healthy." : "Something is failing.", data: result };
  } }),
  A({ id: "platform.test_dm", group: "normal", scope: "platform", label: "Send yourself a test DM", description: "Checks that INFERA can DM you.", danger: 0, params: [], run: async (ctx) => {
    await services.discord.sendDm(ctx.actorId, embed("Test DM", "INFERA can reach you. 👋"));
    return { message: "Test DM sent." };
  } }),
  A({ id: "platform.clear_caches", group: "normal", scope: "platform", label: "Clear platform caches", description: "Reloads maintenance, presence, bans and freezes everywhere.", danger: 0, params: [], run: async () => {
    await services.platform.clearCaches();
    return { message: "Platform caches cleared." };
  } }),

  // ============================================================= EXCLUSIVE
  A({ id: "x.open_dashboard", group: "exclusive", scope: "server", label: "Open server dashboard", description: "Opens any server's dashboard with full owner access.", danger: 0, params: [GUILD], run: async (ctx) => {
    const guildId = id(ctx, "guildId");
    return { message: `/dashboard/server/${guildId}`, data: { url: `/dashboard/server/${guildId}` } };
  } }),
  A({ id: "x.emergency_stop", group: "exclusive", scope: "platform", label: "Emergency stop", description: "Maintenance on, dashboard read-only, new servers blocked and a critical banner, all at once.", danger: 2, params: [{ key: "message", label: "Message", type: "textarea" }], run: async (ctx) => {
    const message = str(ctx, "message", 300) || "INFERA is temporarily paused by the INFERA team.";
    await setState({ maintenance: { enabled: true, message, until: null }, readOnly: true, allowNewServers: false, dashboardBanner: { text: message, tone: "danger" } }, ctx.actorId);
    return { message: "Emergency stop active." };
  } }),
  A({ id: "x.emergency_resume", group: "exclusive", scope: "platform", label: "Resume after emergency", description: "Ends maintenance and read-only, allows new servers and hides the banner.", danger: 1, params: [], run: async (ctx) => {
    const current = await services.platform.state();
    await setState({ maintenance: { ...current.maintenance, enabled: false, until: null }, readOnly: false, allowNewServers: true, dashboardBanner: { text: "", tone: "info" } }, ctx.actorId);
    return { message: "Everything resumed." };
  } }),
  A({ id: "x.freeze_all", group: "exclusive", scope: "platform", label: "Freeze every server", description: "Freezes INFERA in every server it's in.", danger: 2, params: [REASON], run: async (ctx) => {
    const guilds = await activeGuildIds();
    for (const guildId of guilds) await services.platform.addBlacklist("frozen", guildId, reasonOf(ctx), ctx.actorId);
    return { message: `${guilds.length} servers frozen.` };
  } }),
  A({ id: "x.unfreeze_all", group: "exclusive", scope: "platform", label: "Unfreeze every server", description: "Removes every freeze.", danger: 1, params: [], run: async () => {
    const result = await db.platformBlacklist.deleteMany({ where: { type: "frozen" } });
    await services.platform.clearCaches();
    return { message: `${result.count} servers unfrozen.` };
  } }),
  A({ id: "x.broadcast_owners", group: "exclusive", scope: "platform", label: "DM every server owner", description: "Sends a DM to the owner of every server INFERA is in.", danger: 2, params: [{ key: "title", label: "Title", type: "text", required: true }, { key: "message", label: "Message", type: "textarea", required: true }, { key: "optedInOnly", label: "Only owners who enabled update DMs", type: "boolean" }], run: async (ctx) => {
    const owners = [...new Set((await db.guild.findMany({ where: { leftAt: null, ownerId: { not: null } }, select: { ownerId: true } })).map((g) => g.ownerId!))];
    const optedIn = bool(ctx, "optedInOnly");
    const payload = embed(str(ctx, "title", 200), str(ctx, "message", 3500));
    background(async () => {
      for (const owner of owners) {
        if (optedIn && !(await services.platformNotifications.preferences(owner).catch(() => ({ dmNotifications: false }))).dmNotifications) continue;
        await services.discord.sendDm(owner, payload).catch(() => undefined);
        await sleep(1500);
      }
    });
    return { message: `Sending to up to ${owners.length} owners in the background.` };
  } }),
  A({ id: "x.broadcast_servers", group: "exclusive", scope: "platform", label: "Post in every server", description: "Posts an embed in each server's system channel (where one is set).", danger: 2, params: [{ key: "title", label: "Title", type: "text", required: true }, { key: "message", label: "Message", type: "textarea", required: true }], run: async (ctx) => {
    const guilds = await activeGuildIds();
    const payload = embed(str(ctx, "title", 200), str(ctx, "message", 3500));
    background(async () => {
      for (const guildId of guilds) {
        const guild = await services.discord.getGuild(guildId).catch(() => null);
        if (guild?.system_channel_id) await services.discord.sendMessage(guild.system_channel_id, payload).catch(() => undefined);
        await sleep(1200);
      }
    });
    return { message: `Posting in up to ${guilds.length} servers in the background.` };
  } }),
  A({ id: "x.sign_out_everyone", group: "exclusive", scope: "platform", label: "Sign out every user", description: "Ends every dashboard session except yours.", danger: 2, params: [], run: async (ctx) => {
    const result = await db.oAuthSession.updateMany({ where: { revokedAt: null, userId: { not: ctx.actorId } }, data: { revokedAt: new Date() } });
    return { message: `${result.count} sessions ended.` };
  } }),
  A({ id: "x.bot_username", group: "exclusive", scope: "platform", label: "Change bot username", description: "Renames the INFERA bot account (Discord allows this twice per hour).", danger: 2, params: [{ key: "username", label: "Username", type: "text", required: true }], run: async (ctx) => {
    await services.discord.editCurrentUser({ username: str(ctx, "username", 32) });
    return { message: "Username changed." };
  } }),
  A({ id: "x.bot_avatar", group: "exclusive", scope: "platform", label: "Change bot avatar", description: "Sets the bot's avatar from an image URL.", danger: 2, params: [{ key: "url", label: "Image URL", type: "url", required: true }], run: async (ctx) => {
    await services.discord.editCurrentUser({ avatar: await fetchImageDataUri(str(ctx, "url", 500)) });
    return { message: "Avatar changed." };
  } }),
  A({ id: "x.bot_banner", group: "exclusive", scope: "platform", label: "Change bot banner", description: "Sets the bot's profile banner from an image URL.", danger: 2, params: [{ key: "url", label: "Image URL", type: "url", required: true }], run: async (ctx) => {
    await services.discord.editCurrentUser({ banner: await fetchImageDataUri(str(ctx, "url", 500)) });
    return { message: "Banner changed." };
  } }),
  A({ id: "x.restart", group: "exclusive", scope: "platform", label: "Restart INFERA", description: "Restarts the bot and API (about one minute of downtime).", danger: 2, params: [], run: async () => {
    setTimeout(() => process.exit(1), 1500).unref();
    return { message: "Restarting. The dashboard reconnects in about a minute." };
  } }),
  A({ id: "x.clone_config", group: "exclusive", scope: "server", label: "Copy configuration", description: "Copies all settings from one server to another (target is backed up first).", danger: 2, params: [{ ...GUILD, key: "fromGuildId", label: "Copy from server ID" }, { ...GUILD, key: "toGuildId", label: "Copy to server ID" }], run: async (ctx) => {
    const from = id(ctx, "fromGuildId");
    const to = id(ctx, "toGuildId");
    const source = await db.guildConfig.findUnique({ where: { guildId: from } });
    if (!source) throw new InferaError("The source server has no configuration", { code: ErrorCode.NOT_FOUND });
    await backup(to, `Before copy from ${from}`, ctx.actorId);
    await services.config.restoreRaw(to, source.data, ctx.actorId);
    return { message: "Configuration copied." };
  } }),
  A({ id: "x.import_config", group: "exclusive", scope: "server", label: "Import configuration JSON", description: "Replaces a server's settings with JSON (backed up first).", danger: 2, params: [GUILD, { key: "json", label: "Configuration JSON", type: "textarea", required: true }], run: async (ctx) => {
    const guildId = id(ctx, "guildId");
    const raw = str(ctx, "json", 200_000);
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new InferaError("That isn't valid JSON", { code: ErrorCode.VALIDATION_ERROR });
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new InferaError("The JSON must be an object of settings", { code: ErrorCode.VALIDATION_ERROR });
    await backup(guildId, "Before import", ctx.actorId);
    await services.config.restoreRaw(guildId, JSON.stringify(parsed), ctx.actorId);
    return { message: "Configuration imported." };
  } }),
  A({ id: "x.premium_grant", group: "exclusive", scope: "server", label: "Grant premium", description: "Marks a server as premium (shown in the operator panel).", danger: 0, params: [GUILD, { key: "plan", label: "Plan name", type: "text" }], run: async (ctx) => {
    const guildId = id(ctx, "guildId");
    const flags = await services.platform.getSetting<Record<string, unknown>>(`flags:guild:${guildId}`, {});
    await services.platform.setSetting(`flags:guild:${guildId}`, { ...flags, premium: str(ctx, "plan", 40) || "premium" }, ctx.actorId);
    return { message: "Premium granted." };
  } }),
  A({ id: "x.premium_revoke", group: "exclusive", scope: "server", label: "Revoke premium", description: "Removes the premium flag.", danger: 1, params: [GUILD], run: async (ctx) => {
    const guildId = id(ctx, "guildId");
    const flags = await services.platform.getSetting<Record<string, unknown>>(`flags:guild:${guildId}`, {});
    delete flags.premium;
    await services.platform.setSetting(`flags:guild:${guildId}`, flags, ctx.actorId);
    return { message: "Premium revoked." };
  } }),
  A({ id: "x.partner_set", group: "exclusive", scope: "server", label: "Mark as partner", description: "Flags a server as an official INFERA partner.", danger: 0, params: [GUILD], run: async (ctx) => {
    const guildId = id(ctx, "guildId");
    const flags = await services.platform.getSetting<Record<string, unknown>>(`flags:guild:${guildId}`, {});
    await services.platform.setSetting(`flags:guild:${guildId}`, { ...flags, partner: true }, ctx.actorId);
    return { message: "Marked as partner." };
  } }),
  A({ id: "x.partner_remove", group: "exclusive", scope: "server", label: "Remove partner flag", description: "Removes the partner flag.", danger: 0, params: [GUILD], run: async (ctx) => {
    const guildId = id(ctx, "guildId");
    const flags = await services.platform.getSetting<Record<string, unknown>>(`flags:guild:${guildId}`, {});
    delete flags.partner;
    await services.platform.setSetting(`flags:guild:${guildId}`, flags, ctx.actorId);
    return { message: "Partner flag removed." };
  } }),
  A({ id: "x.grant_access", group: "exclusive", scope: "member", label: "Grant dashboard access", description: "Gives a user an INFERA permission level in a server (0 member – 5 owner).", danger: 1, params: [GUILD, USER, { key: "level", label: "Level (0-5)", type: "number", min: 0, max: 5 }], run: async (ctx) => {
    const guildId = id(ctx, "guildId");
    const targetId = id(ctx, "userId");
    const level = num(ctx, "level", 0, 5, 3);
    await db.guildPermission.upsert({ where: { guildId_targetType_targetId: { guildId, targetType: "user", targetId } }, create: { guildId, targetType: "user", targetId, level }, update: { level } });
    return { message: `Level ${level} granted.` };
  } }),
  A({ id: "x.revoke_access", group: "exclusive", scope: "member", label: "Revoke dashboard access", description: "Removes a user's custom permission level in a server.", danger: 1, params: [GUILD, USER], run: async (ctx) => {
    const result = await db.guildPermission.deleteMany({ where: { guildId: id(ctx, "guildId"), targetType: "user", targetId: id(ctx, "userId") } });
    return { message: result.count ? "Access revoked." : "No custom access found." };
  } }),
  A({ id: "x.leave_small", group: "exclusive", scope: "platform", label: "Leave small servers", description: "Leaves every server with fewer members than the limit.", danger: 2, params: [{ key: "maxMembers", label: "Leave servers with fewer than", type: "number", min: 1, max: 100000 }], run: async (ctx) => {
    const limit = num(ctx, "maxMembers", 1, 100_000, 5);
    const guilds = await db.guild.findMany({ where: { leftAt: null, memberCount: { lt: limit } }, select: { id: true } });
    background(async () => {
      for (const guild of guilds) {
        await services.discord.leaveGuild(guild.id).catch(() => undefined);
        await services.config.markLeft(guild.id).catch(() => undefined);
        await sleep(800);
      }
    });
    return { message: `Leaving ${guilds.length} servers in the background.` };
  } }),
  A({ id: "x.republish_panels", group: "exclusive", scope: "server", label: "Re-post ticket panels", description: "Updates every posted ticket panel in a server to the latest design.", danger: 1, params: [GUILD], run: async (ctx) => {
    const guildId = id(ctx, "guildId");
    const { buildPanelMessage, normalizePanelConfig } = await import("@infera/shared");
    const panels = await db.ticketPanel.findMany({ where: { guildId, channelId: { not: null } } });
    const categories = await services.tickets.categories(guildId);
    let updated = 0;
    for (const panel of panels) {
      let raw: unknown = {};
      try {
        raw = JSON.parse(panel.config);
      } catch {
        raw = {};
      }
      const payload = buildPanelMessage(panel, normalizePanelConfig(raw, { title: panel.title, description: panel.description }), categories);
      const ok = panel.messageId ? await services.discord.editMessage(panel.channelId!, panel.messageId, payload).then(() => true).catch(() => false) : false;
      if (ok) updated += 1;
    }
    return { message: `${updated} of ${panels.length} panels updated.` };
  } }),
  A({ id: "x.tickets_close_everywhere", group: "exclusive", scope: "platform", label: "Close every open ticket", description: "Closes every open ticket in every server.", danger: 2, params: [REASON], run: async (ctx) => {
    const count = await db.ticket.count({ where: { status: "open" } });
    background(() => closeTickets({}, ctx.actorId, reasonOf(ctx)));
    return { message: `Closing ${count} tickets in the background.` };
  } }),
  A({ id: "x.giveaways_cancel_everywhere", group: "exclusive", scope: "platform", label: "Cancel every giveaway", description: "Cancels every running giveaway on the platform.", danger: 2, params: [], run: async (ctx) => {
    const active = await db.giveaway.findMany({ where: { status: "active" }, select: { id: true } });
    background(async () => {
      for (const giveaway of active) await services.giveaways.cancel(giveaway.id, ctx.actorId).catch(() => undefined);
    });
    return { message: `Cancelling ${active.length} giveaways in the background.` };
  } }),
  A({ id: "x.user_presence_scan", group: "exclusive", scope: "user", label: "Find user across servers", description: "Checks every server INFERA is in for this user (up to 100).", danger: 0, params: [USER], run: async (ctx) => {
    const userId = id(ctx, "userId");
    const guilds = await db.guild.findMany({ where: { leftAt: null }, select: { id: true, name: true }, take: 100 });
    const found: Array<{ id: string; name: string; joinedAt: string }> = [];
    for (const guild of guilds) {
      const member = await services.discord.getGuildMember(guild.id, userId).catch(() => null);
      if (member) found.push({ id: guild.id, name: guild.name, joinedAt: member.joined_at });
      await sleep(150);
    }
    return { message: `Member of ${found.length} servers.`, data: found };
  } }),
  A({ id: "x.dm_all_users", group: "exclusive", scope: "platform", label: "DM every dashboard user", description: "DMs everyone who has signed in to infera.wtf.", danger: 2, params: [{ key: "title", label: "Title", type: "text", required: true }, { key: "message", label: "Message", type: "textarea", required: true }], run: async (ctx) => {
    const users = await db.user.findMany({ select: { id: true } });
    const payload = embed(str(ctx, "title", 200), str(ctx, "message", 3500));
    background(async () => {
      for (const user of users) {
        await services.discord.sendDm(user.id, payload).catch(() => undefined);
        await sleep(1500);
      }
    });
    return { message: `Sending to ${users.length} users in the background.` };
  } }),
  A({ id: "x.resend_notification", group: "exclusive", scope: "platform", label: "Retry failed update DMs", description: "Re-sends the newest announcement to owners whose DM failed.", danger: 1, params: [], run: async () => {
    const note = await db.platformNotification.findFirst({ orderBy: { createdAt: "desc" } });
    if (!note) throw new InferaError("No announcements yet", { code: ErrorCode.NOT_FOUND });
    const failed = await db.platformNotificationDelivery.findMany({ where: { notificationId: note.id, status: "failed" }, select: { userId: true } });
    const view = services.platformNotifications.view(note);
    background(async () => {
      for (const row of failed) {
        const ok = await services.discord.sendDm(row.userId, embed(`INFERA update · ${view.title}`, view.summary || view.title)).then(() => true).catch(() => false);
        if (ok) await services.platformNotifications.recordDelivery(note.id, row.userId, "sent");
        await sleep(1500);
      }
    });
    return { message: `Retrying ${failed.length} DMs.` };
  } }),
  A({ id: "x.audit_prune", group: "exclusive", scope: "platform", label: "Prune operator audit", description: "Deletes operator audit entries older than N days.", danger: 2, params: [{ key: "days", label: "Older than (days)", type: "number", min: 7, max: 3650 }], run: async (ctx) => {
    const days = num(ctx, "days", 7, 3650, 90);
    const result = await db.operatorAudit.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - days * 86_400_000) } } });
    return { message: `${result.count} entries deleted.` };
  } }),
  A({ id: "x.platform_export", group: "exclusive", scope: "platform", label: "Export platform snapshot", description: "Platform state, blacklist and counts as JSON.", danger: 0, params: [], run: async () => {
    const [state, blacklist, guilds, users, tickets] = await Promise.all([
      services.platform.state(),
      services.platform.blacklist(),
      db.guild.count({ where: { leftAt: null } }),
      db.user.count(),
      db.ticket.count(),
    ]);
    return { message: "Snapshot ready.", data: { exportedAt: new Date().toISOString(), state, blacklist, counts: { guilds, users, tickets } } };
  } }),
  A({ id: "x.operator_note", group: "exclusive", scope: "platform", label: "Pinned operator note", description: "A note pinned at the top of the operator panel.", danger: 0, params: [{ key: "note", label: "Note", type: "textarea" }], run: async (ctx) => {
    await services.platform.setSetting("note:operator", str(ctx, "note", 2000), ctx.actorId);
    return { message: "Note pinned." };
  } }),
  A({ id: "x.sync_all", group: "exclusive", scope: "platform", label: "Sync every server", description: "Refreshes name, owner and member count of every server from Discord.", danger: 0, params: [], run: async () => {
    const guilds = await activeGuildIds();
    background(async () => {
      for (const guildId of guilds) {
        const guild = await services.discord.getGuild(guildId).catch(() => null);
        if (guild) await services.config.ensureGuild({ id: guild.id, name: guild.name, icon: guild.icon ?? null, ownerId: guild.owner_id, memberCount: guild.approximate_member_count ?? undefined, premiumTier: guild.premium_tier ?? 0 }).catch(() => undefined);
        await sleep(500);
      }
    });
    return { message: `Syncing ${guilds.length} servers in the background.` };
  } }),
  A({ id: "x.lockdown_everywhere", group: "exclusive", scope: "platform", label: "Lock down every server", description: "Stops @everyone from talking in every server INFERA is in.", danger: 2, params: [], run: async () => {
    const guilds = await activeGuildIds();
    background(async () => {
      for (const guildId of guilds) {
        await lockdown(guildId, true).catch(() => undefined);
        await sleep(1000);
      }
    });
    return { message: `Locking ${guilds.length} servers in the background.` };
  } }),
  A({ id: "x.unlockdown_everywhere", group: "exclusive", scope: "platform", label: "Lift lockdown everywhere", description: "Allows @everyone to talk again in every server.", danger: 2, params: [], run: async () => {
    const guilds = await activeGuildIds();
    background(async () => {
      for (const guildId of guilds) {
        await lockdown(guildId, false).catch(() => undefined);
        await sleep(1000);
      }
    });
    return { message: `Unlocking ${guilds.length} servers in the background.` };
  } }),
];

export const ACTION_BY_ID = new Map(OPERATOR_ACTIONS.map((action) => [action.id, action]));
