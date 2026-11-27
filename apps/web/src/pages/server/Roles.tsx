import { useMutation, useQueryClient } from "@tanstack/react-query";
import { LayoutPanelTop, ListChecks, MousePointerClick, Plus, Send, SmilePlus, Trash2, Users, X } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "../../components/cards";
import { DiscordMessagePreview } from "../../components/discord/Preview";
import { ChannelName, ChannelPicker, RolePicker } from "../../components/ui/pickers";
import { Badge, Button, Callout, Card, CardHeader, Field, Segmented, TextArea, TextInput, Unsupported } from "../../components/ui/primitives";
import { ConfirmDialog, Modal } from "../../components/ui/overlays";
import { EmptyState, ErrorState, SkeletonRows } from "../../components/ui/states";
import { useToast } from "../../components/ui/toast";
import { errorMessage } from "../../lib/api/client";
import { communityApi, useRolePanels } from "../../lib/api/community";
import { useRoles } from "../../lib/api/guilds";
import { keys } from "../../lib/api/keys";
import type { RolePanel } from "../../lib/api/types";
import { useGuild } from "../../hooks/useGuild";
import { AutorolesCard } from "./Welcome";

interface OptionDraft {
  roleId: string | null;
  label: string;
  emoji: string;
}

function PanelBuilder({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { guildId } = useGuild();
  const roles = useRoles(guildId);
  const queryClient = useQueryClient();
  const toast = useToast();
  const [title, setTitle] = useState("Pick your roles");
  const [description, setDescription] = useState("Choose the roles you want below. Click again to remove a role.");
  const [mode, setMode] = useState<"button" | "select">("button");
  const [channelId, setChannelId] = useState<string | null>(null);
  const [options, setOptions] = useState<OptionDraft[]>([{ roleId: null, label: "", emoji: "" }]);
  const update = (index: number, patch: Partial<OptionDraft>) => setOptions((current) => current.map((option, i) => (i === index ? { ...option, ...patch } : option)));
  const valid = options.filter((option) => option.roleId);
  const duplicate = new Set(valid.map((option) => option.roleId)).size !== valid.length;
  const managed = valid.filter((option) => roles.data?.find((role) => role.id === option.roleId)?.managed);

  const create = useMutation({
    mutationFn: () =>
      communityApi.createRolePanel(guildId, {
        title: title.trim(),
        description: description.trim() || undefined,
        mode,
        channelId: channelId ?? undefined,
        options: valid.map((option) => ({
          roleId: option.roleId!,
          label: option.label.trim() || roles.data?.find((role) => role.id === option.roleId)?.name || "Role",
          emoji: option.emoji.trim() || undefined,
        })),
      }),
    onSuccess: () => {
      toast.success("Role panel saved", "Publish it to post it in Discord.");
      void queryClient.invalidateQueries({ queryKey: keys.rolePanels(guildId) });
      onClose();
    },
    onError: (error) => toast.error("Couldn't save the panel", errorMessage(error)),
  });

  const previewOptions = valid.map((option) => ({ label: option.label || roles.data?.find((role) => role.id === option.roleId)?.name || "Role", emoji: option.emoji || null }));
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title="New role panel"
      description="Members click buttons or pick from a menu to give themselves roles."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={create.isPending} disabled={!title.trim() || valid.length === 0 || duplicate || managed.length > 0} onClick={() => create.mutate()}>
            Save panel
          </Button>
        </>
      }
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <Field label="Panel name" required>
            <TextInput value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} />
          </Field>
          <Field label="Description">
            <TextArea rows={3} maxLength={2000} value={description} onChange={(event) => setDescription(event.target.value)} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Style">
              <Segmented value={mode} onChange={setMode} options={[{ value: "button", label: <span className="flex items-center gap-1"><MousePointerClick className="h-3 w-3" /> Buttons</span> }, { value: "select", label: <span className="flex items-center gap-1"><ListChecks className="h-3 w-3" /> Select menu</span> }]} />
            </Field>
            <Field label="Default channel">
              <ChannelPicker value={channelId} onChange={setChannelId} />
            </Field>
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="label">Roles ({valid.length}/25)</p>
              <Button size="sm" variant="ghost" icon={<Plus className="h-3.5 w-3.5" />} disabled={options.length >= 25} onClick={() => setOptions((current) => [...current, { roleId: null, label: "", emoji: "" }])}>
                Add role
              </Button>
            </div>
            <div className="space-y-2">
              {options.map((option, index) => (
                <div key={index} className="grid gap-2 rounded-lg border border-ink-700 bg-ink-900/60 p-2.5 sm:grid-cols-[1.4fr_1fr_70px_auto]">
                  <RolePicker value={option.roleId} onChange={(roleId) => update(index, { roleId })} />
                  <TextInput value={option.label} maxLength={80} placeholder="Label" onChange={(event) => update(index, { label: event.target.value })} />
                  <TextInput value={option.emoji} maxLength={8} placeholder="🎮" aria-label="Emoji" onChange={(event) => update(index, { emoji: event.target.value })} />
                  <button type="button" aria-label="Remove role" onClick={() => setOptions((current) => current.filter((_, i) => i !== index))} className="btn-icon text-zinc-500 hover:text-red-400">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
            {duplicate ? <p className="mt-2 text-xs text-red-400">Each role can only appear once.</p> : null}
            {managed.length ? <p className="mt-2 text-xs text-red-400">Integration-managed roles can't be self-assigned.</p> : null}
            <p className="hint mt-2">Emoji must be a unicode emoji. Custom server emoji and min/max selection limits aren't supported by the panel API — select menus allow choosing any number of roles.</p>
          </div>
        </div>
        <div>
          <p className="label mb-2">Live preview</p>
          <DiscordMessagePreview
            embed={{ title, description: description || "Choose the roles you want below.", footer: "INFERA self roles" }}
            buttons={mode === "button" ? previewOptions.map((option) => ({ label: option.label, emoji: option.emoji })) : undefined}
            select={mode === "select" ? { placeholder: "Choose your roles", options: previewOptions } : null}
          />
          <Callout tone="info" className="mt-3">
            INFERA's highest role must be above every role on the panel, and it needs <span className="font-medium">Manage Roles</span>. Discord enforces this when a member clicks.
          </Callout>
        </div>
      </div>
    </Modal>
  );
}

function PanelCard({ panel }: { panel: RolePanel }) {
  const { guildId, canConfigure } = useGuild();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [publishing, setPublishing] = useState(false);
  const [channelId, setChannelId] = useState<string | null>(panel.channelId);
  const [remove, setRemove] = useState(false);
  const publish = useMutation({
    mutationFn: () => communityApi.publishRolePanel(guildId, panel.id, channelId ?? undefined),
    onSuccess: (data) => {
      toast.success("Panel published", `Discord confirmed message ${data.messageId}.`);
      setPublishing(false);
      void queryClient.invalidateQueries({ queryKey: keys.rolePanels(guildId) });
    },
    onError: (error) => toast.error("Discord didn't accept the panel", errorMessage(error)),
  });
  const del = useMutation({
    mutationFn: () => communityApi.deleteRolePanel(guildId, panel.id),
    onSuccess: () => {
      toast.success("Panel deleted");
      setRemove(false);
      void queryClient.invalidateQueries({ queryKey: keys.rolePanels(guildId) });
    },
    onError: (error) => toast.error("Couldn't delete the panel", errorMessage(error)),
  });
  const options = panel.options.map((option) => ({ label: option.label, emoji: option.emoji }));
  return (
    <Card className="flex flex-col">
      <div className="flex items-start justify-between gap-3 px-5 pt-4">
        <div>
          <p className="text-sm font-medium text-zinc-100">{panel.title}</p>
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-zinc-500">
            <Badge>{panel.mode === "select" ? "Select menu" : "Buttons"}</Badge>
            {panel.options.length} roles
            {panel.channelId ? <> · <ChannelName id={panel.channelId} /></> : null}
          </p>
        </div>
      </div>
      <div className="flex-1 p-4">
        <DiscordMessagePreview
          embed={{ title: panel.title, description: panel.description || "Choose the roles you want below.", footer: "INFERA self roles" }}
          buttons={panel.mode === "button" ? options : undefined}
          select={panel.mode === "select" ? { placeholder: "Choose your roles", options } : null}
        />
      </div>
      {canConfigure ? (
        <div className="flex justify-end gap-2 border-t border-ink-700 px-5 py-3">
          <Button size="sm" variant="danger-ghost" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => setRemove(true)}>
            Delete
          </Button>
          <Button size="sm" variant="primary" icon={<Send className="h-3.5 w-3.5" />} onClick={() => setPublishing(true)}>
            Publish
          </Button>
        </div>
      ) : null}
      <Modal
        open={publishing}
        onClose={() => setPublishing(false)}
        size="sm"
        title={`Publish “${panel.title}”`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPublishing(false)}>
              Cancel
            </Button>
            <Button variant="primary" disabled={!channelId} loading={publish.isPending} onClick={() => publish.mutate()}>
              Publish to Discord
            </Button>
          </>
        }
      >
        <Field label="Channel" required hint="Publishing again posts a new copy; older copies keep working.">
          <ChannelPicker value={channelId} onChange={setChannelId} />
        </Field>
      </Modal>
      <ConfirmDialog open={remove} onClose={() => setRemove(false)} onConfirm={() => del.mutate()} loading={del.isPending} title={`Delete “${panel.title}”?`} description="Buttons on published copies of this panel will stop working." confirmLabel="Delete panel" />
    </Card>
  );
}

