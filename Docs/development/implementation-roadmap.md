# Mudhakkir — MVP Implementation Roadmap

This document defines the practical, ordered engineering roadmap for implementing the Minimum Viable Product (MVP) of **Mudhakkir**, following the [System Architecture](../architecture/system-architecture.md), [Code Structure](../architecture/code-structure.md), and [Technical Design](../technical/technical-design.md).

Work is structured into 8 sequential milestones designed to minimize risk, validate core invariants early, and ensure every step builds strictly on tested foundation layers.

---

## Current implementation status

The repository contains a working M1/M2 foundation. This section is the authoritative summary of what exists; the milestone sections below retain the original plan and acceptance criteria.

| Milestone | Status | Notes |
| --- | --- | --- |
| **M1** | **Substantially implemented; partially verified** | Config validation, Pino logging, DI, Discord client creation, bootstrap, and signal-handling shutdown exist. `tsc --noEmit` and unit tests pass. A live Discord Gateway login has not been recorded in this repository. |
| **M2** | **Implemented and verified** | SQLite, WAL, migrations, `guild_settings`, `delivery_ledger` table, settings store/service, and Zod validation exist. `SettingsService` depends on an `ISettingsStore` port and a shared `Logger` contract, with `SettingsStore` as the infrastructure adapter. A close/reopen persistence test verifies restart durability. |
| **M3** | **Not started** | No `adhan` dependency, location module, or prayer calculation. |
| **M4** | **Not started** | No scheduler, event builder, ledger adapter, or clock. Only the ledger table exists. |
| **M5** | **Not started** | No text announcement builder or delivery adapter. |
| **M6** | **Not started** | No voice library, audio assets, or voice coordinator. |
| **M7** | **Not started** | No command router, authorization, or slash commands. |
| **M8** | **Not started** | No deployment descriptors, end-to-end suite, or completed crash boundaries. |

### Verified now

- `npx tsc --noEmit` passes.
- `npm test` reports 14 passing tests across four files: configuration, DI/composition, Discord client intents, and persistence/settings.
- Migrations create `guild_settings`, `delivery_ledger`, and `schema_migrations`.
- Settings can be saved, retrieved, partially updated, toggled, deleted, and reject invalid input.
- `SettingsService` depends on abstractions (`ISettingsStore` port and shared `Logger` contract), not concrete infrastructure types.
- The delivery ledger exists only as a table; its adapter and commit order/pruning remain out of scope for now.
- `tsc` does not copy SQL migrations into `dist`; the `build` script runs `copy-migrations.mjs` after `tsc`, which copies migrations to `dist/infrastructure/persistence/migrations` and exits non-zero if the migrations directory is missing.
- `unhandledRejection` is logged but does not terminate the process.

### Known gaps

- The delivery ledger exists only as a table; there is no adapter, commit order, or pruning.
- `SettingsService` imports concrete infrastructure types instead of a port and shared logger contract.
- `tsc` does not copy SQL migrations into `dist`; production startup needs an explicit copy/build step.
- `unhandledRejection` is logged but does not terminate the process.
- There is no close/reopen persistence test, so restart durability is not yet verified.
- Live Discord login and graceful shutdown against the real gateway have not been recorded as verified.

---

## Roadmap Overview

| Milestone | Focus Area | Primary Deliverables | Dependencies |
| :--- | :--- | :--- | :--- |
| **M1** | Project Initialization & Discord Bot Connection | TypeScript build toolchain, logging, config validation, Discord client connection, graceful shutdown. | None |
| **M2** | Database & Server Settings | SQLite setup, schema migrations, Settings service, and persistent CRUD operations. | M1 |
| **M3** | Location & Prayer-Time Calculation | Offline major cities data, Nominatim client, `adhan` calculation engine, IANA timezone handling. | M1 |
| **M4** | Prayer Scheduling & Duplicate Protection | In-process dynamic timer scheduler, event generation, delivery ledger, restart recovery. | M2, M3 |
| **M5** | Text Announcements & Configurable Mentions | Text reminder formatter, mention processor (`@everyone` vs role), text channel delivery adapter. | M1, M2, M4 |
| **M6** | Voice Announcements & Sequential Processing | Local audio assets, `@discordjs/voice` player, eligibility checker, per-guild voice coordinator. | M1, M2, M4 |
| **M7** | Slash Commands & Setup/Settings Flows | Command router, admin authorization, interactive `/setup`, `/settings`, `/prayer-times`, `/test`, `/enable`, `/disable`. | M2, M3, M5, M6 |
| **M8** | Testing, Error Handling & Deployment | End-to-end integration tests, crash boundaries, systemd/Docker deployment readiness. | M1–M7 |

