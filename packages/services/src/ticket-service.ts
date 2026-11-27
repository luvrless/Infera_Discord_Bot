import { type PrismaClient, type Ticket } from "@infera/database";
import { ErrorCode, InferaError, type Cache } from "@infera/shared";
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

export interface CreateTicketInput {
  guildId: string;
  userId: string;
  subject?: string;
  priority?: "low" | "normal" | "high" | "urgent";
}

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

  private async assertEnabled(guildId: string): Promise<void> {
    const enabled = await this.config.getValue<boolean>(guildId, "tickets.enabled");
    if (!enabled) {
      throw new InferaError("The ticket system is disabled", {
        code: ErrorCode.FEATURE_DISABLED,
        messageKey: "tickets.disabled",
      });
    }
  }

  private async nextNumber(guildId: string): Promise<number> {
    const last = await this.db.ticket.findFirst({
      where: { guildId },
      orderBy: { number: "desc" },
      select: { number: true },
    });
    return (last?.number ?? 0) + 1;
  }

  async create(input: CreateTicketInput): Promise<Ticket> {
    await this.assertEnabled(input.guildId);
    const maxOpen = await this.config.getValue<number>(input.guildId, "tickets.max_open_per_user");
    const open = await this.db.ticket.count({
      where: { guildId: input.guildId, userId: input.userId, status: "open" },
    });
    if (open >= maxOpen) {
      throw new InferaError("You already have the maximum number of open tickets", {
        code: ErrorCode.CONFLICT,
        messageKey: "tickets.max_open",
      });
    }

    const categoryId = await this.config.getValue<string | null>(input.guildId, "tickets.category_id");
    const staffRoles = await this.config.getValue<string[]>(input.guildId, "tickets.staff_roles");
    const priority =
      input.priority ??
      ((await this.config.getValue<string>(input.guildId, "tickets.default_priority")) as
        | "low"
        | "normal"
        | "high"
        | "urgent");

    const allowUser = (VIEW_CHANNEL | SEND_MESSAGES | READ_MESSAGE_HISTORY | ATTACH_FILES | EMBED_LINKS).toString();
    const overwrites = [
      { id: input.guildId, type: 0, deny: VIEW_CHANNEL.toString(), allow: "0" },
      { id: input.userId, type: 1, allow: allowUser, deny: "0" },
      { id: this.botUserId, type: 1, allow: allowUser, deny: "0" },
      ...staffRoles.map((roleId) => ({ id: roleId, type: 1 as const, allow: allowUser, deny: "0" })),
    ];

    const channel = await this.discord.createChannel(
      input.guildId,
      {
        name: `ticket-${input.userId.slice(-4)}`,
        type: 0,
        ...(categoryId ? { parent_id: categoryId } : {}),
        topic: `Ticket for ${input.userId}${input.subject ? ` · ${input.subject}` : ""}`,
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
            number: await this.nextNumber(input.guildId),
            channelId: channel.id,
            userId: input.userId,
            priority,
            subject: input.subject ?? null,
          },
        });
      } catch (error) {
        if ((error as { code?: string }).code !== "P2002") throw error;
      }
    }
    if (!ticket) throw new InferaError("Could not allocate a ticket number", { code: ErrorCode.CONFLICT });

    await this.discord.sendMessage(channel.id, {
      content: `<@${input.userId}>`,
      embeds: [
        {
          title: `Ticket #${ticket.number}`,
          description: input.subject ?? "Thanks for opening a ticket. A member of staff will be with you shortly.",
          color: 0x8b5cf6,
          fields: [
            { name: "Priority", value: priority, inline: true },
            { name: "Opened by", value: `<@${input.userId}>`, inline: true },
          ],
          footer: { text: "INFERA Tickets" },
        },
      ],
      components: [
        {
          type: 1,
          components: [
            { type: 2, style: 2, label: "Claim", custom_id: `ticket:claim:${ticket.id}` },
            { type: 2, style: 4, label: "Close", custom_id: `ticket:close:${ticket.id}` },
          ],
        },
      ],
    });

    await this.realtime.publish(input.guildId, "ticket.created", {
      ticketId: ticket.id,
      number: ticket.number,
      userId: input.userId,
      channelId: channel.id,
    });
    await this.analytics.recordMetric(input.guildId, "tickets");
    await this.audit.record({ guildId: input.guildId, actorId: input.userId, action: "ticket.create", targetId: ticket.id });
    return ticket;
  }

  async claim(guildId: string, ticketId: string, staffId: string): Promise<Ticket> {
    const ticket = await this.get(guildId, ticketId);
    const claimEnabled = await this.config.getValue<boolean>(guildId, "tickets.claim_enabled");
    if (!claimEnabled) throw new InferaError("Claiming is disabled", { code: ErrorCode.FEATURE_DISABLED });
    if (ticket.claimedBy) throw new InferaError("That ticket is already claimed", { code: ErrorCode.CONFLICT });
    const updated = await this.db.ticket.update({ where: { id: ticket.id }, data: { claimedBy: staffId } });
    await this.discord.sendMessage(ticket.channelId, { content: `<@${staffId}> claimed this ticket.` });
    await this.realtime.publish(guildId, "ticket.claimed", { ticketId, staffId });
    return updated;
  }

  async close(guildId: string, ticketId: string, actorId: string, reason?: string): Promise<Ticket> {
    const ticket = await this.get(guildId, ticketId);
    if (ticket.status !== "open") throw new InferaError("That ticket is not open", { code: ErrorCode.CONFLICT });
    const transcript = await this.buildTranscript(ticket);
    const updated = await this.db.ticket.update({
      where: { id: ticket.id },
      data: { status: "closed", closedAt: new Date(), closedBy: actorId, transcript },
    });

    const transcriptChannel = await this.config.getValue<string | null>(guildId, "tickets.transcript_channel");
    if (transcriptChannel) {
      try {
        const header = `Transcript for ticket #${ticket.number}${reason ? ` — ${reason}` : ""}\n`;
        const body = transcript.slice(0, 1800 - header.length);
        await this.discord.sendMessage(transcriptChannel, {
          content: `${header}\`\`\`\n${body}\n\`\`\``,
        });
      } catch {
        // Transcript delivery is best effort.
      }
    }
    try {
      await this.discord.deleteChannel(ticket.channelId, "Ticket closed");
    } catch {
      // The channel may already be gone.
    }
    await this.realtime.publish(guildId, "ticket.closed", { ticketId, actorId, reason: reason ?? null });
    await this.audit.record({ guildId, actorId, action: "ticket.close", targetId: ticketId });
    return updated;
  }

  async reopen(guildId: string, ticketId: string, actorId: string): Promise<Ticket> {
    const ticket = await this.get(guildId, ticketId);
    if (ticket.status === "open") throw new InferaError("That ticket is already open", { code: ErrorCode.CONFLICT });
    const updated = await this.db.ticket.update({
      where: { id: ticket.id },
      data: { status: "open", closedAt: null, closedBy: null },
    });
    await this.realtime.publish(guildId, "ticket.reopened", { ticketId, actorId });
    return updated;
  }

  async setPriority(guildId: string, ticketId: string, priority: string): Promise<Ticket> {
    if (!["low", "normal", "high", "urgent"].includes(priority)) {
      throw new InferaError("Invalid priority", { code: ErrorCode.VALIDATION_ERROR });
    }
    await this.get(guildId, ticketId);
    return this.db.ticket.update({ where: { id: ticketId }, data: { priority } });
  }

  async rename(guildId: string, ticketId: string, name: string): Promise<void> {
    const ticket = await this.get(guildId, ticketId);
    await this.discord.editChannel(ticket.channelId, { name: name.slice(0, 100) }, "Ticket renamed");
  }

  async addUser(guildId: string, ticketId: string, userId: string): Promise<void> {
    const ticket = await this.get(guildId, ticketId);
    const allow = (VIEW_CHANNEL | SEND_MESSAGES | READ_MESSAGE_HISTORY | ATTACH_FILES).toString();
    await this.discord.setChannelPermission(ticket.channelId, userId, { type: 1, allow, deny: "0" });
  }

  async removeUser(guildId: string, ticketId: string, userId: string): Promise<void> {
    const ticket = await this.get(guildId, ticketId);
    await this.discord.deleteChannelPermission(ticket.channelId, userId);
  }

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
      where: { guildId, ...(status ? { status } : {}) },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
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
    if (!content.trim()) return;
    await this.db.ticketMessage.create({ data: { ticketId, authorId, content: content.slice(0, 4000) } });
  }

  private async buildTranscript(ticket: Ticket): Promise<string> {
    const messages = await this.db.ticketMessage.findMany({
      where: { ticketId: ticket.id },
      orderBy: { createdAt: "asc" },
      take: 2000,
    });
    const header = [
      `INFERA ticket transcript`,
      `Ticket #${ticket.number}`,
      `Opened by: ${ticket.userId}`,
      `Opened at: ${ticket.createdAt.toISOString()}`,
      `Closed at: ${new Date().toISOString()}`,
      "",
    ].join("\n");
    const body = messages
      .map((message) => `[${message.createdAt.toISOString()}] ${message.authorId}: ${message.content}`)
      .join("\n");
    return `${header}${body || "(no recorded messages)"}`;
  }

  async panels(guildId: string) {
    return this.db.ticketPanel.findMany({ where: { guildId } });
  }

  async createPanel(guildId: string, input: { title: string; description?: string; channelId?: string; categoryId?: string }) {
    return this.db.ticketPanel.create({
      data: {
        guildId,
        title: input.title,
        description: input.description ?? null,
        channelId: input.channelId ?? null,
        categoryId: input.categoryId ?? null,
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
