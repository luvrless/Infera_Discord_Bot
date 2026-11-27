import { parseJson, type Giveaway, type PrismaClient } from "@infera/database";
import { ErrorCode, InferaError, discordTimestamp } from "@infera/shared";
import type { AnalyticsService } from "./analytics-service";
import type { GuildConfigService } from "./config-service";
import type { DiscordApi } from "./discord-api";
import type { RealtimeService } from "./realtime-service";

export interface CreateGiveawayInput {
  guildId: string;
  channelId: string;
  hostId: string;
  prize: string;
  winners?: number;
  durationSeconds?: number;
  requiredRoles?: string[];
  excludedRoles?: string[];
}

export class GiveawayService {
  constructor(
    private readonly db: PrismaClient,
    private readonly discord: DiscordApi,
    private readonly config: GuildConfigService,
    private readonly realtime: RealtimeService,
    private readonly analytics: AnalyticsService,
  ) {}

  private async assertEnabled(guildId: string): Promise<void> {
    const enabled = await this.config.getValue<boolean>(guildId, "giveaways.enabled");
    if (!enabled) {
      throw new InferaError("Giveaways are disabled", {
        code: ErrorCode.FEATURE_DISABLED,
        messageKey: "giveaways.disabled",
      });
    }
  }

  async create(input: CreateGiveawayInput): Promise<Giveaway> {
    await this.assertEnabled(input.guildId);
    const defaultDuration = await this.config.getValue<number>(input.guildId, "giveaways.default_duration");
    const defaultWinners = await this.config.getValue<number>(input.guildId, "giveaways.default_winners");
    const durationSeconds = Math.max(10, input.durationSeconds ?? defaultDuration);
    const winners = Math.max(1, Math.min(100, input.winners ?? defaultWinners));

    const giveaway = await this.db.giveaway.create({
      data: {
        guildId: input.guildId,
        channelId: input.channelId,
        hostId: input.hostId,
        prize: input.prize,
        winners,
        requiredRoles: JSON.stringify(input.requiredRoles ?? []),
        excludedRoles: JSON.stringify(input.excludedRoles ?? []),
        endsAt: new Date(Date.now() + durationSeconds * 1000),
      },
    });

    try {
      const message = await this.discord.sendMessage(input.channelId, {
        embeds: [
          {
            title: `🎉 ${input.prize}`,
            description: [
              `Ends ${discordTimestamp(giveaway.endsAt, "R")}`,
              `Hosted by <@${input.hostId}>`,
              `Winners: **${winners}**`,
            ].join("\n"),
            color: 0x8b5cf6,
            footer: { text: "Click Enter to participate" },
          },
        ],
        components: [
          {
            type: 1,
            components: [
              { type: 2, style: 1, label: "Enter", custom_id: `giveaway:enter:${giveaway.id}` },
            ],
          },
        ],
      });
      await this.db.giveaway.update({ where: { id: giveaway.id }, data: { messageId: message.id } });
    } catch {
      // The giveaway still exists and can be ended; the message failure is surfaced by the caller.
    }

    await this.realtime.publish(input.guildId, "giveaway.created", {
      giveawayId: giveaway.id,
      prize: giveaway.prize,
      endsAt: giveaway.endsAt.toISOString(),
    });
    return giveaway;
  }

