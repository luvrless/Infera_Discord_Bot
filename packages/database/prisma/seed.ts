import { getPrisma } from "../src/index";

/**
 * Seed script. Command definitions are synchronised from the live command
 * registry when the bot boots, so there is no static command seed here.
 * This script simply verifies connectivity and ensures the schema exists.
 */
async function main(): Promise<void> {
  const prisma = getPrisma();
  const guilds = await prisma.guild.count();
  console.log(`Database reachable. Guilds: ${guilds}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await getPrisma().$disconnect();
  });
