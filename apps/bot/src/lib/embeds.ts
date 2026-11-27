import { EmbedBuilder } from "discord.js";
import { BRAND_COLOR, truncate } from "@infera/shared";

export const Colors = {
  brand: BRAND_COLOR,
  success: 0x57f287,
  danger: 0xed4245,
  warning: 0xfee75c,
  info: 0x5865f2,
} as const;

export function parseColor(hex: string, fallback: number = BRAND_COLOR): number {
  return /^#[0-9a-fA-F]{6}$/.test(hex) ? Number.parseInt(hex.slice(1), 16) : fallback;
}

export interface CardOptions {
  title?: string;
  description?: string;
  color?: number;
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
  thumbnail?: string;
  footer?: string;
}

/** Build an INFERA-styled embed with Discord's hard limits applied. */
export function card(options: CardOptions): EmbedBuilder {
  const embed = new EmbedBuilder().setColor(options.color ?? BRAND_COLOR);
  if (options.title) embed.setTitle(truncate(options.title, 256));
  if (options.description) embed.setDescription(truncate(options.description, 4096));
  if (options.fields?.length) {
    embed.addFields(
      options.fields.slice(0, 25).map((field) => ({
        name: truncate(field.name, 256),
        value: truncate(field.value, 1024) || "—",
        inline: field.inline ?? false,
      })),
    );
  }
  if (options.thumbnail) embed.setThumbnail(options.thumbnail);
  if (options.footer) embed.setFooter({ text: truncate(options.footer, 2048) });
  return embed;
}
