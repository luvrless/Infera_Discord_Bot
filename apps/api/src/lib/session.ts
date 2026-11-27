import type { OAuthSession, User } from "@infera/database";
import { ErrorCode, InferaError } from "@infera/shared";
import type { FastifyReply, FastifyRequest } from "fastify";
import { SESSION_COOKIE, SESSION_TTL_MS, db, env } from "./config";
import { decrypt, encrypt, hashToken, randomToken } from "./crypto";
import { refreshAccessToken } from "./oauth";

export interface SessionContext {
  row: OAuthSession;
  user: User;
}

export interface PublicUser {
  id: string;
  username: string;
  globalName: string | null;
  avatar: string | null;
  avatarUrl: string;
  locale: string | null;
}

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: env.NODE_ENV === "production",
    path: "/",
    // The browser keeps the cookie for 400 days (the maximum browsers allow);
    // the server-side rolling expiry decides whether the session is valid.
    maxAge: 400 * 24 * 60 * 60,
  };
}

export async function createSession(input: {
  userId: string;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  userAgent?: string | null;
  ip?: string | null;
}): Promise<{ token: string; row: OAuthSession }> {
  const token = randomToken(32);
  const row = await db.oAuthSession.create({
    data: {
      sessionHash: hashToken(token),
      userId: input.userId,
      accessToken: encrypt(input.accessToken),
      refreshToken: encrypt(input.refreshToken),
      accessExpiresAt: new Date(Date.now() + Math.max(60, input.expiresIn) * 1000),
      userAgent: input.userAgent?.slice(0, 300) ?? null,
      ip: input.ip ?? null,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  });
  // Opportunistic cleanup of dead sessions.
  void db.oAuthSession
    .deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } } })
    .catch(() => undefined);
  return { token, row };
}

export function setSessionCookie(reply: FastifyReply, token: string): void {
  reply.setCookie(SESSION_COOKIE, token, cookieOptions());
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE, { path: "/" });
}

function sessionToken(request: FastifyRequest): string | null {
  const fromPlugin = request.cookies?.[SESSION_COOKIE];
  if (fromPlugin) return fromPlugin;
  // WebSocket upgrade requests can reach the handler without the cookie plugin
  // decorator, so fall back to the raw Cookie header.
  const header = request.headers?.cookie;
  if (!header) return null;
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === SESSION_COOKIE) {
      try {
        return decodeURIComponent(rest.join("="));
      } catch {
        return rest.join("=");
      }
    }
  }
  return null;
}

export async function readSession(request: FastifyRequest): Promise<SessionContext | null> {
  const token = sessionToken(request);
  if (!token) return null;
  const row = await db.oAuthSession.findUnique({ where: { sessionHash: hashToken(token) } });
  if (!row || row.revokedAt || row.expiresAt.getTime() <= Date.now()) return null;
  const user = await db.user.findUnique({ where: { id: row.userId } });
  if (!user) return null;
  if (Date.now() - row.lastUsedAt.getTime() > 5 * 60_000) {
    // Rolling session: each use extends the expiry window.
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    row.expiresAt = expiresAt;
    void db.oAuthSession
      .update({ where: { id: row.id }, data: { lastUsedAt: new Date(), expiresAt } })
      .catch(() => undefined);
  }
  return { row, user };
}

export async function requireSession(request: FastifyRequest): Promise<SessionContext> {
  const session = await readSession(request);
  if (!session) {
    throw new InferaError("Sign in with Discord to continue", { code: ErrorCode.UNAUTHORIZED });
  }
  return session;
}

/** Returns a usable Discord access token, refreshing it when it is about to expire. */
export async function accessTokenFor(row: OAuthSession): Promise<string> {
  const current = row.accessToken ? decrypt(row.accessToken) : null;
  if (!current) {
    throw new InferaError("Your session has expired, sign in again", {
      code: ErrorCode.UNAUTHORIZED,
    });
  }
  if (row.accessExpiresAt && row.accessExpiresAt.getTime() > Date.now() + 60_000) return current;

  const refresh = row.refreshToken ? decrypt(row.refreshToken) : null;
  if (!refresh) return current;
  try {
    const refreshed = await refreshAccessToken(refresh);
    await db.oAuthSession.update({
      where: { id: row.id },
      data: {
        accessToken: encrypt(refreshed.access_token),
        refreshToken: encrypt(refreshed.refresh_token),
        accessExpiresAt: new Date(Date.now() + Math.max(60, refreshed.expires_in) * 1000),
      },
    });
    return refreshed.access_token;
  } catch {
    return current;
  }
}

export async function revokeSession(row: OAuthSession): Promise<void> {
  await db.oAuthSession
    .update({ where: { id: row.id }, data: { revokedAt: new Date() } })
    .catch(() => undefined);
}

export function toPublicUser(user: User): PublicUser {
  const avatar = user.avatar ?? null;
  return {
    id: user.id,
    username: user.username,
    globalName: user.globalName ?? null,
    avatar,
    avatarUrl: avatar
      ? `https://cdn.discordapp.com/avatars/${user.id}/${avatar}.${avatar.startsWith("a_") ? "gif" : "png"}?size=128`
      : `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(user.id) >> 22n) % 6n)}.png`,
    locale: user.locale ?? null,
  };
}
