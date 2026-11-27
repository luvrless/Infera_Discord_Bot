import {
  EmbedBuilder,
  type ChatInputCommandInteraction,
  type Client,
  type Guild,
  type GuildMember,
  type Message,
  type User,
} from "discord.js";
import type { RobloxServices } from "@infera/integrations";
import type { ServiceContainer } from "@infera/services";
import {
  BRAND_COLOR,
  ErrorCode,
  InferaError,
  PermissionLevel,
  createTranslator,
  parseDuration,
  type Translator,
} from "@infera/shared";
import type { CommandContextLike, ReplyPayload } from "./types";

export interface CommandContextInit {
  client: Client;
  services: ServiceContainer;
  roblox: RobloxServices;
  source: "slash" | "prefix";
  interaction?: ChatInputCommandInteraction;
  message?: Message;
  args: string[];
  rawArgs: string;
  prefix: string;
  level: PermissionLevel;
}

const MENTION_RE = /^<@!?(\d{17,20})>$/;
const ID_RE = /^\d{17,20}$/;

export class CommandContext implements CommandContextLike {
  readonly client: Client;
  readonly services: ServiceContainer;
  readonly roblox: RobloxServices;
  readonly interaction: ChatInputCommandInteraction | null;
  readonly message: Message | null;
  readonly args: string[];
  readonly rawArgs: string;
  readonly prefix: string;
  readonly isSlash: boolean;
  readonly level: PermissionLevel;
  readonly t: Translator;

  private deferred = false;
  private replied = false;

  constructor(init: CommandContextInit) {
    this.client = init.client;
    this.services = init.services;
    this.roblox = init.roblox;
    this.interaction = init.interaction ?? null;
    this.message = init.message ?? null;
    this.args = init.args;
    this.rawArgs = init.rawArgs;
    this.prefix = init.prefix;
    this.isSlash = init.source === "slash";
    this.level = init.level;
    this.t = createTranslator("en");
  }

  get guild(): Guild | null {
    return this.interaction?.guild ?? this.message?.guild ?? null;
  }

  get guildId(): string | null {
    return this.guild?.id ?? null;
  }

  get member(): GuildMember | null {
    // Prefer the cached member: interaction.member can be a raw API payload
    // when the member was never cached, which has no roles or helpers.
    const guild = this.guild;
    const userId = this.interaction?.user.id ?? this.message?.author.id;
    if (guild && userId) {
      const cached = guild.members.cache.get(userId);
      if (cached) return cached;
    }
    const member = this.interaction?.member ?? this.message?.member;
    return member && "permissions" in member && "roles" in member ? (member as GuildMember) : null;
  }

  get user(): User {
    if (this.interaction) return this.interaction.user;
    if (this.message) return this.message.author;
    throw new InferaError("Command context has no user", { code: ErrorCode.INTERNAL_ERROR });
  }

  get channelId(): string | null {
    return this.interaction?.channelId ?? this.message?.channelId ?? null;
  }

  requireGuild(): Guild {
    const guild = this.guild;
    if (!guild) {
      throw new InferaError("This command can only be used in a server", {
        code: ErrorCode.VALIDATION_ERROR,
        messageKey: "errors.invalid_guild",
      });
    }
    return guild;
  }

  requireMember(): GuildMember {
    const member = this.member;
    if (!member) {
      throw new InferaError("This command can only be used in a server", {
        code: ErrorCode.VALIDATION_ERROR,
        messageKey: "errors.invalid_guild",
      });
    }
    return member;
  }

  async defer(ephemeral = false): Promise<void> {
    if (!this.interaction || this.deferred || this.replied) return;
    await this.interaction.deferReply({ ephemeral });
    this.deferred = true;
  }

  async reply(payload: ReplyPayload): Promise<unknown> {
    if (this.interaction) {
      const body = {
        content: payload.content,
        embeds: payload.embeds as never,
        components: payload.components as never,
        files: payload.files as never,
        allowedMentions: payload.allowedMentions,
      };
      if (this.replied || this.deferred) return this.interaction.editReply(body);
      this.replied = true;
      return this.interaction.reply({ ...body, ephemeral: payload.ephemeral ?? false });
    }

    if (!this.message) throw new InferaError("Command context has no channel", { code: ErrorCode.INTERNAL_ERROR });
    return this.message.reply({
      content: payload.content,
      embeds: payload.embeds as never,
      components: payload.components as never,
      files: payload.files as never,
      allowedMentions: payload.allowedMentions ?? { repliedUser: false },
    });
  }

  async ok(message: string, title?: string): Promise<unknown> {
    const embed = new EmbedBuilder().setColor(BRAND_COLOR).setDescription(message);
    if (title) embed.setTitle(title);
    return this.reply({ embeds: [embed] });
  }

  async error(message: string): Promise<unknown> {
    const embed = new EmbedBuilder().setColor(0xed4245).setDescription(message);
    return this.reply({ embeds: [embed], ephemeral: true });
  }

