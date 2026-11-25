# Mudhakkir — Technical Design

This document details the practical technical decisions and architecture specifications for implementing the Mudhakkir Minimum Viable Product (MVP). It bridges the conceptual requirements defined in [Requirements](../product/requirements.md) and [System Architecture](../architecture/system-architecture.md) into concrete, library-level designs.

Status labels follow the [documentation conventions](../README.md#status-labels): **Confirmed** for decisions explicitly established by project constraints, **Proposed** for technical recommendations that require user/stakeholder approval, and **Implemented** for code that exists in the current source tree. “Implemented” describes code state, not a product decision.

---

## 1. Prayer Calculation

### Recommended Library: `adhan` (or `@batoulapps/adhan`)
- **Status:** **Proposed**
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
- **High-Latitude Anomalies:** Locations above ~48° latitude experience periods in summer/winter where Fajr or Isha twilight does not occur naturally. `adhan` provides high-latitude approximation rules (e.g., `HighLatitudeRule.TwilightAngle` or `SeventhOfTheNight`). For MVP, `HighLatitudeRule.TwilightAngle` is proposed as the fallback to avoid calculation failures or `null`/`undefined` times.
- **Elevation:** Astronomical calculation operates at sea level by default. Elevation adjustments are negligible for Discord reminders and omitted in MVP to keep configuration simple.

---

## 2. Location & Timezone

### Geocoding & City Selection
- **MVP Strategy (Proposed):** Dual-tier approach:
  1. **Pre-bundled Offline Major City Directory:** A lightweight static JSON dataset containing ~200-500 prominent Muslim cities globally (City, Country, Latitude, Longitude, canonical IANA Timezone). Ensures zero external network dependencies and immediate, rate-limit-free autocompletion for 90%+ of deployments.
  2. **External Geocoding Adapter (Nominatim / OpenStreetMap):** Standard OSM Nominatim API (`https://nominatim.openstreetmap.org/search`) with a custom `User-Agent` header as an optional fallback when a city is not present in the local database.
- **Alternative Open-source Choice:** Mapbox Geocoding or Open-Meteo Geocoding API (fast, free for non-commercial, no API key required for low volume).
- **Setup Requirements:** Nominatim requires compliance with their Usage Policy: max 1 request/second and an identifying HTTP `User-Agent`.

### Coordinates & IANA Timezone Authority
- **Coordinates:** Stored as decimal degrees (Latitude: -90.0 to +90.0, Longitude: -180.0 to +180.0).
- **IANA Timezone:** Stored as an authoritative canonical IANA string (e.g., `"Africa/Cairo"`, `"Asia/Riyadh"`, `"Europe/London"`, `"America/New_York"`) (**Confirmed** per BR-040, FR-002).
- **Timezone Derivation:** When geocoding external coordinates, the IANA zone is inferred via `tz-lookup` or `@photostructure/tz-lookup` (lightweight, offline coordinate-to-IANA timezone resolver, ~100KB).
- **DST Handling:** Calculations and event generation rely on Node.js built-in `Intl` API or `luxon`/`date-fns-tz` with IANA timezone strings. By computing prayer times against the local calendar date and converting to UTC epoch timestamps via the IANA zone, all Daylight Saving Time (DST) changes (spring-forward / fall-back) are applied automatically and accurately without offset drifting (BR-042).

---

## 3. Scheduling & Event Reliability

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
- **Commit Semantics (Proposed Decision for MVP):**
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
- **Status:** **Implemented** for the gateway client; command handling and voice integration are still planned.
- **Rationale:** 
  - Standard, mature Discord API library for Node.js/TypeScript with comprehensive coverage of interactions, voice gateway v4/v10, and typed models.
  - Active maintenance, extensive documentation, and robust stability.

### Command Handling & Interaction Flows
- **Slash Commands:** Handled using Discord Slash Command Interactions (`ChatInputCommandInteraction`).
- **Command Scope:** Registered via REST API to Discord (`Routes.applicationCommands(clientId)` or guild-specific commands for instant updates during development).
- **Ephemeral Responses:** Setup and configuration commands (`/setup`, `/settings`, `/test`, `/enable`, `/disable`) respond with ephemeral messages (`ephemeral: true`) to preserve privacy and avoid channel clutter.
- **Authorization Enforcement:**
  - Evaluated on the server side in `command-router.ts` / `authorization.ts`.
  - **Proposed Administrator Rule:** Member must possess `PermissionFlagsBits.Administrator` or `PermissionFlagsBits.ManageGuild` on the server. Command execution is aborted immediately if this check fails (BR-063, BR-064).
  - In addition, commands define `default_member_permissions: PermissionFlagsBits.ManageGuild` in their slash definition to hide/disable them in the Discord UI for regular members.

### Text Announcements & Mentions
- **Channel Target:** Retrieved from persisted guild configuration.
- **Mention Target:**
  - Configurable as either `@everyone` or a specific role snowflake (e.g., `<@&role_id>`).
  - **Mention Formatting:**
    - If `@everyone`: message contains `@everyone` text and sets `allowedMentions: { parse: ['everyone'] }`.
    - If specific role: message contains `<@&role_id>` and sets `allowedMentions: { roles: [roleId], parse: [] }`. This guarantees `@everyone` is never pinged when a role is configured (BR-037).
- **Bot Permissions Required in Text Channel:**
  - `ViewChannel`, `SendMessages`, and `MentionEveryone` (BR-060).
  - Missing permissions or deleted text channels are caught, logged, and isolated without crashing the application (BR-034).

---

## 5. Voice & Audio Architecture

### Recommended Voice Library: `@discordjs/voice`
- **Status:** **Proposed**
- **Rationale:**
  - Official voice implementation built specifically for Discord Gateway v10 and `discord.js`.
  - Native TypeScript, handles WebSocket signaling, UDP audio transmission, voice state transitions, and connection lifecycle reliably.
  - Standalone package that decouples audio playback state from general client interactions.

### Audio Dependencies & Local Audio Format
- **Audio Asset Format (Proposed):** 
  - Standard `.ogg` (Opus) or 16-bit 48kHz stereo `.mp3` / `.wav`.
  - **Recommendation:** Pre-transcoded 48kHz stereo OGG/Opus files stored in `assets/audio/`.
  - *Why Opus/Ogg:* Discord's voice protocol natively uses Opus at 48kHz. Playing pre-encoded Opus audio avoids real-time CPU transcoding via FFmpeg during announcement cycles.
- **Audio Player Stack:**
  - `@discordjs/voice` with `@discordjs/opus` (or `opusscript`) and standard audio resource creation (`createAudioResource`).
  - `prism-media` and `ffmpeg-static` as a fallback decoder for standard `.mp3` files if custom user audio is introduced later.

### Sequential Channel Processing & Lock Management
- **Guild Voice Mutex (Lock):**
  - An in-process `VoiceCoordinator` holding a per-guild mutex (`isVoiceActive: boolean`).
  - Ensures strict compliance with BR-020 and BR-021: at most one active voice connection in the guild at any time.
- **Sequential Playback Loop:**
  1. Filter guild voice channels based on initial eligibility:
     - Standard voice channel (`ChannelType.GuildVoice`).
     - Bot has effective `ViewChannel`, `Connect`, and `Speak` permissions.
     - Channel contains at least one non-bot member (`members.some(m => !m.user.bot)`).
     - Private channel filter: if channel has permission overwrites hiding `@everyone`, only included if `includePrivateChannels` is `true`.
  2. For each candidate channel in sequence:
     - **Recheck Eligibility Immediately Before Join:** Check that non-bot human members are still in the channel and permissions remain intact (BR-016). If not, skip to next channel.
     - **Join:** Invoke `joinVoiceChannel({ channelId, guildId, adapterCreator })`. Wait for `VoiceConnectionStatus.Ready` with a 5-second connection timeout.
     - **Play:** Create audio player, subscribe connection to player, start playback, and await `AudioPlayerStatus.Idle` (or a safety timeout, e.g. 45 seconds).
     - **Disconnect:** Explicitly call `connection.destroy()` inside a `finally` block before proceeding to the next channel (BR-084).
  3. **Failure Isolation:** Any join failure, audio decode error, or network timeout is caught and logged; the loop cleans up the current connection and moves directly to the next eligible channel (BR-024, BR-050).

---

## 6. Persistence

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

**Current implementation status:** the table exists, but the ledger adapter, commit logic, and pruning are not implemented. *Ledger Pruning Strategy (Proposed):* an automatic lightweight cleanup executed at daily startup or midnight deleting ledger records older than 7 days.

---

## 7. Validation, Dependency Injection & Error Handling

### Configuration Validation: `zod`
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
- **Planned validation:** snowflake format checks, text-channel existence in the guild cache, and role existence in the guild cache. These checks require Discord context and belong with the command/setup layer rather than the persistence schema.

### Dependency Injection: `tsyringe`
- **Status:** **Implemented**
- **Rationale:**
  - Lightweight, TypeScript-native Inversion of Control container supporting constructor injection via decorators (`@injectable()` and `@inject`).
  - Decouples business logic from concrete storage, logging, and Discord adapters.
  - Centralized dependency registration in `src/app/composition.ts`.
  - Enables clean unit and integration testing without launching external services.
- **Tokens (`src/shared/di/tokens.ts`):** `TOKENS` symbol registry ensures type-safe, decoupled token-based resolution.

### Error Handling: `AppError` Hierarchy
- **Status:** **Implemented** for the core error model; command and announcement boundaries are planned.
- **Rationale:**
  - Distinguishes operational/expected domain errors (`isOperational: true`) from unhandled system crashes (`isOperational: false`).
  - Base class `AppError` (`src/shared/error/app-error.ts`) carries a stable error `code` and safe user-facing message.
  - Subclasses: `NotFoundError`, `ValidationError`, `PermissionError`, `ConflictError`, `ConfigurationError`.
  - Discord command handlers catch `AppError` instances to return clear, actionable ephemeral responses without exposing internals.

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
| **Prayer Calculation** | `adhan` library | **Proposed** | In-process astronomical calculations; zero network dependencies. Not installed yet. |
| **Default Calculation Method** | Egyptian General Authority of Survey | **Confirmed** (FR-003) | Standard for Egypt and Arab region. |
| **Location & Geocoding** | Bundled static JSON major cities + OSM Nominatim fallback | **Proposed** | Offline reliability for 90%+ cases; rate-limited fallback. |
| **Timezone & DST** | IANA timezone strings via Node `Intl` & `tz-lookup` | **Confirmed** (BR-040) | Immune to DST shifts and local server OS clock offsets. Current settings validation uses `Intl`; calculation is pending. |
| **Scheduling Engine** | In-process dynamic `setTimeout` + periodic heartbeat | **Proposed** | Lightweight, rebuildable on restart; no Redis/job queue required. |
| **Duplicate Prevention** | `delivery_ledger` SQLite table (commit-before-dispatch) | **Proposed** | Table exists; adapter and commit behavior are not implemented. |
| **Discord Library** | `discord.js` v14 | **Implemented** (gateway client) | Client and required intents exist; commands and voice integration are planned. |
| **Administrator Auth** | `ManageGuild` or `Administrator` permission check | **Proposed** | Verified server-side on interaction before processing. |
| **Voice Library** | `@discordjs/voice` | **Proposed** | Official Discord voice package; manages UDP and voice signaling. Not installed yet. |
| **Local Audio Format** | 48kHz Stereo Ogg Opus files | **Proposed** | Pre-encoded to match Discord voice specs; bypasses runtime transcoding. |
| **Sequential Voice** | Per-guild in-process lock (`VoiceCoordinator`) | **Confirmed** (BR-020) | Max 1 active voice channel per guild; rechecks eligibility before join. |
| **Database** | SQLite via `better-sqlite3` | **Implemented** (M2) | Fast, synchronous, single-file ACID persistence. |
| **Dependency Injection** | `tsyringe` + centralized `TOKENS` | **Implemented** | Constructor injection with leaf-level tokens; decoupled composition. |
| **Error Handling** | `AppError` domain hierarchy | **Implemented** (core) | Operational error flags (`isOperational: true`) and error codes; feature boundaries planned. |
| **Validation** | `zod` | **Implemented** | Type-safe runtime schema validation for configs and inputs. |
| **Logging** | `pino` | **Implemented** | Structured JSON logs with context bindings; zero bloat. |

---

## 9. Decisions Requiring Approval

The following recommendations are **Proposed** and require explicit confirmation prior to implementation:

1. **Adhan Library Adoption:** Approve `adhan` (or `@batoulapps/adhan`) as the prayer-calculation engine.
2. **City Geocoding Strategy:** Approve the hybrid bundled major-city offline dataset + Nominatim fallback.
3. **Delivery Ledger Commit Order:** Approve commit-before-dispatch (at-most-once semantics) prioritizing zero duplicate messages over potential lost announcements during unhandled process crashes.
4. **Discord Administrator Permission:** Approve `PermissionFlagsBits.ManageGuild` or `Administrator` as the requisite authorization check for configuration commands.
5. **Voice Audio Format:** Approve pre-transcoded 48kHz Ogg Opus as the standard asset format for local prayer audio files.
6. **Lead Time Constraint:** Approve restricting voice announcement lead time to an integer between 1 and 60 minutes (default 10 minutes).
7. **Scheduler Implementation:** Approve a single in-process `setTimeout` timer with a rebuild-on-change policy rather than polling or a job queue.

SQLite through `better-sqlite3`, `discord.js` v14, `tsyringe`, `zod`, `pino`, and the `AppError` hierarchy are no longer approval items: they are present in the current source tree (see section 8). Prayer calculation uses the Standard Asr rule application-wide; no per-guild variation is planned. A migration-copy deployment step still needs review before production builds.

## 10. Known Implementation Gaps

Recorded from the current source tree; these must be closed before the affected feature is considered complete.

| Gap | Impact | Related milestone |
| --- | --- | --- |
| No delivery-ledger store, service, or commit policy; only the table exists. | Duplicate protection cannot be tested or relied on. | M4 |
| `SettingsService` imports concrete `SettingsStore` and `Logger` from infrastructure. | Violates the stated port-inversion rule and makes the service harder to test in isolation. | M2 cleanup |
| `tsc` does not copy `.sql` migrations to `dist`. | `npm run build && npm start` cannot run migrations without a copy step. | M8 |
| `unhandledRejection` is logged but does not terminate the process. | Process may continue in an unknown state, contrary to the documented target. | M8 |
| No close/reopen persistence test. | Restart durability is designed but not verified by the suite. | M2/M8 |
| No live Discord login verification recorded. | Connection code exists and unit tests pass, but gateway authentication is unverified. | M1/M8 |
