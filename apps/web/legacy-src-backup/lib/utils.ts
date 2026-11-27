export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export function guildIconUrl(guildId: string, icon: string | null | undefined, size = 64): string {
  if (icon) return `https://cdn.discordapp.com/icons/${guildId}/${icon}.${icon.startsWith("a_") ? "gif" : "png"}?size=${size}`;
  return `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(guildId) >> 22n) % 5}.png`;
}

export function userAvatarUrl(userId: string, avatar: string | null | undefined, size = 64): string {
  if (avatar) return `https://cdn.discordapp.com/avatars/${userId}/${avatar}.${avatar.startsWith("a_") ? "gif" : "png"}?size=${size}`;
  return `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(userId) >> 22n) % 6}.png`;
}

export function installUrl(clientId: string): string {
  return `https://discord.com/oauth2/authorize?client_id=${clientId}&permissions=8&scope=bot%20applications.commands`;
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function relativeTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const abs = Math.abs(seconds);
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 31_536_000],
    ["month", 2_592_000],
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
    ["second", 1],
  ];
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  for (const [unit, size] of units) {
    if (abs >= size || unit === "second") return formatter.format(Math.round(seconds / size), unit);
  }
  return formatter.format(seconds, "second");
}

export function compactNumber(value: number): string {
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

export function permissionLevelName(level: number): string {
  switch (level) {
    case 5:
      return "Platform Owner";
    case 4:
      return "Server Owner";
    case 3:
      return "Administrator";
    case 2:
      return "Moderator";
    case 1:
      return "Trusted";
    default:
      return "Member";
  }
}

export function copyText(text: string): Promise<void> {
  return navigator.clipboard.writeText(text);
}