  async resolveMember(input?: string): Promise<GuildMember> {
    const guild = this.requireGuild();
    const raw = input ?? this.args[0];
    if (!raw) {
      throw new InferaError("You must mention a member or provide their ID", {
        code: ErrorCode.VALIDATION_ERROR,
        messageKey: "errors.target_not_found",
      });
    }
    const id = MENTION_RE.exec(raw)?.[1] ?? (ID_RE.test(raw) ? raw : null);
    if (!id) {
      const byName = guild.members.cache.find(
        (member) => member.user.username.toLowerCase() === raw.replace(/^@/, "").toLowerCase(),
      );
      if (byName) return byName;
      throw new InferaError("I could not find that member", {
        code: ErrorCode.TARGET_NOT_FOUND,
        messageKey: "errors.target_not_found",
      });
    }
    try {
      return await guild.members.fetch(id);
    } catch {
      throw new InferaError("I could not find that member", {
        code: ErrorCode.TARGET_NOT_FOUND,
        messageKey: "errors.target_not_found",
      });
    }
  }

  async resolveUser(input?: string): Promise<User> {
    const raw = input ?? this.args[0];
    if (!raw) {
      throw new InferaError("You must provide a user", { code: ErrorCode.VALIDATION_ERROR });
    }
    const id = MENTION_RE.exec(raw)?.[1] ?? (ID_RE.test(raw) ? raw : null);
    if (!id) throw new InferaError("That is not a valid user", { code: ErrorCode.VALIDATION_ERROR });
    try {
      return await this.client.users.fetch(id);
    } catch {
      throw new InferaError("I could not find that user", { code: ErrorCode.TARGET_NOT_FOUND });
    }
  }

  duration(index = 0): number {
    const raw = this.args[index];
    if (!raw) throw new InferaError("A duration is required, e.g. `10m` or `1h30m`", { code: ErrorCode.VALIDATION_ERROR });
    const ms = parseDuration(raw);
    if (!ms) throw new InferaError("That duration is not valid", { code: ErrorCode.VALIDATION_ERROR });
    return ms;
  }

  optionalDuration(index = 0): number | null {
    const raw = this.args[index];
    if (!raw) return null;
    return parseDuration(raw);
  }

  async requireBotPermissions(...permissions: bigint[]): Promise<void> {
    const guild = this.requireGuild();
    const me = guild.members.me;
    if (!me) throw new InferaError("The bot is not a member of this server", { code: ErrorCode.FORBIDDEN });
    const missing = permissions.filter((permission) => !me.permissions.has(permission));
    if (missing.length > 0) {
      throw new InferaError("I am missing required permissions", {
        code: ErrorCode.BOT_MISSING_PERMISSION,
        messageKey: "errors.bot_missing_permission",
        details: missing.map((permission) => permission.toString()),
      });
    }
  }

  async requireUserPermissions(...permissions: bigint[]): Promise<void> {
    const member = this.requireMember();
    if (member.id === member.guild.ownerId) return;
    const missing = permissions.filter((permission) => !member.permissions.has(permission));
    if (missing.length > 0) {
      throw new InferaError("You are missing required permissions", {
        code: ErrorCode.MISSING_PERMISSION,
        messageKey: "errors.permission_denied",
      });
    }
  }

  async checkHierarchy(target: GuildMember): Promise<void> {
    const guild = this.requireGuild();
    if (target.id === guild.ownerId) {
      throw new InferaError("That member is the server owner", { code: ErrorCode.ROLE_HIERARCHY });
    }
    const me = guild.members.me;
    if (me && target.roles.highest.position >= me.roles.highest.position) {
      throw new InferaError("That member has a role equal to or higher than mine", {
        code: ErrorCode.ROLE_HIERARCHY,
        messageKey: "errors.role_hierarchy",
      });
    }
  }

  async setCooldown(): Promise<void> {
    // Cooldowns are enforced by the executor before the handler runs.
  }
}

/** Build a standard INFERA embed. */
export function embed(options: {
  title?: string;
  description?: string;
  color?: number;
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
  thumbnail?: string;
  image?: string;
  footer?: string;
  timestamp?: boolean;
}): EmbedBuilder {
  const builder = new EmbedBuilder().setColor(options.color ?? BRAND_COLOR);
  if (options.title) builder.setTitle(options.title.slice(0, 256));
  if (options.description) builder.setDescription(options.description.slice(0, 4096));
  if (options.fields) builder.addFields(options.fields.slice(0, 25));
  if (options.thumbnail) builder.setThumbnail(options.thumbnail);
  if (options.image) builder.setImage(options.image);
  if (options.footer) builder.setFooter({ text: options.footer });
  if (options.timestamp) builder.setTimestamp(new Date());
  return builder;
}

/** Tokenise a prefix command line, honouring double quotes. */
export function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;
  for (const char of input) {
    if (quote) {
      if (char === quote) quote = null;
      else current += char;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }
  if (current) tokens.push(current);
  return tokens;
}
