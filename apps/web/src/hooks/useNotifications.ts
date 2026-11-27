import { useCallback, useEffect, useMemo, useState } from "react";
import { useAccountAlerts } from "../lib/api/auth";
import { useGuildAlerts } from "../lib/api/guilds";
import type { Alert } from "../lib/api/types";
import { readLocal, writeLocal } from "../lib/utils";
import { useRealtime } from "./useRealtime";

/**
 * Notifications are derived server-side (bot heartbeat, unresolved security
 * events, pending appeals, incomplete configuration). The backend does not
 * persist read state, so read/unread is kept per user in this browser.
 */
export function useNotifications(userId: string | undefined, guildId: string | null) {
  const account = useAccountAlerts(Boolean(userId));
  const guild = useGuildAlerts(guildId ?? "", Boolean(guildId));
  const { subscribe } = useRealtime();
  const storageKey = `read-alerts:${userId ?? "anon"}`;
  const [readIds, setReadIds] = useState<string[]>(() => readLocal<string[]>(storageKey, []));
  const [live, setLive] = useState<Alert[]>([]);

  useEffect(() => setReadIds(readLocal<string[]>(storageKey, [])), [storageKey]);
  useEffect(() => setLive([]), [guildId]);

  // Realtime security alerts appear immediately, before the next poll.
  useEffect(
    () =>
      subscribe((envelope) => {
        if (!envelope.event.startsWith("security.") && envelope.event !== "bot.shard.disconnected") return;
        setLive((current) =>
          [
            {
              id: `live:${envelope.eventId}`,
              type: envelope.event.startsWith("security.") ? "security" : "bot",
              severity: envelope.event.includes("triggered") || envelope.event.includes("disconnected") ? "critical" : "warning",
              title: envelope.event.replace(/\./g, " "),
              description: "Received live from INFERA.",
              createdAt: envelope.timestamp,
              guildId: envelope.guildId,
            },
            ...current,
          ].slice(0, 20),
        );
      }),
    [subscribe],
  );

  const alerts = useMemo(() => {
    const merged = new Map<string, Alert>();
    for (const alert of live) merged.set(alert.id, alert);
    for (const alert of guild.data?.alerts ?? []) merged.set(alert.id, alert);
    for (const alert of account.data?.alerts ?? []) if (!merged.has(alert.id)) merged.set(alert.id, alert);
    return Array.from(merged.values()).sort((a, b) => {
      const rank = (severity: string) => (severity === "critical" ? 0 : severity === "high" ? 1 : severity === "warning" || severity === "medium" ? 2 : 3);
      return rank(a.severity) - rank(b.severity) || (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
    });
  }, [live, guild.data, account.data]);

  const unread = alerts.filter((alert) => !readIds.includes(alert.id));

  const markRead = useCallback(
    (ids: string[]) => {
      setReadIds((current) => {
        const next = Array.from(new Set([...current, ...ids])).slice(-500);
        writeLocal(storageKey, next);
        return next;
      });
    },
    [storageKey],
  );

  const markUnread = useCallback(
    (id: string) => {
      setReadIds((current) => {
        const next = current.filter((entry) => entry !== id);
        writeLocal(storageKey, next);
        return next;
      });
    },
    [storageKey],
  );

  return {
    alerts,
    unread,
    isRead: (id: string) => readIds.includes(id),
    markRead,
    markUnread,
    markAllRead: () => markRead(alerts.map((alert) => alert.id)),
    isLoading: account.isLoading || (Boolean(guildId) && guild.isLoading),
    error: account.error ?? guild.error,
    refetch: () => {
      void account.refetch();
      if (guildId) void guild.refetch();
    },
  };
}
