import { DiscordPermissions, isPlatformOwner } from "@infera/shared";
import type { ServiceContainer } from "@infera/services";
import type { GuildMember } from "discord.js";

export type PermissionInput = Parameters<ServiceContainer["permissions"]["resolveLevel"]>[1];

/** Shape a discord.js member into the permission service's input contract. */
export function toPermissionInput(member: GuildMember): PermissionInput {
  return {
    userId: member.id,
    roleIds: [...member.roles.cache.keys()],
    isGuildOwner: member.id === member.guild.ownerId,
    hasAdministrator: member.permissions.has(DiscordPermissions.Administrator),
    isPlatformOwner: isPlatformOwner(member.id),
  };
}
