import { type PrismaClient, type Suggestion } from "@infera/database";
import { ErrorCode, InferaError } from "@infera/shared";
import type { GuildConfigService } from "./config-service";
import type { DiscordApi } from "./discord-api";
import type { RealtimeService } from "./realtime-service";

export class SuggestionService {
  constructor(
    private readonly db: PrismaClient,
    private readonly discord: DiscordApi,
    private readonly config: GuildConfigService,
    private readonly realtime: RealtimeService,
  ) {}

  private async assertEnabled(guildId: string): Promise<void> {
    const enabled = await this.config.getValue<boolean>(guildId, "suggestions.enabled");
    if (!enabled) {
      throw new InferaError("Suggestions are disabled", { code: ErrorCode.FEATURE_DISABLED });
    }
  }

  async create(input: { guildId: string; userId: string; content: string; anonymous?: boolean }): Promise<Suggestion> {
    await this.assertEnabled(input.guildId);
    const channelId = await this.config.getValue<string | null>(input.guildId, "suggestions.channel_id");
    if (!channelId) {
      throw new InferaError("No suggestion channel is configured", { code: ErrorCode.VALIDATION_ERROR });
    }
    const allowAnonymous = await this.config.getValue<boolean>(input.guildId, "suggestions.allow_anonymous");
    const anonymous = Boolean(input.anonymous && allowAnonymous);

    const suggestion = await this.db.suggestion.create({
      data: {
        guildId: input.guildId,
        channelId,
        userId: anonymous ? null : input.userId,
        content: input.content.slice(0, 2000),
        anonymous,
      },
    });

    try {
      const message = await this.discord.sendMessage(channelId, {
        embeds: [
          {
            author: { name: anonymous ? "Anonymous suggestion" : "New suggestion" },
            description: suggestion.content,
            color: 0x8b5cf6,
            footer: { text: `Suggestion ${suggestion.id}` },
            timestamp: new Date().toISOString(),
          },
        ],
        components: [
          {
            type: 1,
            components: [
              { type: 2, style: 3, label: "Upvote", custom_id: `suggestion:up:${suggestion.id}` },
              { type: 2, style: 4, label: "Downvote", custom_id: `suggestion:down:${suggestion.id}` },
            ],
          },
        ],
      });
      await this.db.suggestion.update({ where: { id: suggestion.id }, data: { messageId: message.id } });
    } catch {
      // The suggestion is still recorded even if the channel rejects the message.
    }

    await this.realtime.publish(input.guildId, "suggestion.created", {
      suggestionId: suggestion.id,
      anonymous,
    });
    return suggestion;
  }

  async vote(suggestionId: string, userId: string, value: 1 | -1): Promise<{ upvotes: number; downvotes: number }> {
    const suggestion = await this.db.suggestion.findUnique({ where: { id: suggestionId } });
    if (!suggestion) throw new InferaError("Suggestion not found", { code: ErrorCode.NOT_FOUND });
    if (suggestion.status !== "pending") throw new InferaError("Voting has closed", { code: ErrorCode.CONFLICT });

    await this.db.suggestionVote.upsert({
      where: { suggestionId_userId: { suggestionId, userId } },
      create: { suggestionId, userId, value },
      update: { value },
    });
    const [upvotes, downvotes] = await Promise.all([
      this.db.suggestionVote.count({ where: { suggestionId, value: 1 } }),
      this.db.suggestionVote.count({ where: { suggestionId, value: -1 } }),
    ]);
    await this.db.suggestion.update({ where: { id: suggestionId }, data: { upvotes, downvotes } });
    return { upvotes, downvotes };
  }

  async review(
    guildId: string,
    suggestionId: string,
    reviewerId: string,
    decision: "approved" | "denied",
    note?: string,
  ): Promise<Suggestion> {
    const suggestion = await this.db.suggestion.findFirst({ where: { guildId, id: suggestionId } });
    if (!suggestion) throw new InferaError("Suggestion not found", { code: ErrorCode.NOT_FOUND });
    const updated = await this.db.suggestion.update({
      where: { id: suggestionId },
      data: { status: decision, reviewerId, reviewNote: note ?? null },
    });

    if (suggestion.channelId && suggestion.messageId) {
      const color = decision === "approved" ? 0x57f287 : 0xed4245;
      await this.discord
        .editMessage(suggestion.channelId, suggestion.messageId, {
          embeds: [
            {
              author: { name: suggestion.anonymous ? "Anonymous suggestion" : "Suggestion" },
              description: suggestion.content,
              color,
              fields: [
                { name: "Status", value: decision === "approved" ? "✅ Approved" : "❌ Denied", inline: true },
                { name: "Votes", value: `👍 ${suggestion.upvotes} · 👎 ${suggestion.downvotes}`, inline: true },
                ...(note ? [{ name: "Staff note", value: note.slice(0, 1024) }] : []),
              ],
              footer: { text: `Reviewed by ${reviewerId}` },
            },
          ],
          components: [],
        })
        .catch(() => undefined);
    }

    await this.realtime.publish(guildId, "suggestion.updated", { suggestionId, status: decision });
    return updated;
  }

  async list(guildId: string, status?: string) {
    return this.db.suggestion.findMany({
      where: { guildId, ...(status ? { status } : {}) },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }
}