---

## Milestone 1: Project Initialization & Discord Bot Connection

### Goal & Expected Outcome
Initialize the Node.js TypeScript project and configure the compiler, establish environment configuration validation using `zod`, initialize the `pino` logger, and establish a successful, authenticated Discord Gateway connection with graceful shutdown handling. A linter is not configured yet.

### Main Modules & Files Involved
- `package.json`, `tsconfig.json`, `.env.example`
- `src/index.ts` — Main executable entry point
- `src/app/config.ts` — Environment variables validation (`DISCORD_TOKEN`, `CLIENT_ID`, `LOG_LEVEL`) via Zod
- `src/infrastructure/logging/logger.ts` — Structured logger implementation (`pino`)
- `src/discord/client.ts` — Discord client initialization with required Gateway intents (`Guilds`, `GuildVoiceStates`)
- `src/app/bootstrap.ts` — Startup sequence
- `src/app/shutdown.ts` — Controlled process teardown on `SIGINT` / `SIGTERM`

### Dependencies
- None.

### Essential Tests & Acceptance Criteria
- [x] TypeScript compiles cleanly (`tsc --noEmit`). Verified.
- [x] Process fails immediately with an actionable error if `DISCORD_TOKEN` or `CLIENT_ID` is missing or invalid. Verified by unit tests.
- [ ] Bot logs in to Discord Gateway and emits a structured `ready` log with bot tag and client ID. Code exists; live login not yet recorded as verified.
- [ ] Sending `SIGINT` / `SIGTERM` cleanly destroys the Discord client connection and exits with code 0. Code exists; live signal handling not yet recorded as verified.

---

## Milestone 2: Database & Server Settings

### Goal & Expected Outcome
Implement the persistence layer using SQLite (`better-sqlite3`), establish automatic schema migration handling, and implement the `Settings` service to manage durable, guild-scoped configuration across restarts.

### Main Modules & Files Involved
- `src/infrastructure/persistence/storage.ts` — SQLite connection lifecycle and PRAGMA settings (`journal_mode = WAL`, foreign keys)
- `src/infrastructure/persistence/migrations/` — SQL migration scripts (`001_initial_schema.sql`)
- `src/infrastructure/persistence/settings-store.ts` — SQL persistence adapter for guild settings
- `src/modules/settings/settings.types.ts` — Domain types (`GuildSettings`)
- `src/modules/settings/settings.validation.ts` — Zod schema validation for server settings
- `src/modules/settings/settings.service.ts` — Port interface and service methods (`getSettings`, `saveSettings`, `setEnabled`)

### Dependencies
- **Milestone 1** (Logger, config, base project setup).

### Essential Tests & Acceptance Criteria
- [x] Database file and tables (`guild_settings`, `delivery_ledger`) are created automatically if they do not exist. Verified.
- [x] `SettingsService.saveSettings()` validates inputs and persists a complete server configuration record. Verified.
- [x] Modifying individual configuration values (e.g., enabling/disabling or changing text channel) updates existing records atomically. Verified.
- [x] Integration test: Persisted settings survive database close and reopen (simulating process restart). Implemented and verified; uses a file-based SQLite database.

---

## Milestone 3: Location & Prayer-Time Calculation

### Goal & Expected Outcome
Implement local astronomical prayer-time calculations using `adhan`, validate IANA timezones and DST shifts, and provide location resolution (pre-bundled major-city offline dataset with an external geocoding adapter).

### Main Modules & Files Involved
- `src/modules/location/location.types.ts` — Location and coordinate types
- `src/modules/location/major-cities.json` — Static offline dataset of ~200-500 prominent Muslim cities with coordinates and canonical IANA timezones
- `src/modules/location/location.service.ts` — City search, coordinate lookup, and geocoder client
- `src/modules/prayer-times/prayer-time.types.ts` — Prayer types (`Fajr`, `Dhuhr`, `Asr`, `Maghrib`, `Isha`) and method enums
- `src/modules/prayer-times/prayer-calculation.ts` — Wrapper around `adhan` calculations with the Egyptian default method and the fixed Standard Asr rule
- `src/modules/prayer-times/prayer-times.service.ts` — Core service calculating the 5 prayer instants for a local calendar date in the configured timezone

### Dependencies
- **Milestone 1** (Logger and domain types).

