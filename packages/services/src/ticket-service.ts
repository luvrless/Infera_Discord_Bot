import { type PrismaClient, type Ticket, type TicketCategory } from "@infera/database";
import {
  ErrorCode,
  InferaError,
  normalizeCategorySettings,
  normalizePanelConfig,
  ticketChannelName,
  type Cache,
  type TicketCategorySettings,
} from "@infera/shared";
import type { AnalyticsService } from "./analytics-service";
import type { AuditService } from "./audit-service";
import type { GuildConfigService } from "./config-service";
import type { DiscordApi } from "./discord-api";
import type { RealtimeService } from "./realtime-service";

const VIEW_CHANNEL = 1n << 10n;
const SEND_MESSAGES = 1n << 11n;
const READ_MESSAGE_HISTORY = 1n << 16n;
const ATTACH_FILES = 1n << 15n;
const EMBED_LINKS = 1n << 14n;
const PRIORITIES = ["low", "normal", "high", "urgent"] as const;
const PRIORITY_COLOR: Record<string, number> = { low: 0x64748b, normal: 0x3b82f6, high: 0xf59e0b, urgent: 0xef4444 };

export interface CreateTicketInput {
  guildId: string;
  userId: string;
  username?: string;
  subject?: string;
  priority?: "low" | "normal" | "high" | "urgent";
  categoryId?: string | null;
  answers?: Array<{ question: string; answer: string }>;
}

