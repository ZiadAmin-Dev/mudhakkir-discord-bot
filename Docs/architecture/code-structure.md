# Mudhakkir — Code Structure

This document describes the source-code layout for the [system architecture](system-architecture.md). It covers both the current foundation and the target layout. Implemented files are identified below; the remaining tree is **Proposed** and may change as later milestones are built. The module boundaries and dependency direction are the important part.

Status labels follow the [documentation index](../README.md#status-labels). Confirmed constraints come from the [project overview](../product/project-overview.md) and [requirements](../product/requirements.md).

Related documents:

- [System architecture](system-architecture.md) — modules, lifecycle, scheduling, and announcement flows.
- [Requirements](../product/requirements.md) — required behavior and open product decisions.

## 1. Source tree and implementation status

```text
assets/
└── audio/
    ├── fajr.pcm          # generated 48kHz stereo s16le placeholders
    ├── dhuhr.pcm
    ├── asr.pcm
    ├── maghrib.pcm
    └── isha.pcm

scripts/
├── copy-migrations.mjs
├── clean-adhan-tsconfig.mjs
└── generate-audio-assets.mjs

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
│   ├── register-commands.ts
│   ├── commands/
│   │   ├── command-handler.ts
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
│   ├── discord.errors.ts
│   └── voice-transport.ts
├── modules/
│   ├── settings/
│   │   ├── index.ts
│   │   ├── settings.types.ts
│   │   ├── settings.validation.ts
│   │   ├── settings.errors.ts
│   │   ├── settings-store/
│   │   │   ├── index.ts
│   │   │   ├── settings-store.port.ts
│   │   │   └── settings-store.ts
│   │   └── settings-service/
│   │       ├── index.ts
│   │       └── settings.service.ts
│   ├── location/
│   │   ├── index.ts
│   │   ├── location.types.ts
│   │   ├── location.validation.ts
│   │   ├── location.errors.ts
│   │   ├── location-service/
│   │   │   ├── index.ts
│   │   │   └── location.service.ts
│   │   └── data/
│   │       ├── countries.json
│   │       └── cities.json
│   ├── prayer-times/
│   │   ├── index.ts
│   │   ├── prayer-time.types.ts
│   │   ├── prayer-times.errors.ts
│   │   ├── prayer-calculation.ts
│   │   └── prayer-times-service/
│   │       ├── index.ts
│   │       └── prayer-times.service.ts
│   ├── scheduling/
│   │   ├── index.ts
│   │   ├── event.types.ts
│   │   ├── event-builder.ts
│   │   ├── delivery-ledger.ts
│   │   ├── delivery-ledger-store/
│   │   │   ├── index.ts
│   │   │   ├── delivery-ledger-store.port.ts
│   │   │   └── delivery-ledger-store.ts
│   │   └── scheduling-service/
│   │       ├── index.ts
│   │       └── scheduling.service.ts
│   └── reminders/
│       ├── index.ts
│       ├── reminders.errors.ts
│       ├── reminder-handler/
│       │   ├── index.ts
│       │   └── reminder-handler.ts
│       ├── text/
│       │   ├── index.ts
│       │   ├── text-message-sender.port.ts
│       │   ├── text-message.builder.ts
│       │   └── text-announcement.service.ts
│       └── voice/
│           ├── index.ts
│           ├── voice-channels.port.ts
│           ├── channel-eligibility.ts
│           ├── voice-cycle.ts
│           ├── voice-coordinator.ts
│           └── voice-announcement.service.ts
├── infrastructure/
│   ├── persistence/
│   │   ├── storage.ts
│   │   └── migrations/
│   │       └── 001_initial_schema.sql
│   ├── audio/
│   │   ├── audio-library.ts
│   │   └── audio-player.ts
│   └── logging/
│       ├── index.ts
│       └── pino-logger.ts
└── shared/
    ├── clock.ts
    ├── di/
    │   └── tokens.ts
    ├── error/
    │   └── app-error.ts
    ├── logging/
    │   └── logger.port.ts
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

Folder layout follows the convention in [§3](#3-module-public-entry-points): implemented concerns are grouped into folders. Remaining planned files are shown in an indicative flat form and will be grouped into folders when implemented.

### Implemented files today

| Area | Implemented paths |
| --- | --- |
| Entry and lifecycle | `src/index.ts`, `src/app/config.ts`, `src/app/composition.ts`, `src/app/bootstrap.ts`, `src/app/shutdown.ts` |
| Discord | `src/discord/client.ts`, `src/discord/discord-messages.ts`, `src/discord/discord.errors.ts`, `src/discord/discord-channels.ts`, `src/discord/voice-transport.ts` |
| Settings | `src/modules/settings/index.ts`, `src/modules/settings/settings.types.ts`, `src/modules/settings/settings.validation.ts`, `src/modules/settings/settings.errors.ts`, `src/modules/settings/settings-store/index.ts`, `src/modules/settings/settings-store/settings-store.port.ts`, `src/modules/settings/settings-store/settings-store.ts`, `src/modules/settings/settings-service/index.ts`, `src/modules/settings/settings-service/settings.service.ts` |
| Location | `src/modules/location/index.ts`, `src/modules/location/location.types.ts`, `src/modules/location/location.validation.ts`, `src/modules/location/location.errors.ts`, `src/modules/location/location-service/index.ts`, `src/modules/location/location-service/location.service.ts`, `src/modules/location/data/countries.json`, `src/modules/location/data/cities.json` |
| Prayer Times | `src/modules/prayer-times/index.ts`, `src/modules/prayer-times/prayer-time.types.ts`, `src/modules/prayer-times/prayer-times.errors.ts`, `src/modules/prayer-times/prayer-calculation.ts`, `src/modules/prayer-times/prayer-times-service/index.ts`, `src/modules/prayer-times/prayer-times-service/prayer-times.service.ts` |
| Shared database infrastructure | `src/infrastructure/persistence/storage.ts`, `src/infrastructure/persistence/migrations/001_initial_schema.sql` |
| Logging | `src/infrastructure/logging/index.ts`, `src/infrastructure/logging/pino-logger.ts` |
| Shared | `src/shared/di/tokens.ts`, `src/shared/error/app-error.ts`, `src/shared/logging/logger.port.ts`, `src/shared/clock.ts` |
| Scheduling | `src/modules/scheduling/index.ts`, `src/modules/scheduling/event.types.ts`, `src/modules/scheduling/event-builder.ts`, `src/modules/scheduling/delivery-ledger.ts`, `src/modules/scheduling/delivery-ledger-store/index.ts`, `src/modules/scheduling/delivery-ledger-store/delivery-ledger-store.port.ts`, `src/modules/scheduling/delivery-ledger-store/delivery-ledger-store.ts`, `src/modules/scheduling/scheduling-service/index.ts`, `src/modules/scheduling/scheduling-service/scheduling.service.ts` |
| Reminders | `src/modules/reminders/index.ts`, `src/modules/reminders/reminders.errors.ts`, `src/modules/reminders/reminder-handler/index.ts`, `src/modules/reminders/reminder-handler/reminder-handler.ts`, `src/modules/reminders/text/index.ts`, `src/modules/reminders/text/text-message-sender.port.ts`, `src/modules/reminders/text/text-message.builder.ts`, `src/modules/reminders/text/text-announcement.service.ts`, `src/modules/reminders/voice/index.ts`, `src/modules/reminders/voice/voice-channels.port.ts`, `src/modules/reminders/voice/channel-eligibility.ts`, `src/modules/reminders/voice/voice-cycle.ts`, `src/modules/reminders/voice/voice-coordinator.ts`, `src/modules/reminders/voice/voice-announcement.service.ts` |
| Audio | `assets/audio/*.pcm`, `src/infrastructure/audio/audio-library.ts`, `src/infrastructure/audio/audio-player.ts`, `src/infrastructure/audio/index.ts`, `scripts/generate-audio-assets.mjs` |
| Tests | `test/unit/config.test.ts`, `test/unit/di-container.test.ts`, `test/unit/discord-client.test.ts`, `test/unit/discord/discord-messages.test.ts`, `test/unit/location/location.test.ts`, `test/unit/prayer-times/prayer-times.test.ts`, `test/unit/scheduling/scheduling.test.ts`, `test/unit/reminders/text-announcement.test.ts`, `test/unit/reminders/reminder-handler.test.ts`, `test/unit/reminders/voice.test.ts`, `test/unit/audio/audio-library.test.ts`, `test/integration/persistence.test.ts`, `test/integration/location-prayer-times.test.ts`, `test/integration/scheduling-persistence.test.ts`, `test/integration/scheduled-text-delivery.test.ts` |

Everything else in the tree is planned. In particular, the remaining M8 hardening and deployment files do not exist yet. The Location module is implemented with its reference data as files, not database tables or migrations. The scheduler's due-event callback is the reminder handler, which routes text and voice independently.

### Layer Separation: `shared` vs `infrastructure`

- **`shared/` (Technology-independent cross-cutting primitives):** Contains shared types, error definitions, DI tokens, and — when added — clock contracts, with **zero** external technical dependencies (no SQLite, no Discord, no Pino). Today this is `TOKENS`, the `AppError` hierarchy, the `Logger` contract in `shared/logging/logger.port.ts`, and the `Clock` contract in `shared/clock.ts`. Domain and application code import the logger contract from here; the pino implementation never lives in `shared/`.
- **`infrastructure/` (Technical adapters & implementations):** Contains concrete implementations that integrate with external libraries and technical drivers (SQLite with `better-sqlite3`, `pino` logger, and `@discordjs/voice` audio playback). The DI container itself is assembled in `src/app/composition.ts`, not in infrastructure.

## 2. Responsibilities of important files

### Root and application lifecycle

| Path | Responsibility |
| --- | --- |
| `src/index.ts` | Process entry point. Loads `.env`, validates configuration, initializes DI, resolves the logger and Discord client, and starts `bootstrap`. |
| `app/config.ts` | Reads and validates environment variables (`DISCORD_TOKEN`, `CLIENT_ID`, `LOG_LEVEL`, `NODE_ENV`) using Zod. Fails fast with clear error messages. |
| `app/composition.ts` | Composition root: creates the logger, opens SQLite, runs migrations, creates the Discord client, registers stores/services, and exposes `initContainer`. |
| `app/bootstrap.ts` | Startup sequence: installs signal handling, logs in to Discord, starts the scheduler on `ClientReady`, logs bot identity, and resolves. Command registration is planned. |
| `app/shutdown.ts` | Graceful shutdown handler: intercepts `SIGINT`/`SIGTERM`, stops the scheduler first, destroys the Discord client, and exits; a second signal forces exit. Voice/database teardown is planned. |

### Discord integration (Presentation Layer)

| Path | Responsibility |
| --- | --- |
| `discord/client.ts` | Constructs `discord.js` Client with required gateway intents (`Guilds`, `GuildVoiceStates`) and error handlers. |
| `discord/command-router.ts` | Implemented. Dispatches slash commands and routes component interactions to the active flow; owns the in-memory registry keyed by `guildId:userId` with expiry and wrong-user rejection. |
| `discord/authorization.ts` | Implemented. Checks the invoking member's `ManageGuild`/`Administrator` permission using authoritative interaction context. |
| `discord/register-commands.ts` | Implemented. Slash-command definitions and REST registration on startup; UI defaults are not a security boundary. |
| `discord/commands/command-handler.ts` | Implemented contracts for handlers and active flows. |
| `discord/commands/*.ts` | Implemented presentation handlers. Validate input shape, convert to canonical values, delegate to module services, acknowledge/defer, and respond ephemerally. No business rules or Location rule duplication. |
| `discord/flows/*.ts` | Implemented multi-step setup and settings flows using select menus, buttons, and modals. Bound to one user and guild; duplicate submissions are ignored, state dies on expiry/cancel/restart. |
| `discord/discord-channels.ts` | Implemented. Inspects channel existence, types, human membership, effective bot permissions, and privacy for voice eligibility. |
| `discord/discord-messages.ts` | Implemented. Sends text reminders to the configured channel with isolated mentions (`@everyone` or role snowflake). |
| `discord/discord.errors.ts` | Implemented. Named not-found and permission errors for text delivery. |
| `discord/voice-transport.ts` | Implemented. Manages voice channel join, playback, timeout, and cleanup using `@discordjs/voice`. |

### Business modules (Application & Domain Layers)

| Path | Responsibility |
| --- | --- |
| `modules/settings/settings.types.ts` | Domain types (`GuildSettings`, `CalculationMethod`, `MentionType`). |
| `modules/settings/settings.validation.ts` | Runtime validation using Zod: coordinate boundaries, valid IANA timezones, lead times (1–60m), and required role IDs. |
| `modules/settings/settings-store/settings-store.port.ts` | Implemented. `ISettingsStore` port that the settings service depends on and the module's SQLite adapter implements. Co-located with its adapter in the same folder. |
| `modules/settings/settings-store/settings-store.ts` | Implemented. SQLite adapter for `guild_settings` owned by the settings module: atomic upserts (`INSERT ... ON CONFLICT`), explicit column selection, runtime validation of raw rows, a private `toEntity()` snake_case → camelCase mapper, and constructor injection of `TOKENS.Database`. |
| `modules/settings/settings-store/index.ts` | Barrel exporting the store port and adapter for the module entry and for the service's import. |
| `modules/settings/settings.errors.ts` | Module error constants. Currently `settingsNotFoundError`, a `NotFoundError` thrown by `updateSettings`. Define more here only when a component actually needs to throw them. |
| `modules/settings/settings-service/settings.service.ts` | Implemented service (`ISettingsService`) decorated with `@injectable()`. Coordinates reads, saves, updates, enable toggles, and deletion; throws `NotFoundError` on missing settings. Depends on the `ISettingsStore` port and the shared `Logger` contract, not on concrete infrastructure types. |
| `modules/settings/settings-service/index.ts` | Barrel exporting the service and its `ISettingsService` interface. |
| `modules/location/location.types.ts` | Country, city, resolution input/output types. Reuses the `CalculationMethod` type from the Settings module's public entry (type-only import). |
| `modules/location/location.validation.ts` | Validates resolved location output before it leaves the module. Curated JSON is trusted and not validated at load time; request input is validated in `discord/`. |
| `modules/location/location.errors.ts` | Named error constants: unsupported country, unsupported city, and city required. |
| `modules/location/location-service/location.service.ts` | Implemented public service. Defines `ILocationService` and owns curated reference data, location queries, and resolution in one place. Expects canonical input; no request validation or normalization. Unsupported countries/cities are rejected with named errors. |
| `modules/location/location-service/index.ts` | Barrel exporting the service interface and implementation. |
| `modules/location/data/countries.json`, `data/cities.json` | Curated reference data. Countries carry code, name, `cityRequired`, nullable `defaultCity`, a list of IANA `timezones`, and `defaultCalculationMethod`. Cities carry id, country code, name, coordinates, IANA timezone, and a nullable `calculationMethod` override (currently all `null`). Reviewed as trusted data; no load-time validation. Not user records or database tables. |
| `modules/prayer-times/prayer-times-service/prayer-times.service.ts` | Implemented public service (`IPrayerTimesService`); delegates to the pure calculation function. No I/O, timers, or persistence. |
| `modules/prayer-times/prayer-times-service/index.ts` | Barrel exporting the service interface and implementation. |
| `modules/prayer-times/prayer-time.types.ts` | Prayer names, canonical calculation input, and daily result types. Reuses the Settings `CalculationMethod` type. |
| `modules/prayer-times/prayer-times.errors.ts` | Named error for dates/locations where the library cannot produce times. |
| `modules/prayer-times/prayer-calculation.ts` | Pure `adhan` wrapper: maps all 12 `CalculationMethod` values, fixes Asr to Standard (`Madhab.Shafi`), applies `HighLatitudeRule.TwilightAngle`, and formats results in the configured IANA timezone. |
| `modules/scheduling/event.types.ts` | Implemented. One-shot event model (`PRAYER_APPROACHING`, `PRAYER_TIME_REACHED`), stable event keys, and the due-event callback type. |
| `modules/scheduling/event-builder.ts` | Implemented. Builds events for the current and next **local calendar day**, applies lead time, drops past triggers, and skips uncalculable dates. |
| `modules/scheduling/scheduling-service/scheduling.service.ts` | Implemented. Owns one `setTimeout` for the earliest event, a 15-minute heartbeat, 12-hour clamp, rebuild on settings change, and fail-closed commit-before-dispatch. |
| `modules/scheduling/delivery-ledger-store/delivery-ledger-store.port.ts` | Implemented port for ledger persistence (`has`, atomic `insert`, `prune`). |
| `modules/scheduling/delivery-ledger-store/delivery-ledger-store.ts` | Implemented SQLite adapter for the `delivery_ledger` table, owned by the scheduling module and using the shared connection. |
| `modules/scheduling/delivery-ledger.ts` | Implemented deduplication service: commit-before-dispatch, at-most-once semantics, and 7-day pruning. |
| `shared/clock.ts` | Implemented `Clock` port and `SystemClock`; tests inject a fake clock and drive `tick()` deterministically. |
| `modules/reminders/reminder-handler/reminder-handler.ts` | Implemented. Scheduler callback: loads a fresh settings snapshot per event, skips missing/disabled guilds, routes `PRAYER_TIME_REACHED` to text; voice awaits M6. |
| `modules/reminders/text/text-message.builder.ts` | Implemented pure builder: prayer content plus exact `allowedMentions` for `@everyone` or one role. |
| `modules/reminders/text/text-announcement.service.ts` | Implemented text orchestration; sender failures are logged and contained. |
| `modules/reminders/text/text-message-sender.port.ts` | Implemented port implemented by the Discord adapter. |
| `modules/reminders/reminders.errors.ts` | Named error for a role mention without a role id. |
| `discord/discord-messages.ts` | Implemented channel resolution, permission checks, and message send with the exact allowed-mentions payload. |
| `discord/discord.errors.ts` | Named not-found and permission errors for text delivery. |
| `modules/reminders/voice/voice-channels.port.ts` | Implemented ports for the channel directory and voice transport, both provided by Discord adapters. |
| `modules/reminders/voice/channel-eligibility.ts` | Implemented rules: standard voice channel, bot permissions, human presence, and permission-based privacy. |
| `modules/reminders/voice/voice-cycle.ts` | Implemented sequential iteration with immediate pre-join recheck and per-channel failure isolation. |
| `modules/reminders/voice/voice-coordinator.ts` | Implemented per-guild mutex; overlapping cycles are skipped. |
| `modules/reminders/voice/voice-announcement.service.ts` | Implemented cycle entry point used by the reminder handler. |
| `discord/discord-channels.ts` | Implemented voice channel directory adapter producing plain snapshots. |
| `discord/voice-transport.ts` | Implemented `@discordjs/voice` join, playback, timeouts, and cleanup in `finally`. |
| `infrastructure/audio/audio-library.ts` | Implemented local asset lookup and startup validation (warning only). |
| `infrastructure/audio/audio-player.ts` | Implemented raw PCM audio resource creation; no ffmpeg required. |

### Infrastructure and Shared Code

| Path | Responsibility |
| --- | --- |
| `infrastructure/persistence/storage.ts` | Implemented. Shared SQLite connection factory (`better-sqlite3`) enabling WAL mode and foreign keys, plus the migration runner. Used by every feature store; no product queries live here. |
| `infrastructure/persistence/migrations/` | Implemented. Versioned SQL migration scripts (`001_initial_schema.sql`) shared by all modules. Note: `tsc` does not copy `.sql` files into `dist`; production builds must copy them explicitly. |
| `infrastructure/audio/audio-library.ts` | Implemented. Maps prayers to local 48kHz stereo s16le PCM assets and verifies file readability. |
| `infrastructure/audio/audio-player.ts` | Implemented. Creates raw PCM audio resources and plays them through `@discordjs/voice`. |
| `infrastructure/logging/pino-logger.ts` | Implemented. The only concrete logger: `createLogger()` builds a Pino structured logger with a `pino-pretty` development transport and an ISO timestamp in production. It returns the shared `Logger` contract; it does not define or re-export that type. |
| `infrastructure/logging/index.ts` | Barrel exporting `createLogger` only. Application code obtains the logger here; the composition root is the sole caller. |
| `shared/di/tokens.ts` | Implemented. Centralized dependency injection tokens (`TOKENS`) used for constructor injection across layers. |
| `shared/logging/logger.port.ts` | Implemented. The single source of the `Logger` interface and `LogMethod` type. Imported by services and adapters that only need the contract; no dependency on Pino. |
| `shared/error/app-error.ts` | Implemented. Domain error hierarchy rooted in `AppError` (`NotFoundError`, `ValidationError`, `PermissionError`, `ConfigurationError`). |
| `shared/clock.ts` | Implemented. `Clock` port and `SystemClock`; tests inject a fake clock. |

**Proposed `shared/` rule:** it may contain only generic, dependency-free primitives used by several modules, such as clock and logger types. It must not become a home for business logic, cross-module helpers, or a generic "utils" dumping ground.

## 3. Module public entry points

Each module's `index.ts` is its public entry point. Other code imports from that entry, not from internal files. The settings module is the reference implementation for the conventions in this section — folder layout, error constants, and store structure; new modules follow the same pattern.

```text
Allowed:    import { calculatePrayerTimes } from "../prayer-times";
Forbidden:  import { calculatePrayerTimes } from "../prayer-times/prayer-calculation";
```

**Proposed:** a module entry exports only what other modules need. Internal files may import each other freely. This prevents accidental coupling and makes refactoring inside a module safe.

### Folder convention (applies to every module)

Each cohesive concern lives in its own folder inside the module, named after that concern. The settings module is the reference implementation:

- `settings-service/` — the service implementation and its public barrel.
- `settings-store/` — the store port and its SQLite adapter together, plus a public barrel. A port and the adapter that implements it are one concern and share a folder.

Every concern folder has an `index.ts` barrel re-exporting its files. The module-level `index.ts` re-exports those barrels and is the only entry external code imports. Inside a module, a concern imports from a sibling folder's barrel (`../settings-store/index.js`) rather than reaching into that folder's internal files.

Module-wide primitives used by more than one concern — `settings.types.ts` and `settings.validation.ts` — stay at the module root; they do not get single-file folders. This is the convention for all modules: new code follows it, and existing modules are regrouped as they change.

### Error convention (general rule)

Every area that can raise expected errors owns an error file: `modules/settings/settings.errors.ts`, and by the same rule `modules/<module>/<module>.errors.ts` for future modules. An infrastructure area may define its own `*.errors.ts` beside its adapter if it has errors worth naming. The file contains **constant error instances** (`export const settingsNotFoundError = new NotFoundError('...')`), not classes.

Define an error when a real throw site needs one, and name it by what it means. Several constants may use the same shared `AppError` type — e.g. multiple `ValidationError` or `NotFoundError` instances with different names and messages — because the shared type supplies the code and operational flag while the constant's message supplies the meaning. Do not pre-create constants for categories that nothing throws. Export the error file from the module's `index.ts` so callers import it through the public entry.

If a type is needed only to implement a port, the port type belongs with the consuming module, and the adapter imports that type. This keeps the dependency arrow pointing from adapters to the core, not from the core to storage or Discord.

**Feature-owned persistence:** a module that needs durable state owns its SQLite adapter — implemented as `modules/settings/settings-store/settings-store.ts` and `modules/scheduling/delivery-ledger-store/delivery-ledger-store.ts`. Each adapter implements its module's port, lives in that concern's folder, and uses the shared connection and migrations in `infrastructure/persistence/`. All modules use the **same SQLite database**; co-locating adapters is a code-ownership decision, not a move to separate databases. The module entry also exports its adapter so the composition root can wire it.

### Store convention (general rule)

Every feature-owned SQLite adapter follows the pattern established by `SettingsStore`, so all database/store files stay uniform:

- Query with an **explicit column list**, never `SELECT *`.
- Keep every query **parameterized** (`WHERE guild_id = ?`); never interpolate values into SQL.
- Treat raw query results as untrusted: validate them at runtime with a local Zod row schema instead of `as` type assertions. `undefined` means "no row" and maps to `null` or `false` as the port requires.
- Convert rows to domain entities in a reusable, module-private `toEntity()` mapper that owns snake_case → camelCase and numeric flag → boolean conversion. Query methods only fetch, parse, and call the mapper.
- Pass the mapped entity through the module's existing validation before returning it; keep atomic write logic in the same adapter.

This rule applies to every feature store, including the implemented delivery-ledger adapter. The shared connection and migrations in `infrastructure/persistence/` are unchanged.

### Input boundary convention (general rule)

The `discord/` folder is the presentation/controller boundary. It owns **input validation and normalization**, not business validation:

- Command handlers and flows receive raw Discord values, validate their shape, authorize the caller, and normalize them into canonical form (for example: trim free text, parse numbers/enums, validate channel/role IDs) before calling a service.
- Country and city selection are **select menus**, not typed text. The option values come from `LocationService.listCountries()` and `listCities(countryCode)` and are already canonical (country code, city ID/name). Discord validates that the selected value is one of the offered options and that the interaction belongs to the active flow; it does not normalize, translate, or fuzzy-match country names. Services still receive the canonical code/ID.
- Module services receive **already-normalized data** and apply only business rules and domain invariants. They do not trim, change casing, parse, validate request shape, or otherwise reformat input, and they never see raw Discord interaction objects. Canonical form means exact codes/IDs from the reference data and no surrounding whitespace.
- Keep the two kinds of checks separate: a malformed or badly formatted value is rejected at the presentation boundary; a well-formed value that violates a business rule is rejected by the owning service with the module's named error.
- Curated reference data files are reviewed as trusted input and are not validated at load time. Runtime validation in a module is limited to values leaving it (for example, resolved output or database rows).

**Current state:** Location services now accept canonical input unchanged and perform no request validation or normalization. The Discord command layer that produces canonical values arrives in M7; until then, callers must supply canonical data themselves.

## 4. Dependency rules

| Allowed dependency | Reason |
| --- | --- |
| `app` → everything | Composition and lifecycle only. |
| `discord/commands` and `discord/flows` → module public entries | Commands validate and normalize raw input, then call application behavior with canonical values. |
| `settings` → `location`, `prayer-times` public types/validation | Validate supported locations and prayer settings. |
| `scheduling` → `settings`, `prayer-times` | Build events from settings and calculated times. |
| `reminders` → `settings`, text, voice public entries | Coordinate independent delivery paths. |
| Service → another module's **service** public entry | Cross-module needs are answered by the owning module's service, never by its store. |
| Text → message port | Send without knowing Discord internals. |
| Voice → channel, voice, audio ports | Check eligibility and play sequentially. |
| Feature store → own module's port types and shared database infrastructure | Implement persistence inside the owning module using the shared connection and migrations. |
| Infrastructure → port types | Implement cross-cutting technical adapters (logging, storage). |

Forbidden dependencies:

- A business module importing `discord/`, another module's concrete storage adapter, or a playback library. A module's own adapter stays private to that module; only its public entry exposes it for wiring.
- `prayer-times` importing settings, scheduling, reminders, or persistence.
- Scheduling importing text or voice.
- Text importing voice, or voice importing text.
- Command handlers importing a concrete infrastructure implementation.
- A service calling another module's store/repository, or querying tables owned by another module.

**Service-to-service rule:** if a service needs data or behavior owned by another module, it must call that module's **service** through its public entry point — never its repository, store, or database tables. The called module owns the operation and must expose a service method that provides what the caller needs. A service talks to another service, not to another service's database. Persistence stays private to the module that owns it; only the composition root wires concrete stores.

**Current state:** `modules/settings/settings-service/settings.service.ts` depends on the `ISettingsStore` port and the shared `Logger` contract. The concrete `SettingsStore` lives in `modules/settings/settings-store/` and is wired only in `src/app/composition.ts`, so the port-inversion rule is satisfied.

## 5. Enforceable architecture rules

These rules are the architectural contract. Rules marked **Confirmed** restate existing project constraints; the rest are **Proposed** implementation rules.

| ID | Status | Rule | Enforcement |
| --- | --- | --- | --- |
| ARCH-001 | Confirmed | The system runs as one Node.js process with one bot instance; no worker threads, separate workers, external queues, or distributed schedulers. | Build configuration and code review. |
| ARCH-002 | Proposed | Modules communicate through public entry points only; no deep imports into another module's internals. | Import-boundary lint or dependency check. |
| ARCH-003 | Proposed | Business services must not import Discord, another module's concrete adapter, audio libraries, or the application bootstrap. A module's own store adapter may use the shared database infrastructure. | Import-boundary check. |
| ARCH-004 | Confirmed | Prayer calculation does not schedule or deliver; scheduling does not calculate prayer times. | Unit tests and code review. |
| ARCH-005 | Confirmed | Text and voice services must not call each other; only the reminder handler invokes both. | Import rules and review. |
| ARCH-006 | Confirmed | At most one voice connection exists per guild at a time. | Single voice coordinator; integration test where practical. |
| ARCH-007 | Proposed | All configuration writes go through the Settings service; schedule-affecting changes trigger a schedule rebuild. | Code review and command tests. |
| ARCH-008 | Proposed | The scheduler owns all future-event timers. No command handler, reminder service, or adapter creates a timer for a prayer event; short-lived operation timeouts inside the owning service are permitted. | Code search and review. |
| ARCH-009 | Proposed | Command handlers parse, authorize, call, and respond. They contain no prayer, eligibility, or persistence rules. | Review and command unit tests with fake services. |
| ARCH-010 | Confirmed | Inversion of Control: components use constructor injection decorated with `@injectable()` and `@inject(TOKENS...)`. Only the composition root (`src/app/composition.ts` / container) wires concrete singletons and instances. | Dependency check and code review. |
| ARCH-011 | Proposed | External I/O is behind a small port: message sending, voice transport, channel data, storage, audio playback, and clock. No global clients. | Review; unit tests use fakes/mocks. |
| ARCH-012 | Proposed | Shared database connection and migrations stay in `infrastructure/persistence`; feature-specific SQLite adapters live with their owning module and implement that module's port. All modules use the same SQLite database. | Import-boundary check. |
| ARCH-013 | Confirmed | Standardized error handling: operational domain errors extend `AppError` (`isOperational: true`); external boundaries catch and log unexpected system errors without swallowing or crashing. | Lint rules and code review. |
| ARCH-014 | Proposed | There is no in-process event bus or generic job system. The scheduler calls a single due-event callback, and modules use direct calls. | Review; no event-bus dependency. |
| ARCH-015 | Proposed | Prayer calculation, scheduling, eligibility, and deduplication are testable without Discord or network access; time-dependent tests inject the clock port. | Unit test suite and CI. |
| ARCH-016 | Confirmed | `shared/` contains only technology-independent cross-cutting code (`TOKENS`, `AppError`, `Logger` contract, `Clock`); external technology adapters such as Pino belong in `infrastructure/`. | Review and import boundaries. |
| ARCH-017 | Proposed | A voice cycle is driven only by the voice service. `/test` requests a cycle through the same per-guild coordinator rather than opening its own voice connection; the contention policy between test and real cycles is Open. | Import rules and integration test. |
| ARCH-018 | Proposed | Expected errors are named constants in an area-owned `*.errors.ts` file, built from shared `AppError` types; define one when a throw site needs it, and export it from the module entry. | Review and import-boundary check. |
| ARCH-019 | Proposed | Feature stores use explicit column lists, parameterized queries, runtime row validation instead of type assertions, and a private `toEntity()` mapper. | Code review and import-boundary check. |
| ARCH-020 | Proposed | Cross-module communication is service-to-service: a service calls another module's service through its public entry; it must never call that module's store or query its tables. The called service exposes the operation the caller needs. | Import-boundary check and code review. |
| ARCH-021 | Proposed | `discord/` commands and flows validate and normalize raw input before calling services; services receive canonical data and apply only business rules. Services must not receive raw Discord inputs or perform presentation-level normalization. | Code review and command unit tests. |

The exact lint or dependency-checking tool is **Open**. The rules must be enforceable in review even if automated tooling arrives later.

## 6. Testing layout and dependency mocking

**Current status:** the existing suite has 17 test files and reports 84 passing tests. `npx tsc --noEmit` passes. Tests use the Node.js built-in test runner (`node --test`) with TypeScript support via `tsx`.

### Test directory layout:

- `test/unit/` — Fast, isolated unit tests:
  - `config.test.ts` — Zod environment validation and defaults.
  - `di-container.test.ts` — DI container registration, child container resolution, and `AppError` verification.
  - `discord-client.test.ts` — Client intents and gateway options.
  - `location/location.test.ts` — Curated country/city queries, default-city and city-required rules, country-level method defaults, rejection of unsupported locations, and no input normalization.
  - `prayer-times/prayer-times.test.ts` — Deterministic calculations, all method mappings, DST behavior, high-latitude unavailability, and the Standard Asr rule.
  - `scheduling/scheduling.test.ts` — Event generation, lead-time math, past-event filtering, DST calendar horizon, ledger semantics, fake-clock dispatch, late-event skip, fail-closed commits, and rebuild-on-change.
  - `discord/discord-messages.test.ts` — Channel resolution, permission checks, exact payload, and named delivery errors.
  - `discord/m7-commands.test.ts` — Authorization, router flow ownership/expiry, 25-option pagination, canonical select-menu setup, command handlers, and settings change callback.
  - `reminders/text-announcement.test.ts` — Both mention modes and failure containment.
  - `reminders/reminder-handler.test.ts` — Event routing, fresh snapshots, disabled/missing settings, and error boundaries.
  - `voice.test.ts` — Eligibility rules, pre-join recheck, failure isolation, per-guild lock, and disabled/overlapping cycles.
  - `audio/audio-library.test.ts` — Local asset presence and startup validation.
- `test/integration/` — Subsystem integration tests with real in-memory dependencies:
  - `persistence.test.ts` — SQLite migrations, table initialization, WAL mode, atomic upserts through the settings module's `SettingsStore`, and Zod rejection behavior.
  - `location-prayer-times.test.ts` — Full Location → Prayer Times flow, city overrides, required-city countries, DST, high latitudes, and external reference comparisons.
  - `scheduling-persistence.test.ts` — Real-SQLite ledger persistence and pruning, no replay after restart, and merged multi-guild timeline.
  - `scheduled-text-delivery.test.ts` — Scheduler → reminder handler → text delivery: one message per due event, exact role mentions, none for disabled guilds.
  - `settings-rebuild.test.ts` — A settings change through DI triggers the scheduler rebuild callback and moves the next approaching event.
  - `commands/` — Planned M8 end-to-end command tests with live Discord.
- `test/fixtures/` — Sample test data (pre-calculated prayer tables, valid/invalid settings JSON, test audio buffers).

### Dependency mocking conventions:
- **Constructor Injection:** Because all services and stores use constructor injection, unit tests can instantiate components directly (e.g. `new SettingsService(mockStore, mockLogger)`) without running the full DI container or booting Discord.
- **Isolated Child Containers:** For integration tests requiring container resolution, tests create an isolated child container via `container.createChildContainer()`, ensuring tests run without cross-test state leakage.
- **Port Fakes over Heavy Mocks:** Prefer lightweight fake implementations (e.g., an in-memory `SettingsStore` or fake `Clock`) over complex mocking libraries for clarity and maintainability.

## 7. Decisions that affect this structure

The remaining tree is provisional until these are settled or implemented:

- Delivery-ledger adapter, commit ordering, and retention — implemented in M4; commit-before-dispatch is Confirmed.
- Voice and audio libraries are implemented with `@discordjs/voice`, `opusscript`, and local PCM assets; live playback verification is still pending.
- Whether setup drafts survive restart.
- Whether `/test` shares the real voice lock and whether it sends real mentions.
- Whether the single-timer scheduler needs a different in-process strategy (implemented as one timer plus heartbeat in M4).
- The privacy-classification rule and Stage/AFK eligibility decisions.

The settings store port, shared logger contract, and feature-owned placement of the settings adapter are now implemented and no longer open decisions.

These are recorded as open or proposed items in the [system architecture](system-architecture.md#11-consistency-review-and-architectural-concerns) and [requirements](../product/requirements.md#open-product-decisions); this document does not resolve them.
