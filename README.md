# Mudhakkir

A Discord bot that delivers prayer-time reminders to servers, with both text announcements and sequential voice-channel announcements. Calculations run entirely offline using astronomical data — no external API calls at runtime.

## Features

- **Offline prayer calculation** — uses `adhan` for local astronomical computation with multiple calculation methods.
- **Text announcements** — configurable mention (`@everyone` or specific role) delivered to a chosen text channel.
- **Voice announcements** — sequential per-guild audio playback across eligible voice channels with strict eligibility rules.
- **Durable scheduling** — in-process timer scheduler with delivery ledger preventing duplicate reminders across restarts.
- **Server settings** — persistent configuration via SQLite; survives process restarts.
- **Slash commands** — guided `/setup`, `/settings`, `/prayer-times`, `/test`, `/enable`, `/disable`.

## Tech stack

- TypeScript (ESM), Node.js 20+
- `discord.js` v14
- `better-sqlite3` for persistence
- `pino` for structured logging
- `tsyringe` for dependency injection
- `zod` for validation

## Project layout

```text
src/
├── app/                 # Composition root, bootstrap, config, shutdown
├── discord/             # Client, commands, flows, adapters
├── infrastructure/      # Shared SQLite connection/migrations, logging, audio
├── modules/             # Domain: settings, location, prayer-times, scheduling, reminders; each owns its store adapter
└── shared/              # DI tokens, errors, clock, logger contract
Docs/                    # Product, architecture, technical, development docs
```

See [`Docs/`](./Docs/) for product requirements, business rules, system architecture, code structure, technical design, and the implementation roadmap.

## Getting started

### Prerequisites

- Node.js 20 or newer
- npm 10 or newer
- A Discord application/bot token from the [Discord Developer Portal](https://discord.com/developers/applications)

### Setup

1. Clone the repository.
2. Copy `.env.example` to `.env` and fill in your values:

   ```env
   DISCORD_TOKEN=your-bot-token
   CLIENT_ID=your-application-id
   DEV_GUILD_ID=your-test-server-id   # optional: instant overrides (comma-separate several servers)
   LOG_LEVEL=debug
   NODE_ENV=development
   ```

   Slash commands are **always registered globally**, so they work in every server the bot joins (Discord may cache them for up to an hour). `DEV_GUILD_ID` is optional and adds instant guild-scoped overrides for test servers; comma-separate several IDs if needed.

3. Install dependencies:

   ```bash
   npm install
   ```

4. Run in development mode:

   ```bash
   npm run dev
   ```

5. Build for production:

   ```bash
   npm run build
   npm start
   ```

### Invite the bot for local testing

In the Discord Developer Portal → **OAuth2 → URL Generator**, select scopes `bot` and `applications.commands`, and bot permissions **View Channel**, **Send Messages**, **Mention Everyone**, **Connect**, and **Speak**. Open the generated URL and authorize the bot in your test server. Leave privileged gateway intents disabled. `/setup` uses Discord's native channel/role pickers, so Developer Mode is not required. `/test` output is labelled `[TEST]` and suppresses mentions — it never pings members or touches the delivery ledger.

### Testing

```bash
npm test
```

### Running continuously

- Docker: `docker compose up -d --build`. The named volume keeps `data/mudhakkir.db` across container recreation.
- Hosts that replace the app directory on redeploy (e.g. FadeHost/Laplace): set `DB_PATH` to a **full file path outside the app directory**, such as `/data/mudhakkir/mudhakkir.db`. Without it, the default `data/mudhakkir.db` is wiped with each deploy.
- Headless Linux: install `systemd/mudhakkir.service`, put the checkout at `/opt/mudhakkir` and `.env` beside it, then `systemctl enable --now mudhakkir`.
- Shutdown is graceful: it drains in-flight announcements (`SHUTDOWN_GRACE_MS`, default 10 s), closes Discord and SQLite, and flushes logs.
- Backup and restore instructions are in [`Docs/operations/backup-and-recovery.md`](./Docs/operations/backup-and-recovery.md).

### Live verification checklist

After starting the bot, confirm the logs show `Slash commands registered` with `scope: 'global'` (plus `scope: 'guild'` for `DEV_GUILD_ID`), `/setup` completes in your server, `/enable` arms reminders, and `/test type:text` shows a `[TEST]` message without pinging anyone. Global commands can take up to an hour to appear in other servers; add those server IDs to `DEV_GUILD_ID` for instant overrides.

## Status

All 8 roadmap milestones are implemented. M1–M7 cover the feature set; M8 adds graceful shutdown, fatal process traps, an end-to-end virtual-clock test, and deployment/backup artifacts. Offline verification is complete (101 tests); live 24/7 Discord verification and real recitation audio remain manual sign-off items. See [`Docs/development/implementation-roadmap.md`](./Docs/development/implementation-roadmap.md) for current status and known gaps.

## License

ISC
