import "dotenv/config";
import { buildSlashData, registry } from "@infera/commands";
import { createLogger, loadEnv } from "@infera/shared";
import { REST, Routes } from "discord.js";

/**
 * Deploy the slash-command set. Discord allows 100 global commands; the
 * registry ranks by permission level before truncating.
 *
 *   npm run register                 # global (can take up to an hour to appear)
 *   npm run register -- --guild <id> # instant, single server
 */
async function main(): Promise<void> {
  const env = loadEnv();
  const log = createLogger("bot:register");
  const rest = new REST({ version: "10" }).setToken(env.DISCORD_TOKEN);

  const guildFlag = process.argv.indexOf("--guild");
  const guildId = guildFlag >= 0 ? process.argv[guildFlag + 1] : undefined;

  if (guildId) {
    // Guild scope carries the commands that do not fit in the global 100.
    const commands = registry.slashOverflow(100).map(buildSlashData);
    await rest.put(Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID, guildId), {
      body: commands,
    });
    log.info({ count: commands.length, guildId }, "registered guild slash commands");
    return;
  }

  const commands = registry.slashCommands(100).map(buildSlashData);
  await rest.put(Routes.applicationCommands(env.DISCORD_CLIENT_ID), { body: commands });
  log.info(
    { count: commands.length, overflow: registry.slashOverflow(100).length },
    "registered global slash commands; guild overflow is registered on join",
  );
}

main().catch((error: unknown) => {
  console.error("Failed to register slash commands:", error);
  process.exitCode = 1;
});
