import { env } from "./config";

const DISCORD_API = "https://discord.com/api/v10";
const UPDATE_PREFIX = "INFERA update · ";

interface DiscordMessage {
  id: string;
  author?: { id: string };
  embeds?: Array<{ title?: string }>;
}

async function discord(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${DISCORD_API}${path}`, {
    ...init,
    headers: { authorization: `Bot ${env.DISCORD_TOKEN}`, "content-type": "application/json", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(10_000),
  });
}

async function deleteMessage(channelId: string, messageId: string): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await discord(`/channels/${channelId}/messages/${messageId}`, { method: "DELETE" }).catch(() => null);
    if (!response) return false;
    if (response.status === 204 || response.status === 404) return true;
    if (response.status === 429) {
      const body = (await response.json().catch(() => ({}))) as { retry_after?: number };
      await new Promise((resolve) => setTimeout(resolve, Math.min(5_000, (body.retry_after ?? 1) * 1000)));
      continue;
    }
    return false;
  }
  return false;
}

/**
 * Delete INFERA update DMs the bot sent to a user. Uses stored message ids
 * and also scans the DM history for update embeds (covers DMs sent before ids
 * were stored). Only the bot's own update messages are touched.
 */
export async function deleteUpdateDms(
  userId: string,
  options: { stored: Array<{ channelId: string | null; messageId: string | null }>; titles: string[] | "all" },
): Promise<number> {
  let deleted = 0;
  const done = new Set<string>();
  for (const row of options.stored) {
    if (!row.channelId || !row.messageId) continue;
    if (await deleteMessage(row.channelId, row.messageId)) {
      deleted += 1;
      done.add(row.messageId);
    }
  }

  const channel = await discord("/users/@me/channels", { method: "POST", body: JSON.stringify({ recipient_id: userId }) })
    .then((response) => (response.ok ? (response.json() as Promise<{ id: string }>) : null))
    .catch(() => null);
  if (!channel) return deleted;

  const wanted = options.titles === "all" ? null : new Set(options.titles.map((title) => `${UPDATE_PREFIX}${title}`.slice(0, 256)));
  let before: string | undefined;
  for (let page = 0; page < 5; page += 1) {
    const query = new URLSearchParams({ limit: "100", ...(before ? { before } : {}) });
    const messages = await discord(`/channels/${channel.id}/messages?${query.toString()}`)
      .then((response) => (response.ok ? (response.json() as Promise<DiscordMessage[]>) : []))
      .catch(() => [] as DiscordMessage[]);
    if (messages.length === 0) break;
    for (const message of messages) {
      if (done.has(message.id) || message.author?.id !== env.DISCORD_CLIENT_ID) continue;
      const title = message.embeds?.[0]?.title ?? "";
      if (!title.startsWith(UPDATE_PREFIX)) continue;
      if (wanted && !wanted.has(title)) continue;
      if (await deleteMessage(channel.id, message.id)) deleted += 1;
    }
    before = messages[messages.length - 1]?.id;
    if (messages.length < 100) break;
  }
  return deleted;
}
