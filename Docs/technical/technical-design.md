# Mudhakkir — Technical Design

This document details the practical technical decisions and architecture specifications for implementing the Mudhakkir Minimum Viable Product (MVP). It bridges the conceptual requirements defined in [Requirements](../product/requirements.md) and [System Architecture](../architecture/system-architecture.md) into concrete, library-level designs.

Status labels follow the [documentation conventions](../README.md#status-labels): **Confirmed** for decisions explicitly established by project constraints, **Proposed** for technical recommendations that require user/stakeholder approval, and **Implemented** for code that exists in the current source tree. “Implemented” describes code state, not a product decision.

---

## 1. Prayer Calculation

### Calculation Library: `adhan` (or `@batoulapps/adhan`)
- **Status:** **Implemented** (M3)
- **Rationale:** 
  - `adhan` (TypeScript/JavaScript port by Batoul Apps) is the battle-tested, standard open-source library for astronomical Islamic prayer-time calculations in Node.js.
  - Pure JavaScript/TypeScript with zero external native dependencies, ensuring high portability across operating systems (Linux/Windows/macOS).
  - Evaluates prayer times deterministically in-process using geographic coordinates and dates, strictly fulfilling the requirement for local computation without remote API calls (FR-021).
  - Natively supports calculation methods, high-latitude rules, and custom prayer parameters.

### Calculation Methods & Defaults
- **Default Method:** Egyptian General Authority of Survey (`CalculationMethod.Egyptian()`) (**Confirmed** per FR-003).
- **Supported Methods (Proposed initial enum):**
  - Egyptian General Authority of Survey (`CalculationMethod.Egyptian()`)
  - Muslim World League (`CalculationMethod.MuslimWorldLeague()`)
  - Umm Al-Qura University, Makkah (`CalculationMethod.UmmAlQura()`)
  - Islamic Society of North America / ISNA (`CalculationMethod.NorthAmerica()`)
  - University of Islamic Sciences, Karachi (`CalculationMethod.Karachi()`)
  - Dubai (`CalculationMethod.Dubai()`)
  - Kuwait (`CalculationMethod.Kuwait()`)
  - Qatar (`CalculationMethod.Qatar()`)
  - Moonsighting Committee (`CalculationMethod.MoonsightingCommittee()`)
  - Singapore (`CalculationMethod.Singapore()`)
  - Turkey / Diyanet (`CalculationMethod.Turkey()`)
  - Tehran (`CalculationMethod.Tehran()`)
- **Asr Calculation:** Always uses the **Standard** rule (shadow length factor 1) per FR-004 and FR-025. This is fixed application-wide and is not configurable.

### Important Limitations & Setup Requirements
- **High-Latitude Anomalies:** Locations above ~48° latitude experience periods in summer/winter where Fajr or Isha twilight does not occur naturally. The implementation sets `HighLatitudeRule.TwilightAngle`; if the library still returns invalid times, the module throws its named `prayerTimesUnavailableError`. Integration tests cover Anchorage (valid) and an extreme polar date (error).
- **Elevation:** Astronomical calculation operates at sea level by default. Elevation adjustments are negligible for Discord reminders and omitted in MVP to keep configuration simple.

---

## 2. Location & Timezone

### Country & City Selection
- **Status:** Location resolution and Prayer Times are **implemented** (M3).
- **MVP Strategy (Implemented for Location):** Curated reference data only. `src/modules/location/data/countries.json` and `cities.json` hold supported countries (`cityRequired`, nullable `defaultCity`, IANA `timezones`, default calculation method) and their cities (coordinates, IANA timezone, nullable calculation-method override). All city `calculationMethod` values are currently `null`, so the country-level `defaultCalculationMethod` is authoritative; for example, UAE uses `Dubai` and the United States uses `NorthAmerica`. The JSON is reviewed as trusted reference data and is not validated at load time; it is never stored in SQLite. Zod validation in the module applies to resolved output only.
- **Unsupported locations:** Only countries and cities present in the JSON files can be resolved. Unknown or unsupported selections are rejected with the module's named error; there is no external geocoding fallback for now.
- **Deferred:** an external geocoding provider (for example Nominatim, Mapbox, or Open-Meteo) is not needed for the initial release and is not implemented. Location selection uses curated data and canonical-code select menus.

### Coordinates & IANA Timezone Authority
- **Coordinates:** Stored as decimal degrees (Latitude: -90.0 to +90.0, Longitude: -180.0 to +180.0).
- **IANA Timezone:** Stored as an authoritative canonical IANA string (e.g., `"Africa/Cairo"`, `"Asia/Riyadh"`, `"Europe/London"`, `"America/New_York"`) (**Confirmed** per BR-040, FR-002).
- **Timezone Source:** IANA identifiers come from the curated city data and are validated with Node's `Intl` API. No coordinate-to-timezone lookup or fixed offset is used at runtime.
- **DST Handling:** Calculations and event generation rely on Node.js built-in `Intl` API or `luxon`/`date-fns-tz` with IANA timezone strings. By computing prayer times against the local calendar date and converting to UTC epoch timestamps via the IANA zone, all Daylight Saving Time (DST) changes (spring-forward / fall-back) are applied automatically and accurately without offset drifting (BR-042).

---

## 3. Scheduling & Event Reliability

The M4.1 study of scheduling concepts, edge cases, and the proposed minimal design is in [`scheduling-design.md`](scheduling-design.md). The notes below are the library-level proposal; where they differ from the study, the study is the more detailed reference.

### Architecture of the Scheduler
- **Mechanism:** In-process single-timer dynamic scheduler (`setTimeout`) combined with a periodic fallback heartbeat/sweep (e.g., every 15-30 minutes).
- **Event Lifecycle:**
  1. On startup or after any configuration update, the `SchedulerService` calculates prayer times for "today" and "tomorrow" in the configured IANA timezone.
  2. It generates the ten corresponding domain events:
     - `PRAYER_APPROACHING` (trigger = prayer time minus lead time, default 10m)
     - `PRAYER_TIME_REACHED` (trigger = prayer time)
  3. Events that are in the past relative to current wall-clock time are discarded (never replayed, conforming to BR-045).
  4. The earliest future event is loaded, and a native Node.js `setTimeout` is armed for that target timestamp.
  5. Maximum timer duration guard: Node.js `setTimeout` limits 32-bit signed integers (maximum ~24.8 days / 2,147,483,647 ms). If an event is beyond 24 hours, the timer clamps to 12 hours and re-evaluates.
- **Event Rebuilding:** Whenever configuration is modified (city, calculation method, or lead time), any active timer is cancelled (`clearTimeout`), the event queue is recalculated from the fresh settings, and the timer is re-armed (BR-048).

### Duplicate Protection & Delivery Ledger
- **Delivery Ledger:** A durable record stored in the database to prevent duplicate handling across crashes, restarts, and schedule rebuilds (BR-050).
- **Event Unique Key:** `guildId:prayerDate:prayerName:eventType` (e.g., `"1234567890:2026-11-24:fajr:PRAYER_TIME_REACHED"`).
- **Current implementation status:** the `delivery_ledger` table exists in `001_initial_schema.sql`, but no ledger store, service, or scheduler uses it yet.
- **Commit Semantics (Confirmed in M4.1):**
  - **Ledger Commit-Before-Dispatch:** When an event fires, the scheduler checks if the key already exists in the ledger. If present, it skips dispatch. If absent, it records the entry in the ledger *before* initiating the announcement dispatch.
  - *Trade-off Justification:* Discord operations (sending text messages, voice joins) are not idempotent. Committing before dispatch guarantees **at-most-once** delivery: a crash during dispatch will never result in duplicate announcements/pings spamming the Discord server upon restart.

### Handling Bot Restarts & Downtime
- If the bot is offline when a prayer event occurs:
  - When the bot restarts, it rebuilds future events starting from `Date.now()`.
  - Past events are skipped and logged as missed during downtime (BR-045).
  - Even if `PRAYER_APPROACHING` was missed during downtime, `PRAYER_TIME_REACHED` will still fire normally if its trigger is still in the future (BR-046).

---

## 4. Discord Integration

### Recommended Library: `discord.js` (v14)
- **Status:** **Implemented** for the gateway client, command handling (M7), and voice integration (M6).
- **Rationale:** 
  - Standard, mature Discord API library for Node.js/TypeScript with comprehensive coverage of interactions, voice gateway v4/v10, and typed models.
  - Active maintenance, extensive documentation, and robust stability.

### Command Handling & Interaction Flows
- **Slash Commands:** Handled using Discord Slash Command Interactions (`ChatInputCommandInteraction`).
- **Command Scope:** Global commands are **always** registered via `Routes.applicationCommands(clientId)` so the bot works in every server it joins (Discord may cache them for up to an hour). `DEV_GUILD_ID` adds additional guild-scoped overrides via `Routes.applicationGuildCommands(clientId, guildId)` for instant test-server updates; it can be a comma-separated list. Each registration target is attempted independently so one failure does not block the others.
- **Component Interactions:** Slash commands and select-menu/button interactions both enter `command-router.ts`. Component custom IDs identify the target flow; the router resolves the active flow by `guildId:userId` from the interaction context.
- **Acknowledgement:** Discord requires a response within three seconds. `/setup`, `/settings`, `/test`, `/enable`, and `/disable`, and any multi-step interaction, call `deferReply` immediately; immediate validation failures may reply directly. Each interaction is acknowledged once. Failures stay in that interaction's boundary.
- **Ephemeral Responses:** Setup and configuration commands (`/setup`, `/settings`, `/test`, `/enable`, `/disable`) respond with ephemeral messages (`ephemeral: true`) to preserve privacy and avoid channel clutter. `/prayer-times` is proposed to be public so any member can read the times; visibility remains Open in the command specification.
- **Select Menu Limits:** A Discord String Select Menu holds at most 25 options. Country and city menus are paginated (Previous/Next buttons carrying the page index) whenever the Location list exceeds 25 entries. Current curated data has 46 countries and up to 9 cities in a single country, so country pagination is active while city pagination activates only beyond 25 entries. Reminder channels and mention roles use Discord's native channel/role select menus (searchable, no 25-entry pagination needed), so users never copy IDs.
- **Flow State:** `command-router.ts` owns an in-memory registry of active flows keyed by `guildId:userId`, with expiry, cancellation, invalid-state handling, and wrong-user rejection. A restart discards flows. Duplicate submissions for the same step are ignored or re-rendered; they never apply twice.
- **Error Presentation:** Known `AppError` instances become short actionable ephemeral messages; unexpected errors are logged with `guildId`, `userId`, `commandName`, and `interactionId` and shown to users only as a generic failure. Stack traces, tokens, and database errors are never exposed.
- **Authorization Enforcement:**
  - Evaluated on the server side in `command-router.ts` / `authorization.ts`.
  - **Proposed Administrator Rule:** Member must possess `PermissionFlagsBits.Administrator` or `PermissionFlagsBits.ManageGuild` on the server. Command execution is aborted immediately if this check fails (BR-063, BR-064).
  - In addition, commands define `default_member_permissions: PermissionFlagsBits.ManageGuild` in their slash definition to hide/disable them in the Discord UI for regular members.

### Text Announcements & Mentions
- **Status:** **Implemented** (M5, with M7 test support). Built by `buildTextAnnouncement`, delivered through the `ITextMessageSender` port by `DiscordMessageSender`; the reminder handler is the scheduler callback. `isTest: true` prefixes `[TEST]` and sets `allowedMentions: { parse: [], roles: [] }`, so tests never ping anyone.
- **Channel Target:** Retrieved from persisted guild configuration.
- **Mention Target:**
  - Configurable as either `@everyone` or a specific role snowflake (e.g., `<@&role_id>`).
  - **Mention Formatting:**
    - If `@everyone`: message contains `@everyone` text and sets `allowedMentions: { parse: ['everyone'] }`.
    - If specific role: message contains `<@&role_id>` and sets `allowedMentions: { roles: [roleId], parse: [] }`. This guarantees `@everyone` is never pinged when a role is configured (BR-037).
    - For tests (`isTest: true`), both modes render the mention label but send `allowedMentions: { parse: [], roles: [] }`: no ping, even when the configured target is a role.
- **Bot Permissions Required in Text Channel:**
  - `ViewChannel`, `SendMessages`, and `MentionEveryone` (BR-060).
  - Missing permissions or deleted text channels are caught, logged, and isolated without crashing the application (BR-034).

---

## 5. Voice & Audio Architecture

### Voice Library: `@discordjs/voice`
- **Status:** **Implemented** (M6), with `opusscript` as the pure-JS Opus encoder; live playback verification is still pending.
- **Rationale:**
  - Official voice implementation built specifically for Discord Gateway v10 and `discord.js`.
  - Native TypeScript, handles WebSocket signaling, UDP audio transmission, voice state transitions, and connection lifecycle reliably.
  - Standalone package that decouples audio playback state from general client interactions.

### Audio Dependencies & Local Audio Format
- **Audio Asset Format (Implemented):** short placeholder 48kHz stereo 16-bit s16le PCM files (`assets/audio/*.pcm`) generated by `scripts/generate-audio-assets.mjs`. Replace them with real recitations in the same format/filenames.
  - *Why PCM:* `createAudioResource(..., { inputType: StreamType.Raw })` plays the stream directly, so no ffmpeg or preprocessing step is required. OGG/Opus remains a future upgrade for real recordings.
- **Audio Player Stack (Implemented):**
  - `@discordjs/voice` with `opusscript` as the Opus encoder (pure JS; avoids the vulnerable native prebuilt download chain of `@discordjs/opus`).
  - `prism-media` ships with `@discordjs/voice`; no `ffmpeg-static` is needed for the current PCM assets.

### Sequential Channel Processing & Lock Management (Implemented)
- **Guild Voice Mutex (Lock — Implemented):**
  - `VoiceCoordinator` holds a per-guild `Set` of active cycles; a second cycle is skipped rather than queued (Proposed policy).
  - Ensures BR-020/BR-021: at most one active voice connection per guild. `/test` shares this lock: an overlapping test or real cycle is skipped, and the real event's ledger key is still committed before its dispatch. A dedicated test lock remains Open.
  - `isTest: true` bypasses the `enabled === false` early-return so a voice test works while automation is disabled.
- **Sequential Playback Loop:**
  1. Filter guild voice channels based on initial eligibility:
     - Standard voice channel (`ChannelType.GuildVoice`).
     - Bot has effective `ViewChannel`, `Connect`, and `Speak` permissions.
     - Channel contains at least one non-bot member (`members.some(m => !m.user.bot)`).
     - Private channel filter (Implemented as Proposed): a channel is private when `@everyone` cannot view it; included only when `includePrivateVoice` is `true`. No name-based inference.
  2. For each candidate channel in sequence:
     - **Recheck Eligibility Immediately Before Join:** Check that non-bot human members are still in the channel and permissions remain intact (BR-016). If not, skip to next channel.
     - **Join:** Invoke `joinVoiceChannel({ channelId, guildId, adapterCreator })`. Wait for `VoiceConnectionStatus.Ready` with a 5-second connection timeout.
     - **Play:** Create audio player, subscribe connection to player, start playback, and await `AudioPlayerStatus.Idle` (or a safety timeout, e.g. 45 seconds).
     - **Disconnect:** Explicitly call `connection.destroy()` inside a `finally` block before proceeding to the next channel (BR-084).
  3. **Failure Isolation:** Any join failure, audio decode error, or network timeout is caught and logged; the loop cleans up the current connection and moves directly to the next eligible channel (BR-024, BR-050).

---

## 6. Persistence

Shared database infrastructure (`src/infrastructure/persistence/storage.ts` and the versioned migrations) stays in `infrastructure/persistence/`. Feature-specific SQLite adapters are owned by their modules and placed in their own concern folder: `src/modules/settings/settings-store/settings-store.ts` and `src/modules/scheduling/delivery-ledger-store/delivery-ledger-store.ts` are implemented. All adapters use the same SQLite database. Module folders follow the convention in [Code Structure](../architecture/code-structure.md#folder-convention-applies-to-every-module); store implementations follow its [store convention](../architecture/code-structure.md#store-convention-general-rule): explicit columns, parameterized queries, runtime row validation, and a private `toEntity()` mapper.

### Recommended Database: SQLite via `better-sqlite3`
- **Status:** **Implemented** for settings persistence and schema migrations (M2).
- **Rationale:**
  - **Simplest Suitable for MVP:** Embedded, serverless, single-file relational database (`data/mudhakkir.db`).
  - Zero network configuration or external database server maintenance.
  - `better-sqlite3` is synchronous, extremely fast (order of magnitude faster than async SQLite wrappers), robust, and handles transactions atomically.
  - Provides reliable ACID guarantees, ensuring settings updates and delivery ledger commits never suffer file-corruption or partial writes (unlike plain JSON file read/write).
  - Perfect fit for a single Node.js process and easily inspectable/backupable.

### Minimum Stored Data & Schema (MVP)

#### 1. `guild_settings` Table
Holds persistent configuration per Discord server:
- `guild_id` (TEXT, PRIMARY KEY) — Discord Guild Snowflake
- `enabled` (INTEGER, NOT NULL DEFAULT 0) — Boolean flag (1 = active, 0 = disabled)
- `city_name` (TEXT, NOT NULL) — Display name of city
- `country_name` (TEXT, NOT NULL) — Display name of country
- `latitude` (REAL, NOT NULL) — Latitude in decimal degrees
- `longitude` (REAL, NOT NULL) — Longitude in decimal degrees
- `timezone` (TEXT, NOT NULL) — Authoritative IANA timezone (e.g. `"Africa/Cairo"`)
- `calculation_method` (TEXT, NOT NULL DEFAULT 'Egyptian') — Calculation method identifier
- `text_channel_id` (TEXT, NOT NULL) — Channel Snowflake for text reminders
- `mention_type` (TEXT, NOT NULL DEFAULT 'everyone') — 'everyone' or 'role'
- `mention_role_id` (TEXT, NULL) — Role Snowflake if `mention_type` is 'role'
- `voice_lead_time_minutes` (INTEGER, NOT NULL DEFAULT 10) — Lead time before prayer (minutes)
- `include_private_voice` (INTEGER, NOT NULL DEFAULT 0) — Boolean flag (1 = include, 0 = skip)
- `updated_at` (TEXT, NOT NULL) — ISO8601 timestamp

#### 2. `delivery_ledger` Table
Durable deduplication store preventing duplicate text and voice announcements:
- `event_key` (TEXT, PRIMARY KEY) — Format: `guild_id:prayer_date:prayer_name:event_type`
- `guild_id` (TEXT, NOT NULL)
- `prayer_date` (TEXT, NOT NULL) — Local prayer date `YYYY-MM-DD`
- `prayer_name` (TEXT, NOT NULL) — 'fajr', 'dhuhr', 'asr', 'maghrib', 'isha'
- `event_type` (TEXT, NOT NULL) — 'PRAYER_APPROACHING' or 'PRAYER_TIME_REACHED'
- `delivered_at` (TEXT, NOT NULL) — ISO8601 timestamp

**Current implementation status:** the module-owned adapter, commit-before-dispatch logic, and pruning are implemented (M4.2). Pruning runs at scheduler startup and deletes ledger rows older than 7 days.

---

## 7. Validation, Dependency Injection & Error Handling

### Configuration Validation: `zod`

**Input boundary convention:** `discord/` commands and flows validate and normalize raw user input (shape, trimming, casing, parsing) before calling a service; services receive canonical values and enforce business rules. See the [input boundary convention](../architecture/code-structure.md#input-boundary-convention-general-rule). Reference-data integrity checks are separate from request validation.

- **Status:** **Implemented** (M1/M2)
- **Rationale:**
  - Industry-standard TypeScript-first schema declaration and runtime validation library.
  - Zero runtime dependencies, tiny footprint, and produces detailed, user-friendly error messages when input validation fails.
  - Validates environment variables (`DISCORD_TOKEN`, `CLIENT_ID`), user inputs from commands, and records loaded from persistence before use.
- **Implemented validation rules:**
  - Latitude: `-90.0 <= lat <= 90.0`
  - Longitude: `-180.0 <= lon <= 180.0`
  - Timezone: validated by constructing an `Intl.DateTimeFormat` with the supplied IANA zone
  - Calculation method: one of the supported enum values
  - Mention type: `everyone` or `role`; a role ID is required when `role` is selected
  - Lead time: integer between 1 and 60 minutes
  - Required text and guild identifiers: non-empty strings
- **Implemented presentation validation:** the setup flow checks that the selected text channel exists and is text-based via `guild.channels.fetch`; roles are chosen with Discord's native role picker so their existence is guaranteed by the UI. No separate snowflake regex is used — the canonical IDs come from Discord components. These checks stay in the Discord layer, not the persistence schema.

### Dependency Injection: `tsyringe`
- **Status:** **Implemented**
- **Rationale:**
  - Lightweight, TypeScript-native Inversion of Control container supporting constructor injection via decorators (`@injectable()` and `@inject`).
  - Decouples business logic from concrete storage, logging, and Discord adapters.
  - Centralized dependency registration in `src/app/composition.ts`.
  - Enables clean unit and integration testing without launching external services.
- **Tokens (`src/shared/di/tokens.ts`):** `TOKENS` symbol registry ensures type-safe, decoupled token-based resolution.

### Error Handling: `AppError` Hierarchy
- **Status:** **Implemented**: core error model, command/router, scheduler, reminder, voice-channel boundaries, and process-level fatal traps with graceful shutdown.
- **Rationale:**
  - Distinguishes operational/expected domain errors (`isOperational: true`) from unhandled system crashes (`isOperational: false`).
  - Base class `AppError` (`src/shared/error/app-error.ts`) carries a stable error `code` and safe user-facing message.
  - Subclasses: `NotFoundError`, `ValidationError`, `PermissionError`, `ConflictError`, `ConfigurationError`.
  - Discord command handlers catch `AppError` instances to return clear, actionable ephemeral responses without exposing internals.

Feature areas define their own error meanings as constant instances in an area-owned `*.errors.ts` file (e.g. `src/modules/settings/settings.errors.ts`). Create one only when a throw site needs it, name it by meaning, and reuse the shared subclass that matches; several constants may share a subclass. See the [error convention](../architecture/code-structure.md#error-convention-general-rule).

### Logging Framework: `pino`
- **Status:** **Implemented**
- **Rationale:**
  - Extremely fast, low overhead structured JSON logger for Node.js.
  - Supports log levels (`debug`, `info`, `warn`, `error`).
  - Supports contextual child loggers (e.g., `logger.child({ module: 'voice', guildId: '...' })`).
  - In development, `pino-pretty` formats output into human-readable colored terminal lines; in production, logs standard structured JSON lines to `stdout` for clean log-collector ingestion.
- **Error Handling Strategy:**
  - Structured error boundaries around commands, timer execution, and voice channel iteration.
  - Never swallow unexpected errors silently.
  - Discord interaction replies catch command failures and return friendly error explanations to administrators while logging full stack traces internally.

---

## 8. Summary of Technical Decisions

| Subsystem | Recommendation | Classification | Key Trade-off / Note |
| :--- | :--- | :--- | :--- |
| **Prayer Calculation** | `adhan` library | **Implemented** (M3) | In-process astronomical calculations; zero runtime network dependencies. |
| **Default Calculation Method** | Egyptian General Authority of Survey | **Confirmed** (FR-003) | Standard for Egypt and Arab region. |
| **Location reference data** | Curated JSON countries/cities only | **Implemented** (M3 Location) | Deterministic and offline; unsupported selections are rejected. |
| **Timezone & DST** | IANA timezone strings from curated data, validated via Node `Intl` | **Implemented** (M3/M4) | Immune to DST shifts and local server OS clock offsets; calculation, formatting, and the scheduling horizon use IANA calendar dates. |
| **Scheduling Engine** | In-process dynamic `setTimeout` + periodic heartbeat | **Implemented** (M4) | Lightweight, rebuildable on restart; no Redis/job queue required. |
| **Duplicate Prevention** | `delivery_ledger` SQLite table (commit-before-dispatch) | **Implemented** | Module-owned adapter and commit-before-dispatch are implemented; policy confirmed in M4.1. |
| **Discord Library** | `discord.js` v14 | **Implemented** (M1/M7) | Gateway client, slash commands, component interactions, and message/voice adapters exist. |
| **Administrator Auth** | `ManageGuild` or `Administrator` permission check | **Proposed** | Verified server-side on interaction before processing. |
| **Voice Library** | `@discordjs/voice` + `opusscript` | **Implemented** (M6) | Official Discord voice package; pure-JS Opus encoder avoids a vulnerable native download chain. |
| **Local Audio Format** | 48kHz stereo s16le PCM files | **Implemented** (M6) | Played with `StreamType.Raw`; no ffmpeg or transcoding step. Placeholder assets; OGG/Opus remains a future upgrade. |
| **Sequential Voice** | Per-guild in-process lock (`VoiceCoordinator`) | **Confirmed** (BR-020) | Max 1 active voice channel per guild; rechecks eligibility before join. |
| **Database** | SQLite via `better-sqlite3` | **Implemented** (M2) | Fast, synchronous, single-file ACID persistence. |
| **Dependency Injection** | `tsyringe` + centralized `TOKENS` | **Implemented** | Constructor injection with leaf-level tokens; decoupled composition. |
| **Error Handling** | `AppError` domain hierarchy | **Implemented** | Operational error flags and codes; feature boundaries catch and contain failures. |
| **Validation** | `zod` | **Implemented** | Type-safe runtime schema validation for configs and inputs. |
| **Logging** | `pino` | **Implemented** | Structured JSON logs with context bindings; zero bloat. |

---

## 9. Decisions Requiring Approval

The following recommendations are **Proposed** and require explicit confirmation prior to implementation:

1. **Adhan Library Adoption:** Implemented. `adhan` is the prayer-calculation engine; no external prayer-time API is used at runtime.
2. **City Geocoding Strategy:** Deferred. The current implementation is curated-data-only; any external geocoding fallback needs a separate decision.
3. **Delivery Ledger Commit Order:** **Approved (M4.1).** Commit-before-dispatch gives at-most-once semantics, prioritizing zero duplicate messages over potential lost announcements during unhandled process crashes.
4. **Discord Administrator Permission:** Approve `PermissionFlagsBits.ManageGuild` or `Administrator` as the requisite authorization check for configuration commands.
5. **Voice Audio Format:** Implemented with generated 48kHz stereo PCM placeholders; replacing them with real Ogg Opus recitations is a product/content decision, not a blocking approval.
6. **Lead Time Constraint:** Approve restricting voice announcement lead time to an integer between 1 and 60 minutes (default 10 minutes).
7. **Scheduler Implementation:** Implemented in M4.2 as a single in-process `setTimeout` timer with a rebuild-on-change policy and heartbeat; no polling or job queue.

SQLite through `better-sqlite3`, `discord.js` v14, `tsyringe`, `zod`, `pino`, `adhan`, and the `AppError` hierarchy are no longer approval items: they are present in the current source tree (see section 8). Prayer calculation uses the Standard Asr rule application-wide; no per-guild variation is planned. The build script already copies SQL migrations into `dist/infrastructure/persistence/migrations`.

## 10. Known Implementation Gaps

Recorded from the current source tree; these must be closed before the affected feature is considered complete.

| Gap | Impact | Related milestone |
| --- | --- | --- |
| Live Discord gateway/voice playback is unverified and audio assets are placeholder tones. | All flows are verified offline with fakes and real SQLite; no real recitations yet. | Manual M8 sign-off |
| Live 24/7 operation on the deployment target is unverified. | Docker/systemd descriptors exist but have not been run against a real server. | Manual M8 sign-off |

## 11. Deployment & backup (M8)

- `Dockerfile` builds TypeScript in a build stage and runs a single Node process as a non-root user in the runtime stage; no build tools ship in the final image.
- `docker-compose.yml` mounts a named volume at `/app/data` so `mudhakkir.db` survives container recreation; `.env` is supplied via `env_file`, never baked into the image.
- `systemd/mudhakkir.service` provides the equivalent headless-Linux unit (`WorkingDirectory`, `EnvironmentFile`, `Restart=always`, `SIGINT` for graceful stop).
- Shutdown drains in-flight deliveries, closes SQLite with a WAL checkpoint, and flushes Pino before exit; `SHUTDOWN_GRACE_MS` controls the grace period.
- Backup and restore instructions live in [`Docs/operations/backup-and-recovery.md`](../operations/backup-and-recovery.md).
