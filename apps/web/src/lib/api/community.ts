import { useQuery } from "@tanstack/react-query";
import { api } from "./client";
import { keys } from "./keys";
import type {
  Autoresponder,
  CustomCommand,
  IntegrationsResponse,
  RolePanel,
  ScheduledMessage,
  SocialFeed,
  Ticket,
  TicketPanel,
  TicketsResponse,
  WebhookRow,
} from "./types";

const g = (guildId: string) => `/guilds/${guildId}`;

export const communityApi = {
  // tickets
  tickets: (id: string, status: string, signal?: AbortSignal) =>
    api.get<TicketsResponse>(`${g(id)}/tickets`, { status: status === "all" ? undefined : status }, signal),
  ticketAction: (id: string, ticketId: string, action: "claim" | "close" | "reopen" | "priority", body?: Record<string, unknown>) =>
    api.post<{ ticket: Ticket }>(`${g(id)}/tickets/${ticketId}/${action}`, body ?? {}),
  manageTicket: (id: string, ticketId: string, body: { action: "rename" | "add" | "remove"; name?: string; userId?: string }) =>
    api.post<{ ok: boolean }>(`${g(id)}/tickets/${ticketId}/manage`, body),
  createTicketPanel: (id: string, body: { title: string; description?: string; channelId?: string; categoryId?: string }) =>
    api.post<{ panel: TicketPanel }>(`${g(id)}/tickets/panels`, body),
  updateTicketPanel: (id: string, panelId: string, body: { title?: string; description?: string | null; channelId?: string | null; categoryId?: string | null }) =>
    api.patch<{ panel: TicketPanel }>(`${g(id)}/tickets/panels/${panelId}`, body),
  publishTicketPanel: (id: string, panelId: string, body: { channelId?: string; buttonLabel?: string; color?: string }) =>
    api.post<{ channelId: string; messageId: string }>(`${g(id)}/tickets/panels/${panelId}/publish`, body),
  deleteTicketPanel: (id: string, panelId: string) => api.del<{ removed: boolean }>(`${g(id)}/tickets/panels/${panelId}`),

  // roles
  autoroles: (id: string, signal?: AbortSignal) => api.get<{ roleIds: string[] }>(`${g(id)}/roles/autoroles`, undefined, signal),
  setAutoroles: (id: string, roleIds: string[]) => api.put<{ roleIds: string[] }>(`${g(id)}/roles/autoroles`, { roleIds }),
  rolePanels: (id: string, signal?: AbortSignal) => api.get<{ panels: RolePanel[] }>(`${g(id)}/roles/panels`, undefined, signal),
  createRolePanel: (
    id: string,
    body: { title: string; description?: string; mode: "button" | "select"; channelId?: string; options: Array<{ roleId: string; label: string; emoji?: string }> },
  ) => api.post<{ panel: RolePanel }>(`${g(id)}/roles/panels`, body),
  publishRolePanel: (id: string, panelId: string, channelId?: string) =>
    api.post<{ messageId: string; channelId: string }>(`${g(id)}/roles/panels/${panelId}/publish`, { channelId }),
  deleteRolePanel: (id: string, panelId: string) => api.del<{ removed: boolean }>(`${g(id)}/roles/panels/${panelId}`),

  // automation
  customCommands: (id: string, signal?: AbortSignal) =>
    api.get<{ commands: CustomCommand[] }>(`${g(id)}/custom-commands`, undefined, signal),
  createCustomCommand: (id: string, body: Partial<CustomCommand>) => api.post<{ command: CustomCommand }>(`${g(id)}/custom-commands`, body),
  updateCustomCommand: (id: string, commandId: string, body: Partial<CustomCommand>) =>
    api.patch<{ command: CustomCommand }>(`${g(id)}/custom-commands/${commandId}`, body),
  deleteCustomCommand: (id: string, commandId: string) => api.del<{ removed: boolean }>(`${g(id)}/custom-commands/${commandId}`),

  autoresponders: (id: string, signal?: AbortSignal) =>
    api.get<{ autoresponders: Autoresponder[] }>(`${g(id)}/autoresponders`, undefined, signal),
  createAutoresponder: (id: string, body: Partial<Autoresponder>) => api.post<{ autoresponder: Autoresponder }>(`${g(id)}/autoresponders`, body),
  updateAutoresponder: (id: string, arId: string, body: Partial<Autoresponder>) =>
    api.patch<{ autoresponder: Autoresponder }>(`${g(id)}/autoresponders/${arId}`, body),
  deleteAutoresponder: (id: string, arId: string) => api.del<{ removed: boolean }>(`${g(id)}/autoresponders/${arId}`),

  schedules: (id: string, signal?: AbortSignal) =>
    api.get<{ messages: ScheduledMessage[] }>(`${g(id)}/scheduled-messages`, undefined, signal),
  createSchedule: (id: string, body: { channelId: string; content: string; runAt: string }) =>
    api.post<{ task: { id: string } }>(`${g(id)}/scheduled-messages`, body),
  deleteSchedule: (id: string, taskId: string) => api.del<{ removed: boolean }>(`${g(id)}/scheduled-messages/${taskId}`),

  // integrations
  integrations: (id: string, signal?: AbortSignal) => api.get<IntegrationsResponse>(`${g(id)}/integrations`, undefined, signal),
  toggleProvider: (id: string, provider: string, enabled: boolean) =>
    api.patch<{ provider: string; enabled: boolean }>(`${g(id)}/integrations/${provider}`, { enabled }),
  addFeed: (id: string, body: { provider: string; sourceId: string; channelId: string }) =>
    api.post<{ feed: SocialFeed }>(`${g(id)}/social-feeds`, body),
  updateFeed: (id: string, feedId: string, body: { enabled?: boolean; channelId?: string }) =>
    api.patch<{ feed: SocialFeed }>(`${g(id)}/social-feeds/${feedId}`, body),
  removeFeed: (id: string, feedId: string) => api.del<{ removed: boolean }>(`${g(id)}/social-feeds/${feedId}`),
  createWebhook: (id: string, body: { url: string; events: string[] }) =>
    api.post<{ webhook: WebhookRow; secret: string }>(`${g(id)}/webhooks`, body),
  updateWebhook: (id: string, webhookId: string, body: { enabled?: boolean; events?: string[] }) =>
    api.patch<{ webhook: WebhookRow }>(`${g(id)}/webhooks/${webhookId}`, body),
  deleteWebhook: (id: string, webhookId: string) => api.del<{ removed: boolean }>(`${g(id)}/webhooks/${webhookId}`),
  testWebhook: (id: string, webhookId: string) =>
    api.post<{ delivery: { id: string; status: string; responseStatus: number | null; lastError: string | null; createdAt: string } }>(`${g(id)}/webhooks/${webhookId}/test`, {}),
  webhookDeliveries: (id: string, webhookId: string) =>
    api.get<{ deliveries: Array<{ id: string; event: string; status: string; responseStatus: number | null; lastError: string | null; createdAt: string }> }>(`${g(id)}/webhooks/${webhookId}/deliveries`),
  testRoblox: (id: string) =>
    api.post<{ ok: boolean; sampleUser: { id: number; name: string; displayName: string } }>(`${g(id)}/integrations/roblox/test`, {}),
};

