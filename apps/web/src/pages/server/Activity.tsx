import { Activity, History, Radio, Shield, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "../../components/cards";
import { UserChip } from "../../components/ui/pickers";
import { Badge, Card, CardHeader, Segmented, StatusDot } from "../../components/ui/primitives";
import { EmptyState, QueryState, SkeletonRows } from "../../components/ui/states";
import { useActivity } from "../../lib/api/guilds";
import { eventLabel, eventTone } from "../../lib/events";
import { formatDate, timeAgo } from "../../lib/utils";
import { useGuild } from "../../hooks/useGuild";
import { useRealtime } from "../../hooks/useRealtime";

export function ActivityPage() {
  const { guildId, canModerate } = useGuild();
  const activity = useActivity(guildId, canModerate);
  const { events, status, lastEventAt } = useRealtime();
  const [kind, setKind] = useState<"all" | "moderation" | "security" | "audit">("all");

  return (
    <div>
      <PageHeader title="Activity" icon={Activity} description="Everything happening in this server — live events from the bot plus recorded moderation, security and configuration history." />
      <div className="grid gap-4 xl:grid-cols-[1fr_1.2fr]">
        <Card>
          <CardHeader
            title="Live events"
            description={lastEventAt ? `Last event ${timeAgo(new Date(lastEventAt))}` : "Streaming from wss /v1/ws"}
            icon={<Radio className="h-4 w-4" />}
            action={
              <span className="flex items-center gap-1.5 text-2xs text-zinc-500">
                <StatusDot tone={status === "open" ? "success" : "warning"} pulse={status === "open"} /> {status}
              </span>
            }
          />
          {events.length === 0 ? (
            <EmptyState icon={Radio} title="No live events yet" description="Keep this page open — joins, leaves, moderation, automod triggers, level-ups and config changes appear instantly." />
          ) : (
            <ul className="max-h-[640px] divide-y divide-ink-700/60 overflow-y-auto">
              {events.map((event) => {
                const data = (event.data ?? {}) as Record<string, unknown>;
                const userId = (data.userId ?? data.targetId ?? data.actorId ?? data.executorId) as string | undefined;
                const tone = eventTone(event.event);
                return (
                  <li key={event.eventId} className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <StatusDot tone={tone === "neutral" ? "neutral" : tone} />
                      <span className="flex-1 truncate text-13 capitalize text-zinc-100">{eventLabel(event.event)}</span>
                      <span className="text-2xs text-zinc-600" title={formatDate(event.timestamp)}>
                        {timeAgo(event.timestamp)}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 pl-4 text-xs text-zinc-500">
                      {userId ? <UserChip userId={userId} size={16} /> : null}
                      {Object.entries(data)
                        .filter(([key, value]) => !["userId", "targetId", "actorId", "executorId"].includes(key) && (typeof value === "string" || typeof value === "number"))
                        .slice(0, 3)
                        .map(([key, value]) => (
                          <span key={key} className="font-mono text-2xs text-zinc-600">
                            {key}={String(value).slice(0, 40)}
                          </span>
                        ))}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Recorded history"
            description="Moderation cases, security events and audit entries."
            icon={<History className="h-4 w-4" />}
            action={
              <Segmented
                size="sm"
                value={kind}
                onChange={setKind}
                options={[
                  { value: "all", label: "All" },
                  { value: "moderation", label: "Cases" },
                  { value: "security", label: "Security" },
                  { value: "audit", label: "Audit" },
                ]}
              />
            }
          />
          {!canModerate ? (
            <EmptyState title="Moderator access required" description="Recorded history is visible to moderators and administrators." />
          ) : (
            <QueryState query={activity} skeleton={<SkeletonRows className="p-4" rows={8} />}>
              {(data) => {
                const items = data.items.filter((item) => kind === "all" || item.kind === kind);
                if (items.length === 0) return <EmptyState title="Nothing recorded yet" description="History appears as INFERA moderates, protects and gets configured." />;
                return (
                  <ul className="max-h-[640px] divide-y divide-ink-700/60 overflow-y-auto">
                    {items.map((item) => {
                      const Icon = item.kind === "moderation" ? Shield : item.kind === "security" ? ShieldAlert : History;
                      return (
                        <li key={item.id} className="flex items-start gap-3 px-5 py-3">
                          <Icon className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono text-xs text-zinc-200">{item.title}</span>
                              <Badge tone={item.kind === "security" ? "danger" : item.kind === "moderation" ? "warning" : "neutral"}>{item.kind}</Badge>
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
                              {item.actorId ? (
                                <span className="flex items-center gap-1">
                                  by <UserChip userId={item.actorId} size={16} />
                                </span>
                              ) : null}
                              {item.targetId && /^\d{17,20}$/.test(item.targetId) && item.kind === "moderation" ? (
                                <span className="flex items-center gap-1">
                                  on <UserChip userId={item.targetId} size={16} />
                                </span>
                              ) : null}
                              {item.detail ? <span className="truncate">{item.detail}</span> : null}
                            </div>
                          </div>
                          <span className="shrink-0 text-2xs text-zinc-600" title={formatDate(item.createdAt)}>
                            {timeAgo(item.createdAt)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                );
              }}
            </QueryState>
          )}
        </Card>
      </div>
    </div>
  );
}
