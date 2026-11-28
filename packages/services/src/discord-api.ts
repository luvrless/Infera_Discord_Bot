import { REST, Routes } from "discord.js";
import { ErrorCode, InferaError } from "@infera/shared";

export interface DiscordUser {
  id: string;
  username: string;
  discriminator: string;
  global_name?: string | null;
  avatar?: string | null;
  bot?: boolean;
  public_flags?: number;
  created_at?: string;
}

export interface DiscordMember {
  user?: DiscordUser;
  nick?: string | null;
  roles: string[];
  joined_at: string;
  communication_disabled_until?: string | null;
  avatar?: string | null;
}

export interface DiscordChannel {
  id: string;
  type: number;
  name?: string;
  position?: number;
  parent_id?: string | null;
  topic?: string | null;
  nsfw?: boolean;
  permission_overwrites?: Array<{ id: string; type: number; allow: string; deny: string }>;
}

export interface DiscordRole {
  id: string;
  name: string;
  color: number;
  position: number;
  permissions: string;
  managed: boolean;
  mentionable: boolean;
  hoist: boolean;
}

export interface DiscordGuild {
  id: string;
  name: string;
  icon?: string | null;
  banner?: string | null;
  description?: string | null;
  owner_id: string;
  /** Only present on gateway payloads; REST returns approximate_member_count. */
  member_count?: number;
  /** Present on REST responses fetched with `with_counts=true`. */
  approximate_member_count?: number;
  premium_tier?: number;
  preferred_locale?: string;
  features?: string[];
  emojis?: Array<{ id: string; name: string | null; animated?: boolean }>;
  roles?: DiscordRole[];
  channels?: DiscordChannel[];
}

/** Member count from either a gateway or a REST (`with_counts`) guild payload. */
export function guildMemberCount(guild: Pick<DiscordGuild, "member_count" | "approximate_member_count"> | null | undefined): number | undefined {
  if (!guild) return undefined;
  return guild.member_count ?? guild.approximate_member_count ?? undefined;
}

export interface DiscordMessage {
  id: string;
  channel_id: string;
  content: string;
  author: DiscordUser;
  timestamp: string;
  embeds?: unknown[];
}

export interface DiscordInvite {
  code: string;
  guild?: { id: string; name: string; description?: string | null; icon?: string | null };
  channel?: { id: string; name: string };
  inviter?: DiscordUser;
  approximate_member_count?: number;
  approximate_presence_count?: number;
  expires_at?: string | null;
}

export interface DiscordBan {
  reason?: string | null;
  user: DiscordUser;
}

/**
 * Thin, typed wrapper over Discord's REST API. The API process uses this so it
 * never needs gateway access; the bot uses it for actions that must be
 * idempotent and auditable.
 */
export class DiscordApi {
  private readonly rest: REST;

  constructor(token: string) {
    this.rest = new REST({ version: "10", timeout: 15_000 }).setToken(token);
  }

  private async request<T>(
    method: "get" | "post" | "put" | "patch" | "delete",
    route: `/${string}`,
    options: { body?: unknown; reason?: string; query?: Record<string, string | number | boolean> } = {},
  ): Promise<T> {
    try {
      const requestOptions: Record<string, unknown> = {};
      if (options.body !== undefined) requestOptions.body = options.body;
      if (options.reason) requestOptions.reason = options.reason.slice(0, 512);
      if (options.query) requestOptions.query = new URLSearchParams(
        Object.entries(options.query).map(([key, value]) => [key, String(value)] as [string, string]),
      );
      return (await this.rest[method](route, requestOptions)) as T;
    } catch (error) {
      throw this.translateError(error, route);
    }
  }

  private translateError(error: unknown, route: string): InferaError {
    const status = (error as { status?: number }).status;
    const code = (error as { code?: number }).code;
    if (status === 403 || code === 50013) {
      return new InferaError("The bot is missing a required Discord permission", {
        code: ErrorCode.BOT_MISSING_PERMISSION,
        messageKey: "errors.bot_missing_permission",
        cause: error,
      });
    }
    if (status === 404 || code === 10007 || code === 10013 || code === 10011) {
      return new InferaError("That Discord resource no longer exists", {
        code: ErrorCode.TARGET_NOT_FOUND,
        messageKey: "errors.target_not_found",
        cause: error,
      });
    }
    if (status === 429) {
      return new InferaError("Discord rate limit reached", {
        code: ErrorCode.RATE_LIMITED,
        cause: error,
      });
    }
    return new InferaError(`Discord API request failed: ${route}`, {
      code: ErrorCode.EXTERNAL_API_UNAVAILABLE,
      cause: error,
      expose: false,
    });
  }

