import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { wsUrl } from "../lib/api/client";
import { keys } from "../lib/api/keys";
import type { RealtimeEnvelope } from "../lib/api/types";

export type RealtimeStatus = "idle" | "connecting" | "open" | "reconnecting" | "closed" | "unauthorized";

interface RealtimeContextValue {
  status: RealtimeStatus;
  subscribedGuild: string | null;
  events: RealtimeEnvelope[];
  lastEventAt: number | null;
  setGuild: (guildId: string | null) => void;
  subscribe: (listener: (event: RealtimeEnvelope) => void) => () => void;
  clear: () => void;
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

const HEARTBEAT_MS = 25_000;
const MAX_BACKOFF_MS = 30_000;
const FEED_LIMIT = 80;

/** Which cached queries each realtime event makes stale. */
function invalidationsFor(event: string, guildId: string): QueryKey[] {
  const configKeys = [keys.settings(guildId), keys.modules(guildId), keys.overview(guildId), keys.alerts(guildId)];
  if (event === "config.updated" || event.startsWith("module.") || event === "prefix.updated") {
    return [...configKeys, keys.automod(guildId), keys.security(guildId), keys.welcome(guildId), keys.integrations(guildId), keys.autoroles(guildId)];
  }
  if (event.startsWith("moderation.")) return [keys.moderation(guildId), keys.overview(guildId), keys.activity(guildId), keys.alerts(guildId)];
  if (event.startsWith("security.")) return [keys.security(guildId), keys.lockdown(guildId), keys.alerts(guildId), keys.activity(guildId), keys.accountAlerts];
  if (event.startsWith("automod.")) return [keys.automod(guildId), keys.activity(guildId)];
  if (event.startsWith("leveling.")) return [keys.leveling(guildId)];
  if (event.startsWith("economy.")) return [keys.economy(guildId)];
  if (event.startsWith("ticket.")) return [keys.ticketsAll(guildId), keys.overview(guildId)];
  if (event.startsWith("giveaway.")) return [keys.giveaways(guildId), keys.overview(guildId)];
  if (event.startsWith("suggestion.")) return [keys.suggestions(guildId)];
  if (event === "command.enabled" || event === "command.disabled") return [keys.guildCommands(guildId)];
  if (event === "command.executed" || event === "command.failed" || event.startsWith("analytics.")) {
    return [keys.analyticsAll(guildId), keys.overview(guildId), keys.guildCommands(guildId)];
  }
  if (event.startsWith("member.")) return [keys.detail(guildId), keys.overview(guildId)];
  if (event.startsWith("guild.")) return [keys.detail(guildId), keys.guilds];
  if (event.startsWith("role.")) return [keys.roles(guildId)];
  if (event.startsWith("channel.")) return [keys.channels(guildId)];
  if (event.startsWith("integration.")) return [keys.integrations(guildId)];
  return [];
}

export function RealtimeProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<RealtimeStatus>("idle");
  const [events, setEvents] = useState<RealtimeEnvelope[]>([]);
  const [lastEventAt, setLastEventAt] = useState<number | null>(null);
  const [subscribedGuild, setSubscribedGuild] = useState<string | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const guildRef = useRef<string | null>(null);
  const attemptRef = useRef(0);
  const seenRef = useRef<Set<string>>(new Set());
  const listenersRef = useRef(new Set<(event: RealtimeEnvelope) => void>());
  const pendingInvalidations = useRef(new Map<string, QueryKey>());
  const flushTimer = useRef<number | null>(null);
  const stopped = useRef(false);

  const scheduleInvalidation = useCallback(
    (queryKeys: QueryKey[]) => {
      for (const key of queryKeys) pendingInvalidations.current.set(JSON.stringify(key), key);
      if (flushTimer.current !== null) return;
      flushTimer.current = window.setTimeout(() => {
        flushTimer.current = null;
        const entries = Array.from(pendingInvalidations.current.values());
        pendingInvalidations.current.clear();
        for (const key of entries) void queryClient.invalidateQueries({ queryKey: key });
      }, 400);
    },
    [queryClient],
  );

  const send = useCallback((payload: Record<string, unknown>) => {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
  }, []);

