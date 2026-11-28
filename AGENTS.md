# AGENTS.md

Practical guide for AI coding agents working in this repository. This file is a map, not a specification. Full rules live in [`Docs/`](./Docs/); follow them when changing behavior. Do not document planned work as implemented, and do not change documentation unless explicitly asked.

## 1. Project in one paragraph

Mudhakkir is a single-process Discord prayer-reminder bot. TypeScript ESM (NodeNext), Modular Monolith, `tsyringe` DI, SQLite via `better-sqlite3`, `discord.js` v14, `adhan` for offline calculation. Features through M8 are implemented; live Discord verification remains a manual sign-off.

## 2. Commands

```bash
npm install          # or npm ci; postinstall cleans adhan's shipped tsconfig
npm run dev          # tsx watch src/index.ts
npm test             # node --import tsx --test test/**/*.test.ts
npx tsc --noEmit     # type check
npm run build        # tsc + copy SQL migrations into dist
npm start            # node dist/index.js (build first)
```

There is no `engines` field. The Dockerfile pins Node 22; local runs use Node 24. Keep TypeScript import specifiers ending in `.js` — NodeNext ESM requires them.

## 3. Layout and responsibilities

| Path | Responsibility |
| --- | --- |
| `src/index.ts` | Loads `.env`, validates config, builds container, starts bootstrap. |
| `src/app/` | `config.ts` (Zod env), `composition.ts` (only place concrete adapters are wired), `bootstrap.ts` (login, commands, scheduler start), `shutdown.ts` (signals + fatal traps). |
| `src/discord/` | Presentation/transport: client, authorization, `command-router.ts`, `commands/`, `flows/`, message/channel/voice adapters, `register-commands.ts`, `discord.errors.ts`. |
| `src/modules/settings/` | Guild settings model, validation, errors, `settings-store/` (port + SQLite adapter), `settings-service/` (single write path + change callback). |
| `src/modules/location/` | Curated country/city JSON, `ILocationService` (`listCountries`, `listCities`, `getCountry`, `resolve`), output validation, errors. No geocoding. |
| `src/modules/prayer-times/` | Pure `adhan` wrapper, all supported methods, Standard Asr, UTC instants + `Intl` local times, types, errors, service. |
| `src/modules/scheduling/` | One-shot event model/builder, delivery-ledger port/store/service, single-timer scheduler with heartbeat. |
| `src/modules/reminders/` | Due-event handler, text builder/service/sender port, voice ports/eligibility/cycle/coordinator/service, errors. |
| `src/infrastructure/` | Shared SQLite connection + migrations, Pino logger, local audio library/player. |
| `src/shared/` | Leaf primitives only: `TOKENS`, `AppError`, `Logger` port, `Clock`, `TaskTracker`. |
| `test/unit/`, `test/integration/` | `node:test` with `tsx`; fake clock and fake ports over heavy mocks. |
| `assets/audio/` | Runtime PCM files (`fajr.pcm`, etc.), 48 kHz stereo s16le. |
| `audios/` | Source WAV recitations; convert offline, do not change the player for this format. |
| `scripts/` | Migration copy, adhan tsconfig cleanup, placeholder audio generation. |

Each module's `index.ts` is its **only public entry**. Never import another module's internal files.

## 4. Conventions that must be followed

