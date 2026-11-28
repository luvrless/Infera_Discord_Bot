import { buildSlashData, registry } from "@infera/commands";
import { createLogger } from "@infera/shared";
import { ActivityType } from "discord.js";
import type { InferaClient } from "../client";
import { syncCommandDefinitions } from "../lib/command-sync";
import { ensureGuild } from "../lib/guilds";
import { startHeartbeat } from "../lib/heartbeat";
import { deliverUpdateNotices } from "../lib/update-notices";

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

  // Operator panel: presence and blacklisted servers, refreshed every minute.
  const applyPlatform = async () => {
    const state = await client.services.platform.state();
    const types = { playing: ActivityType.Playing, watching: ActivityType.Watching, listening: ActivityType.Listening, competing: ActivityType.Competing, custom: ActivityType.Custom } as const;
    client.user?.setPresence({
      status: state.presence.status,
      activities: state.presence.activity === "none" || !state.presence.text ? [] : [{ name: state.presence.text, type: types[state.presence.activity], ...(state.presence.activity === "custom" ? { state: state.presence.text } : {}) }],
    });
    for (const guild of client.guilds.cache.values()) {
      if (await client.services.platform.isBlacklisted("guild", guild.id)) {
        log.warn({ guildId: guild.id }, "leaving blacklisted server");
        await guild.leave().catch(() => undefined);
      }
    }
  };
  await applyPlatform().catch((error: unknown) => log.warn({ err: error }, "platform state failed"));
  setInterval(() => void applyPlatform().catch(() => undefined), 60_000).unref();

  // Close tickets that went quiet (per-server "auto close after" setting).
  setInterval(() => {
    client.services.tickets.closeInactive().catch((error: unknown) => log.warn({ err: error }, "auto-close failed"));
  }, 10 * 60 * 1000).unref();

  // Release-note DMs to server owners run in the background and never block startup.
  setTimeout(() => {
    deliverUpdateNotices(client).catch((error: unknown) =>
      log.warn({ err: error }, "could not deliver update notices"),
    );
  }, 30_000);

  await client.services.realtime
    .publish(null, "bot.ready", {
      userId: user?.id ?? null,
      guilds: client.guilds.cache.size,
      commands: registry.count(),
    })
    .catch(() => undefined);
}
