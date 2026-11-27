/**
 * Release notes. Add a new entry at the TOP for every bot/dashboard update.
 *
 * When the bot starts, it publishes the newest entry as a platform
 * notification (once per `version`) and DMs it to every server owner who has
 * update DMs enabled. Notifications always appear on infera.wtf/dashboard/notifications.
 */
export interface ReleaseNote {
  /** Unique, never reused. One notification is created per version. */
  version: string;
  /** ISO date of the release. */
  date: string;
  title: string;
  summary: string;
  features?: string[];
  fixes?: string[];
  system?: string[];
  /** Planned or actual downtime, if any. */
  downtime?: string;
}

export const RELEASES: ReleaseNote[] = [
  {
    version: "2026.11.28",
    date: "2026-11-28",
    title: "Smoother dashboard, easier leveling and update notifications",
    summary: "A big stability update for the dashboard and bot. Your server settings were kept exactly as they were.",
    features: [
      "Leveling is easier: about 50 messages per level by default.",
      "Level-up announcements now use a card like the rank card.",
      "Announcements can be sent as a normal message or a Discord embed.",
      "Suggestions show the author's avatar and a mention.",
      "Update notifications: server owners get release notes by DM (can be turned off on the dashboard).",
    ],
    fixes: [
      "Settings now always save the exact value you entered and apply to the bot immediately.",
      "Number fields can be cleared and retyped (no more stuck 0).",
      "Dashboard no longer freezes when switching tabs or typing long texts.",
      "Dropdown menus always appear above other content.",
      "Server icons and member counts display correctly.",
    ],
    system: [
      "Dashboard sessions stay active while you use them.",
      "Faster page loads and instant tab switching.",
    ],
  },
];

export const LATEST_RELEASE: ReleaseNote | undefined = RELEASES[0];
