import { toJson, type PrismaClient } from "@infera/database";

export interface AuditRecord {
  guildId?: string | null;
  actorId?: string | null;
  action: string;
  targetId?: string | null;
  metadata?: unknown;
  ip?: string | null;
}

/** Append-only audit trail for configuration and moderation changes. */
export class AuditService {
  constructor(private readonly db: PrismaClient) {}

  async record(entry: AuditRecord): Promise<void> {
    await this.db.auditLog.create({
      data: {
        guildId: entry.guildId ?? null,
        actorId: entry.actorId ?? null,
        action: entry.action,
        targetId: entry.targetId ?? null,
        metadata: toJson(entry.metadata ?? {}),
        ip: entry.ip ?? null,
      },
    });
  }

  async list(guildId: string, options: { page: number; pageSize: number; action?: string; actionPrefix?: boolean; actorId?: string }) {
    const where = {
      guildId,
      ...(options.action ? { action: options.actionPrefix ? { startsWith: options.action } : options.action } : {}),
      ...(options.actorId ? { actorId: options.actorId } : {}),
    };
    const [total, rows] = await this.db.$transaction([
      this.db.auditLog.count({ where }),
      this.db.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (options.page - 1) * options.pageSize,
        take: options.pageSize,
      }),
    ]);
    return { total, rows };
  }
}
