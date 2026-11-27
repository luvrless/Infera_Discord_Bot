# INFERA Dashboard — Integration Report

The dashboard lives in `apps/web` (Vite + React 18 + TypeScript + Tailwind + TanStack Query + Recharts + Lucide). I kept that stack because it was already in the repo. The previous source is saved, untouched, in `apps/web/legacy-src-backup/`.

Every screen reads from and writes to the real INFERA API (`apps/api`). There's no mock data. When the backend has no data, the screen says so and shows no number. When a feature has no API, it's marked as unsupported (see §6).

---

## 1. Architecture

| Layer | Location |
|---|---|
| Typed API client (errors, abort, 401 broadcast, envelope tolerant) | `src/lib/api/client.ts` |
| Response types mirrored from route implementations | `src/lib/api/types.ts` |
| Domain endpoints + query hooks | `src/lib/api/{auth,guilds,moderation,engagement,community,system}.ts` |
| Guild‑scoped query keys (`["g", guildId, …]`) | `src/lib/api/keys.ts` |
| Auth / guild context / realtime / notifications / user resolution | `src/hooks/*` |
| Schema‑driven configuration engine | `src/components/config/engine.tsx` |
| App shell, sidebar, server switcher, topbar, ⌘K palette, notifications | `src/components/layout/*` |
| Design system (buttons, toggles, pickers, tables, modals, drawers, toasts, states) | `src/components/ui/*` |
| Pages (lazy-loaded per route group) | `src/pages/account`, `src/pages/server/*` |

Key behaviours:
- **Authentication.** The session is restored from the backend's HttpOnly `infera_session` cookie. Tokens never touch JS or storage. A 401 anywhere clears the cache and redirects to `/login?next=…`. The page you were trying to reach is restored after OAuth.
- **Authorization.** The UI hides or locks controls based on `level` and `scopes` from `GET /guilds/:id` and `/settings`. That's only a UI hint: the API re-checks every request.
- **Guild isolation.** All guild data is cached under `["g", guildId]`. Switching servers removes the previous guild's cache. Queries carry an `AbortSignal`, so stale responses are cancelled. Realtime events for any other guild are dropped on the client, on top of the server-side subscription check.
- **Config engine.** It loads `GET /config/schema` and renders each key by its type (toggle, number, duration, enum, colour, channel, category, role, multi-role, multi-channel, members, tags/regex, JSON). Edits are tracked as dirty drafts per section, and one sticky save bar covers the whole page. The engine sends only the changed keys, with `PATCH /guilds/:id/config { patch, expectedVersion }`. Backend validation errors are mapped onto the matching fields. A `409` shows a "changed elsewhere — reload" bar. Simple toggles persist immediately and show their loading state.
- **Realtime.** One WebSocket per tab (`/v1/ws`). It sends a heartbeat ping every 25 s, reconnects with exponential backoff and jitter, and restores its subscription on reconnect. Events are de-duplicated by `eventId`, the socket unsubscribes when you switch guilds, and it closes on logout. Incoming events trigger debounced cache invalidation, a live feed, and immediate toasts for security events.
- **Performance.** Each route group is a separate chunk. Searches are debounced. User IDs are batch-resolved: every `<UserChip>` on screen is coalesced into one `GET /users?ids=` call. Tables are paginated wherever the API paginates.

---

## 2. Backend changes made for the dashboard

Each change is a thin wrapper over an existing INFERA service. None of them duplicate business logic.

