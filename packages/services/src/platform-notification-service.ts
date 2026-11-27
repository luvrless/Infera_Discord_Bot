import type { PlatformNotification, PrismaClient } from "@infera/database";
import { LATEST_RELEASE, type ReleaseNote } from "@infera/shared";

export interface PlatformNotificationView {
  id: string;
  version: string;
  kind: string;
  title: string;
  summary: string;
  features: string[];
  fixes: string[];
  system: string[];
  downtime: string | null;
  createdAt: string;
  read: boolean;
}

function parseBody(row: PlatformNotification): Omit<PlatformNotificationView, "id" | "version" | "kind" | "title" | "createdAt" | "read"> {
  let body: Partial<ReleaseNote> = {};
  try {
    body = JSON.parse(row.body) as Partial<ReleaseNote>;
  } catch {
    body = {};
  }
  return {
    summary: body.summary ?? "",
    features: body.features ?? [],
    fixes: body.fixes ?? [],
    system: body.system ?? [],
    downtime: body.downtime ?? null,
  };
}

/**
 * Platform-wide update notifications. They are created from the changelog,
 * stored forever, shown to every dashboard user and optionally DMed to server
 * owners. Disabling DMs never stops a notification from being stored.
 */
export class PlatformNotificationService {
  constructor(private readonly db: PrismaClient) {}

  /** Store the newest changelog entry once. Returns it when it was just created. */
  async publishLatest(): Promise<PlatformNotification | null> {
    const release = LATEST_RELEASE;
    if (!release) return null;
    const existing = await this.db.platformNotification.findUnique({ where: { version: release.version } });
    if (existing) return existing;
    try {
      return await this.db.platformNotification.create({
        data: {
          version: release.version,
          kind: release.downtime ? "maintenance" : "update",
          title: release.title,
          body: JSON.stringify({
            summary: release.summary,
            features: release.features ?? [],
            fixes: release.fixes ?? [],
            system: release.system ?? [],
            downtime: release.downtime ?? null,
          }),
          createdAt: new Date(release.date),
        },
      });
    } catch {
      // Another process created it at the same moment.
      return this.db.platformNotification.findUnique({ where: { version: release.version } });
    }
  }

  async list(userId: string, limit = 50): Promise<{ notifications: PlatformNotificationView[]; unread: number }> {
    const [rows, reads] = await Promise.all([
      this.db.platformNotification.findMany({ orderBy: { createdAt: "desc" }, take: limit }),
      this.db.platformNotificationRead.findMany({ where: { userId }, select: { notificationId: true, clearedAt: true } }),
    ]);
    const readIds = new Set(reads.map((row) => row.notificationId));
    const clearedIds = new Set(reads.filter((row) => row.clearedAt).map((row) => row.notificationId));
    const notifications = rows.filter((row) => !clearedIds.has(row.id)).map((row) => ({
      id: row.id,
      version: row.version,
      kind: row.kind,
      title: row.title,
      createdAt: row.createdAt.toISOString(),
      read: readIds.has(row.id),
      ...parseBody(row),
    }));
    return { notifications, unread: notifications.filter((item) => !item.read).length };
  }

  async markRead(userId: string, ids: string[] | "all"): Promise<number> {
    const targets =
      ids === "all"
        ? (await this.db.platformNotification.findMany({ select: { id: true } })).map((row) => row.id)
        : ids.slice(0, 200);
    let count = 0;
    for (const notificationId of targets) {
      await this.db.platformNotificationRead
        .upsert({ where: { userId_notificationId: { userId, notificationId } }, create: { userId, notificationId }, update: {} })
        .then(() => {
          count += 1;
        })
        .catch(() => undefined);
    }
    return count;
  }

  async markUnread(userId: string, notificationId: string): Promise<void> {
    // Keep the row if it was cleared; only an un-cleared read is removed.
    await this.db.platformNotificationRead.deleteMany({ where: { userId, notificationId, clearedAt: null } });
  }

  /** Hide notifications from this user's dashboard list. Nothing is deleted for anyone else. */
  async clearFromDashboard(userId: string, ids: string[] | "all"): Promise<number> {
    const targets =
      ids === "all"
        ? (await this.db.platformNotification.findMany({ select: { id: true } })).map((row) => row.id)
        : ids.slice(0, 200);
    const now = new Date();
    let count = 0;
    for (const notificationId of targets) {
      await this.db.platformNotificationRead
        .upsert({
          where: { userId_notificationId: { userId, notificationId } },
          create: { userId, notificationId, clearedAt: now },
          update: { clearedAt: now },
        })
        .then(() => {
          count += 1;
        })
        .catch(() => undefined);
    }
    return count;
  }

  /** DMs that were sent to this user (optionally only for some notifications). */
  async sentDeliveries(userId: string, ids: string[] | "all") {
    return this.db.platformNotificationDelivery.findMany({
      where: { userId, status: "sent", ...(ids === "all" ? {} : { notificationId: { in: ids.slice(0, 200) } }) },
    });
  }

  async titlesFor(ids: string[] | "all"): Promise<Map<string, string>> {
    const rows = await this.db.platformNotification.findMany({
      where: ids === "all" ? {} : { id: { in: ids.slice(0, 200) } },
      select: { id: true, title: true },
    });
    return new Map(rows.map((row) => [row.id, row.title]));
  }

  async markDmDeleted(userId: string, notificationIds: string[]): Promise<void> {
    if (notificationIds.length === 0) return;
    await this.db.platformNotificationDelivery.updateMany({
      where: { userId, notificationId: { in: notificationIds } },
      data: { status: "deleted", messageId: null },
    });
  }

  async preferences(userId: string): Promise<{ dmNotifications: boolean }> {
    const row = await this.db.userPreference.findUnique({ where: { userId } });
    // DMs are opt-in: off until the user turns them on.
    return { dmNotifications: row?.dmNotifications ?? false };
  }

  async setPreferences(userId: string, input: { dmNotifications: boolean }): Promise<{ dmNotifications: boolean }> {
    const row = await this.db.userPreference.upsert({
      where: { userId },
      create: { userId, dmNotifications: input.dmNotifications },
      update: { dmNotifications: input.dmNotifications },
    });
    return { dmNotifications: row.dmNotifications };
  }

  /** Owners of servers INFERA is in who haven't received this notification yet. */
  async pendingRecipients(notificationId: string): Promise<string[]> {
    const guilds = await this.db.guild.findMany({ where: { leftAt: null, ownerId: { not: null } }, select: { ownerId: true } });
    const owners = [...new Set(guilds.map((guild) => guild.ownerId!).filter(Boolean))];
    if (owners.length === 0) return [];
    const done = await this.db.platformNotificationDelivery.findMany({
      where: { notificationId, userId: { in: owners } },
      select: { userId: true },
    });
    const doneIds = new Set(done.map((row) => row.userId));
    return owners.filter((id) => !doneIds.has(id));
  }

  async recordDelivery(
    notificationId: string,
    userId: string,
    status: "sent" | "skipped" | "failed",
    message?: { channelId: string; messageId: string },
  ): Promise<void> {
    const data = { status, channelId: message?.channelId ?? null, messageId: message?.messageId ?? null };
    await this.db.platformNotificationDelivery
      .upsert({ where: { userId_notificationId: { userId, notificationId } }, create: { userId, notificationId, ...data }, update: data })
      .catch(() => undefined);
  }

  view(row: PlatformNotification): PlatformNotificationView {
    return { id: row.id, version: row.version, kind: row.kind, title: row.title, createdAt: row.createdAt.toISOString(), read: false, ...parseBody(row) };
  }
}
