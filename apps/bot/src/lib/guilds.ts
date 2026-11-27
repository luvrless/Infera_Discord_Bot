import { createLogger } from "@infera/shared";
import type { Guild } from "discord.js";
import type { InferaClient } from "../client";
import { Values } from "./values";

const log = createLogger("bot:guilds");

const initialised = new Set<string>();
const pending = new Map<string, Promise<void>>();

/** Create or refresh the guild row and its configuration once per process. */
export async function ensureGuild(client: InferaClient, guild: Guild): Promise<void> {
  if (initialised.has(guild.id)) return;
  const active = pending.get(guild.id);
  if (active) return active;

  const task = client.services.config
    .ensureGuild({
      id: guild.id,
      name: guild.name,
      icon: guild.iconURL(),
      ownerId: guild.ownerId,
      memberCount: guild.memberCount,
      locale: guild.preferredLocale,
      premiumTier: guild.premiumTier,
    })
    .then(() => {
      initialised.add(guild.id);
    })
    .catch((error: unknown) => {
      log.error({ err: error, guildId: guild.id }, "could not initialise guild");
    })
    .finally(() => {
      pending.delete(guild.id);
    });

  pending.set(guild.id, task);
  return task;
}

/** Read a guild's configuration, returning null when it is not initialised. */
export async function readConfig(client: InferaClient, guildId: string): Promise<Values | null> {
  try {
    const values = await client.services.config.getValues(guildId);
    return new Values(values);
  } catch {
    return null;
  }
}

export function forgetGuild(guildId: string): void {
  initialised.delete(guildId);
  pending.delete(guildId);
}
