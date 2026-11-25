# Mudhakkir — Scheduling Design

This document studies the concepts required before implementing the prayer scheduler (M4.1) and defines the minimal design implemented in M4.2. **Status:** the study remains the reference for concepts and trade-offs; the scheduler, clock, and ledger adapter now exist in the source tree. Product behavior comes from the [business rules](../product/business-rules.md); the runtime boundaries come from the [system architecture](../architecture/system-architecture.md#6-prayer-calculation-scheduling-and-event-handling); the library-level proposal lives in the [technical design](technical-design.md#3-scheduling--event-reliability).

Status labels are defined in the [documentation index](../README.md#status-labels).

## Scope and constraints

| Constraint | Status | Consequence |
| --- | --- | --- |
| One bot instance, one Node.js process | **Confirmed** | One in-process scheduler; no distributed coordination. |
| No Redis, brokers, external schedulers, or worker pools | **Confirmed** | Nothing outside the process can own a timer or a job queue. |
| Prayer times are calculated locally | **Confirmed** (implemented in M3) | The scheduler receives instants from `PrayerTimesService`; it never calculates them. |
| Guild-scoped data and event keys | **Confirmed / Proposed** | Records are keyed by guild ID even with one server today; event identity is `{guildId, prayer, localDate, eventType}`. |
| Future schedule is in-memory and rebuildable | **Confirmed** | Settings are the durable source of truth; the schedule is derived state. |
| Delivery ledger commit-before-dispatch | **Confirmed** (decided in M4.1) | At-most-once: prefer no duplicate announcements over guaranteed delivery. |

## 1. Scheduler vs Timer vs Cron

**Timer** — a primitive (`setTimeout`, `setInterval`) that executes a callback after a delay. It has no concept of a job, its identity, whether it already ran, or what to do after a restart. Using timers directly as the design would scatter that bookkeeping across the codebase.

**Cron** — a recurring wall-clock pattern such as "every day at 18:00". Cron fits tasks whose trigger is a fixed, repeating pattern. It is a poor fit when the trigger must be *computed* from an astronomical calculation whose result changes with date, coordinates, method, and timezone.

**Scheduler** — the application component that owns a set of future events, selects the earliest trigger, arms (and cancels) the timer, handles dispatch and failures, rebuilds after changes, and recovers after a restart. It is the owner of time-related decisions, not a timer wrapper.

### Mudhakkir example

Prayer instants are computed by the implemented `PrayerTimesService`, not declared by a pattern. The same prayer at the same wall-clock "time" differs by location and day: our Location → Prayer Times integration tests show Cairo Fajr at `04:57` local on 2026-11-25, while London Dhuhr moves from `13:06` to `11:46` local across the October DST change. Each of the five prayers produces two **one-shot** events per local date (BR-001). A cron expression cannot express these moving targets without re-computing them on every tick, which would just be a polling loop with extra steps.

**Decision:** a single dynamic `setTimeout` scheduler with a periodic safety sweep; no cron library. This matches the existing **Proposed** mechanism in the technical design and is now the recommended design for M4.2.

## 2. One-shot vs Recurring Jobs

A **one-shot** job fires at exactly one instant and is never repeated. A **recurring** job repeats indefinitely on an interval or pattern.

Mudhakkir's events are one-shot and identified by `{guildId, prayer, localDate, eventType}` (for example `1234567890:2026-11-25:fajr:PRAYER_TIME_REACHED`). That identity is also the deduplication key (technical design §3), which makes "did this already fire?" a single database lookup.

Recurrence is **emergent**, not a recurring job: the scheduler keeps a rolling horizon of the current and next local day (ten events for one guild), and as events are consumed, new ones are built for the following day. The only genuinely recurring element is the **heartbeat sweep** (below), which is a safety mechanism, not an announcement job.

**Implication for M4.2:** do not model "the 18:00 job" as a long-lived object that re-arms itself. Model each occurrence as a disposable event with a stable key, and rebuild the horizon.

## 3. Event-driven scheduling

Event-driven means the scheduler reacts to a small number of causes instead of continuously polling "is it time?":

1. **Timer fire** → the due event is processed and the callback is invoked. The callback is injected at composition time; the scheduler has no import of text or voice modules, preserving the architecture's callback boundary.
2. **Configuration change** → `SettingsService` is the single write path and notifies the scheduler to rebuild (BR-048, BR-076).
3. **Startup / shutdown** → build the plan and arm the timer, or cancel it and stop dispatching.

There is no event bus, no message broker, and no external queue: these are direct in-process method calls and one callback. This keeps timing independent of delivery — the scheduler can be tested with a fake clock and a fake callback, as the roadmap's M4 acceptance criteria require.

**Mudhakkir example:** after `/settings` changes the lead time from 10 to 15 minutes, the next `PRAYER_APPROACHING` trigger is five minutes earlier. The scheduler cancels its old timer, recomputes events from the new settings snapshot through `PrayerTimesService`, and arms a fresh timer. Events already dispatched are excluded by their ledger keys.

## 4. Node.js `setTimeout` limitations

| Limitation | Detail | Mudhakkir consequence / mitigation |
| --- | --- | --- |
| **Maximum delay** | Delays above 2,147,483,647 ms (~24.8 days) are not honored; Node fires them after ~1 ms. | Our horizon is at most ~2 days, but keep the documented guard: clamp to 12 hours and re-evaluate if an event is farther out. |
| **Timers are process-local** | All timers vanish on restart or crash. | This is why the schedule is derived state: rebuild from persisted settings on startup (BR-044) and drop triggers already passed (BR-045). |
| **Timer management** | One timer per event is hard to cancel correctly and leaks on rebuild. | Own exactly **one** timer for the earliest event; always `clearTimeout` before re-arming and on shutdown. |
| **Event-loop blocking** | A timer fires only when the loop is free. Synchronous work or a blocked loop makes it fire late. | A periodic heartbeat sweep re-checks for due events; late-event policy is a separate decision (BR-052, see §7). |
| **Drift** | Repeating timers accumulate drift if re-armed as "now + interval". | Irrelevant here: always re-arm to the **absolute UTC instant** returned by `PrayerTimesService`, never a relative delay. |
| **Unhandled callback errors** | A throwing callback can escape and destabilize the process. | The timer callback is inside the scheduler's error boundary: catch everything, log with context, and continue arming subsequent events (architecture §9.2). |

## 5. Timezones and DST in scheduled events

**Rule:** compute, store, and compare trigger instants as absolute UTC epoch milliseconds (`Date` / epoch ms). Use the configured IANA zone only to decide *which local date* to calculate and to format times for humans. Never derive a trigger from "local clock time + fixed UTC offset".

The implemented prayer-times module already does this correctly: `adhan` returns absolute UTC `Date`s, and `Intl.DateTimeFormat` formats the local `HH:mm` in the configured zone. The integration tests capture the proof:

- London 2026-03-29: Dhuhr local `13:06`, UTC `12:00` (spring-forward day).
- London 2026-10-25: Dhuhr local `11:46`, UTC `11:00` (fall-back day).

A naive scheduler using a fixed offset would be one hour off after either transition (BR-042). Two further consequences:

- A local day is **23 or 25 hours** on a transition day. The "today + tomorrow" horizon must be built by advancing **calendar dates in the IANA zone**, not by adding `86_400_000` ms to a timestamp.
- The event key uses the **local prayer date**, so a DST shift never changes an event's identity or creates a duplicate.

**Mudhakkir example:** a `PRAYER_TIME_REACHED` event for London Dhuhr on 2026-10-25 is stored as the UTC instant corresponding to local 11:46, and its key contains `2026-10-25`. When the timer fires, the reminder handler formats the announcement from the event, not from the host machine's clock (IANA timezone authority is Confirmed).

## 6. Multi-Guild scheduling challenges

Each guild can have a different country, city, timezone, calculation method, and lead time, so the "same" prayer occurs at a different UTC instant in each guild. A design that assumes one guild would need a full rewrite when multi-server support arrives — which the architecture deliberately avoids by guild-scoping records.

Minimal approach that already scales:

- Build events for **all enabled guilds** with valid settings and merge them into **one sorted timeline** of absolute instants.
- Arm **one** timer for the earliest event in that merged timeline, regardless of guild.
- When it fires, process all events whose trigger is due (at the same or earlier instant) and then arm the next one.
- Keep dedup keys guild-scoped, so one guild's delivery can never suppress another's.

Memory is O(guilds × 10 events) with a 2-day horizon: trivial for the confirmed single server, still comfortable for hundreds of guilds. No distributed locks, leader election, or shared scheduler are needed because there is exactly one process. The per-guild voice lock in the architecture is a **separate** concern (M6) and must not be confused with timer ownership.

## 7. Event lifecycle: Pending, Processing, Completed, Failed

| State | Where it lives | Meaning in Mudhakkir |
| --- | --- | --- |
| **Pending** | In-memory event plan | Event exists in the horizon and its timer (or the timer for an earlier event) is armed. A rebuild discards pending events and creates new ones. |
| **Processing** | Transition, durable marker written | Timer fired; the scheduler checked `delivery_ledger`, committed the key **before** dispatch (Confirmed), then invoked the due-event callback. |
| **Completed** | Durable marker + logs | The delivery path finished (text sent, or voice cycle ended/failed safely). The ledger row already proves the event was handled; no second state write is needed. |
| **Failed** | Logs only | The callback or delivery path threw. The error boundary catches it, logs the event key and context, and the event is **not retried** — BR-050 requires at-most-once handling. One failed event cannot stop the scheduler loop. |

**Trade-off:** the ledger is a *handled-set*, not a persisted state machine. Recording every state transition in SQLite would enable retries, inspection, and "why didn't this fire?" debugging, but it adds schema, writes, and a recovery policy that MVP does not need. The four states are therefore observable through logs plus the single ledger row, and the design deliberately keeps them lightweight.

**Consequence of commit-before-dispatch:** a key can be recorded even when the handler sends nothing (for example settings became invalid/disabled between build and fire). This is the accepted cost of never spamming duplicates; it is logged with context so it is diagnosable.

## 8. Restart recovery and duplicate execution risks

### Recovery sequence

1. Load persisted settings (Settings module, already implemented and validated on read). Skip missing/invalid/disabled configurations.
2. Compute events for the current and next local date through `PrayerTimesService`.
3. **Discard triggers already past** relative to startup time — no replay, even if the bot was offline by seconds (BR-045). A missed approaching event does not cancel the still-future text event (BR-046).
4. **Exclude keys present in `delivery_ledger`** — an event already handled before the crash is not handled again (BR-050).
5. Arm one timer for the earliest remaining event; start the heartbeat sweep.

### Duplicate risks and mitigations

| Risk | Mitigation |
| --- | --- |
| A rebuild re-arms an event that already fired | Check the ledger key before dispatch; commit-before-dispatch makes the key durable before the callback. |
| Two schedulers/timers accidentally coexist (e.g. reconnection or double bootstrap) | Single-owner invariant: the scheduler owns the next timer; no ad hoc timers elsewhere; startup is idempotent. |
| Discord sends are not idempotent | Commit-before-dispatch: a crash between commit and send loses that announcement but never repeats it. |
| Ledger pruning removes a still-relevant key | Prune only rows older than 7 days (roadmap), far beyond the 2-day rebuild horizon. |
| Clock jump changes "now" during a run | Compare absolute instants and let the heartbeat sweep re-evaluate; the event key still uses the local date. |

True exactly-once delivery is impossible with a non-idempotent Discord API and a crash in the middle. The chosen trade-off is at-most-once (**Confirmed**), which matches architecture §11.1 and technical design §3 now that approval has been given.

## 9. Minimal design (implemented in M4.2)

```text
src/modules/scheduling/
├── index.ts                         # public exports (barrel)
├── event.types.ts                   # event type names + key identity
├── event-builder.ts                 # settings snapshot → events for today + next local day
├── delivery-ledger.ts               # ledger service (check/commit/prune)
├── delivery-ledger-store/
│   ├── index.ts
│   ├── delivery-ledger-store.port.ts
│   └── delivery-ledger-store.ts     # SQLite adapter, owns its port
└── scheduling-service/
    ├── index.ts
    └── scheduling.service.ts        # one timer + heartbeat, rebuild, dispatch, dedup
src/shared/
└── clock.ts                         # Clock port; SystemClock implementation
```

- **Inputs are ports, not concrete types:** settings snapshots and a rebuild notification from `SettingsService`; `IPrayerTimesService` via service-to-service call; the ledger port implemented by the module-owned SQLite adapter using the shared connection; a shared `Clock` port for deterministic tests; a due-event callback injected at composition time.
- **Plan:** sorted events from all enabled guilds, horizon = current + next local calendar day. One timer for the earliest event; clamp-and-re-evaluate guard (12 h). Heartbeat sweep every 15 minutes as a backstop.
- **On fire:** process due events → check/commit ledger key → invoke callback without awaiting a long voice cycle → re-arm next event.
- **Rebuild:** on startup, settings change, or heartbeat drift — cancel timer, recompute, drop past and ledger'd events, re-arm.
- **Shutdown:** cancel the timer, stop dispatch, let in-flight work follow the documented grace policy.
- **Pruning:** delete ledger rows older than 7 days (roadmap M4).
- **Explicitly not used:** cron library, persisted job queue, retry mechanism, event bus, or polling as the primary trigger.

## 10. Edge cases and trade-offs

| Edge case | Resolution / proposal |
| --- | --- |
| 23/25-hour local days (DST) | Build horizon from calendar dates in the IANA zone; triggers are absolute UTC instants. |
| Approaching trigger already past when built (lead time larger than time to prayer) | Skip that approaching event at build time; the text event at the prayer instant still fires. |
| Event due while the event loop was blocked (BR-052) | **Proposed policy, implemented:** dispatch if the trigger is within a 60-second grace window; otherwise skip and log as late, treating it like a missed event. Formal product approval still pending. |
| Config change while a voice cycle is in flight (BR-053) | **Proposed policy:** the running cycle finishes under the settings snapshot it started with; only future events rebuild. Enforced when M6 delivers voice cycles. |
| Ledger write fails at commit time | **Proposed policy, implemented:** fail closed — skip dispatch, log the error with the event key. Preserves at-most-once; the announcement is lost, never duplicated. |
| Guild disabled or settings invalid at dispatch | Load a fresh snapshot; log and send nothing. The ledger key may already be committed — accepted cost of at-most-once. |
| System clock jumps forward/backward | Heartbeat re-evaluates against absolute instants; no interval-based drift. |
| Shutdown exactly when an event fires | Timer cancellation and a "dispatching stopped" flag are set before closing persistence; in-flight work follows the documented grace policy. |
| Event exactly at the horizon boundary | Always rebuild after consuming a due event so the next day's events exist before they are needed; the heartbeat is a second safety net. |
| Ledger row for a prayer whose local date never occurs twice | Local date in the key makes fall-back repeated hours unambiguous (event key stays unique). |

## 11. Decision table

| Decision | Status | Source |
| --- | --- | --- |
| One process, one in-process scheduler; no cron library, queue, or broker | **Confirmed** | System architecture §1 |
| One-shot events keyed by `{guildId, prayer, localDate, eventType}` | **Confirmed / Proposed** | BR-001, BR-050; event identity is Proposed |
| Never replay events missed while offline | **Confirmed** | BR-045, BR-046 |
| Rebuild on any schedule-affecting config change | **Confirmed** | BR-048, BR-076 |
| Two events per prayer: approaching (−lead time) and reached | **Confirmed** | BR-001, BR-002 |
| IANA timezone authority; DST without duplication or drift | **Confirmed** | BR-042; implemented in M3 |
| Ledger commit-before-dispatch (at-most-once) | **Confirmed** (decided in M4.1) | This document §8; technical design §3 |
| Single timer + 15-minute heartbeat, 12-hour clamp | **Implemented** (M4.2) | Technical design §3; this document §9 |
| Horizon = current + next local day; prune ledger after 7 days | **Implemented** (M4.2) | Architecture §6.2; roadmap M4 |
| Ledger as handled-set, not persisted state machine | **Implemented** (M4.2) | This document §7 |
| Late-in-process events: 60-second grace, else skip (BR-052) | **Proposed policy; implemented** | This document §10 |
| Config change mid-delivery: in-flight cycle finishes (BR-053) | **Proposed** (M6) | This document §10 |
| Ledger commit failure: fail closed, skip dispatch | **Proposed policy; implemented** | This document §10 |

## 12. Related documents

- [Business rules](../product/business-rules.md) — event, time, restart, and duplicate-prevention rules (BR-001, BR-002, BR-042, BR-044 to BR-048, BR-050 to BR-053).
- [System architecture](../architecture/system-architecture.md#6-prayer-calculation-scheduling-and-event-handling) — module boundaries, startup/shutdown, and error boundaries.
- [Technical design](technical-design.md#3-scheduling--event-reliability) — library-level scheduling proposal and ledger details.
- [Implementation roadmap](../development/implementation-roadmap.md#milestone-4-prayer-scheduling--duplicate-protection) — M4 acceptance criteria and file plan.
