import type { ReactNode } from "react";

export interface PreviewEmbed {
  enabled: boolean;
  title: string;
  description: string;
  color: string;
}

export function DiscordPreview({
  content,
  embed,
  username,
  avatarUrl,
  channelName,
  timestamp,
}: {
  content: string;
  embed?: PreviewEmbed;
  username: string;
  avatarUrl: string;
  channelName: string;
  timestamp?: string;
}) {
  const sample = (value: string) =>
    value
      .replaceAll("{user}", `@${username}`)
      .replaceAll("{username}", username)
      .replaceAll("{user_id}", "1425174545723293848")
      .replaceAll("{server}", channelName)
      .replaceAll("{server_name}", channelName)
      .replaceAll("{member_count}", "1,248")
      .replaceAll("{server_icon}", "")
      .replaceAll("{created_at}", "2021-04-12")
      .replaceAll("{joined_at}", "2026-11-26")
      .replaceAll("{inviter}", "inviter")
      .replaceAll("{level}", "12");

  const color = /^#[0-9a-fA-F]{6}$/.test(embed?.color ?? "") ? embed?.color : "#8b5cf6";

  return (
    <div className="rounded-lg border border-ink-700 bg-[#313338] p-3 text-[#dbdee1]">
      <div className="flex items-center gap-2 border-b border-black/20 pb-2 text-2xs text-[#949ba4]">
        <span className="text-[#80848e]">#</span>
        <span>{channelName.replace(/^#/, "")}</span>
      </div>
      <div className="mt-3 flex gap-3">
        <img src={avatarUrl} alt="" className="h-10 w-10 shrink-0 rounded-full bg-[#1e1f22]" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium text-[#f2f3f5]">{username}</span>
            <span className="rounded bg-[#5865f2] px-1 py-px text-[9px] font-semibold uppercase text-white">Bot</span>
            <span className="text-2xs text-[#949ba4]">{timestamp ?? "Today at 12:00"}</span>
          </div>
          <p className="mt-0.5 whitespace-pre-wrap break-words text-sm">{sample(content)}</p>
          {embed?.enabled ? (
            <div
              className="mt-2 max-w-md rounded border-l-4 bg-[#2b2d31] px-3 py-2.5"
              style={{ borderColor: color }}
            >
              {embed.title ? (
                <p className="text-sm font-semibold text-[#f2f3f5]">{sample(embed.title)}</p>
              ) : null}
              <p className="whitespace-pre-wrap break-words text-[13px] text-[#dbdee1]">
                {sample(embed.description || content) || "Embed description"}
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function PreviewFrame({ children, title = "Preview" }: { children: ReactNode; title?: string }) {
  return (
    <div className="space-y-2">
      <p className="text-2xs font-medium uppercase tracking-wider text-zinc-500">{title}</p>
      {children}
    </div>
  );
}
