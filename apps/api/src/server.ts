import { apiHost, apiPort, services } from "./lib/config";
import { createApp } from "./app";

/**
 * Render's free plan stops a service after 15 minutes without inbound HTTP
 * traffic, which would also take the Discord bot offline. Ping our own public
 * URL every 10 minutes so the service never idles. (A Cloudflare cron on
 * infera.wtf pings it from outside as well.)
 */
function startKeepAlive(log: { warn: (obj: object, msg: string) => void }): void {
  const base = (process.env.RENDER_EXTERNAL_URL ?? process.env.API_PUBLIC_URL ?? "").replace(/\/$/, "");
  if (!base.startsWith("https://")) return;
  const ping = () =>
    fetch(`${base}/v1/status`, { signal: AbortSignal.timeout(20_000), headers: { "user-agent": "infera-keepalive" } }).catch(
      (error: unknown) => log.warn({ err: error }, "keep-alive ping failed"),
    );
  setInterval(() => void ping(), 10 * 60 * 1000).unref();
  setTimeout(() => void ping(), 60_000).unref();
}

async function main(): Promise<void> {
  const app = createApp();
  try {
    await app.listen({ host: apiHost, port: apiPort });
    app.log.info({ host: apiHost, port: apiPort }, "INFERA dashboard API ready");
    startKeepAlive(app.log);
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
