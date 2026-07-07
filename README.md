# Discord VC Coin Bot

A Discord.js v14 bot that rewards users with coins for staying in voice channels, gives extra coins while they are Go Live streaming, and lets users spend coins to claim one-time keys.

The worker stores all balances, keys, settings, voice totals, and transactions in PostgreSQL, so it works with Vercel-compatible providers such as Neon, Supabase, or Railway Postgres. No production state is stored in local files.

## Important Vercel Note

This bot cannot fully run on Vercel only.

Discord bots require a long-running Gateway WebSocket connection to receive `voiceStateUpdate` events. Vercel serverless functions are short-lived, can sleep between requests, and are not designed to keep persistent WebSocket bot sessions online. If you run the Discord worker as a Vercel function, it will eventually stop receiving voice events and coin tracking will be unreliable.

Use this split instead:

- Vercel: optional API/dashboard endpoints, included here as `/api/health` and `/api/stats`.
- Railway, Render, Fly.io, Replit, or VPS: the always-on Discord bot worker, started with `npm run worker`.

## Features

- Tracks joins, leaves, moves, disconnects, mute/deafen changes, and streaming state changes through Discord voice state events.
- Rewards eligible users by interval, for example 1 coin every 5 minutes.
- Gives a configurable extra streaming bonus while a user is Go Live streaming.
- Blocks common AFK farming cases:
  - no coins while muted or deafened,
  - no coins while alone in the channel,
  - no coins inside the server AFK channel,
  - bot users are ignored.
- Stores balances, keys, settings, transactions, total VC time, and total live time in PostgreSQL.
- Slash commands for users and admins.
- Vercel-compatible API endpoints for health and stats.

## Project Structure

```text
src/
  index.js
  deploy-commands.js
  commands/
    addcoin.js
    addkey.js
    balance.js
    claim.js
    daily.js
    help.js
    leaderboard.js
    removecoin.js
    resetuser.js
    setrate.js
    stats.js
  events/
    interactionCreate.js
    ready.js
    voiceStateUpdate.js
  utils/
    database.js
    keyManager.js
    permissions.js
    rewards.js
api/
  health.js
  stats.js
package.json
.env.example
vercel.json
README.md
```

## Environment Variables

Copy `.env.example` to `.env` for local development.

```env
DISCORD_TOKEN=
CLIENT_ID=
GUILD_ID=
DATABASE_URL=
ADMIN_ROLE_ID=
CLAIM_COST=10
VC_REWARD_INTERVAL_MINUTES=5
VC_REWARD_AMOUNT=1
LIVE_BONUS_AMOUNT=1
DAILY_BONUS_AMOUNT=5
PGSSL=true
API_SECRET=
REGISTER_COMMANDS_ON_START=false
```

`LIVE_BONUS_AMOUNT` is extra coins on top of the normal VC reward. With `VC_REWARD_AMOUNT=1` and `LIVE_BONUS_AMOUNT=1`, streaming earns 2 coins per reward interval.

`API_SECRET` is optional. If set, call `/api/stats` with:

```bash
Authorization: Bearer YOUR_API_SECRET
```

## Database Setup

Use a hosted PostgreSQL database:

- Neon PostgreSQL
- Supabase PostgreSQL
- Railway PostgreSQL
- Render PostgreSQL

Create a database, copy the connection string, and set it as `DATABASE_URL`.

The bot automatically creates these tables on startup:

- `users`
- `keys`
- `guild_settings`
- `coin_transactions`
- `voice_sessions`

## Discord Developer Portal Setup

1. Go to the Discord Developer Portal.
2. Create an application.
3. Open the Bot page and create a bot.
4. Copy the bot token into `DISCORD_TOKEN`.
5. Copy the application ID into `CLIENT_ID`.
6. Enable these bot intents:
   - Server Members Intent: required for member and role checks.
   - Voice State access: used by the `GuildVoiceStates` gateway intent in code.
   - Message Content Intent: not required for this slash-command-only bot, but enable it only if you later add prefix/message commands.

## Invite the Bot

Use this URL format:

```text
https://discord.com/oauth2/authorize?client_id=YOUR_CLIENT_ID&scope=bot%20applications.commands&permissions=84992
```

