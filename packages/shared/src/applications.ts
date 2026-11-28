/**
 * Applications: standalone application forms (staff, partnership, whitelist...).
 * Shared by the API, the bot and mirrored by the dashboard.
 */

export type AppQuestionType = "short" | "long" | "choice" | "dropdown" | "checkboxes" | "yesno" | "number" | "date" | "user";
export type ApplicationStatus = "pending" | "reviewing" | "approved" | "rejected" | "info_required";

export const APPLICATION_STATUSES: ApplicationStatus[] = ["pending", "reviewing", "approved", "rejected", "info_required"];
export const APPLICATION_STATUS_LABEL: Record<ApplicationStatus, string> = {
  pending: "Pending",
  reviewing: "Under review",
  approved: "Approved",
  rejected: "Rejected",
  info_required: "More info needed",
};
export const APPLICATION_STATUS_COLOR: Record<ApplicationStatus, number> = {
  pending: 0x3b82f6,
  reviewing: 0xa855f7,
  approved: 0x22c55e,
  rejected: 0xef4444,
  info_required: 0xf59e0b,
};

export interface AppQuestion {
  id: string;
  label: string;
  type: AppQuestionType;
  description: string;
  placeholder: string;
  required: boolean;
  /** Characters for text, value for numbers. */
  min: number;
  max: number;
  options: string[];
  /** Optional regular expression the answer must match (text types). */
  pattern: string;
  patternMessage: string;
}

export interface ApplicationSettings {
  questions: AppQuestion[];
  color: string;
  /** Hours before the same member can apply again after a decision. 0 = no cooldown. */
  cooldownHours: number;
  /** Total applications one member may send to this form. 0 = unlimited. */
  maxPerUser: number;
  /** Total submissions accepted for this form. 0 = unlimited. */
  maxSubmissions: number;
  opensAt: string | null;
  closesAt: string | null;
  reviewChannelId: string | null;
  announceChannelId: string | null;
  notifyRoles: string[];
  reviewerRoles: string[];
  approvedRoles: string[];
  dmApplicant: boolean;
  submittedMessage: string;
  approvedMessage: string;
  rejectedMessage: string;
  announceMessage: string;
}

export const MAX_APPLICATION_QUESTIONS = 25;
export const QUESTIONS_PER_PAGE = 5;

const SNOWFLAKE = /^\d{17,20}$/;
const HEX = /^#[0-9a-fA-F]{6}$/;
const text = (value: unknown, max: number, fallback = ""): string => (typeof value === "string" ? value.slice(0, max) : fallback);
const ids = (value: unknown): string[] =>
  Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === "string" && SNOWFLAKE.test(id)))].slice(0, 25) : [];
