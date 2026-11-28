import { createLogger } from "@infera/shared";
import type { Guild } from "discord.js";
import type { InferaClient } from "../client";
import { ensureGuild, forgetGuild } from "../lib/guilds";

const log = createLogger("bot:guilds");

export async function onGuildCreate(client: InferaClient, guild: Guild): Promise<void> {
  log.info({ guildId: guild.id, name: guild.name, members: guild.memberCount }, "joined guild");
  // Operator panel: blacklisted servers, or new servers while invites are paused.
  const blocked = await client.services.platform.isBlacklisted("guild", guild.id).catch(() => false);
  const state = await client.services.platform.state().catch(() => null);
  if (blocked || (state && !state.allowNewServers)) {
    log.warn({ guildId: guild.id, blocked }, "leaving server (operator rule)");
    await guild.leave().catch(() => undefined);
    return;
  }
  forgetGuild(guild.id);
  await ensureGuild(client, guild);

  await client.services.realtime
    .publish(guild.id, "guild.created", {
      name: guild.name,
      memberCount: guild.memberCount,
    })
    .catch(() => undefined);
}

export async function onGuildDelete(client: InferaClient, guild: Guild): Promise<void> {
  log.info({ guildId: guild.id, name: guild.name }, "removed from guild");
  forgetGuild(guild.id);
  await client.services.config.markLeft(guild.id).catch(() => undefined);
  await client.services.realtime
    .publish(guild.id, "guild.removed", { name: guild.name })
    .catch(() => undefined);
}
