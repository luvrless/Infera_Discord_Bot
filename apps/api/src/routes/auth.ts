import { ErrorCode, InferaError } from "@infera/shared";
import type { FastifyPluginAsync } from "fastify";
import { BASE_PATH, STATE_COOKIE, db, env } from "../lib/config";
import { randomToken } from "../lib/crypto";
import {
  assertGuildAccess,
  botStatus,
  guildListForSession,
} from "../lib/auth";
import { buildAuthorizeUrl, exchangeCode, fetchProfile } from "../lib/oauth";
import {
  clearSessionCookie,
  createSession,
  readSession,
  requireSession,
  revokeSession,
  setSessionCookie,
  toPublicUser,
} from "../lib/session";

const callbackPath = new URL(env.DISCORD_REDIRECT_URI).pathname;
const webLoginUrl = `${env.WEB_APP_ORIGIN}/login`;
const webDashboardUrl = `${env.WEB_APP_ORIGIN}/dashboard`;

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.get(`${BASE_PATH}/auth/discord`, async (_request, reply) => {
    const state = randomToken(24);
    reply.setCookie(STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: "lax",
      secure: env.NODE_ENV === "production",
      path: "/",
      maxAge: 600,
    });
    return reply.redirect(buildAuthorizeUrl(state));
  });

  app.get(callbackPath, async (request, reply) => {
    const query = request.query as Record<string, string | undefined>;
    const cookieState = request.cookies[STATE_COOKIE];
    reply.clearCookie(STATE_COOKIE, { path: "/" });

    if (query.error || !query.code) {
      return reply.redirect(`${webLoginUrl}?error=${encodeURIComponent(query.error ?? "cancelled")}`);
    }
    if (!cookieState || cookieState !== query.state) {
      return reply.redirect(`${webLoginUrl}?error=state_mismatch`);
    }

    try {
      const tokens = await exchangeCode(query.code);
      const profile = await fetchProfile(tokens.access_token);
      await db.user.upsert({
        where: { id: profile.id },
        create: {
          id: profile.id,
          username: profile.username,
          globalName: profile.global_name ?? null,
          avatar: profile.avatar ?? null,
          locale: profile.locale ?? null,
        },
        update: {
          username: profile.username,
          globalName: profile.global_name ?? null,
          avatar: profile.avatar ?? null,
          locale: profile.locale ?? null,
        },
      });
      const { token } = await createSession({
        userId: profile.id,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresIn: tokens.expires_in,
        userAgent: request.headers["user-agent"] ?? null,
        ip: request.ip,
      });
      setSessionCookie(reply, token);
      return reply.redirect(webDashboardUrl);
    } catch (error) {
      request.log.error({ err: error }, "discord oauth failed");
      return reply.redirect(`${webLoginUrl}?error=oauth_failed`);
    }
  });

  app.get(`${BASE_PATH}/auth/session`, async (request) => {
    const session = await requireSession(request);
    return {
      user: toPublicUser(session.user),
      expiresAt: session.row.expiresAt.toISOString(),
      createdAt: session.row.createdAt.toISOString(),
      // Public identifier used to build the bot invite link.
      clientId: env.DISCORD_CLIENT_ID,
    };
  });

  app.get(`${BASE_PATH}/auth/me`, async (request) => {
    const session = await requireSession(request);
    return { user: toPublicUser(session.user) };
  });

  app.get(`${BASE_PATH}/auth/me/guilds`, async (request) => {
    const session = await requireSession(request);
    const guilds = await guildListForSession(session);
    return { guilds, bot: await botStatus() };
  });

  app.get(`${BASE_PATH}/auth/me/permissions`, async (request) => {
    const session = await requireSession(request);
    const query = request.query as { guildId?: string };
    if (!query.guildId) throw new InferaError("guildId is required", { code: ErrorCode.VALIDATION_ERROR });
    const access = await assertGuildAccess(session, query.guildId);
    return {
      guildId: access.guildId,
      level: access.level,
      scopes: access.scopes,
      botInstalled: access.botInstalled,
    };
  });

  app.post(`${BASE_PATH}/auth/logout`, async (request, reply) => {
    const session = await readSession(request);
    if (session) await revokeSession(session.row);
    clearSessionCookie(reply);
    return { signedOut: true };
  });
};