export function useTickets(guildId: string, status: string) {
  return useQuery({
    queryKey: keys.tickets(guildId, status),
    queryFn: ({ signal }) => communityApi.tickets(guildId, status, signal),
  });
}

export function useAutoroles(guildId: string) {
  return useQuery({
    queryKey: keys.autoroles(guildId),
    queryFn: ({ signal }) => communityApi.autoroles(guildId, signal),
    select: (data) => data.roleIds,
  });
}

export function useRolePanels(guildId: string) {
  return useQuery({
    queryKey: keys.rolePanels(guildId),
    queryFn: ({ signal }) => communityApi.rolePanels(guildId, signal),
    select: (data) => data.panels,
  });
}

export function useCustomCommands(guildId: string) {
  return useQuery({
    queryKey: keys.customCommands(guildId),
    queryFn: ({ signal }) => communityApi.customCommands(guildId, signal),
    select: (data) => data.commands,
  });
}

export function useAutoresponders(guildId: string) {
  return useQuery({
    queryKey: keys.autoresponders(guildId),
    queryFn: ({ signal }) => communityApi.autoresponders(guildId, signal),
    select: (data) => data.autoresponders,
  });
}

export function useSchedules(guildId: string) {
  return useQuery({
    queryKey: keys.schedules(guildId),
    queryFn: ({ signal }) => communityApi.schedules(guildId, signal),
    select: (data) => data.messages,
  });
}

export function useIntegrations(guildId: string) {
  return useQuery({ queryKey: keys.integrations(guildId), queryFn: ({ signal }) => communityApi.integrations(guildId, signal) });
}
