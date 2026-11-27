import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, CalendarClock, CheckCircle2, Crown, EyeOff, Globe2, Lightbulb, MessageSquareQuote, Music, ShieldCheck, Star, ThumbsDown, ThumbsUp, Users, Volume2, XCircle } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { MetricCard, PageHeader, StatGrid } from "../../components/cards";
import { ConfigPage, SettingsSection } from "../../components/config/engine";
import { GuildIcon } from "../../components/layout/ServerSwitcher";
import { UserChip } from "../../components/ui/pickers";
import { Badge, Button, Callout, Card, CardHeader, Field, Tabs, TextArea, Unsupported } from "../../components/ui/primitives";
import { Modal } from "../../components/ui/overlays";
import { EmptyState, ErrorState, SkeletonRows } from "../../components/ui/states";
import { useToast } from "../../components/ui/toast";
import { errorMessage } from "../../lib/api/client";
import { engagementApi, useSuggestions } from "../../lib/api/engagement";
import { keys } from "../../lib/api/keys";
import type { Suggestion } from "../../lib/api/types";
import { serverPath } from "../../lib/nav";
import { formatDate, guildBannerUrl, timeAgo } from "../../lib/utils";
import { useGuild } from "../../hooks/useGuild";

// ----------------------------------------------------------- suggestions

