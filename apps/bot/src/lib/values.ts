/** Typed accessors over a guild configuration snapshot. */
export class Values {
  constructor(private readonly values: Record<string, unknown>) {}

  bool(key: string, fallback = false): boolean {
    const value = this.values[key];
    return typeof value === "boolean" ? value : fallback;
  }

  num(key: string, fallback = 0): number {
    const value = Number(this.values[key]);
    return Number.isFinite(value) ? value : fallback;
  }

  str(key: string, fallback = ""): string {
    const value = this.values[key];
    return typeof value === "string" ? value : fallback;
  }

  list(key: string): string[] {
    const value = this.values[key];
    return Array.isArray(value) ? (value as string[]) : [];
  }

  /** A Discord snowflake, or null when the key is unset or malformed. */
  id(key: string): string | null {
    const value = this.values[key];
    return typeof value === "string" && /^\d{17,20}$/.test(value) ? value : null;
  }

  all(): Record<string, unknown> {
    return this.values;
  }
}
