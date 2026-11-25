# Mudhakkir — MVP Implementation Roadmap

This document defines the practical, ordered engineering roadmap for implementing the Minimum Viable Product (MVP) of **Mudhakkir**, following the [System Architecture](../architecture/system-architecture.md), [Code Structure](../architecture/code-structure.md), and [Technical Design](../technical/technical-design.md).

Work is structured into 8 sequential milestones designed to minimize risk, validate core invariants early, and ensure every step builds strictly on tested foundation layers.

---

## Current implementation status

The repository contains a working M1/M2 foundation and an implemented M3 (Location and Prayer Times with integration tests). This section is the authoritative summary of what exists; the milestone sections below retain the original plan and acceptance criteria.

| Milestone | Status | Notes |
| --- | --- | --- |
| **M1** | **Substantially implemented; partially verified** | Config validation, Pino logging, DI, Discord client creation, bootstrap, and signal-handling shutdown exist. `tsc --noEmit` and unit tests pass. A live Discord Gateway login has not been recorded in this repository. |
| **M2** | **Implemented and verified** | SQLite, WAL, migrations, `guild_settings`, `delivery_ledger` table, settings store/service, and Zod validation exist. `SettingsService` depends on an `ISettingsStore` port and a shared `Logger` contract, with `SettingsStore` as the settings module's SQLite adapter. A close/reopen persistence test verifies restart durability. |
| **M3** | **Implemented and verified** | Location and Prayer Times modules exist, using `adhan` with all supported methods and Standard Asr. Unit and integration tests cover the full flow, DST, high latitudes, and external references. |
| **M4** | **Implemented and verified** | The M4.1 study is in [`technical/scheduling-design.md`](../technical/scheduling-design.md); M4.2 implemented the clock port, event builder, single-timer scheduler with heartbeat, module-owned delivery-ledger adapter, commit-before-dispatch, restart recovery, and 7-day pruning. |
| **M5** | **Text path implemented; M6/M7 items pending** | Reminder handler, text builder/service, and Discord sender deliver `PRAYER_TIME_REACHED` events with exact `@everyone`/role mentions. Voice path and `/test` command behavior remain planned. |
| **M6** | **Implemented and verified (offline tests)** | `@discordjs/voice` transport, channel directory, eligibility rules, per-guild lock, sequential cycle, and local PCM assets. Live voice playback has not been verified on Discord. |
| **M7** | **Implemented and verified (offline tests)** | Six slash commands, router with user/guild-bound flow registry, setup/settings flows, select menus with 25-option pagination, and a settings→scheduler rebuild callback. Live Discord interaction verification remains for M8. |
| **M8** | **Not started** | No deployment descriptors, end-to-end suite, or completed crash boundaries. |

### Verified now

