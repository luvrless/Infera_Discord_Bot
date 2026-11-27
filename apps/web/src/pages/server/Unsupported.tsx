import { Construction, Terminal } from "lucide-react";
import { Link, useLocation, useParams } from "react-router-dom";
import { PageHeader } from "../../components/cards";
import { Card } from "../../components/ui/primitives";
import { serverPath } from "../../lib/nav";
import { useGuild } from "../../hooks/useGuild";

/** Features the bot has, or the spec asks for, without a dashboard API yet. */
const FEATURES: Record<string, { title: string; summary: string; commands: string[]; needs: string[] }> = {
  reputation: {
    title: "Reputation",
    summary: "Members give each other reputation points with bot commands.",
    commands: ["reputation", "rep", "repstats"],
    needs: ["GET /guilds/:id/reputation (leaderboard)", "Config keys for cooldowns and announcements"],
  },
  events: {
    title: "Events",
    summary: "Community events are created and cancelled with bot commands.",
    commands: ["event", "events", "eventcreate", "eventcancel"],
    needs: ["GET/POST /guilds/:id/events", "POST /guilds/:id/events/:eventId/cancel"],
  },
  reminders: {
    title: "Reminders",
    summary: "Reminders are personal and created by members with bot commands.",
    commands: ["remind", "reminders", "reminderdelete"],
    needs: ["A guild-scoped reminder listing endpoint for staff"],
  },
  "embed-builder": {
    title: "Embed Builder",
    summary: "Custom embeds are built and sent with bot commands.",
    commands: ["embed", "embedcreate", "embededit", "embedpreview"],
    needs: ["POST /guilds/:id/messages (send an embed to a channel)", "Saved embed templates"],
  },
};

export function UnsupportedPage() {
  const { guildId } = useGuild();
  const { feature } = useParams();
  const location = useLocation();
  const key = feature ?? location.pathname.split("/").pop() ?? "";
  const info = FEATURES[key] ?? { title: key.replace(/-/g, " "), summary: "This feature has no dashboard API yet.", commands: [], needs: [] };
  return (
    <div>
      <PageHeader title={info.title} icon={Construction} description="Not available in the dashboard yet." />
      <Card className="max-w-2xl p-6">
        <p className="text-13 text-zinc-300">{info.summary}</p>
        <p className="mt-2 text-13 text-zinc-500">
          The INFERA backend doesn't expose an API for it, so the dashboard can't show or change it without inventing data. It's listed as a backend requirement in the integration report.
        </p>
        {info.commands.length ? (
          <div className="mt-5">
            <p className="eyebrow mb-2">Available in Discord now</p>
            <div className="flex flex-wrap gap-1.5">
              {info.commands.map((command) => (
                <Link key={command} to={`${serverPath(guildId, "commands")}?command=${command}`} className="inline-flex items-center gap-1 rounded-md border border-ink-600 bg-ink-800 px-2 py-1 font-mono text-xs text-zinc-200 hover:border-accent/50">
                  <Terminal className="h-3 w-3 text-zinc-500" /> {command}
                </Link>
              ))}
            </div>
          </div>
        ) : null}
        {info.needs.length ? (
          <div className="mt-5">
            <p className="eyebrow mb-2">Backend requirements</p>
            <ul className="space-y-1 font-mono text-xs text-zinc-400">
              {info.needs.map((need) => (
                <li key={need}>· {need}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