- **Folders/barrels:** each cohesive concern gets a folder with `index.ts` (e.g. `settings-service/`, `settings-store/`). Module-wide types/validation/errors stay at module root.
- **DI:** constructor injection with `@inject(TOKENS.X)`. `composition.ts` wires concrete adapters; services depend on ports/interfaces.
- **Service-to-service, never service-to-store.** A service needing another module's data calls its public service. Only composition constructs stores.
- **Input boundary:** `discord/` validates and normalizes raw interactions. Services receive canonical values and never normalize input. Location business rules stay in Location; Discord only uses returned fields to pick the next UI step.
- **Errors:** define named constant instances (`new NotFoundError(...)`) in an area-owned `*.errors.ts` when a throw site needs one. No error classes, no unused constants.
- **Persistence:** one SQLite database. Feature-owned stores use shared connection, explicit columns, parameterized queries, Zod row schemas, and a private `toEntity()` mapper. No raw `SELECT *`.
- **Curated JSON:** trusted; no runtime validation at load. Validate values leaving the module (`validateResolvedLocation`, `validateGuildSettings`).
- **Tests:** add unit tests for new logic and integration tests for cross-module flow; always run `npm test` and `npx tsc --noEmit` before finishing.
- **No Redis, broker, queue, external scheduler, external geocoding, or second process.** Single instance is a confirmed constraint.
- **`/test` is isolated:** calls text/voice directly, writes no ledger row, does not rebuild the schedule; output is prefixed `[TEST]` and mentions are suppressed.
- **Documentation changes only when asked.** Report findings first.

## 5. How the flow works

- `/setup` → Location service (select menus carry canonical country codes / city IDs) → Settings save → `SettingsChangeCallback` → `SchedulingService.rebuild(guildId)`.
- Scheduler rebuilds a rolling plan for the current + next local calendar day, commits each event key to the ledger **before** dispatch, then calls `ReminderHandler`.
- `ReminderHandler` loads a fresh settings snapshot; `PRAYER_TIME_REACHED` → text, `PRAYER_APPROACHING` → voice. Paths are independent and tracked by `TaskTracker`.
- `/prayer-times` reads settings and calls `PrayerTimesService` directly.
- Startup: `initContainer()` → `bootstrap()` → `ClientReady` → scheduler start + global command registration (+ `DEV_GUILD_ID` guild overrides).
- Shutdown: stop scheduler → drain tasks → destroy Discord → checkpoint/close DB → flush logs → exit.

## 6. Where to put new work

| Request | Go to |
| --- | --- |
| New setting field | `settings.types.ts`, `settings.validation.ts`, store columns/mapper, new migration, relevant Discord flow, tests. |
| New country/city | `src/modules/location/data/*.json` only; keep `cityRequired`/`defaultCity` semantics. |
| New calculation method | Settings type + validation, `prayer-calculation.ts` mapping, country defaults if applicable, tests. |
| New slash command | `discord/commands/`, `command-handler.ts`, `register-commands.ts`, `composition.ts`, router/handler tests. |
| New interactive step | `discord/flows/setup-flow.ts` or `settings-flow.ts`; keep business rules in modules. |
| New delivery transport | Add port in `modules/reminders/`, adapter in `discord/` or `infrastructure/`, wire in `composition.ts`. |
| New persistent table | New SQL migration + module-owned store; never query from a service. |
| New shared primitive | `src/shared/` only if technology-free and used by several modules. |

## 7. Runtime facts

- Required env: `DISCORD_TOKEN`, `CLIENT_ID`.
- Optional env: `LOG_LEVEL`, `NODE_ENV`, `DEV_GUILD_ID` (comma-separated), `DB_PATH`, `SHUTDOWN_GRACE_MS` (default `10000`).
- DB path priority: `initContainer(customDbPath)` → `DB_PATH` → `<cwd>/data/mudhakkir.db`.
- WAL mode; preserve `mudhakkir.db`, `-wal`, `-shm` when copying while running.
- Global slash commands are always registered; `DEV_GUILD_ID` adds instant guild overrides.
- Audio must be 48 kHz stereo s16le raw PCM in `assets/audio/`; current real recitations were converted from `audios/*.wav`.

## 8. Documentation map

- Product rules: `Docs/product/business-rules.md`, `requirements.md`, `command-specification.md`.
- Architecture/conventions: `Docs/architecture/system-architecture.md`, `code-structure.md`.
- Technical choices: `Docs/technical/technical-design.md`, `scheduling-design.md`.
- Status/roadmap: `Docs/development/implementation-roadmap.md`.
- Operations: `Docs/operations/backup-and-recovery.md`.
