# Mudhakkir — Code Structure

This document describes the source-code layout for the [system architecture](system-architecture.md). It covers both the current foundation and the target layout. Implemented files are identified below; the remaining tree is **Proposed** and may change as later milestones are built. The module boundaries and dependency direction are the important part.

Status labels follow the [documentation index](../README.md#status-labels). Confirmed constraints come from the [project overview](../product/project-overview.md) and [requirements](../product/requirements.md).

Related documents:

- [System architecture](system-architecture.md) — modules, lifecycle, scheduling, and announcement flows.
- [Requirements](../product/requirements.md) — required behavior and open product decisions.

## 1. Source tree and implementation status

```text
src/
├── index.ts
├── app/
│   ├── bootstrap.ts
│   ├── shutdown.ts
│   ├── composition.ts
│   └── config.ts
├── discord/
│   ├── client.ts
│   ├── command-router.ts
│   ├── authorization.ts
│   ├── commands/
│   │   ├── setup.ts
│   │   ├── prayer-times.ts
│   │   ├── settings.ts
│   │   ├── test.ts
│   │   ├── enable.ts
│   │   └── disable.ts
│   ├── flows/
│   │   ├── setup-flow.ts
│   │   └── settings-flow.ts
│   ├── discord-channels.ts
│   ├── discord-messages.ts
│   └── discord-voice.ts
├── modules/
│   ├── settings/
│   │   ├── index.ts
│   │   ├── settings.types.ts
│   │   ├── settings.validation.ts
│   │   └── settings.service.ts
│   ├── location/
│   │   ├── index.ts
│   │   ├── location.types.ts
│   │   └── location.service.ts
│   ├── prayer-times/
│   │   ├── index.ts
│   │   ├── prayer-time.types.ts
│   │   ├── prayer-times.service.ts
│   │   └── prayer-calculation.ts
│   ├── scheduling/
│   │   ├── index.ts
│   │   ├── event.types.ts
│   │   ├── event-builder.ts
│   │   ├── scheduler.ts
│   │   └── delivery-ledger.ts
│   └── reminders/
│       ├── index.ts
│       ├── reminder-handler.ts
│       ├── text/
│       │   ├── text-announcement.service.ts
│       │   └── text-message.builder.ts
│       └── voice/
│           ├── voice-announcement.service.ts
│           ├── channel-eligibility.ts
│           └── voice-cycle.ts
├── infrastructure/
│   ├── persistence/
│   │   ├── storage.ts
│   │   ├── settings-store.ts
│   │   ├── delivery-ledger-store.ts
│   │   └── migrations/
│   │       └── 001_initial_schema.sql
│   ├── audio/
│   │   ├── audio-library.ts
│   │   └── audio-player.ts
│   ├── logging/
│   │   └── logger.ts
│   └── clock/
│       └── system-clock.ts
└── shared/
    ├── di/
    │   └── tokens.ts
    ├── error/
    │   └── app-error.ts
    └── clock.ts

test/
├── unit/
│   ├── config.test.ts
│   ├── di-container.test.ts
│   ├── discord-client.test.ts
│   ├── prayer-times/
│   ├── scheduling/
│   └── voice/
├── integration/
│   ├── persistence.test.ts
│   └── commands/
└── fixtures/
    ├── settings/
    ├── prayer-times/
    └── audio/
```

### Implemented files today

| Area | Implemented paths |
| --- | --- |
| Entry and lifecycle | `src/index.ts`, `src/app/config.ts`, `src/app/composition.ts`, `src/app/bootstrap.ts`, `src/app/shutdown.ts` |
| Discord | `src/discord/client.ts` |
| Settings | `src/modules/settings/index.ts`, `src/modules/settings/settings.types.ts`, `src/modules/settings/settings.validation.ts`, `src/modules/settings/settings.service.ts` |
| Persistence | `src/infrastructure/persistence/storage.ts`, `src/infrastructure/persistence/settings-store.ts`, `src/infrastructure/persistence/migrations/001_initial_schema.sql` |
| Logging | `src/infrastructure/logging/logger.ts` |
| Shared | `src/shared/di/tokens.ts`, `src/shared/error/app-error.ts` |
| Tests | `test/unit/config.test.ts`, `test/unit/di-container.test.ts`, `test/unit/discord-client.test.ts`, `test/integration/persistence.test.ts` |

Everything else in the tree is planned. In particular, the command layer, prayer calculation, scheduler, announcements, ledger adapter, audio stack, and clock do not exist yet.

### Layer Separation: `shared` vs `infrastructure`

- **`shared/` (Technology-independent cross-cutting primitives):** Contains shared types, error definitions, DI tokens, and — when added — clock contracts, with **zero** external technical dependencies (no SQLite, no Discord, no Pino). Today this is `TOKENS` and the `AppError` hierarchy.
- **`infrastructure/` (Technical adapters & implementations):** Contains concrete implementations that integrate with external libraries and technical drivers (SQLite with `better-sqlite3`, `pino` logger; `@discordjs/voice` audio playback is planned). The DI container itself is assembled in `src/app/composition.ts`, not in infrastructure.

## 2. Responsibilities of important files

### Root and application lifecycle

| Path | Responsibility |
| --- | --- |
| `src/index.ts` | Process entry point. Loads `.env`, validates configuration, initializes DI, resolves the logger and Discord client, and starts `bootstrap`. |
| `app/config.ts` | Reads and validates environment variables (`DISCORD_TOKEN`, `CLIENT_ID`, `LOG_LEVEL`, `NODE_ENV`) using Zod. Fails fast with clear error messages. |
| `app/composition.ts` | Composition root: creates the logger, opens SQLite, runs migrations, creates the Discord client, registers stores/services, and exposes `initContainer`. |
| `app/bootstrap.ts` | Startup sequence: installs signal handling, logs in to Discord, waits for `ClientReady`, logs bot identity, and resolves. Command registration and schedule startup are planned. |
| `app/shutdown.ts` | Graceful shutdown handler: intercepts `SIGINT`/`SIGTERM`, destroys the Discord client, and exits; a second signal forces exit. Scheduler/voice/database teardown is planned. |

### Discord integration (Presentation Layer)

| Path | Responsibility |
| --- | --- |
| `discord/client.ts` | Constructs `discord.js` Client with required gateway intents (`Guilds`, `GuildVoiceStates`) and error handlers. |
| `discord/command-router.ts` | Maps incoming slash command interactions to handlers and enforces authorized guild contexts. |
| `discord/authorization.ts` | Checks that the invoking member possesses required administrative permissions (`ManageGuild`/`Administrator`). |
| `discord/commands/*.ts` | Presentation command handlers. Parse inputs, authorize, delegate to domain services via constructor-injected instances, and respond ephemerally. |
| `discord/flows/*.ts` | Multi-step interactive setup and configuration flows using Discord modals, buttons, and select menus. |
| `discord/discord-channels.ts` | Inspects channel existence, types, human membership, and effective bot permissions for voice eligibility. |
| `discord/discord-messages.ts` | Sends text reminders to the configured channel with isolated mentions (`@everyone` or role snowflake). |
| `discord/discord-voice.ts` | Manages voice channel join, leave, and state transitions using `@discordjs/voice`. |

### Business modules (Application & Domain Layers)

| Path | Responsibility |
| --- | --- |
| `modules/settings/settings.types.ts` | Domain types (`GuildSettings`, `CalculationMethod`, `MentionType`). |
| `modules/settings/settings.validation.ts` | Runtime validation using Zod: coordinate boundaries, valid IANA timezones, lead times (1–60m), and required role IDs. |
| `modules/settings/settings.service.ts` | Implemented service (`ISettingsService`) decorated with `@injectable()`. Coordinates reads, saves, updates, enable toggles, and deletion; throws `NotFoundError` on missing settings. **Current boundary gap:** it imports the concrete `SettingsStore` and `Logger` from infrastructure rather than depending on a store port and shared logger contract. |
| `modules/location/location.service.ts` | Resolves city/country queries to coordinates and authoritative IANA timezones (hybrid offline dataset + Nominatim). |
| `modules/prayer-times/prayer-calculation.ts` | Pure astronomical calculation wrapper around `adhan` library (Egyptian default method, fixed Standard Asr rule). |
| `modules/prayer-times/prayer-times.service.ts` | Domain service computing the 5 prayer instants for a date and location in the configured IANA timezone. |
| `modules/scheduling/event.types.ts` | Event definitions (`PRAYER_APPROACHING`, `PRAYER_TIME_REACHED`) and unique event keys. |
| `modules/scheduling/event-builder.ts` | Builds upcoming events for today and tomorrow based on settings and lead time. |
| `modules/scheduling/scheduler.ts` | In-process dynamic timer scheduler (`setTimeout`) with restart recovery, past-event filtering, and timer rebuilds. |
| `modules/scheduling/delivery-ledger.ts` | Planned. Deduplication service managing at-most-once delivery commits and pruning records older than 7 days. The table exists; the service does not. |
| `modules/reminders/reminder-handler.ts` | Top-level dispatcher receiving scheduler events and independently invoking text and voice announcement pipelines. |
| `modules/reminders/text/text-announcement.service.ts` | Formats and sends prayer reminders to the configured channel with accurate mentions. |
| `modules/reminders/voice/channel-eligibility.ts` | Evaluates channel eligibility: supported type, bot permissions, human presence, and private channel policy. |
| `modules/reminders/voice/voice-cycle.ts` | Manages sequential voice channel visits under the guild voice lock, rechecking eligibility immediately before connecting. |
| `modules/reminders/voice/voice-announcement.service.ts` | Coordinates the voice reminder cycle using the per-guild mutex (`VoiceCoordinator`). |

### Infrastructure and Shared Code

| Path | Responsibility |
| --- | --- |
| `infrastructure/persistence/storage.ts` | Implemented. Creates SQLite database (`better-sqlite3`), enables WAL mode and foreign keys, and runs automatic schema migrations. |
| `infrastructure/persistence/settings-store.ts` | Implemented. SQLite adapter for `guild_settings` implementing atomic upserts (`INSERT ... ON CONFLICT`) and revalidating rows on read. |
| `infrastructure/persistence/delivery-ledger-store.ts` | Planned. SQLite adapter for the `delivery_ledger` table; the table itself exists in `001_initial_schema.sql`. |
| `infrastructure/persistence/migrations/` | Implemented. Versioned SQL migration scripts (`001_initial_schema.sql`). Note: `tsc` does not copy `.sql` files into `dist`; production builds must copy them explicitly. |
| `infrastructure/audio/audio-library.ts` | Maps prayers to local 48kHz stereo OGG/Opus audio assets and verifies file readability. |
| `infrastructure/audio/audio-player.ts` | Plays audio files through `@discordjs/voice` audio player and manages playback lifecycle. |
| `infrastructure/logging/logger.ts` | Implemented. Pino structured logger implementation with `pino-pretty` development transport. |
| `shared/di/tokens.ts` | Implemented. Centralized dependency injection tokens (`TOKENS`) used for constructor injection across layers. |
| `shared/error/app-error.ts` | Implemented. Domain error hierarchy rooted in `AppError` (`NotFoundError`, `ValidationError`, `PermissionError`, `ConfigurationError`). |
| `shared/clock.ts` | Planned. Clock interface allowing deterministic time mocking in tests; not present yet. |

**Proposed `shared/` rule:** it may contain only generic, dependency-free primitives used by several modules, such as clock and logger types. It must not become a home for business logic, cross-module helpers, or a generic "utils" dumping ground.

## 3. Module public entry points

Each module's `index.ts` is its public entry point. Other code imports from that entry, not from internal files.

```text
Allowed:    import { calculatePrayerTimes } from "../prayer-times";
Forbidden:  import { calculatePrayerTimes } from "../prayer-times/prayer-calculation";
```

**Proposed:** a module entry exports only what other modules need. Internal files may import each other freely. This prevents accidental coupling and makes refactoring inside a module safe.

If a type is needed only to implement a port, the port type belongs with the consuming module, and infrastructure imports that type. This keeps the dependency arrow pointing from adapters to the core, not from the core to storage or Discord.

## 4. Dependency rules

| Allowed dependency | Reason |
| --- | --- |
| `app` → everything | Composition and lifecycle only. |
| `discord/commands` and `discord/flows` → module public entries | Commands call application behavior. |
| `settings` → `location`, `prayer-times` public types/validation | Validate supported locations and prayer settings. |
| `scheduling` → `settings`, `prayer-times` | Build events from settings and calculated times. |
| `reminders` → `settings`, text, voice public entries | Coordinate independent delivery paths. |
| Text → message port | Send without knowing Discord internals. |
| Voice → channel, voice, audio ports | Check eligibility and play sequentially. |
| Infrastructure → port types | Implement adapters. |

Forbidden dependencies:

- A business module importing `discord/`, a concrete storage adapter, or a playback library.
- `prayer-times` importing settings, scheduling, reminders, or persistence.
- Scheduling importing text or voice.
- Text importing voice, or voice importing text.
- Command handlers importing a concrete infrastructure implementation.

**Current implementation gap:** `modules/settings/settings.service.ts` imports the concrete `SettingsStore` and the infrastructure `Logger` type. This is acceptable temporarily for the M2 foundation, but it does not yet satisfy the port-inversion rule and should be corrected before more modules depend on it.

## 5. Enforceable architecture rules

These rules are the architectural contract. Rules marked **Confirmed** restate existing project constraints; the rest are **Proposed** implementation rules.

| ID | Status | Rule | Enforcement |
| --- | --- | --- | --- |
| ARCH-001 | Confirmed | The system runs as one Node.js process with one bot instance; no worker threads, separate workers, external queues, or distributed schedulers. | Build configuration and code review. |
| ARCH-002 | Proposed | Modules communicate through public entry points only; no deep imports into another module's internals. | Import-boundary lint or dependency check. |
| ARCH-003 | Proposed | Business modules must not import Discord, concrete persistence, audio libraries, or the application bootstrap. | Import-boundary check. |
| ARCH-004 | Confirmed | Prayer calculation does not schedule or deliver; scheduling does not calculate prayer times. | Unit tests and code review. |
| ARCH-005 | Confirmed | Text and voice services must not call each other; only the reminder handler invokes both. | Import rules and review. |
| ARCH-006 | Confirmed | At most one voice connection exists per guild at a time. | Single voice coordinator; integration test where practical. |
| ARCH-007 | Proposed | All configuration writes go through the Settings service; schedule-affecting changes trigger a schedule rebuild. | Code review and command tests. |
| ARCH-008 | Proposed | The scheduler owns all future-event timers. No command handler, reminder service, or adapter creates a timer for a prayer event; short-lived operation timeouts inside the owning service are permitted. | Code search and review. |
| ARCH-009 | Proposed | Command handlers parse, authorize, call, and respond. They contain no prayer, eligibility, or persistence rules. | Review and command unit tests with fake services. |
| ARCH-010 | Confirmed | Inversion of Control: components use constructor injection decorated with `@injectable()` and `@inject(TOKENS...)`. Only the composition root (`src/app/composition.ts` / container) wires concrete singletons and instances. | Dependency check and code review. |
| ARCH-011 | Proposed | External I/O is behind a small port: message sending, voice transport, channel data, storage, audio playback, clock, and geocoding. No global clients. | Review; unit tests use fakes/mocks. |
| ARCH-012 | Proposed | Persistence details stay in `infrastructure/persistence`; modules never contain queries, serialization, or migration logic. | Import-boundary check. |
| ARCH-013 | Confirmed | Standardized error handling: operational domain errors extend `AppError` (`isOperational: true`); external boundaries catch and log unexpected system errors without swallowing or crashing. | Lint rules and code review. |
| ARCH-014 | Proposed | There is no in-process event bus or generic job system. The scheduler calls a single due-event callback, and modules use direct calls. | Review; no event-bus dependency. |
| ARCH-015 | Proposed | Prayer calculation, scheduling, eligibility, and deduplication are testable without Discord or network access; time-dependent tests inject the clock port. | Unit test suite and CI. |
| ARCH-016 | Confirmed | `shared/` contains only technology-independent cross-cutting code (`TOKENS`, `AppError`, `Clock`); external technology adapters belong in `infrastructure/`. | Review and import boundaries. |
| ARCH-017 | Proposed | A voice cycle is driven only by the voice service. `/test` requests a cycle through the same per-guild coordinator rather than opening its own voice connection; the contention policy between test and real cycles is Open. | Import rules and integration test. |

The exact lint or dependency-checking tool is **Open**. The rules must be enforceable in review even if automated tooling arrives later.

## 6. Testing layout and dependency mocking

**Current status:** the existing suite has four test files and reports 14 passing tests. `npx tsc --noEmit` passes. Tests use the Node.js built-in test runner (`node --test`) with TypeScript support via `tsx`.

### Test directory layout:

- `test/unit/` — Fast, isolated unit tests:
  - `config.test.ts` — Zod environment validation and defaults.
  - `di-container.test.ts` — DI container registration, child container resolution, and `AppError` verification.
  - `discord-client.test.ts` — Client intents and gateway options.
  - `prayer-times/` — Deterministic astronomical calculations, timezone, DST, calculation methods, and the fixed Standard Asr rule.
  - `scheduling/` — Event generation, deduplication keys, past-event filtering, timer calculation with controlled clocks.
  - `voice/` — Channel eligibility rules and sequential visit logic.
- `test/integration/` — Subsystem integration tests with real in-memory dependencies:
  - `persistence.test.ts` — SQLite migrations, table initialization, WAL mode, SettingsStore atomic upserts, and Zod rejection behavior.
  - `commands/` — Slash command routing and authorization with mocked service dependencies.
- `test/fixtures/` — Sample test data (pre-calculated prayer tables, valid/invalid settings JSON, test audio buffers).

### Dependency mocking conventions:
- **Constructor Injection:** Because all services and stores use constructor injection, unit tests can instantiate components directly (e.g. `new SettingsService(mockStore, mockLogger)`) without running the full DI container or booting Discord.
- **Isolated Child Containers:** For integration tests requiring container resolution, tests create an isolated child container via `container.createChildContainer()`, ensuring tests run without cross-test state leakage.
- **Port Fakes over Heavy Mocks:** Prefer lightweight fake implementations (e.g., an in-memory `SettingsStore` or fake `Clock`) over complex mocking libraries for clarity and maintainability.

## 7. Decisions that affect this structure

The remaining tree is provisional until these are settled or implemented:

- Delivery-ledger adapter, commit ordering, and retention.
- Voice and audio libraries; `discord.js` v14 is already used for the gateway client.
- Whether setup drafts survive restart.
- Whether `/test` shares the real voice lock and whether it sends real mentions.
- Whether the scheduler stays a single timer or needs a different in-process strategy.
- The privacy-classification rule and Stage/AFK eligibility decisions.
- Extracting a settings store port and shared logger contract so the Settings module no longer imports infrastructure directly.

These are recorded as open or proposed items in the [system architecture](system-architecture.md#11-consistency-review-and-architectural-concerns) and [requirements](../product/requirements.md#open-product-decisions); this document does not resolve them.
