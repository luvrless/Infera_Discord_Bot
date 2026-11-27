import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  BookOpen,
  Cake,
  CalendarClock,
  CalendarDays,
  Coins,
  Gift,
  Heart,
  Lightbulb,
  Lock,
  LogOut,
  MessageSquareQuote,
  Music,
  Pin,
  Plug,
  Radio,
  Repeat,
  ScrollText,
  Settings2,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Siren,
  Sparkles,
  Star,
  ThumbsUp,
  Ticket,
  TrendingUp,
  Tv,
  Vote,
  Volume2,
  Webhook,
  Youtube,
  AlarmClock,
  Bell,
  Gamepad2,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "../../components/cards";
import { Badge, Segmented, Toggle } from "../../components/ui/primitives";
import { SearchInput } from "../../components/ui/table";
import { useToast } from "../../components/ui/toast";
import { errorMessage } from "../../lib/api/client";
import { guildApi, invalidateConfig } from "../../lib/api/guilds";
import { DOCS_URL, serverPath } from "../../lib/nav";
import { cn, timeAgo } from "../../lib/utils";
import { useGuild } from "../../hooks/useGuild";

interface CatalogueEntry {
  id: string;
  name: string;
  description: string;
  category: "Engagement" | "Moderation" | "Community" | "Utility" | "Voice" | "Integrations";
  icon: LucideIcon;
  /** Toggle through PATCH /guilds/:id/modules/:moduleId */
  moduleId?: string;
  /** Toggle through PATCH /guilds/:id/config when there is no module endpoint */
  toggleKey?: string;
  page?: string;
  requires?: Array<{ key: string; label: string }>;
  dependsOn?: string[];
  permissions?: string[];
  testPath?: string;
  /** Feature exists in the bot as commands only, or not at all. */
  unsupported?: string;
}