const int = (value: unknown, min: number, max: number, fallback: number): number => {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.round(number))) : fallback;
};
const bool = (value: unknown, fallback: boolean): boolean => (typeof value === "boolean" ? value : fallback);
const snowflake = (value: unknown): string | null => (typeof value === "string" && SNOWFLAKE.test(value) ? value : null);
const isoDate = (value: unknown): string | null => {
  if (typeof value !== "string" || !value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};
const TYPES: AppQuestionType[] = ["short", "long", "choice", "dropdown", "checkboxes", "yesno", "number", "date", "user"];

export function normalizeAppQuestion(raw: unknown, index: number): AppQuestion {
  const value = (raw ?? {}) as Record<string, unknown>;
  const type = TYPES.includes(value.type as AppQuestionType) ? (value.type as AppQuestionType) : "short";
  const textLimit = type === "long" ? 4000 : 1000;
  const options = Array.isArray(value.options)
    ? value.options.filter((option): option is string => typeof option === "string" && option.trim().length > 0).map((option) => option.trim().slice(0, 100)).slice(0, 25)
    : [];
  let pattern = text(value.pattern, 200);
  try {
    if (pattern) new RegExp(pattern);
  } catch {
    pattern = "";
  }
  return {
    id: typeof value.id === "string" && /^[a-z0-9_-]{1,40}$/i.test(value.id) ? value.id : `q${index + 1}`,
    label: text(value.label, 45, `Question ${index + 1}`) || `Question ${index + 1}`,
    type,
    description: text(value.description, 100),
    placeholder: text(value.placeholder, 100),
    required: bool(value.required, true),
    min: type === "number" ? int(value.min, -1e9, 1e9, 0) : int(value.min, 0, textLimit, 0),
    max: type === "number" ? int(value.max, -1e9, 1e9, 1_000_000) : int(value.max, 1, textLimit, textLimit),
    options: type === "yesno" ? ["Yes", "No"] : options,
    pattern,
    patternMessage: text(value.patternMessage, 100),
  };
}

export function normalizeApplicationSettings(raw: unknown): ApplicationSettings {
  const value = (raw ?? {}) as Record<string, unknown>;
  const questions = Array.isArray(value.questions) ? value.questions.slice(0, MAX_APPLICATION_QUESTIONS).map(normalizeAppQuestion) : [];
  // Question ids must be unique for answers to map back.
  const seen = new Set<string>();
  for (const [index, question] of questions.entries()) {
    if (seen.has(question.id)) question.id = `q${index + 1}_${Math.random().toString(36).slice(2, 6)}`;
    seen.add(question.id);
  }
  return {
    questions,
    color: typeof value.color === "string" && HEX.test(value.color) ? value.color : "#3B82F6",
    cooldownHours: int(value.cooldownHours, 0, 8760, 0),
    maxPerUser: int(value.maxPerUser, 0, 100, 0),
    maxSubmissions: int(value.maxSubmissions, 0, 100_000, 0),
    opensAt: isoDate(value.opensAt),
    closesAt: isoDate(value.closesAt),
    reviewChannelId: snowflake(value.reviewChannelId),
    announceChannelId: snowflake(value.announceChannelId),
    notifyRoles: ids(value.notifyRoles),
    reviewerRoles: ids(value.reviewerRoles),
    approvedRoles: ids(value.approvedRoles),
    dmApplicant: bool(value.dmApplicant, true),
    submittedMessage: text(value.submittedMessage, 1000, "Thanks for applying! We'll let you know once your application has been reviewed."),
    approvedMessage: text(value.approvedMessage, 1000, "Congratulations, your application was approved! 🎉"),
    rejectedMessage: text(value.rejectedMessage, 1000, "Thanks for applying. Unfortunately your application wasn't accepted this time."),
    announceMessage: text(value.announceMessage, 1000, "Welcome {user}, your **{application}** application was approved! 🎉"),
  };
}

/** Split questions into Discord form pages (5 per form). */
export function applicationPages(questions: AppQuestion[]): AppQuestion[][] {
  const pages: AppQuestion[][] = [];
  for (let i = 0; i < questions.length; i += QUESTIONS_PER_PAGE) pages.push(questions.slice(i, i + QUESTIONS_PER_PAGE));
  return pages.length ? pages : [[]];
}

/** Validate one answer. Returns an error message, or null when it's valid. */
export function validateAppAnswer(question: AppQuestion, answer: string): string | null {
  const value = answer.trim();
  if (!value) return question.required ? `“${question.label}” is required.` : null;
  if (question.type === "number") {
    const number = Number(value.replace(",", "."));
    if (!Number.isFinite(number)) return `“${question.label}” must be a number.`;
    if (number < question.min || number > question.max) return `“${question.label}” must be between ${question.min} and ${question.max}.`;
    return null;
  }
  if (question.type === "date") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(new Date(`${value}T00:00:00Z`).getTime())) return `“${question.label}” must be a date like 2026-01-31.`;
    return null;
  }
  if (question.type === "short" || question.type === "long") {
    if (value.length < question.min) return `“${question.label}” needs at least ${question.min} characters.`;
    if (question.pattern) {
      try {
        if (!new RegExp(question.pattern).test(value)) return question.patternMessage || `“${question.label}” isn't in the expected format.`;
      } catch {
        return null;
      }
    }
  }
  return null;
}
