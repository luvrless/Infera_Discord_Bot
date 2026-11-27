import { type PrismaClient, type Reminder } from "@infera/database";
import { ErrorCode, InferaError } from "@infera/shared";

export class ReminderService {
  constructor(private readonly db: PrismaClient) {}

  async create(input: {
    guildId?: string | null;
    userId: string;
    channelId?: string | null;
    content: string;
    dueAt: Date;
  }): Promise<Reminder> {
    if (input.dueAt.getTime() <= Date.now()) {
      throw new InferaError("The reminder time must be in the future", { code: ErrorCode.VALIDATION_ERROR });
    }
    const count = await this.db.reminder.count({ where: { userId: input.userId, delivered: false } });
    if (count >= 50) {
      throw new InferaError("You have too many active reminders", { code: ErrorCode.CONFLICT });
    }
    return this.db.reminder.create({
      data: {
        guildId: input.guildId ?? null,
        userId: input.userId,
        channelId: input.channelId ?? null,
        content: input.content.slice(0, 1000),
        dueAt: input.dueAt,
      },
    });
  }

  async list(userId: string, includeDelivered = false): Promise<Reminder[]> {
    return this.db.reminder.findMany({
      where: { userId, ...(includeDelivered ? {} : { delivered: false }) },
      orderBy: { dueAt: "asc" },
      take: 100,
    });
  }

  async delete(userId: string, reminderId: string): Promise<void> {
    const result = await this.db.reminder.deleteMany({ where: { id: reminderId, userId } });
    if (result.count === 0) throw new InferaError("Reminder not found", { code: ErrorCode.NOT_FOUND });
  }

  /** Atomically claim due reminders so multiple workers never double-deliver. */
  async claimDue(limit = 25): Promise<Reminder[]> {
    const due = await this.db.reminder.findMany({
      where: { delivered: false, dueAt: { lte: new Date() } },
      orderBy: { dueAt: "asc" },
      take: limit,
    });
    const claimed: Reminder[] = [];
    for (const reminder of due) {
      const updated = await this.db.reminder.updateMany({
        where: { id: reminder.id, delivered: false },
        data: { delivered: true },
      });
      if (updated.count === 1) claimed.push(reminder);
    }
    return claimed;
  }
}
