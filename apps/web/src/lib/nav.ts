import {
  Activity,
  BarChart3,
  Bell,
  Bot,
  CalendarClock,
  CalendarDays,
  Coins,
  Gift,
  Globe2,
  Heart,
  History,
  Home,
  Inbox,
  LayoutDashboard,
  LayoutGrid,
  LayoutPanelTop,
  Lightbulb,
  Lock,
  MessageSquareQuote,
  MessagesSquare,
  Music,
  PanelsTopLeft,
  Plug,
  Radio,
  Repeat,
  ScrollText,
  Server,
  Settings,
  Shield,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Star,
  Terminal,
  ThumbsUp,
  Ticket,
  TrendingUp,
  UserCog,
  Users,
  Volume2,
  Webhook,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  id: string;
  label: string;
  /** Path relative to /dashboard/server/:guildId ("" is the server home). */
  path: string;
  icon: LucideIcon;
  keywords?: string;
  /** Backend module id from GET /guilds/:id/modules, for status dots. */
  moduleId?: string;
  /** Config key that represents "enabled" when there is no module id. */
  enabledKey?: string;
  /** Matches `${guildId}:config:${issueId}` alerts from /notifications. */
  issueId?: string;
  /** Set when the INFERA backend has no API for this feature. */
  unsupported?: boolean;
}

export interface NavGroup {
  id: string;
  title: string;
  items: NavItem[];
}

export const SERVER_NAV: NavGroup[] = [
  {
    id: "overview",
    title: "Overview",
    items: [
      { id: "home", label: "Server Home", path: "", icon: Home, keywords: "dashboard overview summary" },
      { id: "modules", label: "Modules", path: "modules", icon: LayoutGrid, keywords: "features enable disable catalogue" },
      { id: "activity", label: "Activity", path: "activity", icon: Activity, keywords: "live events feed recent" },
    ],
  },
  {
    id: "engagement",
    title: "Engagement",
    items: [
      { id: "welcome", label: "Welcome", path: "welcome", icon: Heart, moduleId: "welcome", issueId: "welcome", keywords: "goodbye join leave greeting autoroles" },
      { id: "leveling", label: "Leveling", path: "leveling", icon: TrendingUp, moduleId: "leveling", keywords: "xp rank leaderboard rewards" },
      { id: "economy", label: "Economy", path: "economy", icon: Coins, moduleId: "economy", keywords: "currency shop coins balance" },
      { id: "giveaways", label: "Giveaways", path: "giveaways", icon: Gift, moduleId: "giveaways", keywords: "prize winners reroll" },
      { id: "suggestions", label: "Suggestions", path: "suggestions", icon: Lightbulb, moduleId: "suggestions", issueId: "suggestions", keywords: "ideas feedback approve" },
      { id: "reputation", label: "Reputation", path: "reputation", icon: ThumbsUp, unsupported: true, keywords: "rep karma" },
      { id: "confessions", label: "Confessions", path: "confessions", icon: MessageSquareQuote, enabledKey: "confessions.enabled", keywords: "anonymous" },
    ],
  },
  {
    id: "moderation",
    title: "Moderation",
    items: [
      { id: "moderation", label: "Moderation", path: "moderation", icon: Shield, moduleId: "moderation", keywords: "ban kick timeout warn cases appeals" },
      { id: "automod", label: "AutoMod", path: "automod", icon: ShieldAlert, moduleId: "automod", keywords: "spam links invites caps filter" },
      { id: "security", label: "Security", path: "security", icon: Lock, enabledKey: "security.antinuke.enabled", keywords: "antinuke antiraid lockdown whitelist" },
      { id: "verification", label: "Verification", path: "verification", icon: ShieldCheck, enabledKey: "security.verification_enabled", keywords: "verify gate role" },
      { id: "logging", label: "Logs", path: "logging", icon: ScrollText, moduleId: "logging", issueId: "logging", keywords: "logging events audit channel" },
    ],
  },
  {
    id: "tickets",
    title: "Tickets",
    items: [
      { id: "tickets-inbox", label: "Inbox", path: "tickets", icon: Inbox, moduleId: "tickets", issueId: "tickets", keywords: "support tickets claim close" },
      { id: "tickets-panels", label: "Ticket Panels", path: "tickets/panels", icon: PanelsTopLeft, keywords: "ticket panel button publish" },
      { id: "tickets-config", label: "Ticket Configuration", path: "tickets/settings", icon: SlidersHorizontal, keywords: "ticket category transcript staff" },
    ],
  },
  {
    id: "community",
    title: "Community",
    items: [
      { id: "identity", label: "Server Identity", path: "identity", icon: Globe2, keywords: "icon banner name description boost" },
      { id: "roles", label: "Roles", path: "roles", icon: Users, keywords: "autoroles reaction button select self roles panels" },
      { id: "social", label: "Social Feeds", path: "social", icon: Radio, moduleId: "social", keywords: "youtube twitch twitter reddit tiktok instagram" },
      { id: "starboard", label: "Starboard", path: "starboard", icon: Star, moduleId: "starboard", issueId: "starboard", keywords: "stars pin highlights" },
      { id: "announcements", label: "Announcements", path: "announcements", icon: Bell, keywords: "announce broadcast scheduled" },
      { id: "events", label: "Events", path: "events", icon: CalendarDays, unsupported: true, keywords: "scheduled events" },
    ],
  },
  {
    id: "tools",
    title: "Tools",
    items: [
      { id: "commands", label: "Commands", path: "commands", icon: Terminal, keywords: "slash prefix permissions cooldown" },
      { id: "custom-commands", label: "Custom Commands", path: "custom-commands", icon: Sparkles, keywords: "custom tags responses" },
      { id: "autoresponders", label: "Auto Responders", path: "autoresponders", icon: Repeat, keywords: "auto reply trigger" },
      { id: "schedules", label: "Schedules", path: "schedules", icon: CalendarClock, keywords: "scheduled messages timer" },
      { id: "voice", label: "Voice", path: "voice", icon: Volume2, moduleId: "voice", keywords: "temporary voice join to create" },
      { id: "music", label: "Music", path: "music", icon: Music, moduleId: "music", keywords: "player queue dj" },
    ],
  },
  {
    id: "analytics",
    title: "Analytics",
    items: [
      { id: "analytics", label: "Overview", path: "analytics", icon: BarChart3, keywords: "stats charts" },
      { id: "analytics-members", label: "Members", path: "analytics/members", icon: Users, keywords: "joins leaves growth" },
      { id: "analytics-messages", label: "Messages", path: "analytics/messages", icon: MessagesSquare, keywords: "message activity" },
      { id: "analytics-commands", label: "Commands", path: "analytics/commands", icon: Terminal, keywords: "command usage" },
      { id: "analytics-moderation", label: "Moderation", path: "analytics/moderation", icon: Shield, keywords: "moderation automod activity" },
      { id: "analytics-modules", label: "Module Statistics", path: "analytics/modules", icon: LayoutPanelTop, keywords: "modules tickets economy voice" },
    ],
  },
  {
    id: "settings",
    title: "Settings",
    items: [
      { id: "config", label: "General", path: "config", icon: SlidersHorizontal, keywords: "prefix language timezone color" },
      { id: "permissions", label: "Permissions", path: "permissions", icon: UserCog, keywords: "admin moderator roles levels overrides" },
      { id: "integrations", label: "Integrations", path: "integrations", icon: Plug, keywords: "roblox discord oauth providers" },
      { id: "webhooks", label: "Webhooks", path: "webhooks", icon: Webhook, keywords: "outgoing webhook events signing" },
      { id: "audit", label: "Audit Log", path: "audit", icon: History, keywords: "history changes who" },
    ],
  },
];

