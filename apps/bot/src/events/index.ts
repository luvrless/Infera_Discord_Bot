import { createLogger } from "@infera/shared";
import { Events, type GuildChannel } from "discord.js";
import type { InferaClient } from "../client";
import { onGuildCreate, onGuildDelete } from "./guild-lifecycle";
import { onGuildMemberAdd, onGuildMemberRemove, onGuildMemberUpdate } from "./guild-member";
import { onInteractionCreate } from "./interaction-create";
import {
  onChannelChange,
  onGuildBanAdd,
  onGuildBanRemove,
  onMessageDelete,
  onMessageUpdate,
  onRoleChange,
  onVoiceStateUpdate,
} from "./logging-events";
import { onMessageCreate } from "./message-create";
import { onReady } from "./ready";
import { onReactionChange } from "./starboard";
import { onTempVoice } from "./temp-voice";
import {
  onBanAddForSecurity,
  onChannelDeleteForSecurity,
  onMemberRemoveForSecurity,
  onRoleDeleteForSecurity,
  onWebhooksUpdateForSecurity,
} from "./security-events";

const log = createLogger("bot:events");

function guard(handler: string, task: Promise<unknown>): void {
  void task.catch((error: unknown) => log.error({ err: error, handler }, "event handler failed"));
}

/** True for guild channels; DM channel events are never logged. */
function isGuildChannel(channel: { isDMBased(): boolean }): channel is GuildChannel {
  return !channel.isDMBased() && "guild" in channel;
}

/** Servers frozen from the operator panel. Refreshed every 20 seconds. */
const frozenGuilds = new Set<string>();
// These events must always run (joining, leaving, startup).
const ALWAYS = new Set<string>([Events.ClientReady, Events.GuildCreate, Events.GuildDelete, Events.Debug, Events.Warn, Events.Error, Events.ShardReady, Events.ShardDisconnect, Events.ShardResume, Events.ShardReconnecting, Events.Raw, Events.CacheSweep, Events.GuildUpdate]);

function guildIdOf(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const v = value as { guildId?: unknown; guild?: { id?: unknown }; message?: { guildId?: unknown } };
  if (typeof v.guildId === "string") return v.guildId;
  if (v.guild && typeof v.guild.id === "string") return v.guild.id;
  if (v.message && typeof v.message.guildId === "string") return v.message.guildId;
  return null;
}

/**
 * A frozen server gets no INFERA features at all: every gateway event from it
 * is dropped before any handler runs. Interactions get a short notice.
 */
function installFreeze(client: InferaClient): void {
  const refresh = async () => {
    const ids = await client.services.platform.listIds("frozen");
    frozenGuilds.clear();
    for (const id of ids) frozenGuilds.add(id);
  };
  void refresh().catch(() => undefined);
  setInterval(() => void refresh().catch(() => undefined), 20_000).unref();

  const emit = client.emit.bind(client) as (event: string, ...args: unknown[]) => boolean;
  (client as unknown as { emit: (event: string, ...args: unknown[]) => boolean }).emit = (event: string, ...args: unknown[]) => {
    if (frozenGuilds.size > 0 && !ALWAYS.has(event)) {
      const guildId = guildIdOf(args[0]);
      if (guildId && frozenGuilds.has(guildId)) {
        if (event === Events.InteractionCreate) {
          const interaction = args[0] as { isRepliable?: () => boolean; reply?: (options: unknown) => Promise<unknown> };
          if (interaction.isRepliable?.()) {
            void interaction.reply?.({ content: "🧊 INFERA has been frozen in this server by the INFERA team.", ephemeral: true }).catch(() => undefined);
          }
        }
        return false;
      }
    }
    return emit(event, ...args);
  };
}

/** Attach every gateway listener. All handlers are individually guarded. */
export function registerEvents(client: InferaClient): void {
  installFreeze(client);
  client.once(Events.ClientReady, (ready) => {
    guard("ready", onReady(ready as InferaClient));
  });

  client.on(Events.MessageCreate, (message) => {
    guard("messageCreate", onMessageCreate(client, message));
  });

  client.on(Events.InteractionCreate, (interaction) => {
    guard("interactionCreate", onInteractionCreate(client, interaction));
  });

  client.on(Events.GuildMemberAdd, (member) => {
    guard("guildMemberAdd", onGuildMemberAdd(client, member));
  });

  client.on(Events.GuildMemberRemove, (member) => {
    guard("guildMemberRemove", onGuildMemberRemove(client, member));
    guard("antinuke:memberRemove", onMemberRemoveForSecurity(client, member));
  });

  client.on(Events.GuildMemberUpdate, (oldMember, newMember) => {
    guard("guildMemberUpdate", onGuildMemberUpdate(client, oldMember, newMember));
  });

  client.on(Events.GuildCreate, (guild) => {
    guard("guildCreate", onGuildCreate(client, guild));
  });

  client.on(Events.GuildDelete, (guild) => {
    guard("guildDelete", onGuildDelete(client, guild));
  });

  client.on(Events.MessageDelete, (message) => {
    guard("messageDelete", onMessageDelete(client, message));
  });

  client.on(Events.MessageUpdate, (oldMessage, newMessage) => {
    guard("messageUpdate", onMessageUpdate(client, oldMessage, newMessage));
  });

  client.on(Events.MessageReactionAdd, (reaction, user) => {
    guard("messageReactionAdd", onReactionChange(client, reaction, user, "add"));
  });

  client.on(Events.MessageReactionRemove, (reaction, user) => {
    guard("messageReactionRemove", onReactionChange(client, reaction, user, "remove"));
  });

  client.on(Events.ChannelCreate, (channel) => {
    if (!isGuildChannel(channel)) return;
    guard("channelCreate", onChannelChange(client, channel, "created"));
  });

  client.on(Events.ChannelUpdate, (oldChannel, newChannel) => {
    if (!isGuildChannel(newChannel)) return;
    guard("channelUpdate", onChannelChange(client, newChannel, "updated"));
  });

  client.on(Events.ChannelDelete, (channel) => {
    if (!isGuildChannel(channel)) return;
    guard("channelDelete", onChannelChange(client, channel, "deleted"));
    guard("antinuke:channelDelete", onChannelDeleteForSecurity(client, channel));
  });

  client.on(Events.GuildRoleCreate, (role) => {
    guard("roleCreate", onRoleChange(client, role, "created"));
  });

  client.on(Events.GuildRoleUpdate, (oldRole, newRole) => {
    guard("roleUpdate", onRoleChange(client, newRole, "updated"));
  });

  client.on(Events.GuildRoleDelete, (role) => {
    guard("roleDelete", onRoleChange(client, role, "deleted"));
    guard("antinuke:roleDelete", onRoleDeleteForSecurity(client, role));
  });

  client.on(Events.VoiceStateUpdate, (oldState, newState) => {
    guard("voiceStateUpdate", onVoiceStateUpdate(client, oldState, newState));
    guard("tempVoice", onTempVoice(client, oldState, newState));
  });

  client.on(Events.GuildBanAdd, (ban) => {
    guard("guildBanAdd", onGuildBanAdd(client, ban));
    guard("antinuke:banAdd", onBanAddForSecurity(client, ban));
  });

  client.on(Events.GuildBanRemove, (ban) => {
    guard("guildBanRemove", onGuildBanRemove(client, ban));
  });

  client.on(Events.WebhooksUpdate, (channel) => {
    if (!isGuildChannel(channel)) return;
    guard("webhooksUpdate", onWebhooksUpdateForSecurity(client, channel));
  });
}
