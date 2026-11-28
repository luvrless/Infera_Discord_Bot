/**
 * Ticket system v2: shared shapes, defaults and the Discord message builder
 * for ticket panels. Used by the API (publish), the bot (interactions) and
 * mirrored by the dashboard preview so all three agree.
 */

export type TicketPanelStyle = "default" | "select" | "form";
export type TicketButtonStyle = "primary" | "secondary" | "success" | "danger";
export type TicketQuestionType = "short" | "paragraph" | "select" | "multi";
export type TicketPriority = "low" | "normal" | "high" | "urgent";

export interface TicketQuestion {
  id: string;
  label: string;
  type: TicketQuestionType;
  description: string;
  placeholder: string;
  required: boolean;
  min: number;
  max: number;
  options: string[];
}

export interface TicketEmbed {
  title: string;
  description: string;
  color: string;
}

export interface TicketCategorySettings {
  buttonLabel: string;
  buttonStyle: TicketButtonStyle;
  /** Channel name template: {number} {user} {username} {category} */
  channelName: string;
  /** Discord category the ticket channel is created in (falls back to the global setting). */
  parentId: string | null;
  /** Can view and reply in tickets. */
  supportRoles: string[];
  /** Can view tickets only. */
  viewRoles: string[];
  claimRoles: string[];
  closeRoles: string[];
  openingMessage: string;
  openingEmbed: TicketEmbed;
  questions: TicketQuestion[];
  maxOpenPerUser: number;
  cooldownSeconds: number;
  allowAttachments: boolean;
  /** Ping the support roles when a ticket opens. */
  pingStaff: boolean;
  transcripts: boolean;
  transcriptChannelId: string | null;
  claimEnabled: boolean;
  ownerCanClose: boolean;
  priority: TicketPriority;
}

export interface TicketPanelField {
  name: string;
  value: string;
  inline: boolean;
}

export interface TicketPanelConfig {
  embed: {
    title: string;
    description: string;
    color: string;
    thumbnail: string;
    image: string;
    footerText: string;
    footerIcon: string;
    authorName: string;
    authorIcon: string;
    fields: TicketPanelField[];
  };
  selectPlaceholder: string;
  /** Ordered ticket category ids shown on this panel. */
  categoryIds: string[];
  /** Formulary style: the single "create ticket" button. */
  button: { label: string; emoji: string; style: TicketButtonStyle };
  /** Formulary style: the form shown when the button is pressed. */
  form: { title: string; topicLabel: string; questions: TicketQuestion[] };
}

export const MAX_FORM_QUESTIONS = 5;

/** Used by the Formulary style when an option has no questions of its own. */
export const DEFAULT_FORM_QUESTION: TicketQuestion = {
  id: "details",
  label: "How can we help?",
  type: "paragraph",
  description: "",
  placeholder: "Describe your request with as much detail as possible",
  required: true,
  min: 10,
  max: 2000,
  options: [],
};

const SNOWFLAKE = /^\d{17,20}$/;
const HEX = /^#[0-9a-fA-F]{6}$/;
const URL_RE = /^https?:\/\/\S+$/;

const text = (value: unknown, max: number, fallback = ""): string =>
  typeof value === "string" ? value.slice(0, max) : fallback;
const ids = (value: unknown): string[] =>
  Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === "string" && SNOWFLAKE.test(id)))].slice(0, 50) : [];
const int = (value: unknown, min: number, max: number, fallback: number): number => {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.round(number))) : fallback;
};
const bool = (value: unknown, fallback: boolean): boolean => (typeof value === "boolean" ? value : fallback);
const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback;
const color = (value: unknown, fallback: string): string => (typeof value === "string" && HEX.test(value) ? value : fallback);
const url = (value: unknown): string => (typeof value === "string" && URL_RE.test(value.trim()) ? value.trim().slice(0, 500) : "");

export function normalizeQuestion(raw: unknown, index: number): TicketQuestion {
  const value = (raw ?? {}) as Record<string, unknown>;
  const type = pick(value.type, ["short", "paragraph", "select", "multi"] as const, "short");
  const options = Array.isArray(value.options)
    ? value.options.filter((option): option is string => typeof option === "string" && option.trim().length > 0).map((option) => option.trim().slice(0, 100)).slice(0, 25)
    : [];
  const maxLimit = type === "paragraph" ? 4000 : 1000;
  return {
    id: typeof value.id === "string" && /^[a-z0-9_-]{1,40}$/i.test(value.id) ? value.id : `q${index + 1}`,
    label: text(value.label, 45, `Question ${index + 1}`) || `Question ${index + 1}`,
    type,
    description: text(value.description, 100),
    placeholder: text(value.placeholder, 100),
    required: bool(value.required, true),
    min: int(value.min, 0, maxLimit, 0),
    max: int(value.max, 1, maxLimit, maxLimit),
    options,
  };
}