export const ACCOUNT_NAV: NavGroup[] = [
  {
    id: "account",
    title: "Account",
    items: [
      { id: "account-home", label: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
      { id: "servers", label: "Servers", path: "/dashboard/servers", icon: Server },
      { id: "bots", label: "Bot", path: "/dashboard/bots", icon: Bot },
      { id: "notifications", label: "Notifications", path: "/dashboard/notifications", icon: Bell },
      { id: "status", label: "Service Status", path: "/dashboard/status", icon: Activity },
      { id: "settings", label: "Account Settings", path: "/dashboard/settings", icon: Settings },
    ],
  },
];

export const ALL_SERVER_ITEMS = SERVER_NAV.flatMap((group) => group.items.map((item) => ({ ...item, group: group.title })));

export function serverPath(guildId: string, path: string): string {
  return path ? `/dashboard/server/${guildId}/${path}` : `/dashboard/server/${guildId}`;
}

export function guildIdFromPath(pathname: string): string | null {
  return /\/dashboard\/server\/(\d{17,20})/.exec(pathname)?.[1] ?? null;
}

/** Breadcrumb label for the trailing route segment(s). */
export function labelForPath(relative: string): string | null {
  const item = ALL_SERVER_ITEMS.find((entry) => entry.path === relative);
  if (item) return item.group === "Analytics" && item.path !== "analytics" ? `Analytics · ${item.label}` : item.label;
  return null;
}

export const DOCS_URL = "https://infera.wtf/docs";
export const SUPPORT_URL = "https://infera.wtf/support";