export function RolesPage() {
  const { guildId, canConfigure } = useGuild();
  const panels = useRolePanels(guildId);
  const [building, setBuilding] = useState(false);
  return (
    <div>
      <PageHeader title="Roles" icon={Users} description="Automatic roles for new members and self-role panels." />
      <div className="space-y-4">
        <AutorolesCard />
        <Card>
          <CardHeader
            title="Role panels"
            description="Button and select-menu self roles."
            icon={<LayoutPanelTop className="h-4 w-4" />}
            action={canConfigure ? <Button size="sm" variant="primary" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setBuilding(true)}>New panel</Button> : null}
          />
          <div className="p-4">
            {panels.isLoading ? (
              <SkeletonRows rows={2} />
            ) : panels.error ? (
              <ErrorState error={panels.error} compact onRetry={() => void panels.refetch()} />
            ) : (panels.data ?? []).length === 0 ? (
              <EmptyState compact icon={LayoutPanelTop} title="No role panels yet" description="Build a panel with buttons or a select menu, preview it, then publish it to a channel." action={canConfigure ? <Button variant="primary" onClick={() => setBuilding(true)}>Build a panel</Button> : undefined} />
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                {(panels.data ?? []).map((panel) => (
                  <PanelCard key={panel.id} panel={panel} />
                ))}
              </div>
            )}
          </div>
          <div className="border-t border-ink-700 px-5 py-3 text-2xs text-zinc-600">Editing a saved panel isn't supported by the API — delete it and build a new one.</div>
        </Card>
        <Unsupported title="Reaction roles">
          <span className="inline-flex items-center gap-1"><SmilePlus className="h-3 w-3" /> Reaction roles are managed with the bot's reactionrole commands; there's no dashboard endpoint for them yet.</span>
        </Unsupported>
      </div>
      <PanelBuilder key={building ? "open" : "closed"} open={building} onClose={() => setBuilding(false)} />
    </div>
  );
}
