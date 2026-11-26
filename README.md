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
   DEV_GUILD_ID=your-test-server-id   # optional: instant slash commands in one server
   LOG_LEVEL=debug
   NODE_ENV=development
   ```

   `DEV_GUILD_ID` is optional. Leaving it empty registers commands globally, which can take up to an hour to appear. Setting it to a test server ID registers commands there instantly.

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

## Status

The project follows an 8-milestone roadmap. M1 (foundation), M2 (database & settings), M3 (Location and Prayer Times), M4 (scheduling and duplicate protection), M5 (text announcements), M6 (voice announcements), and M7 (slash commands and setup/settings flows) are implemented; hardening and live end-to-end verification (M8) remain. See [`Docs/development/implementation-roadmap.md`](./Docs/development/implementation-roadmap.md) for current status and known gaps.

## License

ISC
