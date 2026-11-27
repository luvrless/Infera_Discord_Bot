import { ErrorCode, InferaError } from "@infera/shared";
import { env } from "./config";

const DISCORD_API = "https://discord.com/api/v10";
const DISCORD_TOKEN = "https://discord.com/api/oauth2/token";

export interface DiscordTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

export interface DiscordProfile {
  id: string;
  username: string;
  global_name?: string | null;
  avatar?: string | null;
  bot?: boolean;
  locale?: string | null;
}

export interface DiscordGuildSummary {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  permissions: string;
  features?: string[];
}

async function request<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new InferaError(`Discord request failed (${response.status})`, {
      code: ErrorCode.EXTERNAL_API_UNAVAILABLE,
      details: [{ status: response.status, body: body.slice(0, 400), url }],
      expose: false,
    });
  }
  return (await response.json()) as T;
}

export function buildAuthorizeUrl(state: string): string {
  const url = new URL("https://discord.com/oauth2/authorize");
  url.searchParams.set("client_id", env.DISCORD_CLIENT_ID);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", env.DISCORD_REDIRECT_URI);
  url.searchParams.set("scope", "identify guilds");
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "consent");
  return url.toString();
}

export function exchangeCode(code: string): Promise<DiscordTokenResponse> {
  return request<DiscordTokenResponse>(DISCORD_TOKEN, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.DISCORD_CLIENT_ID,
      client_secret: env.DISCORD_CLIENT_SECRET,
      grant_type: "authorization_code",
      code,
      redirect_uri: env.DISCORD_REDIRECT_URI,
    }).toString(),
  });
}

export function refreshAccessToken(refreshToken: string): Promise<DiscordTokenResponse> {
  return request<DiscordTokenResponse>(DISCORD_TOKEN, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.DISCORD_CLIENT_ID,
      client_secret: env.DISCORD_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }).toString(),
  });
}

export function fetchProfile(accessToken: string): Promise<DiscordProfile> {
  return request<DiscordProfile>(`${DISCORD_API}/users/@me`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
}

export function fetchUserGuilds(accessToken: string): Promise<DiscordGuildSummary[]> {
  return request<DiscordGuildSummary[]>(`${DISCORD_API}/users/@me/guilds`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
}
