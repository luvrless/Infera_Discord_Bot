const UNIT_MS: Record<string, number> = {
  ms: 1,
  s: 1_000,
  sec: 1_000,
  secs: 1_000,
  second: 1_000,
  seconds: 1_000,
  m: 60_000,
  min: 60_000,
  mins: 60_000,
  minute: 60_000,
  minutes: 60_000,
  h: 3_600_000,
  hr: 3_600_000,
  hrs: 3_600_000,
  hour: 3_600_000,
  hours: 3_600_000,
  d: 86_400_000,
  day: 86_400_000,
  days: 86_400_000,
  w: 604_800_000,
  week: 604_800_000,
  weeks: 604_800_000,
  mo: 2_592_000_000,
  month: 2_592_000_000,
  months: 2_592_000_000,
  y: 31_536_000_000,
  year: 31_536_000_000,
  years: 31_536_000_000,
};

/**
 * Parse a human duration such as `1d2h30m`, `10 minutes` or `2w`.
 * Returns null when the input cannot be understood.
 */
export function parseDuration(input: string): number | null {
  const raw = input.trim().toLowerCase();
  if (!raw) return null;

  if (/^\d+$/.test(raw)) return Number(raw) * 1_000;

  const compact = raw.replace(/\s+/g, "");
  const pattern = /(\d+(?:\.\d+)?)([a-z]+)/g;
  let total = 0;
  let matched = false;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(compact)) !== null) {
    if (match.index !== lastIndex) return null;
    lastIndex = pattern.lastIndex;
    matched = true;
    const amount = Number(match[1]);
    const unit = match[2] ?? "";
    const multiplier = UNIT_MS[unit];
    if (!multiplier) return null;
    total += amount * multiplier;
  }

  if (!matched || lastIndex !== compact.length) return null;
  return Math.round(total);
}

/** Format milliseconds as a compact human duration, e.g. `1d 2h 30m`. */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "0s";
  const units: Array<[string, number]> = [
    ["y", 31_536_000_000],
    ["mo", 2_592_000_000],
    ["w", 604_800_000],
    ["d", 86_400_000],
    ["h", 3_600_000],
    ["m", 60_000],
    ["s", 1_000],
  ];
  let remaining = Math.floor(ms);
  const parts: string[] = [];
  for (const [label, size] of units) {
    if (remaining >= size) {
      const count = Math.floor(remaining / size);
      remaining -= count * size;
      parts.push(`${count}${label}`);
      if (parts.length === 3) break;
    }
  }
  return parts.length ? parts.join(" ") : "0s";
}

/** Discord relative timestamp, e.g. `<t:1700000000:R>`. */
export function discordTimestamp(date: Date | number, style: "t" | "T" | "d" | "D" | "f" | "F" | "R" = "R"): string {
  const seconds = Math.floor((typeof date === "number" ? date : date.getTime()) / 1_000);
  return `<t:${seconds}:${style}>`;
}