  async enter(giveawayId: string, userId: string): Promise<{ entered: boolean; entries: number }> {
    const giveaway = await this.db.giveaway.findUnique({ where: { id: giveawayId } });
    if (!giveaway) throw new InferaError("Giveaway not found", { code: ErrorCode.NOT_FOUND });
    if (giveaway.status !== "active" || giveaway.endsAt.getTime() <= Date.now()) {
      throw new InferaError("That giveaway has ended", { code: ErrorCode.CONFLICT });
    }

    const required = parseJson<string[]>(giveaway.requiredRoles, []);
    const excluded = parseJson<string[]>(giveaway.excludedRoles, []);
    if (required.length > 0 || excluded.length > 0) {
      const member = await this.discord.getGuildMember(giveaway.guildId, userId);
      const roles = new Set(member.roles);
      if (required.length > 0 && !required.some((roleId) => roles.has(roleId))) {
        throw new InferaError("You do not have a required role", { code: ErrorCode.FORBIDDEN });
      }
      if (excluded.some((roleId) => roles.has(roleId))) {
        throw new InferaError("You are not eligible for this giveaway", { code: ErrorCode.FORBIDDEN });
      }
    }

    try {
      await this.db.giveawayEntry.create({ data: { giveawayId, userId } });
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") {
        const count = await this.db.giveawayEntry.count({ where: { giveawayId } });
        return { entered: false, entries: count };
      }
      throw error;
    }
    const count = await this.db.giveawayEntry.count({ where: { giveawayId } });
    return { entered: true, entries: count };
  }

  async end(giveawayId: string): Promise<{ winners: string[]; entries: number }> {
    const giveaway = await this.db.giveaway.findUnique({ where: { id: giveawayId } });
    if (!giveaway) throw new InferaError("Giveaway not found", { code: ErrorCode.NOT_FOUND });
    if (giveaway.status !== "active") throw new InferaError("That giveaway has already ended", { code: ErrorCode.CONFLICT });

    const entries = await this.db.giveawayEntry.findMany({ where: { giveawayId } });
    const winners = this.pickWinners(entries.map((entry) => entry.userId), giveaway.winners);

    await this.db.$transaction([
      this.db.giveaway.update({ where: { id: giveawayId }, data: { status: "ended", endedAt: new Date() } }),
      this.db.giveawayEntry.updateMany({
        where: { giveawayId, userId: { in: winners } },
        data: { won: true },
      }),
    ]);

    await this.editGiveawayMessage(giveaway, winners);
    await this.realtime.publish(giveaway.guildId, "giveaway.ended", { giveawayId, winners });
    await this.analytics.recordMetric(giveaway.guildId, "messages", 0);
    return { winners, entries: entries.length };
  }

  async reroll(giveawayId: string, count?: number): Promise<string[]> {
    const giveaway = await this.db.giveaway.findUnique({ where: { id: giveawayId } });
    if (!giveaway) throw new InferaError("Giveaway not found", { code: ErrorCode.NOT_FOUND });
    if (giveaway.status === "active") throw new InferaError("End the giveaway before rerolling", { code: ErrorCode.CONFLICT });

    const previous = await this.db.giveawayEntry.findMany({ where: { giveawayId, won: true } });
    const previousIds = new Set(previous.map((entry) => entry.userId));
    const entries = await this.db.giveawayEntry.findMany({ where: { giveawayId } });
    const pool = entries.map((entry) => entry.userId).filter((userId) => !previousIds.has(userId));
    const winners = this.pickWinners(pool, count ?? giveaway.winners);

    await this.db.giveawayEntry.updateMany({ where: { giveawayId, userId: { in: winners } }, data: { won: true } });
    await this.editGiveawayMessage(giveaway, winners, true);
    await this.realtime.publish(giveaway.guildId, "giveaway.ended", { giveawayId, winners, reroll: true });
    return winners;
  }

  async cancel(giveawayId: string, actorId: string): Promise<void> {
    const giveaway = await this.db.giveaway.findUnique({ where: { id: giveawayId } });
    if (!giveaway) throw new InferaError("Giveaway not found", { code: ErrorCode.NOT_FOUND });
    await this.db.giveaway.update({ where: { id: giveawayId }, data: { status: "cancelled", endedAt: new Date() } });
    if (giveaway.messageId) {
      await this.discord
        .editMessage(giveaway.channelId, giveaway.messageId, {
          embeds: [
            {
              title: `🎉 ${giveaway.prize}`,
              description: `Cancelled by <@${actorId}>.`,
              color: 0xed4245,
            },
          ],
          components: [],
        })
        .catch(() => undefined);
    }
  }

  private pickWinners(pool: string[], count: number): string[] {
    const shuffled = [...pool];
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
    }
    return shuffled.slice(0, Math.min(count, shuffled.length));
  }

  private async editGiveawayMessage(giveaway: Giveaway, winners: string[], reroll = false): Promise<void> {
    if (!giveaway.messageId) return;
    const description =
      winners.length > 0
        ? `${reroll ? "Rerolled winners" : "Winners"}: ${winners.map((id) => `<@${id}>`).join(", ")}`
        : "No valid entries, so there are no winners.";
    await this.discord
      .editMessage(giveaway.channelId, giveaway.messageId, {
        embeds: [
          {
            title: `🎉 ${giveaway.prize}`,
            description: `${description}\nEnded ${discordTimestamp(new Date(), "R")}`,
            color: winners.length > 0 ? 0x57f287 : 0xed4245,
          },
        ],
        components: [],
      })
      .catch(() => undefined);
  }

  async list(guildId: string, status?: string) {
    return this.db.giveaway.findMany({
      where: { guildId, ...(status ? { status } : {}) },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }

  async get(guildId: string, giveawayId: string) {
    const giveaway = await this.db.giveaway.findFirst({ where: { guildId, id: giveawayId } });
    if (!giveaway) throw new InferaError("Giveaway not found", { code: ErrorCode.NOT_FOUND });
    const entries = await this.db.giveawayEntry.count({ where: { giveawayId } });
    return { ...giveaway, entries };
  }

  /** Called by the scheduler to end expired giveaways. */
  async endExpired(limit = 20): Promise<string[]> {
    const due = await this.db.giveaway.findMany({
      where: { status: "active", endsAt: { lte: new Date() } },
      take: limit,
      select: { id: true },
    });
    const ended: string[] = [];
    for (const giveaway of due) {
      try {
        await this.end(giveaway.id);
        ended.push(giveaway.id);
      } catch {
        // Another process may have ended it first.
      }
    }
    return ended;
  }
}