### Essential Tests & Acceptance Criteria
- [ ] Unit tests verify prayer calculations for known cities (e.g., Cairo, Mecca, London, New York) match established astronomical reference tables using the Standard Asr rule.
- [ ] Calculations work entirely offline in-process without network activity (FR-021).
- [ ] Calculation across Daylight Saving Time transitions (e.g. London March/October) yields correct local times without hour-shifting bugs (BR-042).
- [ ] Extreme high latitudes handle missing twilight gracefully without throwing unhandled exceptions.

---

## Milestone 4: Prayer Scheduling & Duplicate Protection

### Goal & Expected Outcome
Implement the in-process dynamic scheduling engine and the durable delivery ledger. The scheduler turns prayer times into scheduled events (`PRAYER_APPROACHING` and `PRAYER_TIME_REACHED`), prevents duplicate reminders, recovers cleanly after restarts, and rebuilds automatically on configuration changes.

### Main Modules & Files Involved
- `src/modules/scheduling/event.types.ts` — Event definitions and keys
- `src/modules/scheduling/event-builder.ts` — Computes future prayer events for today and tomorrow based on settings
- `src/infrastructure/persistence/delivery-ledger-store.ts` — SQLite adapter for `delivery_ledger`
- `src/modules/scheduling/delivery-ledger.ts` — Ledger service managing event deduplication and 7-day pruning
- `src/modules/scheduling/scheduler.ts` — In-process dynamic timer (`setTimeout`), event queue, and clock listener
- `src/shared/clock.ts` — Testable clock interface (`SystemClock`)

### Dependencies
- **Milestone 2** (Persistence and settings).
- **Milestone 3** (Prayer-time calculations).

### Essential Tests & Acceptance Criteria
- [ ] Scheduler computes correct trigger times: `PRAYER_APPROACHING` at `prayerTime - leadTime`, and `PRAYER_TIME_REACHED` at `prayerTime` (BR-001, BR-002).
- [ ] Events in the past relative to startup time are skipped and not replayed (BR-045).
- [ ] Updating server settings cancels pending timers and rebuilds the upcoming schedule (BR-048).
- [ ] Delivery ledger records `event_key` before dispatch; re-running the same event does not trigger duplicate execution (BR-050).
- [ ] Unit tests with a simulated clock verify the timer fires accurately and advances to the next event.

---

## Milestone 5: Text Announcements & Configurable Mentions

### Goal & Expected Outcome
Implement the text reminder path that formats announcement messages and delivers them to the configured Discord text channel with strictly controlled mentions (`@everyone` or a specific role), fully isolated from voice delivery.

### Main Modules & Files Involved
- `src/modules/reminders/text/text-message.builder.ts` — Formats text reminder message containing the prayer name and mention string
- `src/discord/discord-messages.ts` — Discord text message delivery adapter with permission checks (`SendMessages`, `MentionEveryone`)
- `src/modules/reminders/text/text-announcement.service.ts` — Text announcement orchestration
- `src/modules/reminders/reminder-handler.ts` — Top-level dispatcher connecting scheduler events to reminder services

### Dependencies
- **Milestone 1** (Discord client).
- **Milestone 2** (Settings snapshot).
- **Milestone 4** (Scheduler event dispatch).

### Essential Tests & Acceptance Criteria
- [ ] When `@everyone` is configured, the message mentions `@everyone` and sets `allowedMentions: { parse: ['everyone'] }`.
- [ ] When a role is configured, the message mentions `<@&roleId>` and suppresses `@everyone` mentions (FR-062, BR-037).
- [ ] Delivery failure in the text channel (e.g. missing permissions or deleted channel) is logged cleanly and does not crash the process or impede subsequent events (BR-034, FR-065).
- [ ] Unit tests verify independent dispatch: text reminder triggers at prayer time even if the voice cycle failed or is still executing (BR-030).

---

## Milestone 6: Voice Announcements & Sequential Processing

### Goal & Expected Outcome
Implement sequential voice channel announcements: discover voice channels in the guild, evaluate eligibility rules (human presence, bot permissions, private channel policy), and execute the sequential join-play-disconnect cycle using `@discordjs/voice` and local audio assets.

