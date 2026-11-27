import { toJson, type Prisma, type PrismaClient } from "@infera/database";
import type { RealtimeService } from "./realtime-service";

export type AnalyticsMetric =
  | "memberJoins"
  | "memberLeaves"
  | "messages"
  | "commands"
  | "commandFails"
  | "moderation"
  | "automod"
  | "tickets"
  | "economy"
  | "voiceMinutes";

function utcDay(date = new Date()): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** Records real activity. Nothing here is synthesised or estimated. */
export class AnalyticsService {
  constructor(
    private readonly db: PrismaClient,
    private readonly realtime: RealtimeService,
  ) {}

  async recordMetric(guildId: string, metric: AnalyticsMetric, amount = 1): Promise<void> {
    const create = { guildId, date: utcDay(), [metric]: amount } as unknown as Prisma.AnalyticsSnapshotCreateInput;
    const update = { [metric]: { increment: amount } } as unknown as Prisma.AnalyticsSnapshotUpdateInput;
    await this.db.analyticsSnapshot.upsert({
      where: { guildId_date: { guildId, date: utcDay() } },
      create,
      update,
    });
  }

  async recordCommand(input: {
    guildId: string;
    userId: string;
    commandName: string;
    source: "slash" | "prefix" | "context" | "api";
    success: boolean;
    durationMs: number;
    errorCode?: string | null;
  }): Promise<void> {
    await this.db.commandUsage.create({
      data: {
        guildId: input.guildId,
        userId: input.userId,
        commandName: input.commandName,
        source: input.source,
        success: input.success,
        durationMs: Math.max(0, Math.round(input.durationMs)),
        errorCode: input.errorCode ?? null,
      },
    });
    await this.db.analyticsSnapshot.upsert({
      where: { guildId_date: { guildId: input.guildId, date: utcDay() } },
      create: {
        guildId: input.guildId,
        date: utcDay(),
        commands: 1,
        commandFails: input.success ? 0 : 1,
      },
      update: {
        commands: { increment: 1 },
        ...(input.success ? {} : { commandFails: { increment: 1 } }),
      },
    });
    await this.realtime.publish(input.guildId, input.success ? "command.executed" : "command.failed", {
      commandName: input.commandName,
      userId: input.userId,
      source: input.source,
      durationMs: input.durationMs,
      ...(input.errorCode ? { errorCode: input.errorCode } : {}),
    });
    await this.realtime.publish(input.guildId, "analytics.updated", { metric: "commands" });
  }

  async overview(guildId: string, days = 30): Promise<Record<string, unknown>> {
    const window = Math.min(Math.max(Math.trunc(days) || 30, 1), 365);
    const since = new Date(Date.now() - window * 24 * 60 * 60 * 1000);
    const [guild, snapshots, cases, warnings, tickets, giveaways, topCommands] = await Promise.all([
      this.db.guild.findUnique({ where: { id: guildId } }),
      this.db.analyticsSnapshot.findMany({ where: { guildId, date: { gte: since } }, orderBy: { date: "asc" } }),
      this.db.moderationCase.count({ where: { guildId } }),
      this.db.moderationWarning.count({ where: { guildId, active: true } }),
      this.db.ticket.count({ where: { guildId, status: "open" } }),
      this.db.giveaway.count({ where: { guildId, status: "active" } }),
      this.db.commandUsage.groupBy({
        by: ["commandName"],
        where: { guildId, createdAt: { gte: since } },
        _count: { commandName: true },
        orderBy: { _count: { commandName: "desc" } },
        take: 10,
      }),
    ]);

    const totals = snapshots.reduce(
      (acc, snapshot) => {
        acc.memberJoins += snapshot.memberJoins;
        acc.memberLeaves += snapshot.memberLeaves;
        acc.messages += snapshot.messages;
        acc.commands += snapshot.commands;
        acc.commandFails += snapshot.commandFails;
        acc.moderation += snapshot.moderation;
        acc.automod += snapshot.automod;
        acc.tickets += snapshot.tickets;
        acc.economy += snapshot.economy;
        acc.voiceMinutes += snapshot.voiceMinutes;
        return acc;
      },
      {
        memberJoins: 0,
        memberLeaves: 0,
        messages: 0,
        commands: 0,
        commandFails: 0,
        moderation: 0,
        automod: 0,
        tickets: 0,
        economy: 0,
        voiceMinutes: 0,
      },
    );

    return {
      guild: guild
        ? { id: guild.id, name: guild.name, memberCount: guild.memberCount, joinedAt: guild.joinedAt }
        : null,
      totals,
      current: { openTickets: tickets, activeGiveaways: giveaways, activeWarnings: warnings, cases },
      topCommands: topCommands.map((row) => ({
        command: row.commandName,
        uses: row._count.commandName,
      })),
      history: snapshots.map((snapshot) => ({
        date: snapshot.date,
        memberJoins: snapshot.memberJoins,
        memberLeaves: snapshot.memberLeaves,
        messages: snapshot.messages,
        commands: snapshot.commands,
        commandFails: snapshot.commandFails,
        moderation: snapshot.moderation,
        automod: snapshot.automod,
        tickets: snapshot.tickets,
        economy: snapshot.economy,
        voiceMinutes: snapshot.voiceMinutes,
      })),
      /** Distinguishes "no data collected" from a genuine zero. */
      dataAvailable: snapshots.length > 0,
    };
  }

  async commandUsage(guildId: string, since: Date): Promise<Array<{ commandName: string; uses: number; failures: number }>> {
    const rows = await this.db.commandUsage.groupBy({
      by: ["commandName", "success"],
      where: { guildId, createdAt: { gte: since } },
      _count: { commandName: true },
    });
    const map = new Map<string, { commandName: string; uses: number; failures: number }>();
    for (const row of rows) {
      const entry = map.get(row.commandName) ?? { commandName: row.commandName, uses: 0, failures: 0 };
      entry.uses += row._count.commandName;
      if (!row.success) entry.failures += row._count.commandName;
      map.set(row.commandName, entry);
    }
    return [...map.values()].sort((a, b) => b.uses - a.uses);
  }

  async platformOverview(): Promise<Record<string, unknown>> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [guilds, users, commands, failures, snapshots] = await Promise.all([
      this.db.guild.count({ where: { leftAt: null } }),
      this.db.user.count(),
      this.db.commandUsage.count({ where: { createdAt: { gte: since } } }),
      this.db.commandUsage.count({ where: { createdAt: { gte: since }, success: false } }),
      this.db.analyticsSnapshot.aggregate({
        where: { date: { gte: since } },
        _sum: { messages: true, memberJoins: true, moderation: true, automod: true },
      }),
    ]);
    return {
      guilds,
      users,
      commandsLast24h: commands,
      failuresLast24h: failures,
      messagesLast24h: snapshots._sum.messages ?? 0,
      joinsLast24h: snapshots._sum.memberJoins ?? 0,
      moderationLast24h: snapshots._sum.moderation ?? 0,
      automodLast24h: snapshots._sum.automod ?? 0,
    };
  }

  async recordSystemEvent(source: string, message: string, metadata: unknown = {}, guildId: string | null = null): Promise<void> {
    await this.db.systemEvent.create({
      data: { source, message, metadata: toJson(metadata), guildId },
    });
  }
}
