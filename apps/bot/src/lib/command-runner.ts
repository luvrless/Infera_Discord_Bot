import { CommandContext, registry, type CommandDefinition } from "@infera/commands";
import {
  ErrorCode,
  InferaError,
  PermissionLevel,
  createLogger,
  formatDuration,
  isPlatformOwner,
  translate,
} from "@infera/shared";
import type { InferaClient } from "../client";
import { toPermissionInput } from "./permissions";

const log = createLogger("bot:commands");

const cooldowns = new Map<string, number>();

/** Discard expired cooldown entries so the map cannot grow without bound. */
export function sweepCooldowns(): void {
  const now = Date.now();
  for (const [key, expiresAt] of cooldowns) {
    if (expiresAt <= now) cooldowns.delete(key);
  }
}

function describe(error: InferaError): string {
  if (error.messageKey) {
    const detail = error.details.find((entry): entry is string => typeof entry === "string");
    return translate(error.messageKey, {
      permission: detail ?? "required",
      feature: detail ?? "requested",
      time: detail ?? "a moment",
    });
  }
  return error.message;
}

async function replyError(context: CommandContext, error: unknown, commandName: string): Promise<void> {
  if (error instanceof InferaError) {
    log.warn(
      { err: error, command: commandName, guildId: context.guildId, userId: context.user.id },
      "command rejected",
    );
    await context.error(describe(error)).catch(() => undefined);
    return;
  }
  log.error(
    { err: error, command: commandName, guildId: context.guildId, userId: context.user.id },
    "command failed",
  );
  await context.error(translate("errors.generic")).catch(() => undefined);
}

/**
 * The single execution path for prefix and slash commands: module gate,
 * permission gate, Discord permission gates, cooldown, analytics and errors.
 */
export async function runCommand(
  client: InferaClient,
  command: CommandDefinition,
  context: CommandContext,
  source: "slash" | "prefix",
): Promise<void> {
  const started = Date.now();
  const guildId = context.guildId;
  let success = false;
  let errorCode: string | null = null;

  try {
    if (command.ownerOnly && !isPlatformOwner(context.user.id)) {
      throw new InferaError("This command is restricted to platform owners", {
        code: ErrorCode.FORBIDDEN,
        messageKey: "errors.owner_only",
      });
    }

    if (!guildId) {
      if (command.guildOnly !== false) {
        throw new InferaError("This command can only be used in a server", {
          code: ErrorCode.VALIDATION_ERROR,
          messageKey: "errors.invalid_guild",
        });
      }
    } else {
      const member = context.member;
      if (!member) {
        throw new InferaError("You must be a member of this server", {
          code: ErrorCode.VALIDATION_ERROR,
          messageKey: "errors.invalid_guild",
        });
      }

      const check = await client.services.permissions.checkCommand(
        guildId,
        context.channelId,
        toPermissionInput(member),
        command.name,
        command.level ?? PermissionLevel.Member,
      );
      if (!check.allowed) {
        throw new InferaError("You do not have permission to use this command", {
          code: ErrorCode.MISSING_PERMISSION,
          messageKey: "errors.permission_denied",
        });
      }

      if (command.module) {
        const enabled = await client.services.config
          .isModuleEnabled(guildId, command.module)
          .catch(() => true);
        if (!enabled) {
          throw new InferaError(`The ${command.module} module is disabled`, {
            code: ErrorCode.FEATURE_DISABLED,
            messageKey: "errors.feature_disabled",
            details: [command.module],
          });
        }
      }

      if (command.userPermissions?.length) await context.requireUserPermissions(...command.userPermissions);
      if (command.botPermissions?.length) await context.requireBotPermissions(...command.botPermissions);
    }

    const cooldownKey = `${guildId ?? "dm"}:${context.user.id}:${command.name}`;
    const cooldownMs = command.cooldownMs ?? 3_000;
    const expiresAt = cooldowns.get(cooldownKey) ?? 0;
    if (expiresAt > Date.now()) {
      throw new InferaError("This command is on cooldown", {
        code: ErrorCode.COOLDOWN,
        messageKey: "errors.cooldown",
        details: [formatDuration(expiresAt - Date.now())],
      });
    }
    cooldowns.set(cooldownKey, Date.now() + cooldownMs);

    await command.execute(context);
    success = true;
  } catch (error) {
    errorCode = error instanceof InferaError ? error.code : ErrorCode.INTERNAL_ERROR;
    await replyError(context, error, command.name);
  } finally {
    if (guildId) {
      await client.services.analytics
        .recordCommand({
          guildId,
          userId: context.user.id,
          commandName: command.name,
          source,
          success,
          durationMs: Date.now() - started,
          errorCode,
        })
        .catch((error: unknown) => log.warn({ err: error }, "command analytics failed"));
    }
  }
}

export { registry };
