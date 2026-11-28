import { parseJson, toJson, type PrismaClient } from "@infera/database";
import { createLogger } from "@infera/shared";
import type { DiscordApi } from "./discord-api";

const log = createLogger("services:scheduler");

/**
 * Executes delayed, tenant-scoped jobs stored in ScheduledTask. Jobs are
 * claimed atomically so multiple workers never run the same task twice.
 */
export class SchedulerService {
  constructor(
    private readonly db: PrismaClient,
    private readonly discord: DiscordApi,
  ) {}

  async processScheduledTasks(limit = 25): Promise<number> {
    const due = await this.db.scheduledTask.findMany({
      where: { status: "pending", runAt: { lte: new Date() } },
      orderBy: { runAt: "asc" },
      take: limit,
    });

    let processed = 0;
    for (const task of due) {
      // Frozen servers: postpone their scheduled posts. Expiring punishments
      // (unban / timeout end) still run so members aren't punished longer.
      if (task.type !== "unban" && task.type !== "timeout_expire" && this.isFrozen && (await this.isFrozen(task.guildId).catch(() => false))) {
        await this.db.scheduledTask.updateMany({ where: { id: task.id, status: "pending" }, data: { runAt: new Date(Date.now() + 10 * 60_000) } });
        continue;
      }
      const claimed = await this.db.scheduledTask.updateMany({
        where: { id: task.id, status: "pending" },
        data: { status: "running", attempts: { increment: 1 } },
      });
      if (claimed.count !== 1) continue;

      try {
        await this.execute(task.guildId, task.type, parseJson<Record<string, unknown>>(task.payload, {}));
        await this.db.scheduledTask.update({
          where: { id: task.id },
          data: { status: "completed", lastError: null },
        });
        processed += 1;
      } catch (error) {
        const attempts = task.attempts + 1;
        const failed = attempts >= 5;
        await this.db.scheduledTask.update({
          where: { id: task.id },
          data: {
            status: failed ? "failed" : "pending",
            lastError: error instanceof Error ? error.message.slice(0, 500) : String(error),
            runAt: failed ? task.runAt : new Date(Date.now() + Math.min(300_000, 2 ** attempts * 5_000)),
          },
        });
        log.warn({ err: error, taskId: task.id, type: task.type }, "scheduled task failed");
      }
    }
    return processed;
  }

  /** Set by the service container: whether a server is frozen by the operator. */
  isFrozen: ((guildId: string) => Promise<boolean>) | null = null;

  private async execute(guildId: string, type: string, payload: Record<string, unknown>): Promise<void> {
    switch (type) {
      case "unban": {
        const userId = String(payload.userId ?? "");
        if (!userId) throw new Error("unban task is missing userId");
        await this.discord.unban(guildId, userId, "Temporary ban expired");
        return;
      }
      case "timeout_expire": {
        const userId = String(payload.userId ?? "");
        if (!userId) throw new Error("timeout task is missing userId");
        await this.discord.timeout(guildId, userId, null, "Timeout expired");
        return;
      }
      case "message": {
        const channelId = String(payload.channelId ?? "");
        const content = String(payload.content ?? "");
        if (!/^\d{17,20}$/.test(channelId) || !content.trim()) {
          throw new Error("scheduled message is missing a channel or content");
        }
        if (payload.style === "embed") {
          const color = typeof payload.embedColor === "string" && /^#[0-9a-fA-F]{6}$/.test(payload.embedColor) ? Number.parseInt(payload.embedColor.slice(1), 16) : 0x8b5cf6;
          const title = typeof payload.embedTitle === "string" ? payload.embedTitle.slice(0, 256) : "";
          await this.discord.sendMessage(channelId, {
            embeds: [{ ...(title ? { title } : {}), description: content.slice(0, 4096), color, timestamp: new Date().toISOString() }],
            allowed_mentions: { parse: [] },
          });
          return;
        }
        // Plain text (also every message scheduled before styles existed).
        await this.discord.sendMessage(channelId, {
          content: content.slice(0, 2000),
          allowed_mentions: { parse: [] },
        });
        return;
      }
      case "noop":
        return;
      default:
        throw new Error(`Unknown scheduled task type: ${type}`);
    }
  }

  async schedule(input: {
    guildId: string;
    type: string;
    payload?: unknown;
    runAt: Date;
    cron?: string | null;
  }): Promise<{ id: string; runAt: Date | null }> {
    return this.db.scheduledTask.create({
      data: {
        guildId: input.guildId,
        type: input.type,
        payload: toJson(input.payload ?? {}),
        runAt: input.runAt,
        cron: input.cron ?? null,
      },
    });
  }

  async listMessageTasks(guildId: string): Promise<Array<{ id: string; runAt: Date | null; channelId: string; content: string; userId: string; style: "text" | "embed"; embedTitle: string | null }>> {
    const tasks = await this.db.scheduledTask.findMany({
      where: { guildId, type: "message", status: "pending" },
      orderBy: { runAt: "asc" },
      take: 50,
    });
    return tasks.map((task) => {
      const payload = parseJson<Record<string, unknown>>(task.payload, {});
      return {
        id: task.id,
        runAt: task.runAt,
        channelId: String(payload.channelId ?? ""),
        content: String(payload.content ?? ""),
        userId: String(payload.userId ?? ""),
        style: payload.style === "embed" ? "embed" : "text",
        embedTitle: typeof payload.embedTitle === "string" ? payload.embedTitle : null,
      };
    });
  }

  async cancelMessageTask(guildId: string, taskId: string): Promise<boolean> {
    const result = await this.db.scheduledTask.deleteMany({
      where: { id: taskId, guildId, type: "message", status: "pending" },
    });
    return result.count === 1;
  }
}
