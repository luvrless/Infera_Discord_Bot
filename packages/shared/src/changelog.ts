/**
 * Release notes. Add a new entry at the TOP for every bot/dashboard update.
 * Set `major: true` only for big updates; only those are announced.
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
  /**
   * Only major releases are announced (dashboard notification + owner DM).
   * Small fixes and tweaks ship silently.
   */
  major?: boolean;
}

export const RELEASES: ReleaseNote[] = [
  {
    version: "2026.11.28-4",
    major: false,
    date: "2026-11-28",
    title: "Ticket polish",
    summary: "Formulary panels always ask before opening, richer ticket info embeds and cleaner ticket messages.",
    fixes: ["Formulary buttons always open a form.", "Ticket channels show the member's account age, join date and form answers."],
  },
  {
    version: "2026.11.28-3",
    major: true,
    date: "2026-11-28",
    title: "The new ticket system",
    summary: "Tickets were rebuilt: three panel styles, ticket options with their own forms and staff roles, and much better ticket management. Existing panels and tickets keep working.",
    features: [
      "Three panel styles: buttons, a select menu, or forms that open before the ticket.",
      "Panel builder with live preview: title, description, colour, author, thumbnail, image, footer and fields.",
      "Ticket options: each with its own emoji, description, form (up to 5 questions incl. dropdowns), staff roles, limits and messages.",
      "Claim/unclaim, close with reasons, reopen, delete, move between options, priorities and private staff notes.",
      "HTML transcripts, a ticket log channel and auto-closing of inactive tickets.",
    ],
    fixes: ["Ticket transcripts now work with any ticket channel name."],
    system: ["Your existing ticket settings and panels were not changed."],
    downtime: "The bot restarts once for about a minute while this update is installed.",
  },
  {
    version: "2026.11.28-2",
    major: false,
    date: "2026-11-28",
    title: "Boost notifications and a cleaner dashboard",
    summary: "Thank your boosters automatically, plus a tidier dashboard sidebar. Your existing settings were not changed.",
    features: [
      "Boost notifications: announce every server boost with a custom message or embed (Welcome & Goodbye page).",
      "New placeholders: {server.boost.count}, {server.name} and {user.id}.",
    ],
    fixes: ["Tickets and Analytics now have tabs inside the page instead of extra sidebar entries."],
    system: ["Anti-nuke and anti-raid stay off for new servers until you enable them. Existing servers keep their settings."],
    downtime: "The bot restarts once for about a minute while this update is installed.",
  },
  {
    version: "2026.11.28",
    major: true,
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

/** Newest release that should be announced to server owners. */
export const LATEST_RELEASE: ReleaseNote | undefined = RELEASES.find((release) => release.major);
