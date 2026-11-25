# Mudhakkir Documentation

This directory holds the project documentation for **Mudhakkir**, a Discord prayer reminder bot. Its purpose is to record what the project is meant to do, how it is expected to be built, and how it will be run and maintained — before and alongside implementation.

Documentation is written in Markdown and in clear, professional English. It is organized by concern rather than by chronology, so a reader can go straight to the area they need.

## Documentation structure

```text
Docs/
├── README.md
├── product/
├── architecture/
│   └── decisions/
├── technical/
├── development/
└── operations/
```

### Directory purposes

| Directory | Purpose |
| --- | --- |
| `product/` | What Mudhakkir is and does: purpose, scope, features, user-facing behavior, and the decisions that shape the product. |
| `architecture/` | The system's structure: module boundaries, responsibilities, data flow, and how the pieces fit together. |
| `architecture/decisions/` | Architecture Decision Records (ADRs): individual, dated records of significant technical decisions and the reasoning behind them. |
| `technical/` | Detailed reference material for specific subsystems, such as prayer calculation, scheduling, voice announcements, text announcements, persistence, and location handling. |
| `development/` | Guidance for working on the project: local setup, coding conventions, testing approach, and contribution workflow. |
| `operations/` | Running and maintaining the bot: configuration, deployment, backups, monitoring, and troubleshooting. |

## How the documentation is organized

- **Start with the product.** `product/project-overview.md` is the main introductory document and the recommended first read.
- **Architecture documents describe structure, not code.** They explain responsibilities and boundaries and should not restate product requirements.
- **ADRs capture one decision each.** A decision that is significant, has trade-offs, or would be expensive to reverse gets its own record. ADRs are immutable in substance: later changes are recorded as new ADRs that supersede earlier ones.
- **Technical documents go deeper on one subsystem.** Each should stay focused, link to related documents, and avoid duplicating explanations found elsewhere.
- **Development and operations documents describe process, not design.** They answer "how do I work on this?" and "how do I run this?".

## Status labels

To keep confirmed requirements separate from ideas, documents use these labels where relevant:

- **Confirmed** — explicitly agreed project behavior that is required.
- **Proposed** — a reasonable recommendation that still needs approval.
- **Open** — a decision that has not been made.
- **Future** — intentionally outside the initial release.
- **Implemented** — present in the current source tree; this describes code state, not a product decision or a guarantee that the whole feature is complete.

Nothing in the documentation should be read as a finalized product choice unless it is marked as confirmed. **Implemented** describes what the code currently does; it does not promote a proposed design into a confirmed decision. Proposed and open items must not be implemented as though they were settled.

## Current documents

| Document | Description |
| --- | --- |
| [`product/project-overview.md`](product/project-overview.md) | Purpose, features, initial scope, constraints, architecture philosophy, confirmed decisions, and open decisions. |
| [`product/requirements.md`](product/requirements.md) | Functional and non-functional requirements with stable IDs, status labels, and a consolidated list of open product decisions. |
| [`product/business-rules.md`](product/business-rules.md) | Precise business behavior for prayer events, voice-channel eligibility, announcement independence, time and scheduling, permissions, and audio. |
| [`product/command-specification.md`](product/command-specification.md) | Proposed administrator command set with purpose, access, inputs, outputs, validation, and failure cases. |
| [`architecture/system-architecture.md`](architecture/system-architecture.md) | Modular Monolith modules, dependencies, startup/shutdown, command and configuration flow, scheduling, announcement paths, persistence, logging, and architectural risks. |
| [`architecture/code-structure.md`](architecture/code-structure.md) | Source tree, file responsibilities, module entry points, enforceable architecture rules, and the distinction between implemented and planned files. |
| [`technical/technical-design.md`](technical/technical-design.md) | Practical technical decisions, library choices, scheduling engine, Discord integration, voice pipeline, persistence schema, validation, and logging for the MVP, with implementation status where code exists. |
| [`technical/scheduling-design.md`](technical/scheduling-design.md) | M4.1 study of scheduler/timer/cron, one-shot events, event-driven design, `setTimeout` limits, DST, multi-guild scheduling, event lifecycle, restart recovery, and the proposed minimal M4.2 design. |
| [`development/implementation-roadmap.md`](development/implementation-roadmap.md) | Practical 8-milestone implementation plan for the MVP, including the current implementation baseline, remaining milestones, and known gaps. |

## Current implementation status

The repository now contains a partial TypeScript implementation, not only documentation:

- **M1 foundation implemented:** environment validation, Pino logging, dependency injection, Discord client creation, and graceful shutdown wiring.
- **M2 foundation implemented:** SQLite connection and migrations, guild settings schema, settings store/service, and validation. The settings store is owned by the settings module while the shared database connection and migrations stay in `infrastructure/persistence/`; all modules use the same SQLite database. `SettingsService` depends on abstractions (`ISettingsStore` port and shared `Logger` contract), and restart durability is verified by a close/reopen test.
- **M3 implemented and verified:** Location and Prayer Times modules, with unit and integration tests covering the full flow, DST, high latitudes, and external references.
- **M4 implemented and verified:** in-process scheduler with one timer and a heartbeat, event builder, delivery ledger with commit-before-dispatch, restart recovery, and 7-day pruning. M5–M8 are still planned.
- **Verification:** `npx tsc --noEmit`, `npm run build`, and all 49 tests pass across nine test files.
- **Known gap:** no text or voice announcement path exists yet; the scheduler currently dispatches to a no-op callback that M5 will replace. See the [implementation roadmap](development/implementation-roadmap.md#current-implementation-status).

The [implementation roadmap](development/implementation-roadmap.md) is the authoritative summary of what exists, what is partial, and what remains.

## Planned documents

The following documents are planned for upcoming documentation tasks. They do not exist yet; this list describes intent only. Filenames are indicative and may change.

### Product
No further product documents are currently planned. Open product questions are tracked in the [requirements](product/requirements.md#open-product-decisions) rather than in speculative documents.

### Architecture
- ADRs, including: Modular Monolith as the architectural style; local prayer-time calculation; sequential voice-channel processing; the delivery-ledger semantics; and the choice of geocoding provider once finalized. The SQLite persistence choice is already implemented but still lacks a recorded ADR.

### Technical
Subsystem deep-dives or supplementary technical notes if needed beyond [`technical/technical-design.md`](technical/technical-design.md) and the completed [`scheduling-design.md`](technical/scheduling-design.md).

### Development
- Local development setup and environment configuration.
- Coding conventions and contribution workflow.
- Testing strategy.

### Operations
- Deployment and process management.
- Configuration and secrets management.
- Backup and recovery.
- Monitoring, logging, and troubleshooting.