  // ------------------------------------------------------------- read paths
  getGuild(guildId: string): Promise<DiscordGuild> {
    return this.request("get", Routes.guild(guildId), { query: { with_counts: true } });
  }

  getGuildChannels(guildId: string): Promise<DiscordChannel[]> {
    return this.request("get", Routes.guildChannels(guildId));
  }

  getGuildRoles(guildId: string): Promise<DiscordRole[]> {
    return this.request("get", Routes.guildRoles(guildId));
  }

  getGuildMember(guildId: string, userId: string): Promise<DiscordMember> {
    return this.request("get", Routes.guildMember(guildId, userId));
  }

  /** Prefix search over guild members (username / nickname). Max 1000. */
  searchGuildMembers(guildId: string, query: string, limit = 25): Promise<DiscordMember[]> {
    return this.request("get", Routes.guildMembersSearch(guildId), {
      query: { query, limit: Math.min(Math.max(limit, 1), 100) },
    });
  }

  getUser(userId: string): Promise<DiscordUser> {
    return this.request("get", Routes.user(userId));
  }

  getCurrentUser(): Promise<DiscordUser> {
    return this.request("get", Routes.user("@me"));
  }

  getInvite(code: string): Promise<DiscordInvite> {
    return this.request("get", Routes.invite(code), {
      query: { with_counts: true, with_expiration: true },
    });
  }

  getGuildBans(guildId: string): Promise<DiscordBan[]> {
    return this.request("get", Routes.guildBans(guildId), { query: { limit: 1000 } });
  }

  getMessages(channelId: string, options: { limit?: number; before?: string } = {}): Promise<DiscordMessage[]> {
    return this.request("get", Routes.channelMessages(channelId), {
      query: { limit: options.limit ?? 50, ...(options.before ? { before: options.before } : {}) },
    });
  }

  // ------------------------------------------------------------ moderation
  async ban(
    guildId: string,
    userId: string,
    options: { reason?: string; deleteMessageSeconds?: number } = {},
  ): Promise<void> {
    await this.request("put", Routes.guildBan(guildId, userId), {
      body: { delete_message_seconds: options.deleteMessageSeconds ?? 0 },
      reason: options.reason,
    });
  }

  async unban(guildId: string, userId: string, reason?: string): Promise<void> {
    await this.request("delete", Routes.guildBan(guildId, userId), { reason });
  }

  async kick(guildId: string, userId: string, reason?: string): Promise<void> {
    await this.request("delete", Routes.guildMember(guildId, userId), { reason });
  }

  async timeout(guildId: string, userId: string, until: Date | null, reason?: string): Promise<void> {
    await this.request("patch", Routes.guildMember(guildId, userId), {
      body: { communication_disabled_until: until ? until.toISOString() : null },
      reason,
    });
  }

  async addRole(guildId: string, userId: string, roleId: string, reason?: string): Promise<void> {
    await this.request("put", Routes.guildMemberRole(guildId, userId, roleId), { reason });
  }

  async removeRole(guildId: string, userId: string, roleId: string, reason?: string): Promise<void> {
    await this.request("delete", Routes.guildMemberRole(guildId, userId, roleId), { reason });
  }

  async setNickname(guildId: string, userId: string, nickname: string | null, reason?: string): Promise<void> {
    await this.request("patch", Routes.guildMember(guildId, userId), {
      body: { nick: nickname },
      reason,
    });
  }

  async moveMember(guildId: string, userId: string, channelId: string | null): Promise<void> {
    await this.request("patch", Routes.guildMember(guildId, userId), {
      body: { channel_id: channelId },
    });
  }

  async setVoiceMute(guildId: string, userId: string, muted: boolean, reason?: string): Promise<void> {
    await this.request("patch", Routes.guildMember(guildId, userId), {
      body: { mute: muted },
      reason,
    });
  }

  async setVoiceDeaf(guildId: string, userId: string, deafened: boolean, reason?: string): Promise<void> {
    await this.request("patch", Routes.guildMember(guildId, userId), {
      body: { deaf: deafened },
      reason,
    });
  }

