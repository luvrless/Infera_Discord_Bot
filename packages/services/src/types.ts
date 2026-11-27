import type { PrismaClient } from "@infera/database";
import type { Cache } from "@infera/shared";

/** Dependencies shared by every INFERA service. */
export interface ServiceDeps {
  db: PrismaClient;
  cache: Cache;
}

export interface GuildIdentity {
  id: string;
  name: string;
  icon?: string | null;
  ownerId?: string | null;
  memberCount?: number;
  locale?: string | null;
  premiumTier?: number;
}

export interface ActorContext {
  userId: string;
  guildId: string | null;
  ip?: string;
  source: "bot" | "api" | "worker" | "system";
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
}

export function paginate<T>(items: T[], page: number, pageSize: number): Paginated<T> {
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), pages);
  const start = (safePage - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    total,
    page: safePage,
    pageSize,
    pages,
  };
}

export function paginationArgs(page: number, pageSize: number): { skip: number; take: number } {
  const safePage = Math.max(1, page);
  const safeSize = Math.min(Math.max(1, pageSize), 100);
  return { skip: (safePage - 1) * safeSize, take: safeSize };
}
