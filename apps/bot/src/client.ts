import { Client, GatewayIntentBits, Partials } from "discord.js";
import type { RobloxServices } from "@infera/integrations";
import type { ServiceContainer } from "@infera/services";
import type { Env } from "@infera/shared";

/**
 * Intents INFERA actually consumes. Presences and message content on other
 * bots' messages are never requested.
 */
const INTENTS = [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMembers,
  GatewayIntentBits.GuildModeration,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.MessageContent,
  GatewayIntentBits.GuildVoiceStates,
  GatewayIntentBits.GuildMessageReactions,
] as const;

function shardIds(env: Env): number[] | undefined {
  if (env.SHARD_COUNT === "auto") return undefined;
  const count = Number(env.SHARD_COUNT);
  if (!Number.isInteger(count) || count <= 1) return undefined;
  return Array.from({ length: count }, (_, index) => index);
}

export class InferaClient extends Client {
  readonly env: Env;
  readonly services: ServiceContainer;
  readonly roblox: RobloxServices;

  constructor(env: Env, services: ServiceContainer, roblox: RobloxServices) {
    super({
      intents: [...INTENTS],
      partials: [Partials.Channel, Partials.GuildMember, Partials.Message, Partials.Reaction, Partials.User],
      // Always explicit: discord.js also reads SHARD_COUNT from the environment
      // and rejects the project's "auto" value.
      shards: shardIds(env) ?? "auto",
    });
    this.env = env;
    this.services = services;
    this.roblox = roblox;
  }
}