  // -------------------------------------------------------------- messages
  async sendMessage(
    channelId: string,
    body: Record<string, unknown>,
  ): Promise<DiscordMessage> {
    return this.request("post", Routes.channelMessages(channelId), { body });
  }

  async sendDirectMessage(userId: string, body: Record<string, unknown>): Promise<DiscordMessage> {
    const dm = await this.request<{ id: string }>("post", Routes.userChannels(), {
      body: { recipient_id: userId },
    });
    return this.sendMessage(dm.id, body);
  }

  async editMessage(
    channelId: string,
    messageId: string,
    body: Record<string, unknown>,
  ): Promise<DiscordMessage> {
    return this.request("patch", Routes.channelMessage(channelId, messageId), { body });
  }

  async deleteMessage(channelId: string, messageId: string, reason?: string): Promise<void> {
    await this.request("delete", Routes.channelMessage(channelId, messageId), { reason });
  }

  async bulkDelete(channelId: string, messageIds: string[], reason?: string): Promise<void> {
    if (messageIds.length === 0) return;
    await this.request("post", Routes.channelBulkDelete(channelId), {
      body: { messages: messageIds },
      reason,
    });
  }

  // -------------------------------------------------------------- channels
  /** Send a message with file attachments (e.g. HTML transcripts). */
  async sendFiles(
    channelId: string,
    body: Record<string, unknown>,
    files: Array<{ name: string; data: Buffer; contentType?: string }>,
  ): Promise<DiscordMessage> {
    try {
      return (await this.rest.post(Routes.channelMessages(channelId), { body, files })) as DiscordMessage;
    } catch (error) {
      throw this.translateError(error, Routes.channelMessages(channelId));
    }
  }

  /** DM a user (opens the DM channel first). Fails if the user closed DMs. */
  async sendDm(
    userId: string,
    body: Record<string, unknown>,
    files: Array<{ name: string; data: Buffer; contentType?: string }> = [],
  ): Promise<DiscordMessage> {
    const channel = (await this.request("post", Routes.userChannels(), { body: { recipient_id: userId } })) as { id: string };
    return files.length ? this.sendFiles(channel.id, body, files) : this.sendMessage(channel.id, body);
  }

  async createChannel(guildId: string, body: Record<string, unknown>, reason?: string): Promise<DiscordChannel> {
    return this.request("post", Routes.guildChannels(guildId), { body, reason });
  }

  async editChannel(channelId: string, body: Record<string, unknown>, reason?: string): Promise<DiscordChannel> {
    return this.request("patch", Routes.channel(channelId), { body, reason });
  }

  async deleteChannel(channelId: string, reason?: string): Promise<void> {
    await this.request("delete", Routes.channel(channelId), { reason });
  }

  async setChannelPermission(
    channelId: string,
    overwriteId: string,
    body: { type: 0 | 1; allow?: string; deny?: string },
    reason?: string,
  ): Promise<void> {
    await this.request("put", Routes.channelPermission(channelId, overwriteId), {
      body: { allow: "0", deny: "0", ...body },
      reason,
    });
  }

  async deleteChannelPermission(channelId: string, overwriteId: string, reason?: string): Promise<void> {
    await this.request("delete", Routes.channelPermission(channelId, overwriteId), { reason });
  }

  async createInvite(
    channelId: string,
    options: { maxAge?: number; maxUses?: number; temporary?: boolean; reason?: string } = {},
  ): Promise<DiscordInvite> {
    return this.request("post", Routes.channelInvites(channelId), {
      body: {
        max_age: options.maxAge ?? 0,
        max_uses: options.maxUses ?? 0,
        temporary: options.temporary ?? false,
      },
      reason: options.reason,
    });
  }

  // ----------------------------------------------------------------- roles
  async createRole(guildId: string, body: Record<string, unknown>, reason?: string): Promise<DiscordRole> {
    return this.request("post", Routes.guildRoles(guildId), { body, reason });
  }

  async editRole(guildId: string, roleId: string, body: Record<string, unknown>, reason?: string): Promise<DiscordRole> {
    return this.request("patch", Routes.guildRole(guildId, roleId), { body, reason });
  }

  async deleteRole(guildId: string, roleId: string, reason?: string): Promise<void> {
    await this.request("delete", Routes.guildRole(guildId, roleId), { reason });
  }
}