### Main Modules & Files Involved
- `assets/audio/` — Pre-transcoded 48kHz stereo OGG/Opus audio files for each prayer (`fajr.ogg`, `dhuhr.ogg`, etc.)
- `src/infrastructure/audio/audio-library.ts` — Validates local audio files exist and are readable on startup
- `src/infrastructure/audio/audio-player.ts` — Plays audio resources via `@discordjs/voice`
- `src/discord/discord-channels.ts` — Channel directory adapter inspecting voice channels and member presence
- `src/modules/reminders/voice/channel-eligibility.ts` — Pure business rules checking channel type, permissions, humans, and privacy
- `src/modules/reminders/voice/voice-cycle.ts` — Per-guild voice mutex lock and sequential channel iterator
- `src/modules/reminders/voice/voice-announcement.service.ts` — Voice reminder cycle entry point

### Dependencies
- **Milestone 1** (Discord client and voice gateway).
- **Milestone 2** (Settings snapshot).
- **Milestone 4** (Scheduler approaching event).

### Essential Tests & Acceptance Criteria
- [ ] Channels with zero members or only bot members are skipped (BR-012).
- [ ] Eligibility is re-checked immediately before connecting to each channel (BR-016).
- [ ] Bot connects to at most one voice channel at a time, plays audio to completion, and disconnects before joining the next channel (BR-020, BR-022).
- [ ] A failure in one channel (e.g., join timeout, playback error) is logged and does not prevent the bot from continuing to the next eligible channel (BR-024).
- [ ] Invariant check: Voice failures or lengthy voice cycles never delay or suppress the text announcement at prayer time (BR-030, BR-032).

---

## Milestone 7: Slash Commands & Setup/Settings Flows

### Goal & Expected Outcome
Implement Discord slash commands and user interactions: administrator authorization checks, guided `/setup` interaction flow, `/settings` viewer/editor, `/prayer-times` viewer, `/test` trigger, and `/enable` / `/disable` toggles.

### Main Modules & Files Involved
- `src/discord/authorization.ts` — Server-side permission validator (`ManageGuild` / `Administrator`)
- `src/discord/command-router.ts` — Routes incoming interactions to handlers
- `src/discord/commands/setup.ts` & `src/discord/flows/setup-flow.ts` — Guided multi-step configuration sequence
- `src/discord/commands/settings.ts` & `src/discord/flows/settings-flow.ts` — View/update settings
- `src/discord/commands/prayer-times.ts` — Displays today's 5 prayer times for server members
- `src/discord/commands/test.ts` — Triggers on-demand text or voice test announcement without recording in delivery ledger
- `src/discord/commands/enable.ts` & `disable.ts` — Toggles automated announcements
- `src/app/composition.ts` — Wires commands to application services and registers slash commands with Discord REST API

### Dependencies
- **Milestone 2** (Settings service).
- **Milestone 3** (Location and prayer calculation).
- **Milestone 5** (Text announcements).
- **Milestone 6** (Voice announcements).

### Essential Tests & Acceptance Criteria
- [ ] Non-administrators attempting to invoke configuration commands are rejected with an ephemeral permission error (BR-063, BR-064).
- [ ] `/setup` successfully guides an administrator through location selection, timezone confirmation, text channel selection, and mention preference, persisting a valid configuration.
- [ ] `/test` executes voice and/or text announcements on demand without consuming or altering upcoming scheduled prayer events (BR-051).
- [ ] `/disable` immediately suspends automated reminders; `/enable` recalculates and arms upcoming reminders without replaying missed events (BR-047).

---

## Milestone 8: Testing, Error Handling & Deployment

### Goal & Expected Outcome
Harden the entire application with end-to-end integration tests, top-level error boundaries, structured process logging, database backup instructions, and production deployment scripts (systemd service / Docker container).

### Main Modules & Files Involved
- `test/integration/` — Comprehensive integration tests covering configuration changes, restarts, and announcement dispatch
- `src/app/bootstrap.ts` & `shutdown.ts` — Top-level unhandled rejection / uncaught exception traps
- `data/` — Persistence backup and verification guidelines
- `Dockerfile` / `docker-compose.yml` (or `systemd/mudhakkir.service`) — Deployment descriptors

### Dependencies
- **Milestones 1 through 7**.

### Essential Tests & Acceptance Criteria
- [ ] End-to-end flow test: Initialize database, configure guild settings, advance virtual clock, verify ledger entries and mock Discord deliveries.
- [ ] Unhandled promise rejections are logged with full stack traces and shut down the process gracefully without leaving dangling voice connections.
- [ ] Bot successfully boots and runs in a containerized or headless Linux environment with persistent SQLite volume storage.
- [ ] Application satisfies all non-functional requirements (resource limits, single-process operation, zero external job broker dependencies).