export function normalizeCategorySettings(raw: unknown): TicketCategorySettings {
  const value = (raw ?? {}) as Record<string, unknown>;
  const embed = (value.openingEmbed ?? {}) as Record<string, unknown>;
  const questions = Array.isArray(value.questions) ? value.questions.slice(0, MAX_FORM_QUESTIONS).map(normalizeQuestion) : [];
  return {
    buttonLabel: text(value.buttonLabel, 80),
    buttonStyle: pick(value.buttonStyle, ["primary", "secondary", "success", "danger"] as const, "primary"),
    channelName: text(value.channelName, 90, "ticket-{number}") || "ticket-{number}",
    parentId: typeof value.parentId === "string" && SNOWFLAKE.test(value.parentId) ? value.parentId : null,
    supportRoles: ids(value.supportRoles),
    viewRoles: ids(value.viewRoles),
    claimRoles: ids(value.claimRoles),
    closeRoles: ids(value.closeRoles),
    openingMessage: text(value.openingMessage, 2000),
    openingEmbed: {
      title: text(embed.title, 256),
      description: text(embed.description, 4000, "Thanks for opening a ticket. A member of staff will be with you shortly."),
      color: color(embed.color, "#3B82F6"),
    },
    questions,
    maxOpenPerUser: int(value.maxOpenPerUser, 1, 25, 1),
    cooldownSeconds: int(value.cooldownSeconds, 0, 86_400, 0),
    allowAttachments: bool(value.allowAttachments, true),
    pingStaff: bool(value.pingStaff, false),
    transcripts: bool(value.transcripts, true),
    transcriptChannelId: typeof value.transcriptChannelId === "string" && SNOWFLAKE.test(value.transcriptChannelId) ? value.transcriptChannelId : null,
    claimEnabled: bool(value.claimEnabled, true),
    ownerCanClose: bool(value.ownerCanClose, true),
    priority: pick(value.priority, ["low", "normal", "high", "urgent"] as const, "normal"),
  };
}

export function normalizePanelConfig(raw: unknown, fallback: { title?: string; description?: string | null } = {}): TicketPanelConfig {
  const value = (raw ?? {}) as Record<string, unknown>;
  const embed = (value.embed ?? {}) as Record<string, unknown>;
  const button = (value.button ?? {}) as Record<string, unknown>;
  const form = (value.form ?? {}) as Record<string, unknown>;
  const fields = Array.isArray(embed.fields)
    ? embed.fields.slice(0, 10).map((field) => {
        const f = (field ?? {}) as Record<string, unknown>;
        return { name: text(f.name, 256), value: text(f.value, 1024), inline: bool(f.inline, false) };
      }).filter((field) => field.name && field.value)
    : [];
  return {
    embed: {
      title: text(embed.title, 256, fallback.title ?? "Support") || fallback.title || "Support",
      description: text(embed.description, 4000, fallback.description ?? "Select an option below to open a ticket."),
      color: color(embed.color, "#3B82F6"),
      thumbnail: url(embed.thumbnail),
      image: url(embed.image),
      footerText: text(embed.footerText, 2048),
      footerIcon: url(embed.footerIcon),
      authorName: text(embed.authorName, 256),
      authorIcon: url(embed.authorIcon),
      fields,
    },
    selectPlaceholder: text(value.selectPlaceholder, 150, "Select an option to get help") || "Select an option to get help",
    categoryIds: Array.isArray(value.categoryIds) ? value.categoryIds.filter((id): id is string => typeof id === "string").slice(0, 25) : [],
    button: {
      label: text(button.label, 80, "Create ticket") || "Create ticket",
      emoji: text(button.emoji, 64, "🎫"),
      style: pick(button.style, ["primary", "secondary", "success", "danger"] as const, "primary"),
    },
    form: {
      title: text(form.title, 45, "Create a ticket") || "Create a ticket",
      topicLabel: text(form.topicLabel, 45, "What do you need help with?") || "What do you need help with?",
      questions: Array.isArray(form.questions) ? form.questions.slice(0, MAX_FORM_QUESTIONS).map(normalizeQuestion) : [],
    },
  };
}

