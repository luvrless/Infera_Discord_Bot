import { registry } from "@infera/commands";
import { createLogger } from "@infera/shared";
import type { InferaClient } from "../client";

const log = createLogger("bot:commands-sync");

/** Mirror the live command registry into the database for the dashboard. */
export async function syncCommandDefinitions(client: InferaClient): Promise<void> {
  const manifest = registry.manifest();
  await client.services.db.$transaction(
    manifest.map((entry) =>
      client.services.db.commandDefinition.upsert({
        where: { id: entry.name },
        create: {
          id: entry.name,
          description: entry.description,
          category: entry.category,
          aliases: JSON.stringify(entry.aliases),
          defaultLevel: entry.level,
          cooldownMs: entry.cooldownMs,
          guildOnly: entry.guildOnly,
          enabled: true,
        },
        update: {
          description: entry.description,
          category: entry.category,
          aliases: JSON.stringify(entry.aliases),
          defaultLevel: entry.level,
          cooldownMs: entry.cooldownMs,
          guildOnly: entry.guildOnly,
        },
      }),
    ),
  );
  log.info({ count: manifest.length }, "command definitions synced");
}