- `npx tsc --noEmit` passes.
- `npm test` reports 84 passing tests across 17 files: configuration, DI/composition, Discord client intents, message sender, commands/flows/router, persistence/settings, location, prayer times, scheduling, text announcements, reminder handler, voice announcements, audio assets, and the Location → Prayer Times, Scheduling → Persistence, Scheduler → Text Delivery, and Settings → Scheduler Rebuild integration suites.
- Migrations create `guild_settings`, `delivery_ledger`, and `schema_migrations`.
- Settings can be saved, retrieved, partially updated, toggled, deleted, and reject invalid input.
- Location resolves only countries/cities present in curated JSON, applies default-city and country-level calculation-method rules, and rejects unsupported selections. No external geocoding is used.
- Prayer Times calculates five daily prayers offline with `adhan`, maps all 12 supported `CalculationMethod` values, fixes Asr to Standard (`Madhab.Shafi`), and formats times with the configured IANA timezone (DST handled through `Intl`).
- Integration tests verify the complete Location → Prayer Times flow, city overrides, DST dates, high-latitude behavior, and representative times against the aladhan.com reference API (2-minute tolerance).
- `SettingsService` depends on abstractions (`ISettingsStore` port and shared `Logger` contract), not concrete infrastructure types.
- The scheduler builds events for the current and next local calendar day, drops past triggers, arms one `setTimeout` for the earliest event, uses a 15-minute heartbeat as a backstop, and rebuilds on settings changes. A fake clock and `tick()` make dispatch deterministic in tests.
- The delivery ledger is owned by the scheduling module (`src/modules/scheduling/delivery-ledger-store/delivery-ledger-store.ts`), commits keys **before** dispatch, and prunes rows older than 7 days. Tests verify no replay after a database close/reopen and deduplication across restarts.
- The reminder handler is the scheduler's due-event callback. It loads a fresh settings snapshot per event, skips missing/disabled guilds, and delivers only `PRAYER_TIME_REACHED` events through the text path; `PRAYER_APPROACHING` awaits M6.
- Text announcements apply exactly one mention mode (`@everyone` or one role) via `allowedMentions`, and delivery failures are logged and contained. Integration tests verify one message per due event and none for disabled guilds.
- Voice announcements use a per-guild lock (overlapping cycles are skipped), recheck eligibility immediately before each join, and isolate per-channel failures so the loop continues. Text delivery remains independent; the reminder handler routes approaching events to voice and reached events to text.
- Local audio assets are generated 48kHz stereo PCM placeholders (`assets/audio/*.pcm`) played with `StreamType.Raw`, so no ffmpeg is required. Replace them with real recitations without changing filenames.
- Feature persistence adapters are owned by their modules (`src/modules/settings/settings-store/settings-store.ts` today), with each concern in its own folder per the [folder convention](../architecture/code-structure.md#folder-convention-applies-to-every-module); `infrastructure/persistence/` keeps only the shared connection and migrations. All modules use the same SQLite database.
- `tsc` does not copy SQL migrations into `dist`; the `build` script runs `copy-migrations.mjs` after `tsc`, which copies migrations to `dist/infrastructure/persistence/migrations` and exits non-zero if the migrations directory is missing.
- `unhandledRejection` is logged but does not terminate the process.

### Known gaps

- Live Discord voice connection/playback has not been verified; tests use fakes and real local audio assets.
- Audio assets are placeholder tones, not real prayer recitations.
- No command layer or `/test` behavior exists; settings can only be seeded directly in tests until M7.
- `unhandledRejection` is logged but does not terminate the process.
- Live Discord login and graceful shutdown against the real gateway have not been recorded as verified.

---

## Roadmap Overview

| Milestone | Focus Area | Primary Deliverables | Dependencies |
| :--- | :--- | :--- | :--- |
| **M1** | Project Initialization & Discord Bot Connection | TypeScript build toolchain, logging, config validation, Discord client connection, graceful shutdown. | None |
| **M2** | Database & Server Settings | SQLite setup, schema migrations, Settings service, and persistent CRUD operations. | M1 |
| **M3** | Location & Prayer-Time Calculation | Curated offline country/city data, `adhan` calculation engine, IANA timezone handling. | M1 |
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
- `src/shared/logging/logger.port.ts` — Logger contract (`Logger` interface and `LogMethod`)
- `src/infrastructure/logging/pino-logger.ts` — Structured logger implementation (`pino`), exported via `src/infrastructure/logging/index.ts`
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
- `src/modules/settings/settings-store/settings-store.ts` — SQL persistence adapter for guild settings, owned by the settings module; explicit columns, parameterized queries, runtime row validation, and a private `toEntity()` mapper per the [store convention](../architecture/code-structure.md#store-convention-general-rule)
- `src/modules/settings/settings-store/settings-store.port.ts` — `ISettingsStore` port consumed by the service and implemented by the module's store
- `src/modules/settings/settings-store/index.ts` — Barrel for the store port and adapter
- `src/infrastructure/persistence/storage.ts` — Shared SQLite connection and migration runner
- `src/modules/settings/settings.types.ts` — Domain types (`GuildSettings`); module-wide primitive kept at the module root
- `src/modules/settings/settings.validation.ts` — Zod schema validation for server settings; module-wide primitive kept at the module root
- `src/modules/settings/settings.errors.ts` — Named error constants for the settings module, built from shared `AppError` types
- `src/modules/settings/settings-service/settings.service.ts` — Service methods (`getSettings`, `saveSettings`, `setEnabled`)
- `src/modules/settings/settings-service/index.ts` — Barrel for the service and `ISettingsService`

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
Implement local astronomical prayer-time calculations using `adhan`, validate IANA timezones and DST shifts, and provide location resolution from the curated offline country/city dataset. External geocoding is deferred.

### Main Modules & Files Involved
Location (implemented):
- `src/modules/location/index.ts` — Public exports of the module.
- `src/modules/location/location.types.ts` — Country, city, and resolved-location types.
- `src/modules/location/location.validation.ts` — Zod validation for resolved output only; reference JSON is trusted and request input is validated in `discord/`.
- `src/modules/location/location.errors.ts` — Named error constants.
- `src/modules/location/location-service/{index.ts,location.service.ts}` — Defines `ILocationService` and owns curated data queries and resolution; no separate resolver layer.
- `src/modules/location/data/countries.json`, `data/cities.json` — Curated reference data (not database records): countries have `cityRequired`, nullable `defaultCity`, IANA `timezones`, and a default method; cities have coordinates, IANA timezone, and a nullable calculation-method override.

Prayer Times (implemented):
- `src/modules/prayer-times/index.ts` — Public exports of the module.
- `src/modules/prayer-times/prayer-time.types.ts` — Prayer names, input, and daily prayer-time result types.
- `src/modules/prayer-times/prayer-times.errors.ts` — Named error for unavailable calculation results.
- `src/modules/prayer-times/prayer-calculation.ts` — Pure `adhan` wrapper: all 12 method mappings, Standard Asr (`Madhab.Shafi`), and `Intl` formatting in the configured timezone.
- `src/modules/prayer-times/prayer-times-service/{index.ts,prayer-times.service.ts}` — Public service (`IPrayerTimesService`) delegating to the calculation function.

Tests:
- `test/unit/location/location.test.ts`, `test/unit/prayer-times/prayer-times.test.ts` — module unit tests.
- `test/integration/location-prayer-times.test.ts` — full Location → Prayer Times flow.

### Dependencies
- **Milestone 1** (Logger and domain types).

### Location acceptance criteria (implemented)
- [x] Curated countries/cities are trusted reference data and exposed through the Location service.
- [x] Country default city, city-required countries, country-level default calculation methods, no input normalization, and rejection of unsupported locations are covered by unit tests.
- [x] Reference data is file-based; no database migrations or tables were added.

### Essential Tests & Acceptance Criteria
- [x] Unit tests verify prayer calculations for known cities (Cairo, London) using the Standard Asr rule. Integration tests compare representative results with the aladhan.com reference API within a 2-minute tolerance.
- [x] Calculations work entirely offline in-process without network activity (FR-021); the external API is used only to produce test reference values.
- [x] Calculation across Daylight Saving Time transitions (London March/October) yields correct local times and UTC instants without hour-shifting bugs (BR-042).
- [x] High-latitude locations are covered: Anchorage calculates successfully, and unavailable polar results raise the module's named error instead of an unhandled exception.

---

## Milestone 4: Prayer Scheduling & Duplicate Protection

### Goal & Expected Outcome
Implement the in-process dynamic scheduling engine and the durable delivery ledger. The scheduler turns prayer times into scheduled events (`PRAYER_APPROACHING` and `PRAYER_TIME_REACHED`), prevents duplicate reminders, recovers cleanly after restarts, and rebuilds automatically on configuration changes.

### M4.1 — Scheduling Fundamentals (study; complete)
- [x] Study and document scheduler vs timer vs cron, one-shot vs recurring jobs, event-driven scheduling, `setTimeout` limitations, timezones/DST, multi-guild scheduling, event lifecycle, and restart/duplicate risks.
- [x] Propose a minimal single-process design and record edge cases, trade-offs, and open decisions in [`Docs/technical/scheduling-design.md`](../technical/scheduling-design.md).
- [x] Confirm ledger commit-before-dispatch (at-most-once semantics) as the duplicate-prevention policy.
- No source code, modules, or schema changes were made in M4.1.

### M4.2 — Scheduler implementation (complete)
- `src/modules/scheduling/event.types.ts` — One-shot event model and stable event keys.
- `src/modules/scheduling/event-builder.ts` — Events for the current and next local calendar day, with past triggers dropped.
- `src/modules/scheduling/delivery-ledger-store/delivery-ledger-store.ts` — SQLite adapter for `delivery_ledger`, owned by the scheduling module.
- `src/modules/scheduling/delivery-ledger.ts` — Commit-before-dispatch deduplication and 7-day pruning.
- `src/modules/scheduling/scheduling-service/scheduling.service.ts` — Single `setTimeout`, 12-hour clamp, 15-minute heartbeat, rebuild on change, fail-closed dispatch.
- `src/shared/clock.ts` — Clock port and `SystemClock`; tests inject a fake clock.
- `src/app/composition.ts`, `bootstrap.ts`, `shutdown.ts` — DI wiring, startup, and cancellation of the scheduler.
- `src/modules/settings/settings-service/settings.service.ts` — `listSettings()` added so the scheduler can enumerate guilds without importing Discord.

### Dependencies
- **Milestone 2** (Persistence and settings).
- **Milestone 3** (Prayer-time calculations).

### Essential Tests & Acceptance Criteria
- [x] Scheduler computes correct trigger times: `PRAYER_APPROACHING` at `prayerTime - leadTime`, and `PRAYER_TIME_REACHED` at `prayerTime` (BR-001, BR-002).
- [x] Events in the past relative to startup time are skipped and not replayed (BR-045).
- [x] Updating server settings cancels pending timers and rebuilds the upcoming schedule (BR-048).
- [x] Delivery ledger records `event_key` before dispatch; re-running the same event does not trigger duplicate execution (BR-050).
- [x] Unit tests with a simulated clock verify the timer fires accurately and advances to the next event.
- [x] Integration tests verify ledger persistence across close/reopen, no replay after restart, and a merged multi-guild timeline with disabled guilds excluded.

---

## Milestone 5: Text Announcements & Configurable Mentions

### Goal & Expected Outcome
Implement the text reminder path that formats announcement messages and delivers them to the configured Discord text channel with strictly controlled mentions (`@everyone` or a specific role), fully isolated from voice delivery.

### Status: text path implemented (M5); voice and `/test` planned for M6/M7

### Main Modules & Files Involved
- `src/modules/reminders/reminder-handler/reminder-handler.ts` — Implemented callback: fresh settings per event, routes reached events to text, ignores approaching events until M6.
- `src/modules/reminders/text/text-message.builder.ts` — Implemented pure builder for prayer content and exact `allowedMentions`.
- `src/modules/reminders/text/text-announcement.service.ts` — Implemented text orchestration with contained failures.
- `src/modules/reminders/text/text-message-sender.port.ts` — Implemented module-owned delivery port.
- `src/discord/discord-messages.ts` — Implemented Discord adapter with channel resolution and `ViewChannel`/`SendMessages`/`MentionEveryone` checks.
- `src/discord/discord.errors.ts` — Named channel-not-found and permission errors.

### Dependencies
- **Milestone 1** (Discord client).
- **Milestone 2** (Settings snapshot).
- **Milestone 4** (Scheduler event dispatch).

### Essential Tests & Acceptance Criteria
- [x] When `@everyone` is configured, the message mentions `@everyone` and sets `allowedMentions: { parse: ['everyone'] }`.
- [x] When a role is configured, the message mentions `<@&roleId>` and suppresses `@everyone` mentions (FR-062, BR-037).
- [x] Delivery failure in the text channel (e.g. missing permissions or deleted channel) is logged cleanly and does not crash the process or impede subsequent events (BR-034, FR-065).
- [x] Unit tests verify independent dispatch: text reminder triggers at prayer time even if the voice cycle failed or is still executing (BR-030) — the handler ignores approaching events and text failures are contained.
- [ ] `/test` reuses delivery services without consuming a real event (BR-051) — deferred to M7's command layer.

---

## Milestone 6: Voice Announcements & Sequential Processing

### Goal & Expected Outcome
Implement sequential voice channel announcements: discover voice channels in the guild, evaluate eligibility rules (human presence, bot permissions, private channel policy), and execute the sequential join-play-disconnect cycle using `@discordjs/voice` and local audio assets.

### Status: implemented (offline-verified); live voice and real audio assets pending

### Main Modules & Files Involved
- `assets/audio/*.pcm` — Generated placeholder 48kHz stereo s16le announcements (`fajr.pcm`, ...); `scripts/generate-audio-assets.mjs` regenerates them.
- `src/infrastructure/audio/audio-library.ts` — Local asset lookup and startup validation (warning only).
- `src/infrastructure/audio/audio-player.ts` — `createAudioResource(..., { inputType: StreamType.Raw })`; no ffmpeg required.
- `src/discord/discord-channels.ts` — Channel directory adapter returning plain snapshots with permissions, human count, and privacy flag.
- `src/discord/voice-transport.ts` — `@discordjs/voice` join, 5s readiness timeout, playback to `Idle` (45s safety timeout), and `destroy()` in `finally`.
- `src/modules/reminders/voice/channel-eligibility.ts` — Pure rules: type, permissions, human presence, and permission-based privacy.
- `src/modules/reminders/voice/voice-cycle.ts` — Sequential iteration with immediate pre-join recheck and per-channel failure isolation.
- `src/modules/reminders/voice/voice-coordinator.ts` — Per-guild mutex; overlapping cycles are skipped (Proposed).
- `src/modules/reminders/voice/voice-announcement.service.ts` — Voice entry point used by the reminder handler.

### Dependencies
- **Milestone 1** (Discord client and voice gateway).
- **Milestone 2** (Settings snapshot).
- **Milestone 4** (Scheduler approaching event).

### Essential Tests & Acceptance Criteria
- [x] Channels with zero human members are skipped (BR-012).
- [x] Eligibility is re-checked immediately before connecting to each channel (BR-016).
- [x] The per-guild coordinator allows one active cycle; the transport disconnects in `finally` after playback (BR-020, BR-022).
- [x] A failure in one channel is logged and does not prevent the next eligible channel (BR-024).
- [x] Voice and text dispatch are independent; approaching events go to voice, reached events to text, and neither awaits the other (BR-030, BR-032).
- [ ] Live Discord voice connection and audible playback verification remain for M8 end-to-end testing.

---

## Milestone 7: Slash Commands & Setup/Settings Flows

### Goal & Expected Outcome
Implement Discord slash commands and user interactions: administrator authorization checks, guided `/setup` interaction flow, `/settings` viewer/editor, `/prayer-times` viewer, `/test` trigger, and `/enable` / `/disable` toggles. Command handlers own **input validation and normalization**; services receive canonical values and apply business rules ([input boundary convention](../architecture/code-structure.md#input-boundary-convention-general-rule), ARCH-021).

### Status: implemented (offline-verified); live Discord interaction verification pending M8

### Main Modules & Files Involved
- `src/discord/authorization.ts` — Implemented server-side permission validator (`ManageGuild` / `Administrator`).
- `src/discord/register-commands.ts` — Implemented slash-command definitions and REST registration on startup.
- `src/discord/commands/*.ts` & `src/discord/flows/*.ts` — Validate raw interaction input and convert it to canonical values (trim free text, parse enums/numbers; country/city values come from Location select menus, not typed text), then call module services with those values. No business rules here.
- `src/discord/command-router.ts` — Implemented router for slash commands and component interactions; owns the user/guild-bound flow registry.
- `src/discord/commands/command-handler.ts` — Implemented handler/flow contracts.
- `src/modules/settings/settings-service/settings.service.ts` — Implemented `SettingsChangeCallback`, wired in composition to `SchedulerService.rebuild(guildId)`.
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
- [x] Command handlers reject malformed input with an actionable ephemeral message and pass only canonical values to services; no raw Discord interaction data reaches a service (ARCH-021).
- [x] Non-administrators attempting to invoke configuration commands are rejected with an ephemeral permission error (BR-063, BR-064), using authoritative interaction context rather than user-supplied IDs.
- [x] `/setup` country and city selection use paginated 25-option select menus populated from `ILocationService.listCountries()` / `listCities()`; option values are canonical codes/IDs and no country text normalization or fuzzy search is performed.
- [x] Location business rules (country existence, required city, default city, city membership, final resolution) are applied only by Location; the Discord layer does not duplicate them or the reference data.
- [x] Component interactions route to the correct user- and guild-bound active flow; expired, cancelled, wrong-user, and duplicate submissions are contained with an ephemeral notice and no state change.
- [x] Interactions are acknowledged via reply/defer; configuration flows are ephemeral, `/prayer-times` is public by default (Proposed), and unexpected errors are logged with context without exposing stack traces or database details.
- [x] `/setup` guides an administrator through location, text channel, mention preference, lead time, and private-channel choice, persisting a valid configuration with `enabled: false` only on final confirmation.
- [x] `/test` executes voice and/or text announcements on demand without consuming or altering upcoming scheduled prayer events or delivery-ledger records (BR-051).
- [x] `/disable` suspends automated reminders; `/enable` activates them; both notify the scheduler through the settings change callback (BR-047, BR-048).
- [ ] Live Discord interaction, component, and command-registration verification remain for M8 end-to-end testing.

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
