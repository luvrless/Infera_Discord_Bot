
## Release rule (always)

Before every bot/dashboard update that restarts the bot or changes behaviour, add a new
entry at the TOP of `packages/shared/src/changelog.ts` (unique `version`, include
`downtime` if the bot restarts). On startup the bot publishes it to every dashboard
(infera.wtf/dashboard/notifications) and DMs server owners who enabled update DMs.

Never reset or overwrite existing server configuration or user data. Database changes
must be additive (new tables/nullable columns, `IF NOT EXISTS`). New defaults apply only
to servers that never set the value.
