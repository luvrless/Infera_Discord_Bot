import { EmbedBuilder } from "discord.js";
import { BRAND_COLOR, createLogger, getEnv, truncate } from "@infera/shared";
import type { PlatformNotificationView } from "@infera/services";
import type { InferaClient } from "../client";

const log = createLogger("bot:update-notices");
const DELAY_MS = 1_500;

function siteOrigin(): string {
  try {
    const origin = getEnv().WEB_APP_ORIGIN;
    if (origin.startsWith("https://")) return origin.replace(/\/$/, "");
  } catch {
    // fall through
  }
  return "https://infera.wtf";
}

function bullets(items: string[]): string {
  return truncate(items.map((item) => `• ${item}`).join("\n"), 1024);
}

export function updateEmbed(note: PlatformNotificationView, client: InferaClient): EmbedBuilder {
  const origin = siteOrigin();
  const embed = new EmbedBuilder()
    .setColor(note.kind === "maintenance" ? 0xfee75c : BRAND_COLOR)
    .setTitle(truncate(`INFERA update · ${note.title}`, 256))
    .setURL(`${origin}/dashboard/notifications`)
    .setDescription(truncate(note.summary || "INFERA was updated.", 4096))
    .setTimestamp(new Date(note.createdAt));
  const icon = client.user?.displayAvatarURL({ size: 128 });
  if (icon) embed.setThumbnail(icon);
  if (note.features.length) embed.addFields({ name: "New features", value: bullets(note.features) });
  if (note.fixes.length) embed.addFields({ name: "Fixes", value: bullets(note.fixes) });
  if (note.system.length) embed.addFields({ name: "System changes", value: bullets(note.system) });
  embed.addFields({
    name: "Downtime",
    value: truncate(note.downtime ?? "No downtime planned.", 1024),
  });
  embed.addFields({
    name: "Status",
    value: `INFERA is online and serving ${client.guilds.cache.size > 0 ? "your servers" : "servers"} normally. Live status: ${origin}/dashboard/status`,
  });
  embed.setFooter({ text: "You get this because you own a server with INFERA. Turn DMs off at infera.wtf/dashboard/notifications" });
  return embed;
}

/**
 * Store the newest release note and DM it once to every server owner who has
 * update DMs enabled. Runs in the background after the bot is ready; failures
 * never affect the bot. Only the bot process does this, so owners get one DM.
 */
export async function deliverUpdateNotices(client: InferaClient): Promise<void> {
  const service = client.services.platformNotifications;
  const row = await service.publishLatest();
  if (!row) return;
  const note = service.view(row);
  const recipients = await service.pendingRecipients(row.id);
  if (recipients.length === 0) return;
  log.info({ version: row.version, recipients: recipients.length }, "delivering update notices");
  const embed = updateEmbed(note, client);
  for (const userId of recipients) {
    const prefs = await service.preferences(userId).catch(() => ({ dmNotifications: true }));
    if (!prefs.dmNotifications) {
      await service.recordDelivery(row.id, userId, "skipped");
      continue;
    }
    try {
      const user = await client.users.fetch(userId);
      await user.send({ embeds: [embed] });
      await service.recordDelivery(row.id, userId, "sent");
    } catch (error) {
      log.debug({ err: error, userId }, "could not DM update notice");
      await service.recordDelivery(row.id, userId, "failed");
    }
    await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
  }
}
