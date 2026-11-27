import { PrismaClient } from "@prisma/client";

export * from "@prisma/client";

export interface DatabaseOptions {
  logQueries?: boolean;
}

declare global {
  // eslint-disable-next-line no-var
  var __inferaPrisma: PrismaClient | undefined;
}

let client: PrismaClient | null = null;

export function getPrisma(options: DatabaseOptions = {}): PrismaClient {
  if (client) return client;
  if (globalThis.__inferaPrisma) {
    client = globalThis.__inferaPrisma;
    return client;
  }
  client = new PrismaClient({
    log: options.logQueries ? ["query", "warn", "error"] : ["warn", "error"],
  });
  if (process.env.NODE_ENV !== "production") globalThis.__inferaPrisma = client;
  return client;
}

export async function connectDatabase(): Promise<void> {
  await getPrisma().$connect();
}

export async function disconnectDatabase(): Promise<void> {
  if (!client) return;
  await client.$disconnect();
  client = null;
}

export async function isDatabaseReady(): Promise<boolean> {
  try {
    await getPrisma().$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

/** Safely parse a JSON string column, returning `fallback` on failure. */
export function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

/** Serialise a value for storage in a string column. */
export function toJson(value: unknown): string {
  return JSON.stringify(value ?? null);
}

/** Run a callback inside a transaction with the default client. */
export function transaction<T>(
  fn: (tx: PrismaClient) => Promise<T>,
): Promise<T> {
  return getPrisma().$transaction((tx) => fn(tx as unknown as PrismaClient));
}
