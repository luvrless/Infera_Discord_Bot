/**
 * Centralised INFERA API client.
 *
 * - Session auth uses the backend's HttpOnly `infera_session` cookie; no token
 *   is ever stored in the browser.
 * - Mutations are protected server-side by Origin validation + SameSite cookies.
 * - Every request accepts an AbortSignal so stale requests (e.g. after a server
 *   switch) are cancelled instead of overwriting newer data.
 */

export const API_BASE: string = (import.meta.env.VITE_API_BASE as string | undefined) ?? "/v1";

export function wsUrl(): string {
  const explicit = import.meta.env.VITE_WS_URL as string | undefined;
  if (explicit) return explicit;
  if (/^https?:\/\//.test(API_BASE)) return `${API_BASE.replace(/^http/, "ws")}/ws`;
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}${API_BASE}/ws`;
}

export const loginUrl = (): string => `${API_BASE}/auth/discord`;

export interface ValidationIssue {
  key?: string;
  message?: string;
  [extra: string]: unknown;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details: unknown[] = [],
    public readonly retryAfter: number | null = null,
  ) {
    super(message);
    this.name = "ApiError";
  }

  get issues(): ValidationIssue[] {
    return this.details.filter((detail): detail is ValidationIssue => typeof detail === "object" && detail !== null);
  }
}

/** Broadcast so the auth layer can redirect when a session expires mid-use. */
export const UNAUTHORIZED_EVENT = "infera:unauthorized";

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
  query?: Record<string, string | number | boolean | null | undefined>;
}

function buildUrl(path: string, query?: RequestOptions["query"]): string {
  const url = `${API_BASE}${path}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? "GET";
  let response: Response;
  try {
    response = await fetch(buildUrl(path, options.query), {
      method,
      credentials: "include",
      signal: options.signal,
      headers: {
        accept: "application/json",
        "x-requested-with": "infera-dashboard",
        ...(options.body !== undefined ? { "content-type": "application/json" } : {}),
      },
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    });
  } catch (error) {
    if ((error as Error).name === "AbortError") throw error;
    throw new ApiError(0, "NETWORK_ERROR", "Can't reach the INFERA API. Check your connection or try again shortly.");
  }

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const body = payload as { error?: { code?: string; message?: string; details?: unknown[] } } | null;
    const retryAfterHeader = response.headers.get("retry-after");
    const error = new ApiError(
      response.status,
      body?.error?.code ?? defaultCode(response.status),
      body?.error?.message ?? defaultMessage(response.status),
      Array.isArray(body?.error?.details) ? body!.error!.details! : [],
      retryAfterHeader ? Number(retryAfterHeader) : null,
    );
    if (response.status === 401 && !path.startsWith("/auth/session")) {
      window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
    }
    throw error;
  }

  // Tolerate the documented `{ success, data }` envelope as well as raw bodies.
  if (payload && typeof payload === "object" && "success" in payload && "data" in payload) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

function defaultCode(status: number): string {
  if (status === 400) return "VALIDATION_ERROR";
  if (status === 401) return "UNAUTHORIZED";
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NOT_FOUND";
  if (status === 409) return "CONFLICT";
  if (status === 429) return "RATE_LIMITED";
  if (status >= 500) return "SERVER_ERROR";
  return `HTTP_${status}`;
}

function defaultMessage(status: number): string {
  if (status === 401) return "Your session has expired. Sign in again.";
  if (status === 403) return "You don't have permission to do that.";
  if (status === 404) return "That resource could not be found.";
  if (status === 409) return "Someone else changed this at the same time. Reload and try again.";
  if (status === 429) return "You're doing that too quickly. Wait a moment and retry.";
  if (status >= 500) return "INFERA hit an error. Try again shortly.";
  return `Request failed (${status})`;
}

export const api = {
  get: <T>(path: string, query?: RequestOptions["query"], signal?: AbortSignal) =>
    request<T>(path, { query, signal }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: "POST", body: body ?? {} }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: "PATCH", body: body ?? {} }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: "PUT", body: body ?? {} }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

// ------------------------------------------------------------------ helpers

export function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}

export function isForbidden(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    (error.status === 403 || error.code === "MISSING_PERMISSION" || error.code === "GUILD_NOT_AUTHORIZED")
  );
}

export function isBotMissing(error: unknown): boolean {
  if (!(error instanceof ApiError) || error.code !== "GUILD_NOT_FOUND") return false;
  return error.details.some(
    (detail) => typeof detail === "object" && detail !== null && (detail as { reason?: string }).reason === "bot_not_installed",
  ) || /install/i.test(error.message);
}

export function isNotImplemented(error: unknown): boolean {
  return error instanceof ApiError && error.code === "NOT_IMPLEMENTED";
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "VALIDATION_ERROR" && error.issues.length > 0) {
      const first = error.issues[0];
      if (first?.message) return first.key ? `${first.key}: ${first.message}` : String(first.message);
    }
    if (error.status === 429 && error.retryAfter) return `${error.message} (retry in ${error.retryAfter}s)`;
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return "Something went wrong";
}
