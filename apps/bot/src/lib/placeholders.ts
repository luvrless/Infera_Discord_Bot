import type { Guild, GuildMember } from "discord.js";

/** The minimum member shape placeholders need. */
export type PlaceholderMember = Pick<GuildMember, "id" | "user"> & {
  joinedAt?: Date | null;
  guild: Pick<Guild, "name" | "memberCount"> & { iconURL?: Guild["iconURL"] };
};

/**
 * Placeholders supported by welcome/goodbye messages.
 *
 * The dashboard contract (GET /v1/guilds/:id/welcome) advertises the
 * snake_case names; the dotted/camelCase names are kept for messages written
 * before the dashboard existed. Both resolve to the same values.
 */
export const WELCOME_PLACEHOLDERS = [
  "{user}",
  "{username}",
  "{user_id}",
  "{server}",
  "{server_name}",
  "{member_count}",
  "{server_icon}",
  "{created_at}",
  "{joined_at}",
] as const;

export function applyPlaceholders(template: string, member: PlaceholderMember): string {
  const created = member.user.createdAt ? member.user.createdAt.toISOString().slice(0, 10) : "";
  const joined = member.joinedAt ? member.joinedAt.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
  const icon = member.guild.iconURL?.({ size: 256 }) ?? "";
  const replacements: Record<string, string> = {
    "{user}": `<@${member.id}>`,
    "{username}": member.user.username,
    "{user_id}": member.id,
    "{server}": member.guild.name,
    "{server_name}": member.guild.name,
    "{member_count}": String(member.guild.memberCount),
    "{server_icon}": icon,
    "{created_at}": created,
    "{joined_at}": joined,
    // Legacy names.
    "{user.name}": member.user.username,
    "{user.tag}": member.user.tag,
    "{user.id}": member.id,
    "{memberCount}": String(member.guild.memberCount),
  };

  let output = template;
  for (const [token, value] of Object.entries(replacements)) {
    output = output.split(token).join(value);
  }
  return output;
}
