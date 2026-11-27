import {
  ErrorCode,
  InferaError,
  PermissionLevel,
  isAtLeast,
} from "@infera/shared";
import type { GuildConfigService } from "./config-service";

export interface MemberPermissionInput {
  userId: string;
  roleIds: readonly string[];
  isGuildOwner: boolean;
  hasAdministrator: boolean;
  isPlatformOwner: boolean;
}

export interface CommandPermissionResult {
  allowed: boolean;
  level: PermissionLevel;
  required: PermissionLevel;
  reason?: "disabled" | "channel" | "level";
}

function clampLevel(value: number): PermissionLevel {
  const clamped = Math.max(PermissionLevel.Member, Math.min(PermissionLevel.PlatformOwner, Math.trunc(value)));
  return clamped as PermissionLevel;
}

function overrideLevel(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value === true) return PermissionLevel.Admin;
  if (value === false) return PermissionLevel.Member;
  return null;
}

/**
 * Resolves effective permission levels and evaluates command access.
 * Guild owners and platform owners always outrank configured roles.
 */
export class PermissionService {
  constructor(private readonly config: GuildConfigService) {}

  async resolveLevel(guildId: string, member: MemberPermissionInput): Promise<PermissionLevel> {
    if (member.isPlatformOwner) return PermissionLevel.PlatformOwner;
    if (member.isGuildOwner) return PermissionLevel.GuildOwner;

    const values = await this.config.getValues(guildId);
    const userOverrides = (values["permissions.user_overrides"] ?? {}) as Record<string, unknown>;
    const userOverride = overrideLevel(userOverrides[member.userId]);
    if (userOverride !== null) return clampLevel(userOverride);

    const roleSet = new Set(member.roleIds);
    const adminRoles = (values["permissions.admin_roles"] ?? []) as string[];
    const moderatorRoles = [
      ...((values["permissions.moderator_roles"] ?? []) as string[]),
      ...((values["moderation.staff_roles"] ?? []) as string[]),
    ];

    if (member.hasAdministrator || adminRoles.some((roleId) => roleSet.has(roleId))) {
      return PermissionLevel.Admin;
    }
    if (moderatorRoles.some((roleId) => roleSet.has(roleId))) {
      return PermissionLevel.Moderator;
    }

    const fallback = Number(values["permissions.default_level"] ?? 0);
    return clampLevel(Number.isFinite(fallback) ? fallback : 0);
  }

  async requireLevel(
    guildId: string,
    member: MemberPermissionInput,
    required: PermissionLevel,
  ): Promise<PermissionLevel> {
    const level = await this.resolveLevel(guildId, member);
    if (!isAtLeast(level, required)) {
      throw new InferaError("You do not have permission to do that", {
        code: ErrorCode.MISSING_PERMISSION,
        messageKey: "errors.permission_denied",
      });
    }
    return level;
  }

  async checkCommand(
    guildId: string,
    channelId: string | null,
    member: MemberPermissionInput,
    commandName: string,
    required: PermissionLevel,
  ): Promise<CommandPermissionResult> {
    const level = await this.resolveLevel(guildId, member);
    if (member.isPlatformOwner) {
      return { allowed: true, level, required };
    }

    const values = await this.config.getValues(guildId);
    const channelOverrides = (values["permissions.channel_overrides"] ?? {}) as Record<string, unknown>;
    if (channelId) {
      const channelOverride = channelOverrides[channelId];
      if (channelOverride === false) {
        return { allowed: false, level, required, reason: "channel" };
      }
    }

    const commandOverrides = (values["permissions.command_overrides"] ?? {}) as Record<string, unknown>;
    const commandOverride = commandOverrides[commandName];
    if (commandOverride === false) {
      return { allowed: false, level, required, reason: "disabled" };
    }

    let effectiveRequired = required;
    if (typeof commandOverride === "number") effectiveRequired = clampLevel(commandOverride);
    if (channelId && typeof channelOverrides[channelId] === "number") {
      effectiveRequired = Math.max(
        effectiveRequired,
        clampLevel(Number(channelOverrides[channelId])),
      ) as PermissionLevel;
    }

    const allowed = isAtLeast(level, effectiveRequired);
    return {
      allowed,
      level,
      required: effectiveRequired,
      ...(allowed ? {} : { reason: "level" as const }),
    };
  }
}
