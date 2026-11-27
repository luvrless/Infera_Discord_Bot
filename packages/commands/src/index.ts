import community from "./categories/community";
import configuration from "./categories/configuration";
import economy from "./categories/economy";
import fun from "./categories/fun";
import general from "./categories/general";
import leveling from "./categories/leveling";
import moderation from "./categories/moderation";
import roblox from "./categories/roblox";
import security from "./categories/security";
import utility from "./categories/utility";
import { registry } from "./core/registry";
import type { CommandDefinition } from "./core/types";

/**
 * Every canonical command. Aliases live on the definition and are never
 * registered as commands of their own.
 */
export const COMMANDS: CommandDefinition[] = [
  ...general,
  ...moderation,
  ...leveling,
  ...security,
  ...configuration,
  ...economy,
  ...community,
  ...utility,
  ...roblox,
  ...fun,
];

// Side-effect registration: importing this package populates the registry used
// by the bot, the slash-command deployer and the generated manifest.
registry.registerAll(COMMANDS);

export { CommandContext, embed, tokenize } from "./core/context";
export { CommandRegistry, buildSlashData, registry } from "./core/registry";
export type { CommandManifestEntry } from "./core/registry";
export type {
  CommandCategory,
  CommandContextLike,
  CommandDefinition,
  ReplyPayload,
  SlashOption,
  SlashOptionType,
} from "./core/types";
