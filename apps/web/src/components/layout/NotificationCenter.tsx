import { AlertTriangle, Bell, BotOff, CheckCheck, Info, Plug, Settings2, ShieldAlert, Shield } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import type { Alert } from "../../lib/api/types";
import { cn, timeAgo } from "../../lib/utils";
import { useNotifications } from "../../hooks/useNotifications";
import { useClickOutside } from "../ui/primitives";

export function alertIcon(alert: Alert) {
  if (alert.type === "security") return ShieldAlert;
  if (alert.type === "bot") return BotOff;
  if (alert.type === "moderation") return Shield;
  if (alert.type === "configuration") return Settings2;
  if (alert.type === "integration") return Plug;
  if (alert.severity === "critical" || alert.severity === "high") return AlertTriangle;
  return Info;
}

export function severityTone(severity: string): string {
  if (severity === "critical" || severity === "high") return "text-red-400 bg-red-500/10 border-red-500/20";
  if (severity === "warning" || severity === "medium") return "text-amber-400 bg-amber-500/10 border-amber-500/20";
  return "text-sky-400 bg-sky-500/10 border-sky-500/20";
}

export function NotificationCenter({ userId, guildId }: { userId: string | undefined; guildId: string | null }) {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside<HTMLDivElement>(open, () => setOpen(false));
  const notifications = useNotifications(userId, guildId);
  const count = notifications.unread.length;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={count ? `Notifications, ${count} unread` : "Notifications"}
        aria-expanded={open}
        className="btn-icon relative"
      >
        <Bell className="h-4 w-4" />
        {count > 0 ? (
          <span className="absolute right-1 top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-accent px-1 text-[9px] font-bold text-white">
            {count > 9 ? "9+" : count}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-[min(380px,calc(100vw-1.5rem))] animate-fade-in overflow-hidden rounded-xl border border-ink-600 bg-ink-850 shadow-pop">
          <div className="flex items-center justify-between border-b border-ink-700 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-zinc-100">Notifications</p>
              <p className="text-2xs text-zinc-500">{count ? `${count} unread` : "You're all caught up"}</p>
            </div>
            <button type="button" disabled={count === 0} onClick={notifications.markAllRead} className="btn-ghost btn-sm">
              <CheckCheck className="h-3.5 w-3.5" /> Mark all read
            </button>
          </div>
          <ul className="max-h-[60vh] divide-y divide-ink-700/70 overflow-y-auto">
            {notifications.isLoading ? <li className="px-4 py-8 text-center text-xs text-zinc-500">Loading…</li> : null}
            {!notifications.isLoading && notifications.alerts.length === 0 ? (
              <li className="px-4 py-10 text-center">
                <Bell className="mx-auto h-5 w-5 text-zinc-600" />
                <p className="mt-2 text-13 text-zinc-300">No notifications</p>
                <p className="mt-0.5 text-xs text-zinc-500">Security alerts, bot disconnections and configuration warnings appear here.</p>
              </li>
            ) : null}
            {notifications.alerts.slice(0, 20).map((alert) => {
              const Icon = alertIcon(alert);
              const read = notifications.isRead(alert.id);
              return (
                <li key={alert.id}>
                  <button
                    type="button"
                    onClick={() => (read ? notifications.markUnread(alert.id) : notifications.markRead([alert.id]))}
                    className={cn("flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-ink-800", read && "opacity-60")}
                    title={read ? "Mark as unread" : "Mark as read"}
                  >
                    <span className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border", severityTone(alert.severity))}>
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-13 font-medium capitalize text-zinc-100">{alert.title}</span>
                        {!read ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" /> : null}
                      </span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-zinc-500">{alert.description}</span>
                      <span className="mt-1 block text-2xs text-zinc-600">
                        {alert.guildName ? `${alert.guildName} · ` : ""}
                        {alert.createdAt ? timeAgo(alert.createdAt) : "Ongoing"}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <Link to="/dashboard/notifications" onClick={() => setOpen(false)} className="block border-t border-ink-700 px-4 py-2.5 text-center text-xs text-zinc-400 hover:bg-ink-800 hover:text-zinc-100">
            View all notifications
          </Link>
        </div>
      ) : null}
    </div>
  );
}
