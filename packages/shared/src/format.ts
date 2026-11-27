/** Number formatting with thousands separators. */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(Math.round(value));
}

export function formatCompact(value: number): string {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(
    value,
  );
}

export function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 1))}…`;
}

export function escapeMarkdown(value: string): string {
  return value.replace(/([*_`~\\|>])/g, "\\$1");
}

/** A simple unicode progress bar. */
export function progressBar(current: number, total: number, size = 12): string {
  if (total <= 0) return "░".repeat(size);
  const ratio = Math.min(1, Math.max(0, current / total));
  const filled = Math.round(ratio * size);
  return `${"█".repeat(filled)}${"░".repeat(size - filled)}`;
}

export function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function ordinal(value: number): string {
  const mod100 = value % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${value}th`;
  switch (value % 10) {
    case 1:
      return `${value}st`;
    case 2:
      return `${value}nd`;
    case 3:
      return `${value}rd`;
    default:
      return `${value}th`;
  }
}

/** Format a bigint Discord permission bitfield as readable flag names. */
export function formatPermissionBits(bits: bigint, names: Record<string, bigint>): string[] {
  return Object.entries(names)
    .filter(([, flag]) => (bits & flag) === flag)
    .map(([name]) => name);
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (size <= 0) throw new Error("chunk size must be positive");
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function pick<T>(items: readonly T[]): T {
  if (items.length === 0) throw new Error("cannot pick from an empty array");
  return items[Math.floor(Math.random() * items.length)] as T;
}
