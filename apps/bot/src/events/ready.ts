import { buildSlashData, registry } from "@infera/commands";
import { createLogger } from "@infera/shared";
import type { InferaClient } from "../client";
import { syncCommandDefinitions } from "../lib/command-sync";
import { ensureGuild } from "../lib/guilds";
import { startHeartbeat } from "../lib/heartbeat";

const log = createLogger("bot:ready");

export async function onReady(client: InferaClient): Promise<void> {
  const user = client.user;
  log.info(
    { user: user?.tag ?? null, guilds: client.guilds.cache.size, commands: registry.count() },
    "INFERA is online",
  );

  await Promise.allSettled(
    [...client.guilds.cache.values()].map((guild) => ensureGuild(client, guild)),
  );

  await syncCommandDefinitions(client).catch((error: unknown) =>
    log.error({ err: error }, "could not sync command definitions"),
  );

  // Discord caps global slash commands at 100. Register the overflow in each
  // guild scope so the full command set remains reachable from slash.
  const overflow = registry.slashOverflow(100).map(buildSlashData);
  if (overflow.length > 0) {
    await Promise.allSettled(
      [...client.guilds.cache.values()].map((guild) =>
        guild.commands
          .set(overflow)
          .catch((error: unknown) =>
            log.warn({ err: error, guildId: guild.id }, "could not register guild slash commands"),
          ),
      ),
    );
  }

  startHeartbeat(client);

  await client.services.realtime
    .publish(null, "bot.ready", {
      userId: user?.id ?? null,
      guilds: client.guilds.cache.size,
      commands: registry.count(),
    })
    .catch(() => undefined);
}