export function SuggestionsPage() {
  const { guildId, canModerate } = useGuild();
  const suggestions = useSuggestions(guildId);
  const queryClient = useQueryClient();
  const toast = useToast();
  const [tab, setTab] = useState<"pending" | "approved" | "denied" | "settings">("pending");
  const [review, setReview] = useState<{ suggestion: Suggestion; decision: "approved" | "denied" } | null>(null);
  const [note, setNote] = useState("");
  const decide = useMutation({
    mutationFn: () => engagementApi.reviewSuggestion(guildId, review!.suggestion.id, review!.decision, note.trim() || undefined),
    onSuccess: () => {
      toast.success(review?.decision === "approved" ? "Suggestion approved" : "Suggestion denied", "The Discord post is updated by INFERA.");
      setReview(null);
      setNote("");
      void queryClient.invalidateQueries({ queryKey: keys.suggestions(guildId) });
    },
    onError: (error) => toast.error("Couldn't review the suggestion", errorMessage(error)),
  });
  const list = (suggestions.data ?? []).filter((entry) => entry.status === tab);
  const count = (status: string) => (suggestions.data ?? []).filter((entry) => entry.status === status).length;

  return (
    <ConfigPage>
      <PageHeader title="Suggestions" icon={Lightbulb} description="Community ideas with voting and staff review." />
      <Tabs
        className="mb-5"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "pending", label: "Pending", count: count("pending") },
          { id: "approved", label: "Approved", count: count("approved") },
          { id: "denied", label: "Denied", count: count("denied") },
          { id: "settings", label: "Settings" },
        ]}
      />
      {tab === "settings" ? (
        <div className="max-w-2xl">
          <SettingsSection id="suggestions" title="Suggestion workflow" icon={<Lightbulb className="h-4 w-4" />} configKeys={["suggestions.enabled", "suggestions.channel_id", "suggestions.review_channel", "suggestions.approval_roles", "suggestions.allow_anonymous"]} />
        </div>
      ) : suggestions.isLoading ? (
        <SkeletonRows />
      ) : suggestions.error ? (
        <Card>
          <ErrorState error={suggestions.error} onRetry={() => void suggestions.refetch()} />
        </Card>
      ) : list.length === 0 ? (
        <Card>
          <EmptyState icon={Lightbulb} title={`No ${tab} suggestions`} description="Members submit suggestions with the suggest command." />
        </Card>
      ) : (
        <div className="space-y-3">
          {list.map((suggestion) => (
            <Card key={suggestion.id} className="p-4">
              <div className="flex items-start gap-4">
                <div className="flex shrink-0 flex-col items-center gap-1 rounded-lg border border-ink-700 bg-ink-900 px-2.5 py-2 text-xs">
                  <span className="flex items-center gap-1 text-emerald-400"><ThumbsUp className="h-3 w-3" />{suggestion.upvotes}</span>
                  <span className="flex items-center gap-1 text-red-400"><ThumbsDown className="h-3 w-3" />{suggestion.downvotes}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="whitespace-pre-wrap break-words text-13 text-zinc-100">{suggestion.content}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                    {suggestion.anonymous ? (
                      <span className="flex items-center gap-1">
                        <EyeOff className="h-3 w-3" /> Anonymous{suggestion.userId ? <> · <UserChip userId={suggestion.userId} size={16} /></> : null}
                      </span>
                    ) : (
                      <UserChip userId={suggestion.userId} size={16} />
                    )}
                    <span>· {timeAgo(suggestion.createdAt)}</span>
                    {suggestion.reviewerId ? (
                      <span className="flex items-center gap-1">
                        · reviewed by <UserChip userId={suggestion.reviewerId} size={16} />
                      </span>
                    ) : null}
                  </div>
                  {suggestion.reviewNote ? <p className="mt-2 rounded-md bg-ink-900 px-3 py-2 text-xs text-zinc-400">{suggestion.reviewNote}</p> : null}
                </div>
                {suggestion.status === "pending" && canModerate ? (
                  <div className="flex shrink-0 flex-col gap-1.5 sm:flex-row">
                    <Button size="sm" variant="danger-ghost" icon={<XCircle className="h-3.5 w-3.5" />} onClick={() => setReview({ suggestion, decision: "denied" })}>
                      Deny
                    </Button>
                    <Button size="sm" variant="primary" icon={<CheckCircle2 className="h-3.5 w-3.5" />} onClick={() => setReview({ suggestion, decision: "approved" })}>
                      Approve
                    </Button>
                  </div>
                ) : (
                  <Badge tone={suggestion.status === "approved" ? "success" : suggestion.status === "denied" ? "danger" : "warning"}>{suggestion.status}</Badge>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
      <Modal
        open={Boolean(review)}
        onClose={() => setReview(null)}
        size="sm"
        title={review?.decision === "approved" ? "Approve suggestion" : "Deny suggestion"}
        footer={
          <>
            <Button variant="ghost" onClick={() => setReview(null)}>
              Cancel
            </Button>
            <Button variant={review?.decision === "approved" ? "primary" : "danger"} loading={decide.isPending} onClick={() => decide.mutate()}>
              {review?.decision === "approved" ? "Approve" : "Deny"}
            </Button>
          </>
        }
      >
        <Field label="Note to the community (optional)">
          <TextArea rows={3} maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} />
        </Field>
      </Modal>
    </ConfigPage>
  );
}

// ----------------------------------------------------------- confessions

export function ConfessionsPage() {
  return (
    <ConfigPage>
      <PageHeader title="Confessions" icon={MessageSquareQuote} description="Members post anonymously through INFERA. Authors are never shown in the dashboard." />
      <div className="grid gap-4 xl:grid-cols-2">
        <SettingsSection id="confessions" title="Confessions" icon={<MessageSquareQuote className="h-4 w-4" />} configKeys={["confessions.enabled", "confessions.channel_id"]} />
        <Unsupported title="Moderation queue and filters">
          There's no API for listing confessions or configuring a review queue. Confession content goes through AutoMod like any other message.
        </Unsupported>
      </div>
    </ConfigPage>
  );
}

// ------------------------------------------------------------- starboard

export function StarboardPage() {
  return (
    <ConfigPage>
      <PageHeader title="Starboard" icon={Star} description="Repost messages that collect enough reactions to a highlights channel." />
      <div className="max-w-2xl">
        <SettingsSection id="starboard" title="Starboard" icon={<Star className="h-4 w-4" />} configKeys={["starboard.enabled", "starboard.channel_id", "starboard.threshold", "starboard.emoji", "starboard.ignore_self_reactions"]} />
      </div>
    </ConfigPage>
  );
}

// --------------------------------------------------------------- identity

export function IdentityPage() {
  const { detail } = useGuild();
  const guild = detail.guild;
  const banner = guildBannerUrl(guild.id, guild.banner);
  return (
    <div>
      <PageHeader title="Server identity" icon={Globe2} description="How your server presents itself, read live from Discord." />
      <Card className="overflow-hidden">
        <div className="relative h-40 bg-gradient-to-br from-ink-700 via-ink-800 to-ink-900" style={banner ? { background: `center / cover url(${banner})` } : undefined}>
          {!banner ? <p className="absolute bottom-3 right-4 text-2xs text-zinc-600">No server banner</p> : null}
        </div>
        <div className="flex flex-col gap-4 px-6 pb-6 sm:flex-row sm:items-end">
          <div className="-mt-10 rounded-2xl border-4 border-ink-850">
            <GuildIcon guild={guild} size={80} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-zinc-50">{guild.name}</h2>
            <p className="mt-1 text-13 text-zinc-400">{guild.description ?? <span className="text-zinc-600">No server description set (Community servers only).</span>}</p>
          </div>
        </div>
      </Card>
      <StatGrid className="mt-4">
        <MetricCard label="Members" value={guild.memberCount} icon={Users} />
        <MetricCard label="Boost level" value={`Tier ${guild.premiumTier}`} icon={Star} tone="accent" />
        <MetricCard label="Created" value={formatDate(guild.createdAt, false)} icon={CalendarClock} hint={timeAgo(guild.createdAt)} />
        <Card className="p-4">
          <p className="text-xs font-medium text-zinc-500">Owner</p>
          <div className="mt-2.5 flex items-center gap-1.5">
            {guild.ownerId ? <UserChip userId={guild.ownerId} size={22} /> : <span className="text-zinc-600">—</span>}
            {guild.userIsOwner ? <Crown className="h-3.5 w-3.5 text-amber-400" /> : null}
          </div>
        </Card>
      </StatGrid>
      <div className="mt-4">
        <Unsupported title="Editing the name, icon, banner or description">
          The INFERA API reads server identity but has no endpoint to update it. Change these in Discord's Server Settings.
        </Unsupported>
      </div>
      <p className="mt-3 font-mono text-2xs text-zinc-600">Server ID {guild.id}</p>
    </div>
  );
}

// ----------------------------------------------------------- verification

export function VerificationPage() {
  const { values } = useGuild();
  return (
    <ConfigPage>
      <PageHeader title="Verification" icon={ShieldCheck} description="Gate access behind a role that members receive once verified." />
      {values["security.verification_enabled"] && !values["security.verification_role"] ? <Callout tone="warning" className="mb-4">Verification is on but no verified role is selected.</Callout> : null}
      <div className="grid gap-4 xl:grid-cols-2">
        <SettingsSection id="verification" title="Verification gate" icon={<ShieldCheck className="h-4 w-4" />} configKeys={["security.verification_enabled", "security.verification_role"]} />
        <div className="space-y-3">
          <Card className="p-4 text-xs leading-relaxed text-zinc-400">
            Members verify with the bot's <span className="font-mono text-zinc-200">verify</span> command. Staff can manage individual members with <span className="font-mono text-zinc-200">verify</span> / <span className="font-mono text-zinc-200">unverify</span>. Raid protection's account-age check lives under Security.
          </Card>
          <Unsupported title="Verification panels and captcha flows">There's no API to publish a verification button panel yet.</Unsupported>
        </div>
      </div>
    </ConfigPage>
  );
}

// ------------------------------------------------------------------ voice

export function VoicePage() {
  return (
    <ConfigPage>
      <PageHeader title="Voice" icon={Volume2} description="Join-to-create temporary voice channels." />
      <div className="grid gap-4 xl:grid-cols-2">
        <SettingsSection
          id="voice"
          title="Temporary voice channels"
          icon={<Volume2 className="h-4 w-4" />}
          configKeys={["voice.enabled", "voice.lobby_channel_id", "voice.category_id", "voice.default_limit", "voice.default_bitrate", "voice.allow_user_control"]}
          overrides={{ "voice.default_bitrate": { description: "Bits per second (8,000 – 384,000). Higher than your boost tier allows is capped by Discord." } }}
        />
        <Card className="p-5 text-xs leading-relaxed text-zinc-400">
          <p className="mb-2 text-13 font-medium text-zinc-200">How it works</p>
          Members join the lobby channel and INFERA creates a personal channel in the selected category, moving them into it. Empty temporary channels are deleted automatically. INFERA needs <span className="text-zinc-200">Manage Channels</span> and <span className="text-zinc-200">Move Members</span>.
        </Card>
      </div>
    </ConfigPage>
  );
}

// ------------------------------------------------------------------ music

export function MusicPage() {
  return (
    <ConfigPage>
      <PageHeader title="Music" icon={Music} description="Playback limits and DJ permissions for the music module." />
      <div className="grid gap-4 xl:grid-cols-2">
        <SettingsSection id="music" title="Music" icon={<Music className="h-4 w-4" />} configKeys={["music.enabled", "music.default_volume", "music.max_volume", "music.queue_limit", "music.dj_roles", "music.provider"]} />
        <Unsupported title="Live player controls and queue">
          The API exposes music configuration only. Now-playing, queue and playback controls need a player endpoint and an audio backend connected to the bot.
        </Unsupported>
      </div>
    </ConfigPage>
  );
}

// ---------------------------------------------------------- announcements

export function AnnouncementsPage() {
  const { guildId } = useGuild();
  return (
    <div>
      <PageHeader title="Announcements" icon={Bell} description="Announcements are delivered through INFERA's scheduled messages." />
      <Card>
        <EmptyState
          icon={CalendarClock}
          title="Schedule an announcement"
          description="Write the message, pick a channel and a time — the INFERA worker posts it. Instant broadcast and recurring announcements aren't available in the API."
          action={
            <Link to={serverPath(guildId, "schedules")} className="btn-primary">
              Open schedules
            </Link>
          }
        />
      </Card>
    </div>
  );
}
