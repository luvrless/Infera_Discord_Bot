import { Fragment, type ReactNode } from "react";
import { LogoMark } from "../layout/Logo";

export interface PreviewEmbed {
  color?: string;
  author?: string;
  title?: string;
  description?: string;
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
  thumbnail?: string | null;
  image?: string | null;
  footer?: string;
  timestamp?: boolean;
}

export interface PreviewButton {
  label: string;
  emoji?: string | null;
  style?: "primary" | "secondary";
}

/** Minimal, safe Discord markdown: escapes everything, then styles a subset. */
function renderInline(text: string): ReactNode[] {
  const tokens: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|__[^_]+__|`[^`]+`|<@!?\d+>|<#\d+>|@everyone|@here|\{[a-z_]+\})/g;
  let last = 0;
  let index = 0;
  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0;
    if (start > last) tokens.push(text.slice(last, start));
    const token = match[0];
    const key = `t${index++}`;
    if (token.startsWith("**")) tokens.push(<strong key={key} className="font-semibold text-white">{token.slice(2, -2)}</strong>);
    else if (token.startsWith("__")) tokens.push(<u key={key}>{token.slice(2, -2)}</u>);
    else if (token.startsWith("*")) tokens.push(<em key={key}>{token.slice(1, -1)}</em>);
    else if (token.startsWith("`")) tokens.push(<code key={key} className="rounded bg-[#2b2d31] px-1 py-0.5 font-mono text-[0.85em]">{token.slice(1, -1)}</code>);
    else if (token.startsWith("<#")) tokens.push(<span key={key} className="rounded bg-[#5865f2]/30 px-0.5 text-[#c9cdfb]">#channel</span>);
    else if (token.startsWith("<@") || token.startsWith("@")) tokens.push(<span key={key} className="rounded bg-[#5865f2]/30 px-0.5 text-[#c9cdfb]">{token.startsWith("<@") ? "@member" : token}</span>);
    else tokens.push(<span key={key} className="rounded bg-amber-500/15 px-0.5 font-mono text-[0.85em] text-amber-200">{token}</span>);
    last = start + token.length;
  }
  if (last < text.length) tokens.push(text.slice(last));
  return tokens;
}

export function DiscordText({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <>
      {lines.map((line, index) => (
        <Fragment key={index}>
          {renderInline(line)}
          {index < lines.length - 1 ? <br /> : null}
        </Fragment>
      ))}
    </>
  );
}

export function DiscordMessagePreview({
  content,
  embed,
  buttons,
  select,
  botName = "INFERA",
  substitutions,
}: {
  content?: string;
  embed?: PreviewEmbed | null;
  buttons?: PreviewButton[];
  select?: { placeholder: string; options: Array<{ label: string; emoji?: string | null }> } | null;
  botName?: string;
  substitutions?: Record<string, string>;
}) {
  const sub = (value: string | undefined) => {
    if (!value) return "";
    if (!substitutions) return value;
    return Object.entries(substitutions).reduce((text, [key, replacement]) => text.split(key).join(replacement), value);
  };
  const time = new Date().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  const text = sub(content);
  const hasEmbed = embed && (embed.title || embed.description || embed.author || embed.fields?.length || embed.footer || embed.image);

  return (
    <div className="rounded-lg bg-[#313338] p-4 font-[system-ui] text-[15px] leading-[1.375] text-[#dbdee1]" aria-label="Discord message preview">
      <div className="flex gap-4">
        <LogoMark size={40} className="shrink-0 rounded-full" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="font-medium text-white">{botName}</span>
            <span className="rounded bg-[#5865f2] px-1 text-[10px] font-semibold uppercase leading-4 text-white">App</span>
            <span className="text-xs text-[#949ba4]">Today at {time}</span>
          </div>
          {text ? (
            <div className="mt-0.5 whitespace-pre-wrap break-words">
              <DiscordText text={text} />
            </div>
          ) : null}
          {hasEmbed ? (
            <div className="mt-1.5 flex max-w-[520px] overflow-hidden rounded bg-[#2b2d31]">
              <div className="w-1 shrink-0" style={{ background: embed?.color ?? "#8B5CF6" }} />
              <div className="flex min-w-0 flex-1 gap-4 p-3 pr-4">
                <div className="min-w-0 flex-1">
                  {embed?.author ? <p className="mb-1 text-sm font-medium text-white">{sub(embed.author)}</p> : null}
                  {embed?.title ? <p className="mb-1 font-semibold text-white">{sub(embed.title)}</p> : null}
                  {embed?.description ? (
                    <div className="whitespace-pre-wrap break-words text-sm">
                      <DiscordText text={sub(embed.description)} />
                    </div>
                  ) : null}
                  {embed?.fields?.length ? (
                    <div className="mt-2 grid grid-cols-3 gap-2">
                      {embed.fields.map((field, index) => (
                        <div key={index} className={field.inline ? "col-span-1" : "col-span-3"}>
                          <p className="text-sm font-semibold text-white">{sub(field.name)}</p>
                          <p className="text-sm">{sub(field.value)}</p>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {embed?.image ? <img src={embed.image} alt="" className="mt-3 max-h-64 rounded" /> : null}
                  {embed?.footer || embed?.timestamp ? (
                    <p className="mt-2 text-xs text-[#949ba4]">
                      {sub(embed?.footer)}
                      {embed?.footer && embed?.timestamp ? " • " : ""}
                      {embed?.timestamp ? `Today at ${time}` : ""}
                    </p>
                  ) : null}
                </div>
                {embed?.thumbnail ? <img src={embed.thumbnail} alt="" className="h-16 w-16 shrink-0 rounded object-cover" /> : null}
              </div>
            </div>
          ) : null}
          {buttons?.length ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {buttons.slice(0, 25).map((button, index) => (
                <span
                  key={index}
                  className={
                    button.style === "primary"
                      ? "inline-flex h-8 items-center gap-1.5 rounded bg-[#5865f2] px-4 text-sm font-medium text-white"
                      : "inline-flex h-8 items-center gap-1.5 rounded bg-[#4e5058] px-4 text-sm font-medium text-white"
                  }
                >
                  {button.emoji ? <span>{button.emoji}</span> : null}
                  {button.label || "Button"}
                </span>
              ))}
            </div>
          ) : null}
          {select ? (
            <div className="mt-2 max-w-[400px] rounded border border-[#1e1f22] bg-[#1e1f22] px-3 py-2 text-sm text-[#949ba4]">
              {select.placeholder}
              <span className="float-right">▾</span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** Sample values for the preview; the real values are filled in by the bot. */
export function previewSubstitutions(input: { username: string; userId: string; serverName: string; memberCount: number }): Record<string, string> {
  return {
    "{user}": `@${input.username}`,
    "{username}": input.username,
    "{user_id}": input.userId,
    "{server}": input.serverName,
    "{server_name}": input.serverName,
    "{member_count}": String(input.memberCount),
    "{server_icon}": "",
    "{created_at}": new Date().toLocaleDateString(),
    "{joined_at}": new Date().toLocaleDateString(),
    "{inviter}": "inviter",
    "{level}": "12",
  };
}