export interface PanelCategory {
  id: string;
  name: string;
  description: string | null;
  emoji: string | null;
  settings: TicketCategorySettings;
}

const BUTTON_STYLE: Record<TicketButtonStyle, number> = { primary: 1, secondary: 2, success: 3, danger: 4 };

/** Parse "🎫", "<:name:id>" or "<a:name:id>" into a Discord emoji object. */
export function parseEmoji(value: string | null | undefined): { id?: string; name?: string; animated?: boolean } | undefined {
  const raw = (value ?? "").trim();
  if (!raw) return undefined;
  const custom = /^<(a?):([\w~]{2,32}):(\d{17,20})>$/.exec(raw);
  if (custom) return { id: custom[3], name: custom[2], animated: custom[1] === "a" };
  return { name: raw.slice(0, 32) };
}

const hexToInt = (value: string): number => Number.parseInt(value.slice(1), 16);

/** Discord message payload (embeds + components) for a ticket panel. */
export function buildPanelMessage(
  panel: { id: string; style: string },
  config: TicketPanelConfig,
  categories: PanelCategory[],
): { embeds: Record<string, unknown>[]; components: Record<string, unknown>[] } {
  const e = config.embed;
  const embed: Record<string, unknown> = {
    title: e.title || undefined,
    description: e.description || undefined,
    color: hexToInt(e.color),
  };
  if (e.thumbnail) embed.thumbnail = { url: e.thumbnail };
  if (e.image) embed.image = { url: e.image };
  if (e.footerText) embed.footer = { text: e.footerText, ...(e.footerIcon ? { icon_url: e.footerIcon } : {}) };
  if (e.authorName) embed.author = { name: e.authorName, ...(e.authorIcon ? { icon_url: e.authorIcon } : {}) };
  if (e.fields.length) embed.fields = e.fields;

  const ordered = config.categoryIds.length
    ? config.categoryIds.map((id) => categories.find((category) => category.id === id)).filter((c): c is PanelCategory => Boolean(c))
    : categories;

  let components: Record<string, unknown>[];
  if (panel.style === "form") {
    // Formulary: one button that opens a form (topic dropdown + questions).
    const emoji = parseEmoji(config.button.emoji);
    components = [
      {
        type: 1,
        components: [{ type: 2, style: BUTTON_STYLE[config.button.style], label: config.button.label, custom_id: `tkt:pf:${panel.id}`, ...(emoji ? { emoji } : {}) }],
      },
    ];
  } else if (ordered.length === 0) {
    // Panels without options keep the original single button.
    components = [{ type: 1, components: [{ type: 2, style: 1, label: "Open ticket", custom_id: `ticket:open:${panel.id}` }] }];
  } else if (panel.style === "select") {
    components = [
      {
        type: 1,
        components: [
          {
            type: 3,
            custom_id: `tkt:s:${panel.id}`,
            placeholder: config.selectPlaceholder,
            min_values: 1,
            max_values: 1,
            options: ordered.slice(0, 25).map((category) => ({
              label: category.name.slice(0, 100),
              value: category.id,
              ...(category.description ? { description: category.description.slice(0, 100) } : {}),
              ...(parseEmoji(category.emoji) ? { emoji: parseEmoji(category.emoji) } : {}),
            })),
          },
        ],
      },
    ];
  } else {
    // Default: one button per option; pressing it opens the ticket right away.
    const buttons = ordered.slice(0, 25).map((category) => ({
      type: 2,
      style: BUTTON_STYLE[category.settings.buttonStyle],
      label: (category.settings.buttonLabel || category.name).slice(0, 80),
      custom_id: `tkt:d:${category.id}`,
      ...(parseEmoji(category.emoji) ? { emoji: parseEmoji(category.emoji) } : {}),
    }));
    components = [];
    for (let i = 0; i < buttons.length; i += 5) components.push({ type: 1, components: buttons.slice(i, i + 5) });
  }
  return { embeds: [embed], components };
}

/** Fill a channel-name template and make it a valid Discord channel name. */
export function ticketChannelName(template: string, vars: { number: number; userId: string; username: string; category: string }): string {
  const name = template
    .replaceAll("{number}", String(vars.number).padStart(4, "0"))
    .replaceAll("{user}", vars.username)
    .replaceAll("{username}", vars.username)
    .replaceAll("{userid}", vars.userId)
    .replaceAll("{category}", vars.category)
    .toLowerCase()
    .replace(/[^a-z0-9\-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return (name || `ticket-${vars.number}`).slice(0, 100);
}
