import { InferaError, toInferaError } from "@infera/shared";
import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";

export function intParam(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), min), max);
}

export function pagination(query: Record<string, unknown>): { page: number; pageSize: number } {
  return {
    page: intParam(query.page, 1, 1, 10_000),
    pageSize: intParam(query.pageSize, 25, 1, 100),
  };
}

export function stringQuery(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

export function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function errorHandler(
  error: FastifyError | InferaError,
  request: FastifyRequest,
  reply: FastifyReply,
): void {
  const normalized = toInferaError(error);
  const status = normalized.statusCode;
  const body = {
    error: {
      code: normalized.code,
      message: normalized.expose ? normalized.message : "Something went wrong on the INFERA API",
      details: normalized.expose ? normalized.details : [],
      ...(normalized.messageKey ? { messageKey: normalized.messageKey } : {}),
    },
  };
  if (status >= 500) request.log.error({ err: error, url: request.url }, "api error");
  else request.log.info({ code: normalized.code, url: request.url }, "request rejected");
  void reply.code(status).type("application/json").send(body);
}
