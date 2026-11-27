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
      this.db.platformNotificationRead.findMany({ where: { userId }, select: { notificationId: true } }),
    ]);
    const readIds = new Set(reads.map((row) => row.notificationId));
    const notifications = rows.map((row) => ({
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
    await this.db.platformNotificationRead.deleteMany({ where: { userId, notificationId } });
  }

  async preferences(userId: string): Promise<{ dmNotifications: boolean }> {
    const row = await this.db.userPreference.findUnique({ where: { userId } });
    return { dmNotifications: row?.dmNotifications ?? true };
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

  async recordDelivery(notificationId: string, userId: string, status: "sent" | "skipped" | "failed"): Promise<void> {
    await this.db.platformNotificationDelivery
      .upsert({ where: { userId_notificationId: { userId, notificationId } }, create: { userId, notificationId, status }, update: { status } })
      .catch(() => undefined);
  }

  view(row: PlatformNotification): PlatformNotificationView {
    return { id: row.id, version: row.version, kind: row.kind, title: row.title, createdAt: row.createdAt.toISOString(), read: false, ...parseBody(row) };
  }
}
