/**
 * Canonical error codes used by services, the API and the bot. The dashboard
 * depends on these strings, so they are part of the public contract.
 */
export const ErrorCode = {
  VALIDATION_ERROR: "VALIDATION_ERROR",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  RATE_LIMITED: "RATE_LIMITED",
  FEATURE_DISABLED: "FEATURE_DISABLED",
  GUILD_NOT_FOUND: "GUILD_NOT_FOUND",
  GUILD_NOT_AUTHORIZED: "GUILD_NOT_AUTHORIZED",
  MISSING_PERMISSION: "MISSING_PERMISSION",
  BOT_MISSING_PERMISSION: "BOT_MISSING_PERMISSION",
  ROLE_HIERARCHY: "ROLE_HIERARCHY",
  TARGET_NOT_FOUND: "TARGET_NOT_FOUND",
  COOLDOWN: "COOLDOWN",
  INSUFFICIENT_FUNDS: "INSUFFICIENT_FUNDS",
  EXTERNAL_API_UNAVAILABLE: "EXTERNAL_API_UNAVAILABLE",
  DATABASE_UNAVAILABLE: "DATABASE_UNAVAILABLE",
  INTERNAL_ERROR: "INTERNAL_ERROR",
  NOT_IMPLEMENTED: "NOT_IMPLEMENTED",
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface InferaErrorOptions {
  code?: ErrorCodeValue;
  statusCode?: number;
  details?: unknown[];
  /** Localisation key used to render a user-facing message. */
  messageKey?: string;
  cause?: unknown;
  expose?: boolean;
}

export class InferaError extends Error {
  readonly code: ErrorCodeValue;
  readonly statusCode: number;
  readonly details: unknown[];
  readonly messageKey?: string;
  readonly expose: boolean;

  constructor(message: string, options: InferaErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = "InferaError";
    this.code = options.code ?? ErrorCode.INTERNAL_ERROR;
    this.statusCode = options.statusCode ?? statusForCode(this.code);
    this.details = options.details ?? [];
    this.messageKey = options.messageKey;
    this.expose = options.expose ?? this.statusCode < 500;
  }

  toJSON(): Record<string, unknown> {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
      ...(this.messageKey ? { messageKey: this.messageKey } : {}),
    };
  }
}

function statusForCode(code: ErrorCodeValue): number {
  switch (code) {
    case ErrorCode.VALIDATION_ERROR:
      return 400;
    case ErrorCode.UNAUTHORIZED:
      return 401;
    case ErrorCode.FORBIDDEN:
    case ErrorCode.GUILD_NOT_AUTHORIZED:
    case ErrorCode.MISSING_PERMISSION:
    case ErrorCode.BOT_MISSING_PERMISSION:
    case ErrorCode.ROLE_HIERARCHY:
      return 403;
    case ErrorCode.NOT_FOUND:
    case ErrorCode.GUILD_NOT_FOUND:
    case ErrorCode.TARGET_NOT_FOUND:
      return 404;
    case ErrorCode.CONFLICT:
      return 409;
    case ErrorCode.COOLDOWN:
    case ErrorCode.RATE_LIMITED:
      return 429;
    case ErrorCode.FEATURE_DISABLED:
      return 409;
    case ErrorCode.INSUFFICIENT_FUNDS:
      return 422;
    case ErrorCode.EXTERNAL_API_UNAVAILABLE:
      return 502;
    case ErrorCode.DATABASE_UNAVAILABLE:
      return 503;
    case ErrorCode.NOT_IMPLEMENTED:
      return 501;
    default:
      return 500;
  }
}

export const errors = {
  validation: (message = "A valid value is required", details: unknown[] = []) =>
    new InferaError(message, { code: ErrorCode.VALIDATION_ERROR, details }),
  unauthorized: (message = "Authentication is required") =>
    new InferaError(message, { code: ErrorCode.UNAUTHORIZED }),
  forbidden: (message = "You do not have permission to do that") =>
    new InferaError(message, { code: ErrorCode.FORBIDDEN }),
  notFound: (message = "Not found") => new InferaError(message, { code: ErrorCode.NOT_FOUND }),
  guildNotFound: (guildId: string) =>
    new InferaError(`Guild ${guildId} was not found`, { code: ErrorCode.GUILD_NOT_FOUND }),
  guildNotAuthorized: (guildId: string) =>
    new InferaError(`You cannot manage guild ${guildId}`, {
      code: ErrorCode.GUILD_NOT_AUTHORIZED,
    }),
  featureDisabled: (feature: string) =>
    new InferaError(`The ${feature} module is disabled`, {
      code: ErrorCode.FEATURE_DISABLED,
      messageKey: "errors.feature_disabled",
    }),
  internal: (message = "An unexpected error occurred", cause?: unknown) =>
    new InferaError(message, { code: ErrorCode.INTERNAL_ERROR, cause, expose: false }),
};

/** Convert any thrown value into a normalised InferaError. */
export function toInferaError(error: unknown): InferaError {
  if (error instanceof InferaError) return error;
  if (error instanceof Error) {
    return new InferaError(error.message, {
      code: ErrorCode.INTERNAL_ERROR,
      cause: error,
      expose: false,
    });
  }
  return new InferaError(String(error), { code: ErrorCode.INTERNAL_ERROR, expose: false });
}