| Change | File | Why |
|---|---|---|
| **Realtime bridge**: the API relays bot, worker and service events to WebSocket clients. With Redis it uses pub/sub. Without Redis it uses a `SystemEvent` outbox (`source = "realtime"`, polled every 2 s, kept for 10 min). | `packages/services/src/realtime-service.ts`, `services/index.ts`, `apps/api/src/lib/{bridge,hub}.ts`, bot/worker/api `createServices` | Before this, bot events never reached the dashboard. The processes share no memory, and `REDIS_URL` is empty. |
| WebSocket accepts both `{type}` (implemented) and `{action}` (documented) | `apps/api/src/app.ts` | Docs and implementation disagreed. |
| Optimistic concurrency `expectedVersion` → `409 CONFLICT` | `apps/api/src/routes/guilds.ts` | Concurrent-edit protection. |
| Placeholder contract aligned | `apps/bot/src/lib/placeholders.ts`, `routes/guilds.ts` | **Discrepancy:** the API advertised `{username} {user_id} {server_name} {member_count} {server_icon} {created_at} {joined_at} {inviter}`, but the bot only replaced `{user.name} {user.tag} {user.id} {memberCount}`. The bot now supports both sets. `{inviter}` was removed because invite tracking doesn't back it. |
| Analytics window honours `days` (was capped at 30). History now includes `commandFails` and `economy`. | `analytics-service.ts`, `routes/system.ts` | "90 days" showed 30 days, and economy/failure totals were always 0. |
| Audit filter: `prefix=true` (starts-with) and `actorId` | `audit-service.ts`, `routes/system.ts` | Lets you filter the audit log by module and by user. |
| Anonymous suggestion authors are redacted below Administrator | `routes/community.ts` | They were exposed to every user with access to the server. |
| `ticket:open:<panelId>` button handler | `apps/bot/src/events/interaction-create.ts` | Ticket panels had no working button. |
| `unlockdown` command writes `security.unlockdown` to the audit log | `packages/commands/src/categories/security.ts` | So the lockdown state can be derived. |
| `DiscordApi.searchGuildMembers` | `discord-api.ts` | Powers the member picker. |
| New routes file | `apps/api/src/routes/dashboard.ts` | See §3. |

---

## 3. Connected endpoints

**Auth:** `GET /auth/discord` · `GET /auth/discord/callback` · `GET /auth/session` · `GET /auth/me/guilds` · `POST /auth/logout`

**Platform:** `GET /status` · `GET /notifications` · `GET /config/schema` · `GET /commands`

**Guild:** `GET /guilds/:id` · `/overview` · `/settings` · `/channels` · `/roles` · `/notifications` · `/welcome` · `PATCH /config` · `POST /config/reset` · `PATCH /modules/:moduleId` · `POST /test-message`

**New (dashboard.ts):** `GET /members/search?q=` · `GET /users?ids=` · `PATCH /moderation/cases/:caseId` · `POST /moderation/cases/:caseId/void` · `GET /moderation/history/:userId` · `GET /security/lockdown` · `POST /security/lockdown` · `POST /security/unlockdown` · `POST /tickets/:ticketId/manage` (rename/add/remove) · `POST /tickets/panels/:panelId/publish` · `GET /economy/users/:userId` · `POST /economy/users/:userId/adjust` (audited ledger credit/debit) · `PATCH /social-feeds/:feedId` · `PATCH /webhooks/:webhookId` · `GET /activity`

**Moderation:** `GET /moderation/stats` · `GET /moderation/cases` · `GET /moderation/cases/:id` · `POST /moderation/actions` (ban, unban, kick, softban, timeout, untimeout, warn) · `POST /moderation/purge` · `GET /moderation/warnings` · `DELETE /moderation/warnings/:id` · `GET /moderation/appeals` · `POST /moderation/appeals/:id/review`

**AutoMod / Security:** `GET /automod` · `PATCH /automod/rules/:type` · `POST /automod/test` · `GET /security` · `POST /security/whitelist` · `DELETE /security/whitelist/:id` · `POST /security/events/:id/resolve`

**Engagement:** `GET /leveling/stats` · `/leaderboard` · `/rewards` (GET/POST/DELETE) · `/exclusions` (GET/POST/DELETE) · `POST /leveling/reset` · `GET /economy/overview` · `/economy/transactions` · `/economy/items` (POST/PATCH/DELETE) · `GET/POST /giveaways` · `POST /giveaways/:id/{end,reroll,cancel}` · `GET /suggestions` · `POST /suggestions/:id/review`

**Community:** `GET /tickets` · `POST /tickets/:id/{claim,close,reopen,priority}` · `POST/DELETE /tickets/panels` · `GET/PUT /roles/autoroles` · `GET/POST/DELETE /roles/panels` · `POST /roles/panels/:id/publish`

**Automation:** `/custom-commands` (GET/POST/PATCH/DELETE) · `/autoresponders` (GET/POST/PATCH/DELETE) · `/scheduled-messages` (GET/POST/DELETE)

**System:** `GET /guilds/:id/commands` · `PATCH /guilds/:id/commands/:name` · `GET /analytics?days=` · `GET /audit`

**Integrations:** `GET /integrations` · `PATCH /integrations/:provider` · `POST/DELETE /social-feeds` · `POST/DELETE /webhooks`

## 4. Configuration keys

All keys in `packages/shared/src/config/registry.ts` are connected. Pages render them through the config engine, and **General → All settings** can edit every key by category. Purpose-built editors cover:

