import type {
  ChatInputCommandInteraction,
  Client,
  Guild,
  GuildMember,
  Message,
  User,
} from "discord.js";
import type { RobloxServices } from "@infera/integrations";
import type { ServiceContainer } from "@infera/services";
import type { PermissionLevel, Translator } from "@infera/shared";

export type CommandCategory =
  | "general"
  | "moderation"
  | "cases"
  | "automod"
  | "security"
  | "configuration"
  | "roles"
  | "leveling"
  | "economy"
  | "economy_games"
  | "giveaways"
  | "tickets"
  | "community"
  | "fun"
  | "image"
  | "games"
  | "roblox"
  | "discord"
  | "utility"
  | "voice"
  | "social"
  | "customization"
  | "music"
  | "profile"
  | "owner";

export type SlashOptionType =
  | "string"
  | "integer"
  | "number"
  | "boolean"
  | "user"
  | "member"
  | "channel"
  | "role";

export interface SlashOption {
  name: string;
  description: string;
  type: SlashOptionType;
  required?: boolean;
  choices?: Array<{ name: string; value: string | number }>;
  min?: number;
  max?: number;
  autocomplete?: boolean;
}

export interface CommandDefinition {
  /** Canonical command name. Aliases never count as separate commands. */
  name: string;
  description: string;
  category: CommandCategory;
  aliases?: string[];
  usage?: string;
  examples?: string[];
  /** Minimum permission level. Defaults to Member. */
  level?: PermissionLevel;
  /** Discord permissions the invoking member must hold. */
  userPermissions?: bigint[];
  /** Discord permissions the bot must hold. */
  botPermissions?: bigint[];
  cooldownMs?: number;
  guildOnly?: boolean;
  ownerOnly?: boolean;
  /** Module id used for the feature-enabled check. */
  module?: string;
  /** Whether the command is exposed as a slash command (subject to the 100 limit). */
  slash?: boolean;
  slashOptions?: SlashOption[];
  execute(context: CommandContextLike): Promise<unknown>;
}

/** Structural interface to avoid a circular import with CommandContext. */
export interface CommandContextLike {
  readonly client: Client;
  readonly services: ServiceContainer;
  readonly roblox: RobloxServices;
  readonly guild: Guild | null;
  readonly guildId: string | null;
  readonly channelId: string | null;
  readonly member: GuildMember | null;
  readonly user: User;
  readonly args: string[];
  readonly rawArgs: string;
  readonly prefix: string;
  readonly isSlash: boolean;
  readonly interaction: ChatInputCommandInteraction | null;
  readonly message: Message | null;
  readonly level: PermissionLevel;
  readonly t: Translator;
  requireGuild(): Guild;
  requireMember(): GuildMember;
  defer(ephemeral?: boolean): Promise<void>;
  reply(payload: ReplyPayload): Promise<unknown>;
  ok(message: string, title?: string): Promise<unknown>;
  error(message: string): Promise<unknown>;
  resolveMember(input?: string): Promise<GuildMember>;
  resolveUser(input?: string): Promise<User>;
  duration(index?: number): number;
  optionalDuration(index?: number): number | null;
  requireBotPermissions(...permissions: bigint[]): Promise<void>;
  requireUserPermissions(...permissions: bigint[]): Promise<void>;
  checkHierarchy(target: GuildMember): Promise<void>;
  setCooldown(): Promise<void>;
}

export interface ReplyPayload {
  content?: string;
  embeds?: unknown[];
  components?: unknown[];
  ephemeral?: boolean;
  files?: unknown[];
  allowedMentions?: { repliedUser?: boolean; parse?: Array<"roles" | "users" | "everyone"> };
}