Replace `YOUR_CLIENT_ID` with your application ID.

The included permission number covers View Channels, Send Messages, Embed Links, and Read Message History. The bot does not need to join voice channels because it only listens for voice state events.

For quick testing, you can use Discord's OAuth2 URL Generator with:

- Scopes: `bot`, `applications.commands`
- Bot permissions: View Channels, Send Messages, Embed Links, Read Message History

## Local Setup

```bash
npm install
cp .env.example .env
npm run deploy:commands
npm run worker
```

If `GUILD_ID` is set, commands deploy instantly to that server. If `GUILD_ID` is empty, commands deploy globally and can take up to 1 hour to appear.

On hosts where you cannot run a one-off command, set `REGISTER_COMMANDS_ON_START=true` and redeploy once. You can set it back to `false` after the commands appear.

## User Commands

- `/balance` - show your coin balance, total VC time, and live time.
- `/leaderboard` - show the top users by coins.
- `/claim` - spend coins to claim a key. The key is sent by DM.
- `/daily` - claim daily bonus coins.
- `/help` - show all commands.

## Admin Commands

Admin access is granted to users with `ADMIN_ROLE_ID`, Administrator, or Manage Server.

- `/addkey key:<text>` - add a new claimable key.
- `/addcoin user:<user> amount:<number>` - add coins.
- `/removecoin user:<user> amount:<number>` - remove coins.
- `/resetuser user:<user>` - reset a user's coins to 0.
- `/setrate` - update reward interval, base reward, live bonus, or claim cost.
- `/stats` - show bot statistics for the server.

## Reward Rules

Default example:

- Normal eligible VC: 1 coin every 5 minutes.
- Streaming eligible VC: 1 base coin plus 1 live bonus coin every 5 minutes.

A user is eligible only when:

- they are in a voice or stage channel,
- they are not self-muted, server-muted, self-deafened, or server-deafened,
- they are not suppressed as a stage audience member,
- they are not in the server AFK channel,
- at least one other non-bot user is in the same channel.

The reward loop runs every 30 seconds and pays out once enough eligible seconds have accumulated.

## Deploy the Bot Worker on Railway

1. Push this project to GitHub.
2. Create a new Railway project from the GitHub repository.
3. Add these environment variables in Railway:
   - `DISCORD_TOKEN`
   - `CLIENT_ID`
   - `GUILD_ID`
   - `DATABASE_URL`
   - `ADMIN_ROLE_ID`
   - `CLAIM_COST`
   - `VC_REWARD_INTERVAL_MINUTES`
   - `VC_REWARD_AMOUNT`
   - `LIVE_BONUS_AMOUNT`
4. Set the start command:

```bash
npm run worker
```

5. Deploy.
6. Run slash command deployment once from your local machine or a Railway shell:

```bash
npm run deploy:commands
```

## Deploy the Bot Worker on Render

1. Create a new Background Worker on Render.
2. Connect the GitHub repository.
3. Build command:

```bash
npm install
```

4. Start command:

```bash
npm run worker
```

5. Add the same environment variables listed above.
6. Deploy.

## Deploy the API on Vercel

This is optional. It does not run the Discord worker.

1. Import the GitHub repository into Vercel.
2. Set Vercel environment variables:
   - `DATABASE_URL`
   - `GUILD_ID`
   - `PGSSL=true`
   - `API_SECRET` if you want to protect `/api/stats`
3. Deploy.

Available endpoints:

- `GET /api/health` - confirms the API can connect to the database.
- `GET /api/stats` - returns stored stats for `GUILD_ID`.
- `GET /api/stats?guildId=SERVER_ID` - returns stats for a specific server.

## Production Notes

- Keep `DISCORD_TOKEN` only on the worker host unless your Vercel dashboard/API later needs Discord API calls.
- Do not use JSON files for keys or balances in production on Vercel. Serverless file storage is temporary.
- If users cannot receive claimed keys, ask them to enable DMs from server members. The bot refunds the claim if the DM fails.
- Hosted PostgreSQL providers usually require SSL. Leave `PGSSL=true` unless you are using a local database.