- `moderation.warning_thresholds`: escalation rule builder
- `welcome.*` / `goodbye.*`: message editor with variables and a live preview
- `automod.*`: per-rule cards that go through the rule endpoint
- `security.whitelist` / `security.trusted_roles`: managed through the whitelist endpoints

## 5. Realtime events consumed

The client maps every event family in `REALTIME_EVENTS` to cache invalidation:

| Events | Effect |
|---|---|
| `config.*`, `module.*`, `prefix.updated` | Config and module status |
| `moderation.*` | Cases, warnings, counts, activity feed |
| `security.*` | Toast + Security page, alerts, lockdown |
| `automod.*` | AutoMod |
| `leveling.*` · `economy.*` · `ticket.*` · `giveaway.*` · `suggestion.*` | Matching pages |
| `command.*`, `analytics.*` | Analytics and command usage |
| `member.*`, `guild.*`, `role.*`, `channel.*` | Detail, roles, channels |
| `bot.*` | Bot status |

## 6. Missing backend capabilities

These are marked in the UI as unsupported. None of them is faked.

| Dashboard feature | Needed |
|---|---|
| Social feed delivery | A worker poller per provider. Feeds are stored, but nothing posts. UI says so. |
| Webhook delivery, test, retries, history | A dispatcher with HMAC signing and a `WebhookDelivery` writer. Subscriptions are stored only. |
| Roblox "test connection" | The documented `/integrations/roblox/*` routes aren't implemented. |
| Reputation, Birthdays, Events, Polls, Reminders, Sticky messages, Embed builder, Reaction roles | Guild-scoped CRUD endpoints. These are command-only today. |
| Welcome image cards | `welcome.image.enabled` is stored, but the bot doesn't render cards, and there are no keys for background, avatar or text settings. |
| Welcome embed author/footer/fields/image/timestamp | Config keys. |
| Level rewards edit/reorder · role exclusions · include-lists · weekly/monthly leaderboards | `PATCH /leveling/rewards/:id`. Role exclusions return `NOT_IMPLEMENTED`. Time-windowed leaderboards. |
| Case date-range/status filters · active punishment count · "request more info" on appeals | Query params and aggregates. |
| Staff notes / duty / activity | Endpoints over the existing staff commands. |
| Ticket live messages, internal notes, panel edit | Endpoints. |
| Command syntax/args/examples, slash registration status, role/channel/user restrictions | A richer command manifest, and target-based permission overrides. |
| Antiraid response actions; per-detector antinuke thresholds | Config keys. |
| Server identity editing | `PATCH /guilds/:id/identity`. |
| Music player / queue | A player endpoint backed by an audio service. |
| API request usage and quotas | Per-guild request metering. The UI states "Not tracked". |
| Session list/revoke · notification preferences and server-side read state · account deletion | Account endpoints. |
| Bot multi-instance management | A platform-owner API. |

## 7. Remaining integration issues

1. **Run the bot from source.** The bot, API and worker run through `tsx --tsconfig tsconfig.runtime.json`, which loads source, so they must be restarted to load these changes. Packages that resolve to `packages/*/dist` (`tsc -b`) still have stale typings until rebuilt. `tsc -b` currently fails on 3 errors that were already there (`channel.send` on `PartialGroupDMChannel` in `commands/categories/community.ts`, `bot/events/message-create.ts`, `bot/lib/scheduler.ts`).
2. **Redis.** Without Redis, realtime uses the database outbox and arrives about 2 s late. Set `REDIS_URL` for instant pub/sub. That also turns the outbox off.
3. **Duplicate events.** Some API routes call `hub.broadcast` and the service also publishes the same event. The client de-duplicates invalidations, so this is harmless. Duplicate feed rows can still appear, so the `hub.broadcast` calls should eventually be removed.
4. **Production cookies.** The dashboard at `infera.wtf` and the API at `api.infera.wtf` need the session cookie scoped to `.infera.wtf` (or both served on the same origin through a reverse proxy). Set `VITE_API_BASE` and `VITE_WS_URL` accordingly. Add the dashboard origin to `WEB_APP_ORIGIN` and `API_CORS_ORIGINS`.
5. **Not verified in a browser.** The signed-in pages have not been checked in a browser yet. Discord sign-in is required, and the dev machine ran out of disk/pagefile during testing (~190 MB free on C:).

## 8. Running

```
# from the repo root
npx tsx --tsconfig tsconfig.runtime.json apps/api/src/server.ts
npx tsx --tsconfig tsconfig.runtime.json apps/bot/src/index.ts
npm run dev:web            # http://localhost:3000, proxies /v1 to :3001
npm run build:web          # type-check + production build to apps/web/dist
```