const CATALOGUE: CatalogueEntry[] = [
  { id: "welcome", name: "Welcome", description: "Greet new members with a message, embed or DM.", category: "Engagement", icon: Heart, moduleId: "welcome", page: "welcome", testPath: "welcome", requires: [{ key: "welcome.channel_id", label: "Welcome channel" }], permissions: ["Send Messages", "Embed Links"] },
  { id: "goodbye", name: "Goodbye", description: "Post a message when members leave.", category: "Engagement", icon: LogOut, moduleId: "goodbye", page: "welcome", requires: [{ key: "goodbye.channel_id", label: "Goodbye channel" }], permissions: ["Send Messages"] },
  { id: "leveling", name: "Leveling", description: "XP for messages and voice, rewards and leaderboards.", category: "Engagement", icon: TrendingUp, moduleId: "leveling", page: "leveling", permissions: ["Manage Roles (for rewards)"] },
  { id: "economy", name: "Economy", description: "Virtual currency, shop, trading and games.", category: "Engagement", icon: Coins, moduleId: "economy", page: "economy" },
  { id: "giveaways", name: "Giveaways", description: "Timed giveaways with entry requirements and rerolls.", category: "Engagement", icon: Gift, moduleId: "giveaways", page: "giveaways", permissions: ["Send Messages", "Embed Links"] },
  { id: "reputation", name: "Reputation", description: "Members give each other reputation points.", category: "Engagement", icon: ThumbsUp, unsupported: "Available through the bot's rep commands; there's no dashboard API for it yet." },
  { id: "birthdays", name: "Birthdays", description: "Birthday announcements for members.", category: "Engagement", icon: Cake, unsupported: "Available through the bot's birthday commands; there's no dashboard API for it yet." },

  { id: "moderation", name: "Moderation", description: "Bans, kicks, timeouts, warnings, cases and appeals.", category: "Moderation", icon: Shield, moduleId: "moderation", page: "moderation", permissions: ["Ban Members", "Kick Members", "Moderate Members"] },
  { id: "automod", name: "AutoMod", description: "Spam, links, invites, caps, phishing and word filters.", category: "Moderation", icon: ShieldAlert, moduleId: "automod", page: "automod", testPath: "automod", permissions: ["Manage Messages", "Moderate Members"] },
  { id: "antinuke", name: "Antinuke", description: "Detect destructive admin actions and respond.", category: "Moderation", icon: Siren, toggleKey: "security.antinuke.enabled", page: "security", requires: [{ key: "security.alert_channel", label: "Alert channel" }], permissions: ["View Audit Log", "Manage Roles", "Ban Members"] },
  { id: "antiraid", name: "Antiraid", description: "Detect mass joins and suspicious accounts.", category: "Moderation", icon: Lock, toggleKey: "security.antiraid.enabled", page: "security", requires: [{ key: "security.alert_channel", label: "Alert channel" }] },
  { id: "verification", name: "Verification", description: "Gate the server behind a verification role.", category: "Moderation", icon: ShieldCheck, toggleKey: "security.verification_enabled", page: "verification", requires: [{ key: "security.verification_role", label: "Verified role" }], permissions: ["Manage Roles"] },
  { id: "logging", name: "Logging", description: "Message, member, role, channel and voice logs.", category: "Moderation", icon: ScrollText, moduleId: "logging", page: "logging", testPath: "logging", requires: [{ key: "logging.channel_id", label: "Log channel" }], permissions: ["View Audit Log", "Send Messages"] },

  { id: "tickets", name: "Tickets", description: "Private support channels with claims and transcripts.", category: "Community", icon: Ticket, moduleId: "tickets", page: "tickets", requires: [{ key: "tickets.category_id", label: "Ticket category" }], permissions: ["Manage Channels", "Manage Roles"] },
  { id: "suggestions", name: "Suggestions", description: "Collect and review community ideas.", category: "Community", icon: Lightbulb, moduleId: "suggestions", page: "suggestions", requires: [{ key: "suggestions.channel_id", label: "Suggestion channel" }] },
  { id: "confessions", name: "Confessions", description: "Anonymous confessions posted by INFERA.", category: "Community", icon: MessageSquareQuote, toggleKey: "confessions.enabled", page: "confessions", requires: [{ key: "confessions.channel_id", label: "Confession channel" }] },
  { id: "starboard", name: "Starboard", description: "Highlight messages that get enough reactions.", category: "Community", icon: Star, moduleId: "starboard", page: "starboard", requires: [{ key: "starboard.channel_id", label: "Starboard channel" }], permissions: ["Read Message History", "Embed Links"] },
  { id: "announcements", name: "Announcements", description: "Schedule announcements to post later.", category: "Community", icon: Bell, page: "schedules" },
  { id: "events", name: "Events", description: "Community event planning.", category: "Community", icon: CalendarDays, unsupported: "The bot has event commands, but there's no dashboard API for events yet." },
  { id: "polls", name: "Polls", description: "Run polls in channels.", category: "Community", icon: Vote, unsupported: "Polls run from the bot's poll commands; there's no dashboard API yet." },

  { id: "reminders", name: "Reminders", description: "Personal and channel reminders.", category: "Utility", icon: AlarmClock, unsupported: "Reminders are per-user bot commands; there's no guild reminder API." },
  { id: "schedules", name: "Schedules", description: "Scheduled messages delivered by the worker.", category: "Utility", icon: CalendarClock, page: "schedules" },
  { id: "custom-commands", name: "Custom Commands", description: "Your own prefix commands with custom responses.", category: "Utility", icon: Sparkles, page: "custom-commands" },
  { id: "autoresponders", name: "Auto Responders", description: "Reply automatically to trigger phrases.", category: "Utility", icon: Repeat, page: "autoresponders" },
  { id: "embed-builder", name: "Embed Builder", description: "Design and send custom embeds.", category: "Utility", icon: Settings2, unsupported: "Embeds are built with the bot's embed commands; there's no send-embed API." },
  { id: "sticky", name: "Sticky Messages", description: "Keep a message pinned to the bottom of a channel.", category: "Utility", icon: Pin, unsupported: "Sticky messages are command-only; there's no dashboard API." },

  { id: "voice", name: "Temporary Voice", description: "Join-to-create voice channels.", category: "Voice", icon: Volume2, moduleId: "voice", page: "voice", requires: [{ key: "voice.lobby_channel_id", label: "Lobby channel" }, { key: "voice.category_id", label: "Voice category" }], permissions: ["Manage Channels", "Move Members"] },
  { id: "voice-controls", name: "Voice Controls", description: "Let channel owners manage their temporary channel.", category: "Voice", icon: Settings2, toggleKey: "voice.allow_user_control", page: "voice", dependsOn: ["voice"] },
  { id: "music", name: "Music", description: "Music playback settings and DJ roles.", category: "Voice", icon: Music, moduleId: "music", page: "music", permissions: ["Connect", "Speak"] },

  { id: "roblox", name: "Roblox", description: "Roblox user, game and group lookups.", category: "Integrations", icon: Gamepad2, moduleId: "roblox", page: "integrations" },
  { id: "youtube", name: "YouTube", description: "YouTube upload notifications.", category: "Integrations", icon: Youtube, toggleKey: "social.youtube.enabled", page: "social" },
  { id: "twitch", name: "Twitch", description: "Twitch live notifications.", category: "Integrations", icon: Tv, toggleKey: "social.twitch.enabled", page: "social" },
  { id: "social", name: "Social Feeds", description: "All social providers and feed subscriptions.", category: "Integrations", icon: Radio, page: "social" },
  { id: "webhooks", name: "Webhooks", description: "Signed outgoing webhooks for INFERA events.", category: "Integrations", icon: Webhook, page: "webhooks" },
];