  const handleEnvelope = useCallback(
    (envelope: RealtimeEnvelope) => {
      if (!envelope.eventId || seenRef.current.has(envelope.eventId)) return;
      seenRef.current.add(envelope.eventId);
      if (seenRef.current.size > 2000) seenRef.current = new Set(Array.from(seenRef.current).slice(-1000));

      const current = guildRef.current;
      // Platform events (no guild) update global state only.
      if (!envelope.guildId) {
        if (envelope.event.startsWith("bot.")) scheduleInvalidation([keys.guilds, keys.status, keys.accountAlerts]);
        if (current) scheduleInvalidation([keys.detail(current)]);
      } else {
        // Never surface another guild's events, even if the server sent them.
        if (envelope.guildId !== current) return;
        scheduleInvalidation(invalidationsFor(envelope.event, envelope.guildId));
        setEvents((list) => [envelope, ...list].slice(0, FEED_LIMIT));
      }
      setLastEventAt(Date.now());
      for (const listener of listenersRef.current) listener(envelope);
    },
    [scheduleInvalidation],
  );

  useEffect(() => {
    if (!enabled) {
      setStatus("idle");
      return;
    }
    stopped.current = false;
    let heartbeat: number | null = null;
    let retry: number | null = null;

    const connect = () => {
      if (stopped.current) return;
      setStatus(attemptRef.current === 0 ? "connecting" : "reconnecting");
      let socket: WebSocket;
      try {
        socket = new WebSocket(wsUrl());
      } catch {
        scheduleReconnect();
        return;
      }
      socketRef.current = socket;

      socket.onopen = () => {
        attemptRef.current = 0;
        setStatus("open");
        // Restore the subscription after (re)connecting.
        if (guildRef.current) socket.send(JSON.stringify({ type: "subscribe", guildId: guildRef.current }));
        heartbeat = window.setInterval(() => send({ type: "ping" }), HEARTBEAT_MS);
      };

      socket.onmessage = (message) => {
        let payload: Record<string, unknown>;
        try {
          payload = JSON.parse(String(message.data)) as Record<string, unknown>;
        } catch {
          return;
        }
        if (typeof payload.event === "string") {
          handleEnvelope(payload as unknown as RealtimeEnvelope);
          return;
        }
        if (payload.type === "subscribed") setSubscribedGuild(String(payload.guildId));
        if (payload.type === "unsubscribed" && payload.guildId === guildRef.current) setSubscribedGuild(null);
        if (payload.type === "error" && payload.code === "UNAUTHORIZED") {
          stopped.current = true;
          setStatus("unauthorized");
        }
      };

      socket.onclose = (event) => {
        if (heartbeat) window.clearInterval(heartbeat);
        heartbeat = null;
        socketRef.current = null;
        setSubscribedGuild(null);
        if (event.code === 4401) {
          stopped.current = true;
          setStatus("unauthorized");
          return;
        }
        if (!stopped.current) scheduleReconnect();
        else setStatus("closed");
      };

      socket.onerror = () => {
        socket.close();
      };
    };

    const scheduleReconnect = () => {
      if (stopped.current) return;
      attemptRef.current += 1;
      setStatus("reconnecting");
      const base = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** Math.min(attemptRef.current - 1, 5));
      const delay = base / 2 + Math.random() * (base / 2);
      retry = window.setTimeout(connect, delay);
    };

    const onVisible = () => {
      if (document.visibilityState === "visible" && !socketRef.current && !stopped.current) {
        if (retry) window.clearTimeout(retry);
        attemptRef.current = 0;
        connect();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    connect();

    return () => {
      stopped.current = true;
      document.removeEventListener("visibilitychange", onVisible);
      if (heartbeat) window.clearInterval(heartbeat);
      if (retry) window.clearTimeout(retry);
      socketRef.current?.close(1000, "logout");
      socketRef.current = null;
      setEvents([]);
      setSubscribedGuild(null);
    };
  }, [enabled, handleEnvelope, send]);

  const setGuild = useCallback(
    (guildId: string | null) => {
      const previous = guildRef.current;
      if (previous === guildId) return;
      if (previous) send({ type: "unsubscribe", guildId: previous });
      guildRef.current = guildId;
      setEvents([]);
      setSubscribedGuild(null);
      if (guildId) send({ type: "subscribe", guildId });
    },
    [send],
  );

  const subscribe = useCallback((listener: (event: RealtimeEnvelope) => void) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  const value = useMemo<RealtimeContextValue>(
    () => ({ status, subscribedGuild, events, lastEventAt, setGuild, subscribe, clear: () => setEvents([]) }),
    [status, subscribedGuild, events, lastEventAt, setGuild, subscribe],
  );

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useRealtime(): RealtimeContextValue {
  const context = useContext(RealtimeContext);
  if (!context) throw new Error("useRealtime must be used inside RealtimeProvider");
  return context;
}

/** Subscribe the socket to a guild for as long as the calling component is mounted. */
export function useRealtimeGuild(guildId: string | null): void {
  const { setGuild } = useRealtime();
  useEffect(() => {
    setGuild(guildId);
    return () => setGuild(null);
  }, [guildId, setGuild]);
}
