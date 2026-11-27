import { apiHost, apiPort, services } from "./lib/config";
import { createApp } from "./app";

async function main(): Promise<void> {
  const app = createApp();
  try {
    await app.listen({ host: apiHost, port: apiPort });
    app.log.info({ host: apiHost, port: apiPort }, "INFERA dashboard API ready");
  } catch (error) {
    app.log.error({ err: error }, "failed to start the API");
    process.exitCode = 1;
    return;
  }

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, "shutting down");
    await app.close().catch(() => undefined);
    await services.db.$disconnect().catch(() => undefined);
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

void main();