const CATEGORIES = ["All", "Engagement", "Moderation", "Community", "Utility", "Voice", "Integrations"] as const;

export function ModulesPage() {
  const { guildId, modules, values, canConfigure, settings } = useGuild();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("All");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | "enabled" | "disabled">("all");
  const [pending, setPending] = useState<string | null>(null);

  const enabledOf = (entry: CatalogueEntry): boolean | null => {
    if (entry.moduleId) return modules.find((module) => module.id === entry.moduleId)?.enabled ?? null;
    if (entry.toggleKey) return Boolean(values[entry.toggleKey]);
    return null;
  };

  const list = useMemo(() => {
    const text = query.trim().toLowerCase();
    return CATALOGUE.filter((entry) => category === "All" || entry.category === category)
      .filter((entry) => !text || entry.name.toLowerCase().includes(text) || entry.description.toLowerCase().includes(text))
      .filter((entry) => {
        if (status === "all") return true;
        const enabled = enabledOf(entry);
        return status === "enabled" ? enabled === true : enabled === false;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, query, status, modules, values]);

  const toggle = async (entry: CatalogueEntry, next: boolean) => {
    setPending(entry.id);
    try {
      if (entry.moduleId) await guildApi.setModule(guildId, entry.moduleId, next);
      else if (entry.toggleKey) await guildApi.patchConfig(guildId, { [entry.toggleKey]: next });
      invalidateConfig(queryClient, guildId);
      toast.success(`${entry.name} ${next ? "enabled" : "disabled"}`);
    } catch (error) {
      toast.error(`Couldn't ${next ? "enable" : "disable"} ${entry.name}`, errorMessage(error));
    } finally {
      setPending(null);
    }
  };

  const enabledCount = CATALOGUE.filter((entry) => enabledOf(entry) === true).length;

  return (
    <div>
      <PageHeader
        title="Modules"
        description="Turn INFERA features on and off. Every switch saves to the backend and the bot applies it immediately."
        meta={
          <>
            <Badge tone="success">{enabledCount} enabled</Badge>
            {settings?.updatedAt ? <span className="text-2xs text-zinc-500">Configuration updated {timeAgo(settings.updatedAt)}</span> : null}
          </>
        }
      />
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center">
        <SearchInput value={query} onChange={setQuery} placeholder="Search modules" className="lg:w-64" />
        <div className="flex-1 overflow-x-auto">
          <Segmented value={category} onChange={setCategory} size="sm" options={CATEGORIES.map((entry) => ({ value: entry, label: entry }))} />
        </div>
        <Segmented
          value={status}
          onChange={setStatus}
          size="sm"
          options={[
            { value: "all", label: "Any" },
            { value: "enabled", label: "On" },
            { value: "disabled", label: "Off" },
          ]}
        />
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {list.map((entry) => {
          const enabled = enabledOf(entry);
          const Icon = entry.icon;
          const missing = (entry.requires ?? []).filter((requirement) => {
            const value = values[requirement.key];
            return value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0);
          });
          const depends = (entry.dependsOn ?? []).filter((dependency) => modules.find((module) => module.id === dependency)?.enabled === false);
          return (
            <div key={entry.id} className={cn("card flex flex-col p-4", entry.unsupported && "border-dashed bg-ink-900/60")}>
              <div className="flex items-start gap-3">
                <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border", enabled ? "border-accent/30 bg-accent/10 text-accent-soft" : "border-ink-600 bg-ink-800 text-zinc-400")}>
                  <Icon className="h-[18px] w-[18px]" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium text-zinc-100">{entry.name}</p>
                    <span className="text-2xs text-zinc-600">{entry.category}</span>
                  </div>
                  <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">{entry.description}</p>
                </div>
                {enabled !== null && !entry.unsupported ? (
                  <Toggle label={`Enable ${entry.name}`} checked={enabled} loading={pending === entry.id} disabled={!canConfigure} onChange={(next) => void toggle(entry, next)} />
                ) : null}
              </div>

              <div className="mt-3 flex-1 space-y-1.5">
                {entry.unsupported ? (
                  <p className="flex items-start gap-1.5 text-2xs leading-relaxed text-zinc-500">
                    <Lock className="mt-0.5 h-3 w-3 shrink-0" /> {entry.unsupported}
                  </p>
                ) : null}
                {enabled && missing.length > 0 ? (
                  <p className="flex items-start gap-1.5 text-2xs text-amber-300">
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> Needs setup: {missing.map((item) => item.label).join(", ")}
                  </p>
                ) : null}
                {depends.length > 0 ? <p className="text-2xs text-amber-300">Requires {depends.join(", ")} to be enabled.</p> : null}
                {entry.permissions?.length ? <p className="text-2xs text-zinc-600">Bot permissions: {entry.permissions.join(", ")}</p> : null}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-1 border-t border-ink-700 pt-3">
                {entry.page ? (
                  <Link to={serverPath(guildId, entry.page)} className="btn-secondary btn-sm">
                    Configure
                  </Link>
                ) : null}
                {entry.testPath ? (
                  <Link to={`${serverPath(guildId, entry.testPath)}#test`} className="btn-ghost btn-sm">
                    Test
                  </Link>
                ) : null}
                {!entry.unsupported ? (
                  <Link to={`${serverPath(guildId, "audit")}?action=${encodeURIComponent(entry.moduleId ?? entry.id)}`} className="btn-ghost btn-sm">
                    Activity
                  </Link>
                ) : null}
                <a href={`${DOCS_URL}/modules/${entry.id}`} target="_blank" rel="noreferrer noopener" className="btn-ghost btn-sm ml-auto" aria-label={`${entry.name} documentation`}>
                  <BookOpen className="h-3.5 w-3.5" /> Docs
                </a>
              </div>
            </div>
          );
        })}
      </div>
      {list.length === 0 ? <p className="py-12 text-center text-13 text-zinc-500">No modules match your filters.</p> : null}
      <p className="mt-6 flex items-center gap-1.5 text-2xs text-zinc-600">
        <Plug className="h-3 w-3" /> Modules marked unavailable exist in the bot but have no dashboard API yet. They're listed in the integration report as backend requirements.
      </p>
    </div>
  );
}