export interface TicketCategoryView {
  id: string;
  name: string;
  description: string | null;
  emoji: string | null;
  position: number;
  settings: TicketCategorySettings;
}

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export class TicketService {
  constructor(
    private readonly db: PrismaClient,
    private readonly discord: DiscordApi,
    private readonly config: GuildConfigService,
    private readonly realtime: RealtimeService,
    private readonly analytics: AnalyticsService,
    private readonly audit: AuditService,
    private readonly cache: Cache,
    private readonly botUserId: string,
  ) {}

  // ------------------------------------------------------------ categories
  view(row: TicketCategory): TicketCategoryView {
    let raw: unknown = {};
    try {
      raw = JSON.parse(row.settings);
    } catch {
      raw = {};
    }
    return { id: row.id, name: row.name, description: row.description, emoji: row.emoji, position: row.position, settings: normalizeCategorySettings(raw) };
  }

  async categories(guildId: string): Promise<TicketCategoryView[]> {
    const rows = await this.db.ticketCategory.findMany({ where: { guildId }, orderBy: [{ position: "asc" }, { createdAt: "asc" }] });
    return rows.map((row) => this.view(row));
  }

  async category(guildId: string, categoryId: string): Promise<TicketCategoryView> {
    const row = await this.db.ticketCategory.findFirst({ where: { guildId, id: categoryId } });
    if (!row) throw new InferaError("That ticket option no longer exists", { code: ErrorCode.NOT_FOUND });
    return this.view(row);
  }

  async saveCategory(
    guildId: string,
    input: { id?: string; name: string; description?: string | null; emoji?: string | null; position?: number; settings?: unknown },
  ): Promise<TicketCategoryView> {
    const name = input.name.trim().slice(0, 100);
    if (!name) throw new InferaError("Give the ticket option a name", { code: ErrorCode.VALIDATION_ERROR });
    const settings = JSON.stringify(normalizeCategorySettings(input.settings));
    const data = {
      name,
      description: input.description ? input.description.slice(0, 100) : null,
      emoji: input.emoji ? input.emoji.trim().slice(0, 64) : null,
      position: Number.isFinite(input.position) ? Math.max(0, Math.min(999, Math.round(input.position!))) : 0,
      settings,
    };
    if (input.id) {
      const existing = await this.db.ticketCategory.findFirst({ where: { guildId, id: input.id } });
      if (!existing) throw new InferaError("Ticket option not found", { code: ErrorCode.NOT_FOUND });
      return this.view(await this.db.ticketCategory.update({ where: { id: existing.id }, data }));
    }
    const count = await this.db.ticketCategory.count({ where: { guildId } });
    if (count >= 50) throw new InferaError("A server can have up to 50 ticket options", { code: ErrorCode.CONFLICT });
    return this.view(await this.db.ticketCategory.create({ data: { guildId, ...data, position: input.position ?? count } }));
  }

  async deleteCategory(guildId: string, categoryId: string): Promise<void> {
    const result = await this.db.ticketCategory.deleteMany({ where: { guildId, id: categoryId } });
    if (result.count === 0) throw new InferaError("Ticket option not found", { code: ErrorCode.NOT_FOUND });
  }

  // --------------------------------------------------------------- helpers
  private async assertEnabled(guildId: string): Promise<void> {
    const enabled = await this.config.getValue<boolean>(guildId, "tickets.enabled");
    if (!enabled) {
      throw new InferaError("The ticket system is disabled", { code: ErrorCode.FEATURE_DISABLED, messageKey: "tickets.disabled" });
    }
  }

  private async nextNumber(guildId: string): Promise<number> {
    const last = await this.db.ticket.findFirst({ where: { guildId }, orderBy: { number: "desc" }, select: { number: true } });
    return (last?.number ?? 0) + 1;
  }

  private async settingsFor(ticket: Ticket): Promise<TicketCategorySettings | null> {
    if (!ticket.categoryId) return null;
    const row = await this.db.ticketCategory.findFirst({ where: { guildId: ticket.guildId, id: ticket.categoryId } });
    return row ? this.view(row).settings : null;
  }

  /** Post a ticket activity entry to the configured log channel (best effort). */
  async logEvent(guildId: string, title: string, fields: Array<{ name: string; value: string; inline?: boolean }>, color = 0x3b82f6): Promise<void> {
    const channelId = await this.config.getValue<string | null>(guildId, "tickets.log_channel").catch(() => null);
    if (!channelId) return;
    await this.discord
      .sendMessage(channelId, { embeds: [{ title, color, fields: fields.slice(0, 25), timestamp: new Date().toISOString(), footer: { text: "INFERA Tickets" } }] })
      .catch(() => undefined);
  }

  private controls(ticket: Ticket, settings: TicketCategorySettings | null, claimGlobal: boolean) {
    const buttons: Record<string, unknown>[] = [];
    if (settings ? settings.claimEnabled : claimGlobal) buttons.push({ type: 2, style: 2, label: "Claim", emoji: { name: "🙋" }, custom_id: `ticket:claim:${ticket.id}` });
    buttons.push({ type: 2, style: 4, label: "Close", emoji: { name: "🔒" }, custom_id: `ticket:close:${ticket.id}` });
    return [{ type: 1, components: buttons }];
  }

  // ---------------------------------------------------------------- create
  async create(input: CreateTicketInput): Promise<Ticket> {
    await this.assertEnabled(input.guildId);
    const category = input.categoryId ? await this.category(input.guildId, input.categoryId) : null;
    const settings = category?.settings ?? null;

    const maxOpen = settings?.maxOpenPerUser ?? (await this.config.getValue<number>(input.guildId, "tickets.max_open_per_user"));
    const open = await this.db.ticket.count({
      where: { guildId: input.guildId, userId: input.userId, status: "open", ...(category ? { categoryId: category.id } : {}) },
    });
    if (open >= maxOpen) {
      throw new InferaError(
        maxOpen === 1 ? "You already have an open ticket here. Please use that one." : `You already have ${open} open tickets here.`,
        { code: ErrorCode.CONFLICT, messageKey: "tickets.max_open" },
      );
    }
    if (settings && settings.cooldownSeconds > 0) {
      const recent = await this.db.ticket.findFirst({
        where: { guildId: input.guildId, userId: input.userId, categoryId: category!.id, createdAt: { gt: new Date(Date.now() - settings.cooldownSeconds * 1000) } },
        select: { createdAt: true },
      });
      if (recent) {
        const wait = Math.ceil((recent.createdAt.getTime() + settings.cooldownSeconds * 1000 - Date.now()) / 1000);
        throw new InferaError(`Please wait ${wait}s before opening another ticket here.`, { code: ErrorCode.COOLDOWN });
      }
    }

    const globalParent = await this.config.getValue<string | null>(input.guildId, "tickets.category_id");
    const globalStaff = await this.config.getValue<string[]>(input.guildId, "tickets.staff_roles");
    const priority = input.priority ?? settings?.priority ?? ((await this.config.getValue<string>(input.guildId, "tickets.default_priority")) as CreateTicketInput["priority"]) ?? "normal";

    const userAllow = VIEW_CHANNEL | SEND_MESSAGES | READ_MESSAGE_HISTORY | EMBED_LINKS | (settings && !settings.allowAttachments ? 0n : ATTACH_FILES);
    const staffAllow = (VIEW_CHANNEL | SEND_MESSAGES | READ_MESSAGE_HISTORY | ATTACH_FILES | EMBED_LINKS).toString();
    const viewOnly = (VIEW_CHANNEL | READ_MESSAGE_HISTORY).toString();
    const staffRoles = [...new Set([...(settings?.supportRoles ?? []), ...(settings?.claimRoles ?? []), ...(settings?.closeRoles ?? []), ...(settings ? [] : globalStaff)])];
    const overwrites = [
      { id: input.guildId, type: 0, deny: VIEW_CHANNEL.toString(), allow: "0" },
      { id: input.userId, type: 1, allow: userAllow.toString(), deny: settings && !settings.allowAttachments ? ATTACH_FILES.toString() : "0" },
      { id: this.botUserId, type: 1, allow: staffAllow, deny: "0" },
      ...staffRoles.map((roleId) => ({ id: roleId, type: 0, allow: staffAllow, deny: "0" })),
      ...(settings?.viewRoles ?? []).filter((id) => !staffRoles.includes(id)).map((roleId) => ({ id: roleId, type: 0, allow: viewOnly, deny: SEND_MESSAGES.toString() })),
    ];

    const number = await this.nextNumber(input.guildId);
    const channel = await this.discord.createChannel(
      input.guildId,
      {
        name: ticketChannelName(settings?.channelName ?? "ticket-{number}", {
          number,
          userId: input.userId,
          username: input.username ?? input.userId.slice(-4),
          category: category?.name ?? "ticket",
        }),
        type: 0,
        ...((settings?.parentId ?? globalParent) ? { parent_id: settings?.parentId ?? globalParent } : {}),
        topic: `Ticket for ${input.userId}${category ? ` · ${category.name}` : ""}${input.subject ? ` · ${input.subject}` : ""}`.slice(0, 1024),
        permission_overwrites: overwrites,
      },
      "Ticket created",
    );

    let ticket: Ticket | null = null;
    for (let attempt = 0; attempt < 5 && !ticket; attempt += 1) {
      try {
        ticket = await this.db.ticket.create({
          data: {
            guildId: input.guildId,
            number: attempt === 0 ? number : await this.nextNumber(input.guildId),
            channelId: channel.id,
            userId: input.userId,
            priority: priority ?? "normal",
            subject: input.subject ?? category?.name ?? null,
            categoryId: category?.id ?? null,
            answers: input.answers?.length ? JSON.stringify(input.answers) : null,
            lastActivityAt: new Date(),
          },
        });
      } catch (error) {
        if ((error as { code?: string }).code !== "P2002") throw error;
      }
    }
    if (!ticket) throw new InferaError("Could not allocate a ticket number", { code: ErrorCode.CONFLICT });

    const fill = (text: string) =>
      text.replaceAll("{user}", `<@${input.userId}>`).replaceAll("{number}", String(ticket!.number)).replaceAll("{category}", category?.name ?? "Ticket");
    const embeds: Record<string, unknown>[] = [
      {
        title: fill(settings?.openingEmbed.title || `Ticket #${ticket.number}${category ? ` · ${category.name}` : ""}`).slice(0, 256),
        description: fill(settings?.openingEmbed.description || input.subject || "Thanks for opening a ticket. A member of staff will be with you shortly.").slice(0, 4096),
        color: settings ? Number.parseInt(settings.openingEmbed.color.slice(1), 16) : 0x3b82f6,
        fields: [
          { name: "Opened by", value: `<@${input.userId}>`, inline: true },
          { name: "Priority", value: priority ?? "normal", inline: true },
          ...(category ? [{ name: "Category", value: `${category.emoji ? `${category.emoji} ` : ""}${category.name}`, inline: true }] : []),
        ],
        footer: { text: "INFERA Tickets" },
      },
    ];
    if (input.answers?.length) {
      embeds.push({
        title: "Form answers",
        color: 0x8ab8ff,
        fields: input.answers.slice(0, 25).map((entry) => ({ name: entry.question.slice(0, 256), value: (entry.answer || "—").slice(0, 1024) })),
      });
    }
    const ping = settings?.pingStaff ? settings.supportRoles.map((id) => `<@&${id}>`).join(" ") : "";
    const content = [`<@${input.userId}>`, ping, settings?.openingMessage ? fill(settings.openingMessage) : ""].filter(Boolean).join(" ").slice(0, 2000);
    const claimGlobal = await this.config.getValue<boolean>(input.guildId, "tickets.claim_enabled").catch(() => true);
    await this.discord.sendMessage(channel.id, {
      content,
      embeds,
      components: this.controls(ticket, settings, claimGlobal),
      allowed_mentions: { users: [input.userId], roles: settings?.pingStaff ? settings.supportRoles : [] },
    });

    await this.realtime.publish(input.guildId, "ticket.created", { ticketId: ticket.id, number: ticket.number, userId: input.userId, channelId: channel.id });
    await this.analytics.recordMetric(input.guildId, "tickets");
    await this.audit.record({ guildId: input.guildId, actorId: input.userId, action: "ticket.create", targetId: ticket.id });
    await this.logEvent(input.guildId, `Ticket #${ticket.number} opened`, [
      { name: "User", value: `<@${input.userId}>`, inline: true },
      { name: "Category", value: category?.name ?? "General", inline: true },
      { name: "Channel", value: `<#${channel.id}>`, inline: true },
    ], 0x22c55e);
    return ticket;
  }

  // ------------------------------------------------------------ permissions
  /** Whether a member may claim / close / manage a ticket based on its category roles. */
  async canAct(ticket: Ticket, action: "claim" | "close" | "manage", member: { id: string; roles: string[]; manageChannels: boolean }): Promise<boolean> {
    if (member.manageChannels) return true;
    const settings = await this.settingsFor(ticket);
    const globalStaff = settings ? [] : await this.config.getValue<string[]>(ticket.guildId, "tickets.staff_roles");
    const has = (roles: string[]) => roles.some((role) => member.roles.includes(role));
    if (!settings) return has(globalStaff) || (action === "close" && ticket.userId === member.id);
    if (action === "claim") return has(settings.claimRoles.length ? settings.claimRoles : settings.supportRoles);
    if (action === "close") return (settings.ownerCanClose && ticket.userId === member.id) || has(settings.closeRoles) || has(settings.supportRoles);
    return has(settings.supportRoles);
  }

  // --------------------------------------------------------------- actions
  async claim(guildId: string, ticketId: string, staffId: string): Promise<Ticket> {
    const ticket = await this.get(guildId, ticketId);
    const settings = await this.settingsFor(ticket);
    const claimEnabled = settings ? settings.claimEnabled : await this.config.getValue<boolean>(guildId, "tickets.claim_enabled");
    if (!claimEnabled) throw new InferaError("Claiming is disabled", { code: ErrorCode.FEATURE_DISABLED });
    if (ticket.claimedBy) throw new InferaError(ticket.claimedBy === staffId ? "You already claimed this ticket" : "That ticket is already claimed", { code: ErrorCode.CONFLICT });
    const updated = await this.db.ticket.update({ where: { id: ticket.id }, data: { claimedBy: staffId } });
    await this.discord.sendMessage(ticket.channelId, { embeds: [{ description: `🙋 <@${staffId}> claimed this ticket and will help you.`, color: 0x22c55e }] }).catch(() => undefined);
    await this.realtime.publish(guildId, "ticket.claimed", { ticketId, staffId });
    await this.logEvent(guildId, `Ticket #${ticket.number} claimed`, [{ name: "Staff", value: `<@${staffId}>`, inline: true }]);
    return updated;
  }

  async unclaim(guildId: string, ticketId: string, actorId: string): Promise<Ticket> {
    const ticket = await this.get(guildId, ticketId);
    if (!ticket.claimedBy) throw new InferaError("That ticket isn't claimed", { code: ErrorCode.CONFLICT });
    const updated = await this.db.ticket.update({ where: { id: ticket.id }, data: { claimedBy: null } });
    await this.discord.sendMessage(ticket.channelId, { embeds: [{ description: `<@${actorId}> unclaimed this ticket.`, color: 0x64748b }] }).catch(() => undefined);
    await this.realtime.publish(guildId, "ticket.unclaimed", { ticketId, actorId });
    await this.logEvent(guildId, `Ticket #${ticket.number} unclaimed`, [{ name: "By", value: `<@${actorId}>`, inline: true }]);
    return updated;
  }

  async close(guildId: string, ticketId: string, actorId: string, reason?: string): Promise<Ticket> {
    const ticket = await this.get(guildId, ticketId);
    if (ticket.status !== "open") throw new InferaError("That ticket is not open", { code: ErrorCode.CONFLICT });
    const settings = await this.settingsFor(ticket);
    const messages = await this.db.ticketMessage.findMany({ where: { ticketId: ticket.id }, orderBy: { createdAt: "asc" }, take: 5000 });
    const transcript = this.textTranscript(ticket, messages, reason);
    const html = this.htmlTranscript(ticket, messages, reason, actorId);
    const updated = await this.db.ticket.update({
      where: { id: ticket.id },
      data: { status: "closed", closedAt: new Date(), closedBy: actorId, transcript, transcriptHtml: html, closeReason: reason?.slice(0, 500) ?? null },
    });

    const wantTranscript = settings ? settings.transcripts : true;
    const transcriptChannel = settings?.transcriptChannelId ?? (await this.config.getValue<string | null>(guildId, "tickets.transcript_channel"));
    if (wantTranscript && transcriptChannel) {
      await this.discord
        .sendFiles(
          transcriptChannel,
          {
            embeds: [
              {
                title: `Transcript · Ticket #${ticket.number}`,
                color: 0x3b82f6,
                fields: [
                  { name: "Opened by", value: `<@${ticket.userId}>`, inline: true },
                  { name: "Closed by", value: `<@${actorId}>`, inline: true },
                  { name: "Messages", value: String(messages.length), inline: true },
                  ...(reason ? [{ name: "Reason", value: reason.slice(0, 1024) }] : []),
                ],
                timestamp: new Date().toISOString(),
              },
            ],
          },
          [{ name: `ticket-${ticket.number}.html`, data: Buffer.from(html, "utf8"), contentType: "text/html" }],
        )
        .catch(() => undefined);
    }

    const closeDm = await this.config.getValue<boolean>(guildId, "tickets.close_dm").catch(() => false);
    if (closeDm) {
      const text = await this.config.getValue<string>(guildId, "tickets.close_message").catch(() => "");
      await this.discord
        .sendDm(ticket.userId, {
          embeds: [{ title: `Ticket #${ticket.number} closed`, description: `${text || "Your ticket was closed."}${reason ? `\n\n**Reason:** ${reason}` : ""}`.slice(0, 4096), color: 0x3b82f6 }],
        }, wantTranscript ? [{ name: `ticket-${ticket.number}.html`, data: Buffer.from(html, "utf8"), contentType: "text/html" }] : [])
        .catch(() => undefined);
    }

    const closeAction = await this.config.getValue<string>(guildId, "tickets.close_action").catch(() => "delete");
    if (closeAction === "lock") {
      await this.discord.setChannelPermission(ticket.channelId, ticket.userId, { type: 1, allow: (VIEW_CHANNEL | READ_MESSAGE_HISTORY).toString(), deny: SEND_MESSAGES.toString() }).catch(() => undefined);
      await this.discord.editChannel(ticket.channelId, { name: `closed-${ticket.number}` }, "Ticket closed").catch(() => undefined);
      await this.discord
        .sendMessage(ticket.channelId, {
          embeds: [{ title: "Ticket closed", description: `Closed by <@${actorId}>${reason ? `\n**Reason:** ${reason}` : ""}`, color: 0xef4444 }],
          components: [
            {
              type: 1,
              components: [
                { type: 2, style: 3, label: "Reopen", emoji: { name: "🔓" }, custom_id: `ticket:reopen:${ticket.id}` },
                { type: 2, style: 4, label: "Delete", emoji: { name: "🗑️" }, custom_id: `ticket:delete:${ticket.id}` },
              ],
            },
          ],
        })
        .catch(() => undefined);
    } else {
      await this.discord.deleteChannel(ticket.channelId, "Ticket closed").catch(() => undefined);
    }
    await this.realtime.publish(guildId, "ticket.closed", { ticketId, actorId, reason: reason ?? null });
    await this.audit.record({ guildId, actorId, action: "ticket.close", targetId: ticketId, metadata: { reason: reason ?? null } });
    await this.logEvent(guildId, `Ticket #${ticket.number} closed`, [
      { name: "User", value: `<@${ticket.userId}>`, inline: true },
      { name: "Closed by", value: `<@${actorId}>`, inline: true },
      ...(reason ? [{ name: "Reason", value: reason.slice(0, 1024) }] : []),
    ], 0xef4444);
    return updated;
  }

  async reopen(guildId: string, ticketId: string, actorId: string): Promise<Ticket> {
    const ticket = await this.get(guildId, ticketId);
    if (ticket.status === "open") throw new InferaError("That ticket is already open", { code: ErrorCode.CONFLICT });
    // Only possible while the channel still exists (close action "lock").
    try {
      await this.discord.setChannelPermission(ticket.channelId, ticket.userId, { type: 1, allow: (VIEW_CHANNEL | SEND_MESSAGES | READ_MESSAGE_HISTORY | ATTACH_FILES | EMBED_LINKS).toString(), deny: "0" });
    } catch {
      throw new InferaError("The ticket channel was deleted, so it can't be reopened", { code: ErrorCode.TARGET_NOT_FOUND });
    }
    await this.discord.editChannel(ticket.channelId, { name: `ticket-${String(ticket.number).padStart(4, "0")}` }, "Ticket reopened").catch(() => undefined);
    const updated = await this.db.ticket.update({ where: { id: ticket.id }, data: { status: "open", closedAt: null, closedBy: null, closeReason: null, lastActivityAt: new Date() } });
    const settings = await this.settingsFor(ticket);
    const claimGlobal = await this.config.getValue<boolean>(guildId, "tickets.claim_enabled").catch(() => true);
    await this.discord.sendMessage(ticket.channelId, { embeds: [{ description: `🔓 <@${actorId}> reopened this ticket.`, color: 0x22c55e }], components: this.controls(updated, settings, claimGlobal) }).catch(() => undefined);
    await this.realtime.publish(guildId, "ticket.reopened", { ticketId, actorId });
    await this.logEvent(guildId, `Ticket #${ticket.number} reopened`, [{ name: "By", value: `<@${actorId}>`, inline: true }], 0x22c55e);
    return updated;
  }

  /** Delete the ticket channel (the ticket record and transcript are kept). */
  async deleteTicket(guildId: string, ticketId: string, actorId: string): Promise<Ticket> {
    const ticket = await this.get(guildId, ticketId);
    let current = ticket;
    if (ticket.status === "open") current = await this.close(guildId, ticketId, actorId, "Deleted");
    await this.discord.deleteChannel(ticket.channelId, "Ticket deleted").catch(() => undefined);
    const updated = await this.db.ticket.update({ where: { id: current.id }, data: { status: "deleted" } });
    await this.realtime.publish(guildId, "ticket.deleted", { ticketId, actorId });
    await this.logEvent(guildId, `Ticket #${ticket.number} deleted`, [{ name: "By", value: `<@${actorId}>`, inline: true }], 0x64748b);
    return updated;
  }

  async transfer(guildId: string, ticketId: string, categoryId: string, actorId: string): Promise<Ticket> {
    const ticket = await this.get(guildId, ticketId);
    const category = await this.category(guildId, categoryId);
    const staffAllow = (VIEW_CHANNEL | SEND_MESSAGES | READ_MESSAGE_HISTORY | ATTACH_FILES | EMBED_LINKS).toString();
    if (category.settings.parentId) await this.discord.editChannel(ticket.channelId, { parent_id: category.settings.parentId, lock_permissions: false }, "Ticket transferred").catch(() => undefined);
    for (const roleId of category.settings.supportRoles) {
      await this.discord.setChannelPermission(ticket.channelId, roleId, { type: 0, allow: staffAllow, deny: "0" }).catch(() => undefined);
    }
    const updated = await this.db.ticket.update({ where: { id: ticket.id }, data: { categoryId: category.id, claimedBy: null } });
    await this.discord.sendMessage(ticket.channelId, { embeds: [{ description: `↪️ <@${actorId}> moved this ticket to **${category.name}**.`, color: 0x3b82f6 }] }).catch(() => undefined);
    await this.realtime.publish(guildId, "ticket.transferred", { ticketId, categoryId, actorId });
    await this.logEvent(guildId, `Ticket #${ticket.number} transferred`, [{ name: "To", value: category.name, inline: true }, { name: "By", value: `<@${actorId}>`, inline: true }]);
    return updated;
  }

  async setPriority(guildId: string, ticketId: string, priority: string): Promise<Ticket> {
    if (!PRIORITIES.includes(priority as (typeof PRIORITIES)[number])) throw new InferaError("Invalid priority", { code: ErrorCode.VALIDATION_ERROR });
    const ticket = await this.get(guildId, ticketId);
    const updated = await this.db.ticket.update({ where: { id: ticketId }, data: { priority } });
    if (ticket.status === "open") {
      await this.discord.sendMessage(ticket.channelId, { embeds: [{ description: `Priority set to **${priority}**.`, color: PRIORITY_COLOR[priority] }] }).catch(() => undefined);
    }
    await this.logEvent(guildId, `Ticket #${ticket.number} priority`, [{ name: "Priority", value: priority, inline: true }], PRIORITY_COLOR[priority]);
    return updated;
  }

  async rename(guildId: string, ticketId: string, name: string): Promise<void> {
    const ticket = await this.get(guildId, ticketId);
    await this.discord.editChannel(ticket.channelId, { name: name.slice(0, 100) }, "Ticket renamed");
  }

  async addUser(guildId: string, ticketId: string, userId: string): Promise<void> {
    const ticket = await this.get(guildId, ticketId);
    const allow = (VIEW_CHANNEL | SEND_MESSAGES | READ_MESSAGE_HISTORY | ATTACH_FILES).toString();
    await this.discord.setChannelPermission(ticket.channelId, userId, { type: 1, allow, deny: "0" });
    await this.discord.sendMessage(ticket.channelId, { embeds: [{ description: `➕ <@${userId}> was added to this ticket.`, color: 0x3b82f6 }] }).catch(() => undefined);
  }

  async removeUser(guildId: string, ticketId: string, userId: string): Promise<void> {
    const ticket = await this.get(guildId, ticketId);
    await this.discord.deleteChannelPermission(ticket.channelId, userId);
    await this.discord.sendMessage(ticket.channelId, { embeds: [{ description: `➖ <@${userId}> was removed from this ticket.`, color: 0x64748b }] }).catch(() => undefined);
  }

  // ------------------------------------------------------------------ notes
  async notes(guildId: string, ticketId: string) {
    await this.get(guildId, ticketId);
    return this.db.ticketNote.findMany({ where: { ticketId }, orderBy: { createdAt: "asc" }, take: 200 });
  }

  async addNote(guildId: string, ticketId: string, authorId: string, content: string) {
    await this.get(guildId, ticketId);
    const text = content.trim().slice(0, 2000);
    if (!text) throw new InferaError("Write a note first", { code: ErrorCode.VALIDATION_ERROR });
    return this.db.ticketNote.create({ data: { ticketId, authorId, content: text } });
  }

  async deleteNote(guildId: string, ticketId: string, noteId: string): Promise<void> {
    await this.get(guildId, ticketId);
    await this.db.ticketNote.deleteMany({ where: { id: noteId, ticketId } });
  }

  // ------------------------------------------------------------------ reads
  async get(guildId: string, ticketId: string): Promise<Ticket> {
    const ticket = await this.db.ticket.findFirst({ where: { guildId, id: ticketId } });
    if (!ticket) throw new InferaError("Ticket not found", { code: ErrorCode.NOT_FOUND });
    return ticket;
  }

  async getByChannel(guildId: string, channelId: string): Promise<Ticket | null> {
    return this.db.ticket.findFirst({ where: { guildId, channelId } });
  }

  async list(guildId: string, status?: string) {
    return this.db.ticket.findMany({
      where: { guildId, ...(status ? { status } : { status: { not: "deleted" } }) },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true, guildId: true, panelId: true, number: true, channelId: true, userId: true, claimedBy: true, status: true, priority: true,
        subject: true, createdAt: true, closedAt: true, closedBy: true, categoryId: true, answers: true, lastActivityAt: true, closeReason: true,
      },
    });
  }

  async transcriptHtml(guildId: string, ticketId: string): Promise<string | null> {
    const ticket = await this.get(guildId, ticketId);
    return ticket.transcriptHtml;
  }

  async stats(guildId: string) {
    const [open, closed, total] = await Promise.all([
      this.db.ticket.count({ where: { guildId, status: "open" } }),
      this.db.ticket.count({ where: { guildId, status: "closed" } }),
      this.db.ticket.count({ where: { guildId } }),
    ]);
    return { open, closed, total };
  }

  async recordMessage(ticketId: string, authorId: string, content: string): Promise<void> {
    await this.db.ticket.update({ where: { id: ticketId }, data: { lastActivityAt: new Date() } }).catch(() => undefined);
    if (!content.trim()) return;
    await this.db.ticketMessage.create({ data: { ticketId, authorId, content: content.slice(0, 4000) } });
  }

  /** Close open tickets that had no activity for `tickets.auto_close_hours`. Safe to run repeatedly. */
  async closeInactive(): Promise<number> {
    const open = await this.db.ticket.findMany({ where: { status: "open" }, select: { id: true, guildId: true, createdAt: true, lastActivityAt: true }, take: 2000 });
    let closed = 0;
    const hoursByGuild = new Map<string, number>();
    for (const ticket of open) {
      if (!hoursByGuild.has(ticket.guildId)) {
        hoursByGuild.set(ticket.guildId, await this.config.getValue<number>(ticket.guildId, "tickets.auto_close_hours").catch(() => 0));
      }
      const hours = hoursByGuild.get(ticket.guildId) ?? 0;
      if (!hours) continue;
      const last = (ticket.lastActivityAt ?? ticket.createdAt).getTime();
      if (Date.now() - last < hours * 3_600_000) continue;
      await this.close(ticket.guildId, ticket.id, this.botUserId, `No activity for ${hours} hour${hours === 1 ? "" : "s"}`).then(() => {
        closed += 1;
      }).catch(() => undefined);
    }
    return closed;
  }

  private textTranscript(ticket: Ticket, messages: Array<{ authorId: string; content: string; createdAt: Date }>, reason?: string): string {
    const header = [
      "INFERA ticket transcript",
      `Ticket #${ticket.number}`,
      `Opened by: ${ticket.userId}`,
      `Opened at: ${ticket.createdAt.toISOString()}`,
      `Closed at: ${new Date().toISOString()}`,
      ...(reason ? [`Reason: ${reason}`] : []),
      "",
    ].join("\n");
    const body = messages.map((message) => `[${message.createdAt.toISOString()}] ${message.authorId}: ${message.content}`).join("\n");
    return `${header}${body || "(no recorded messages)"}`;
  }

  private htmlTranscript(ticket: Ticket, messages: Array<{ authorId: string; content: string; createdAt: Date }>, reason: string | undefined, closedBy: string): string {
    let answers: Array<{ question: string; answer: string }> = [];
    try {
      answers = ticket.answers ? (JSON.parse(ticket.answers) as typeof answers) : [];
    } catch {
      answers = [];
    }
    const rows = messages
      .map((message) => {
        const time = message.createdAt.toISOString().replace("T", " ").slice(0, 19);
        const staff = message.authorId !== ticket.userId;
        return `<div class="m"><div class="a ${staff ? "s" : ""}">${message.authorId === ticket.userId ? "Ticket owner" : "Staff"} <span>${escapeHtml(message.authorId)}</span><time>${time} UTC</time></div><div class="c">${escapeHtml(message.content).replace(/\n/g, "<br>")}</div></div>`;
      })
      .join("");
    const answerHtml = answers.length
      ? `<section class="f"><h2>Form answers</h2>${answers.map((entry) => `<p><b>${escapeHtml(entry.question)}</b><br>${escapeHtml(entry.answer || "—")}</p>`).join("")}</section>`
      : "";
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ticket #${ticket.number} transcript</title>
<style>body{margin:0;background:#0b1020;color:#e2e8f0;font:15px/1.5 Inter,system-ui,sans-serif}main{max-width:860px;margin:0 auto;padding:32px 18px}h1{margin:0 0 4px;font-size:24px}header p{color:#94a3b8;margin:2px 0}.meta{display:flex;flex-wrap:wrap;gap:8px;margin:16px 0 24px}.meta span{background:#121b31;border:1px solid #1f2a46;border-radius:999px;padding:4px 12px;font-size:13px}.f{background:#0f172a;border:1px solid #1f2a46;border-radius:14px;padding:14px 18px;margin-bottom:22px}.f h2{font-size:15px;margin:0 0 8px;color:#93c5fd}.m{padding:10px 0;border-bottom:1px solid #141d33}.a{font-weight:700;color:#cbd5e1}.a.s{color:#60a5fa}.a span{font-weight:400;color:#64748b;font-size:12px;margin-left:6px}.a time{float:right;font-weight:400;color:#64748b;font-size:12px}.c{margin-top:2px;white-space:normal;word-wrap:break-word}</style></head>
<body><main><header><h1>Ticket #${ticket.number}${ticket.subject ? ` · ${escapeHtml(ticket.subject)}` : ""}</h1><p>INFERA ticket transcript</p></header>
<div class="meta"><span>Opened by ${escapeHtml(ticket.userId)}</span><span>Opened ${ticket.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC</span><span>Closed by ${escapeHtml(closedBy)}</span><span>${messages.length} messages</span>${reason ? `<span>Reason: ${escapeHtml(reason)}</span>` : ""}</div>
${answerHtml}${rows || "<p>No messages were recorded.</p>"}</main></body></html>`;
  }

  // ----------------------------------------------------------------- panels
  async panels(guildId: string) {
    return this.db.ticketPanel.findMany({ where: { guildId }, orderBy: { createdAt: "asc" } });
  }

  async createPanel(
    guildId: string,
    input: { title: string; description?: string; channelId?: string; categoryId?: string; style?: string; config?: unknown },
  ) {
    const style = ["default", "select", "form"].includes(input.style ?? "") ? input.style! : "default";
    const config = normalizePanelConfig(input.config, { title: input.title, description: input.description ?? null });
    return this.db.ticketPanel.create({
      data: {
        guildId,
        title: input.title,
        description: input.description ?? null,
        channelId: input.channelId ?? null,
        categoryId: input.categoryId ?? null,
        style,
        config: JSON.stringify(config),
      },
    });
  }

  async deletePanel(guildId: string, panelId: string): Promise<void> {
    const result = await this.db.ticketPanel.deleteMany({ where: { guildId, id: panelId } });
    if (result.count === 0) throw new InferaError("Panel not found", { code: ErrorCode.NOT_FOUND });
  }

  async cacheStats(guildId: string): Promise<void> {
    await this.cache.set(`infera:guild:${guildId}:ticket-stats`, await this.stats(guildId), 30);
  }
}
