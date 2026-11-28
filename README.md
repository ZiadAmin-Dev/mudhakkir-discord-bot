# Mudhakkir

Mudhakkir is a Discord bot that reminds a server when it is time for prayer. It calculates prayer times on its own computer — no prayer-time website or API is used — and can send both a text reminder and an audio announcement in voice channels.

## What it can do

- Gives you the five prayer times for your configured city and timezone.
- Sends a text reminder at each prayer time with either `@everyone` or one chosen role.
- Plays a short recitation in eligible voice channels shortly before each prayer.
- Remembers each server's settings across restarts and avoids sending the same reminder twice.
- Gives administrators simple slash commands to set everything up.

## Run it on your computer

You will need Node.js (22+ recommended; the Docker image uses 22), npm, and a Discord bot application from the [Discord Developer Portal](https://discord.com/developers/applications).

1. Copy the example environment file:

   ```bash
   cp .env.example .env
   ```

2. Fill in the two required values in `.env` (never share your token):

   ```env
   DISCORD_TOKEN=your_bot_token
   CLIENT_ID=your_application_id
   ```

   Optional settings are explained in the file itself:
   - `DEV_GUILD_ID` — makes commands appear instantly in one or more test servers.
   - `DB_PATH` — moves the SQLite database to persistent storage.
   - `LOG_LEVEL` and `NODE_ENV` — logging and runtime mode.
   - `SHUTDOWN_GRACE_MS` — how long to wait for announcements when stopping.

3. Install and start:

   ```bash
   npm install
   npm run dev
   ```

   The bot logs in to Discord and prints `Mudhakkir connected to Discord Gateway successfully` when it is ready.

## Invite the bot to your server

In the Developer Portal, go to **OAuth2 → URL Generator**:

- Scopes: `bot` and `applications.commands`
- Permissions: **View Channel**, **Send Messages**, **Mention Everyone**, **Connect**, **Speak**

Open the generated URL and authorize the bot in your test server. You do not need to enable privileged gateway intents.

## Using the bot

| Command | What it does |
| --- | --- |
| `/setup` | Guided setup: choose country, city (or default), reminder channel, mention target, and lead time. |
| `/enable` | Turn on automatic reminders after setup. |
| `/disable` | Pause automatic reminders. |
| `/prayer-times` | Show today's five prayer times for your configured location. |
| `/settings` | View your settings and change the voice lead time. |
| `/test` | Try the text or voice announcement safely. Test messages are labelled `[TEST]` and never ping anyone. |

New servers may take up to an hour to show global slash commands. If you want commands instantly in a test server, add its ID to `DEV_GUILD_ID` and restart the bot.

## Keeping it online

- **Docker:** `docker compose up -d --build`. The `data` volume keeps your database safe when the container is rebuilt.
- **Linux server:** use `systemd/mudhakkir.service`; put the app in `/opt/mudhakkir` and your `.env` beside it.
- **FadeHost/Laplace:** it replaces the app directory on each deploy, so set `DB_PATH` to a real file outside it, for example:

  ```env
  DB_PATH=/data/mudhakkir/mudhakkir.db
  ```

Backups and restore steps are in [`Docs/operations/backup-and-recovery.md`](./Docs/operations/backup-and-recovery.md).

## Developer checks

```bash
npm test          # all unit and integration tests
npx tsc --noEmit  # type check
npm run build     # compile and copy SQL migrations
npm start         # run the compiled app
```

## Where to learn more

- [`AGENTS.md`](./AGENTS.md) — practical guide for coding agents.
- [`Docs/`](./Docs/) — product rules, architecture, technical decisions, conventions, roadmap, and operations.

## Status

All eight roadmap milestones are implemented. The offline test suite has 103 passing tests. Live 24/7 Discord verification is still a manual step. See [`Docs/development/implementation-roadmap.md`](./Docs/development/implementation-roadmap.md) for details.

## License

ISC
