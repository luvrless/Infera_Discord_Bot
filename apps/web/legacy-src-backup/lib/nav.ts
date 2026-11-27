import {
  Activity,
  BarChart3,
  Bell,
  Coins,
  Gift,
  Globe2,
  History,
  Home,
  LayoutDashboard,
  Lightbulb,
  Lock,
  Package,
  Plug,
  Radio,
  ScrollText,
  Server,
  Settings,
  Shield,
  ShieldAlert,
  SlidersHorizontal,
  Terminal,
  Ticket,
  TrendingUp,
  Users,
  Zap,
  Heart,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  end?: boolean;
  keywords?: string;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

export function serverNav(guildId: string): NavGroup[] {
  const base = `/dashboard/server/${guildId}`;
  return [
    {
      title: "Overview",
      items: [
        { label: "Server Home", href: base, icon: Home, end: true, keywords: "dashboard overview" },
        { label: "Modules", href: `${base}/modules`, icon: Package, keywords: "features toggles" },
        { label: "Analytics", href: `${base}/analytics`, icon: BarChart3, keywords: "stats activity charts" },
      ],
    },
    {
      title: "Engagement",
      items: [
        { label: "Welcome", href: `${base}/welcome`, icon: Heart, keywords: "goodbye autoroles greetings" },
        { label: "Leveling", href: `${base}/leveling`, icon: TrendingUp, keywords: "xp ranks leaderboard rewards" },
        { label: "Economy", href: `${base}/economy`, icon: Coins, keywords: "currency shop items" },
        { label: "Giveaways", href: `${base}/giveaways`, icon: Gift, keywords: "prizes winners" },
        { label: "Suggestions", href: `${base}/suggestions`, icon: Lightbulb, keywords: "feedback approvals" },
      ],
    },
    {
      title: "Moderation",
      items: [
        { label: "Moderation", href: `${base}/moderation`, icon: Shield, keywords: "cases bans kicks warnings appeals" },
        { label: "AutoMod", href: `${base}/automod`, icon: ShieldAlert, keywords: "spam links invites caps" },
        { label: "Security", href: `${base}/security`, icon: Lock, keywords: "antinuke antiraid whitelist" },
        { label: "Logs", href: `${base}/logging`, icon: ScrollText, keywords: "logging events channels" },
      ],
    },
    {
      title: "Community",
      items: [
        { label: "Server Identity", href: `${base}/identity`, icon: Globe2, keywords: "icon banner description" },
        { label: "Roles", href: `${base}/roles`, icon: Users, keywords: "autoroles role panels" },
        { label: "Social Feeds", href: `${base}/social`, icon: Radio, keywords: "youtube twitch feeds" },
        { label: "Commands", href: `${base}/commands`, icon: Terminal, keywords: "prefix slash overrides" },
        { label: "Automation", href: `${base}/automation`, icon: Zap, keywords: "custom commands autoresponders auto replies" },
      ],
    },
    {
      title: "Tools",
      items: [
        { label: "Tickets", href: `${base}/tickets`, icon: Ticket, keywords: "support inbox panels" },
        { label: "Integrations", href: `${base}/integrations`, icon: Plug, keywords: "roblox webhooks social" },
      ],
    },
    {
      title: "Settings",
      items: [
        { label: "General", href: `${base}/config`, icon: SlidersHorizontal, keywords: "configuration prefix language" },
        { label: "Audit Log", href: `${base}/audit`, icon: History, keywords: "history changes" },
      ],
    },
  ];
}

export const accountNav: NavGroup[] = [
  {
    title: "Account",
    items: [
      { label: "Overview", href: "/dashboard", icon: LayoutDashboard, end: true },
      { label: "Servers", href: "/dashboard/servers", icon: Server },
      { label: "Notifications", href: "/dashboard/notifications", icon: Bell },
      { label: "Status", href: "/dashboard/status", icon: Activity },
      { label: "Settings", href: "/dashboard/settings", icon: Settings },
    ],
  },
];

export const pageLabels: Record<string, string> = {
  dashboard: "Dashboard",
  servers: "Servers",
  notifications: "Notifications",
  status: "Status",
  settings: "Settings",
  modules: "Modules",
  welcome: "Welcome",
  leveling: "Leveling",
  economy: "Economy",
  giveaways: "Giveaways",
  suggestions: "Suggestions",
  moderation: "Moderation",
  automod: "AutoMod",
  security: "Security",
  logging: "Logs",
  roles: "Roles",
  tickets: "Tickets",
  identity: "Server Identity",
  social: "Social Feeds",
  commands: "Commands",
  automation: "Automation",
  analytics: "Analytics",
  integrations: "Integrations",
  config: "General",
  audit: "Audit Log",
};

export function guildIdFromPath(pathname: string): string | null {
  const match = /\/dashboard\/server\/(\d{17,20})/.exec(pathname);
  return match?.[1] ?? null;
}
