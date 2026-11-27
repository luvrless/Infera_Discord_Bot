import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import websocket from "@fastify/websocket";
import { ErrorCode, InferaError } from "@infera/shared";
import Fastify, { type FastifyInstance } from "fastify";
import type { WebSocket } from "ws";
import {
  BASE_PATH,
  allowedOrigins,
  cache,
  env,
  services,
} from "./lib/config";
import { assertGuildAccess } from "./lib/auth";
import { errorHandler } from "./lib/http";
import { readSession } from "./lib/session";
import { hub } from "./lib/hub";
import { startRealtimeBridge } from "./lib/bridge";
import { dashboardRoutes } from "./routes/dashboard";
import { authRoutes } from "./routes/auth";
import { communityRoutes } from "./routes/community";
import { automationRoutes } from "./routes/automation";
import { guildRoutes } from "./routes/guilds";
import { moderationRoutes } from "./routes/moderation";
import { systemRoutes } from "./routes/system";

export function createApp(): FastifyInstance {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      transport: env.NODE_ENV === "development" ? undefined : undefined,
    },
    trustProxy: true,
    bodyLimit: 1_000_000,
  });

  void app.register(cookie);
  void app.register(cors, {
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.has(origin)) return callback(null, true);
      return callback(null, false);
    },
    credentials: true,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  });
  void app.register(rateLimit, { max: 400, timeWindow: "1 minute" });
  void app.register(websocket);

  app.addHook("onSend", async (_request, reply, payload) => {
    reply.header("x-content-type-options", "nosniff");
    reply.header("cache-control", "no-store");
    return payload;
  });

  // Cookie-authenticated mutations must come from a known origin.
  app.addHook("preHandler", async (request, reply) => {
    if (!["POST", "PATCH", "PUT", "DELETE"].includes(request.method)) return;
    const origin = request.headers.origin;
    if (!origin) return;
    if (!allowedOrigins.has(origin)) {
      return reply.code(403).send({
        error: { code: ErrorCode.FORBIDDEN, message: "Cross-origin request rejected", details: [] },
      });
    }
  });

  app.setErrorHandler(errorHandler);

  app.get("/health", async () => ({ ok: true, service: "infera-api" }));
  app.get(BASE_PATH, async () => ({
    name: "INFERA API",
    version: "1.0.0",
    base: BASE_PATH,
    realtime: `${BASE_PATH}/ws`,
  }));

  void app.register(authRoutes);
  void app.register(guildRoutes);
  void app.register(moderationRoutes);
  void app.register(communityRoutes);
  void app.register(automationRoutes);
  void app.register(systemRoutes);
  void app.register(dashboardRoutes);

  const stopBridge = startRealtimeBridge(app.log);

  // Route registration must happen after the websocket plugin is loaded so the
  // plugin can attach its upgrade handler; otherwise Fastify treats this as a
  // normal HTTP route and hands the request object to the callback.
  app.after(() => {
    app.get(`${BASE_PATH}/ws`, { websocket: true }, async (socket: WebSocket, request) => {
    const session = await readSession(request);
    if (!session) {
      socket.send(JSON.stringify({ type: "error", code: "UNAUTHORIZED", message: "Sign in first" }));
      socket.close(4401, "unauthorized");
      return;
    }
    const client = hub.add(socket, session.user.id);
    socket.send(JSON.stringify({ type: "ready", userId: session.user.id }));

    socket.on("message", (raw) => {
      void (async () => {
        let message: { type?: string; action?: string; guildId?: string };
        try {
          message = JSON.parse(String(raw)) as typeof message;
        } catch {
          socket.send(JSON.stringify({ type: "error", message: "Invalid JSON" }));
          return;
        }
        // Accept both the implemented `type` field and the documented `action` field.
        message.type = message.type ?? message.action;
        if (message.type === "ping") {
          socket.send(JSON.stringify({ type: "pong", at: Date.now() }));
          return;
        }
        if (message.type === "subscribe" && message.guildId) {
          try {
            await assertGuildAccess(session, message.guildId);
            hub.subscribe(client, message.guildId);
            socket.send(JSON.stringify({ type: "subscribed", guildId: message.guildId }));
          } catch (error) {
            socket.send(
              JSON.stringify({
                type: "error",
                code: error instanceof InferaError ? error.code : "FORBIDDEN",
                message: "You cannot subscribe to that server",
              }),
            );
          }
          return;
        }
        if (message.type === "unsubscribe" && message.guildId) {
          client.guilds.delete(message.guildId);
          socket.send(JSON.stringify({ type: "unsubscribed", guildId: message.guildId }));
        }
      })();
    });

      socket.on("close", () => hub.remove(socket));
      socket.on("error", () => hub.remove(socket));
    });
  });

  app.addHook("onClose", async () => {
    stopBridge();
    await cache.close().catch(() => undefined);
    await services.db.$disconnect().catch(() => undefined);
  });

  return app;
}
