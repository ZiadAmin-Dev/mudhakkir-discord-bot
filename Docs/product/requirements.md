# Mudhakkir — Functional and Non-Functional Requirements

This document translates the [project overview](project-overview.md) into requirements that can be verified and later converted into tests. It describes required behavior, not implementation. Architecture and technology choices remain outside its scope.

Requirements use stable identifiers (`FR-` for functional, `NFR-` for non-functional). Identifiers are never reused; a withdrawn requirement is marked as such rather than renumbered.

Status labels follow the definitions in the [documentation index](../README.md#status-labels):

- **Confirmed** — agreed and required.
- **Proposed** — a recommendation that still needs approval.
- **Open** — not yet decided.
- **Future** — intentionally outside the initial release.

Confirmed requirements state required behavior. Proposed requirements are included so they can be reviewed and either approved or changed; they are not commitments. Open decisions are listed in [Open product decisions](#open-product-decisions) and are not requirements.

Related documents:

- [Business rules](business-rules.md) — precise behavior and invariants behind these requirements.
- [Command specification](command-specification.md) — the proposed administrator command surface.
- [Project overview](project-overview.md) — scope, constraints, and context.

## Functional requirements

### 1. Server configuration

| ID | Status | Requirement |
| --- | --- | --- |
| FR-001 | Confirmed | The bot shall treat automated announcements as active only when every mandatory configuration setting is present and valid and announcements are enabled. |
| FR-002 | Confirmed | Configuration shall identify one specific location by city, country, latitude, longitude, and IANA timezone identifier. |
| FR-003 | Confirmed | The prayer calculation method shall be configurable. A new configuration shall default to the Egyptian General Authority of Survey method. |
| FR-004 | Confirmed | Asr prayer calculation shall use the Standard rule (1x shadow length). |
| FR-005 | Confirmed | Configuration shall identify the text channel that receives prayer-time reminders. |
| FR-006 | Confirmed | The voice reminder lead time shall be configurable, with a default of 10 minutes before prayer. |
| FR-007 | Confirmed | Whether private voice channels are included in voice reminders shall be configurable. |
| FR-008 | Proposed | Initial setup shall be performed through a guided sequence of Discord interactions rather than one command invocation with many arguments. |
| FR-009 | Proposed | An authorized administrator shall be able to view the current configuration in a summarized form. |
| FR-010 | Confirmed | An authorized administrator shall be able to update configuration settings without discarding unrelated settings. |
| FR-011 | Confirmed | Configuration, including whether announcements are enabled, shall persist across bot restarts. |
| FR-012 | Confirmed | Only authorized server administrators shall be able to create or change configuration. |
| FR-013 | Confirmed | A configuration change shall affect future reminders only. It shall not cause a reminder for an already-passed event to be sent, nor a reminder already delivered to be repeated. |
| FR-014 | Confirmed | The bot shall support enabling and disabling automated prayer announcements. While disabled, it shall not send automated voice or text prayer reminders. |
| FR-015 | Confirmed | The text reminder mention target shall be configurable as either `@everyone` or one role from the same server. A new configuration shall default to `@everyone`. |

**Open in this area:**

- The default for private-channel inclusion (FR-007).
- Whether the lead time is global or configurable per prayer, and the permitted range (FR-006).
- The exact Discord permission required of an administrator (FR-012). See [business rules §5](business-rules.md#5-configuration-and-permissions).
- Whether enable/disable applies to voice and text together or separately (FR-014).
- Whether a partially completed setup may be saved as a draft, and when it becomes active (FR-001, FR-008).

### 2. Prayer times

| ID | Status | Requirement |
| --- | --- | --- |
| FR-020 | Confirmed | The bot shall calculate the times of the five daily prayers — Fajr, Dhuhr, Asr, Maghrib, and Isha — for each local day. |
| FR-021 | Confirmed | Prayer times shall be calculated locally by the bot without a prayer-time API. |
| FR-022 | Confirmed | Prayer-time calculation shall use the configured latitude and longitude. |
| FR-023 | Confirmed | Calculated times shall be interpreted in the configured IANA timezone, with daylight saving time applied. |
| FR-024 | Confirmed | Prayer-time calculation shall use the configured calculation method. Changing the method shall change subsequently calculated times accordingly. |
| FR-025 | Confirmed | Asr calculation shall follow the Standard calculation method (shadow length factor of 1). |
| FR-026 | Confirmed | The bot shall provide a way to view today's five prayer times for the configured location, expressed in the configured timezone. |
| FR-027 | Confirmed | When the location, timezone, or calculation method changes, the bot shall recalculate prayer times and reschedule future reminders. |
| FR-028 | Proposed | A displayed prayer-time result shall identify the location and timezone it applies to, so the values cannot be mistaken for another location's times. |

**Open in this area:**

- Location selection UX details beyond the initial select-menu flow, such as a manual timezone override in a later release (FR-002). The location source itself is fixed: curated offline country/city data exposed through `ILocationService`; no external geocoding or fuzzy name matching.
- The set of supported calculation methods (FR-003, FR-024).
- Handling of locations and seasons where a prayer time is undefined or anomalous, such as high-latitude cases.
- Whether the displayed prayer times include additional context such as the calculation method or date (FR-026, FR-028).

### 3. Voice announcements

| ID | Status | Requirement |
| --- | --- | --- |
| FR-040 | Confirmed | A `PRAYER_APPROACHING` event shall be scheduled at the prayer time minus the configured lead time. |
| FR-041 | Confirmed | When a `PRAYER_APPROACHING` event triggers, the bot shall start one voice reminder cycle for that prayer. |
| FR-042 | Confirmed | Each prayer shall use its corresponding local audio announcement file. |
| FR-043 | Confirmed | Before announcing, the bot shall determine which voice channels are eligible under the rules in [business rules §2](business-rules.md#2-voice-channel-eligibility). |
| FR-044 | Confirmed | Eligible channels shall be processed sequentially. The bot shall hold at most one active voice connection in the guild at any time. |
| FR-045 | Confirmed | Voice channels with no human members, including channels containing only bots, shall be skipped. |
| FR-046 | Confirmed | The bot shall join a voice channel only when it has the effective Discord permissions to view, connect to, and speak in that channel. |
| FR-047 | Confirmed | The private-channel setting shall control whether restricted channels are considered. Enabling private-channel inclusion shall not bypass any Discord permission check. |
| FR-048 | Confirmed | Immediately before joining each channel, the bot shall recheck that the channel is still eligible, including current membership and effective permissions. |
| FR-049 | Confirmed | For each eligible channel, the bot shall join, play the prayer's announcement, and disconnect before processing the next channel. |
| FR-050 | Confirmed | A failure affecting one channel — including join, playback, or disconnect failure — shall be logged and shall not stop processing of the remaining eligible channels. |
| FR-051 | Confirmed | A missing or invalid audio file shall be handled without crashing the application and without preventing later channels from being processed. |
| FR-052 | Confirmed | A failure, delay, or partial completion of the voice reminder shall not prevent the corresponding text reminder. |

**Open in this area:**

- Behavior when no voice channel is eligible: no-op, log only, or another response.
- Stage channel support.
- AFK channel handling.
- Other eligibility edge cases, such as a channel at its user limit, the bot already being connected, or a channel becoming unavailable mid-cycle.
- Retry policy after a channel failure.
- Audio behavior when a prayer's file is missing: skip the prayer's voice cycle or use a fallback.

### 4. Text announcements

| ID | Status | Requirement |
| --- | --- | --- |
| FR-060 | Confirmed | When a `PRAYER_TIME_REACHED` event triggers, the bot shall send a text reminder for that prayer. |
| FR-061 | Confirmed | The text reminder shall be sent to the configured text channel in the same Discord server. |
| FR-062 | Confirmed | The text reminder shall mention exactly the configured mention target: `@everyone` or the selected role. When a role is configured, the message shall not also mention `@everyone`. |
| FR-063 | Confirmed | The text reminder shall include the prayer name. |
| FR-064 | Confirmed | Text delivery shall be independent of voice delivery. The text reminder shall not wait for, nor be conditional on, the voice reminder starting, finishing, or succeeding. |
| FR-065 | Confirmed | A text delivery failure shall be logged, shall not crash the application, and shall not affect voice announcements or later prayer events. |
| FR-066 | Confirmed | The bot shall not send duplicate text reminders for the same prayer occurrence because of a restart, reschedule, or schedule rebuild. |

**Open in this area:**

- The exact wording and formatting of the message beyond the configured mention target and prayer name (FR-062, FR-063).
- Whether the message includes additional content such as the prayer time, date, or a timestamp.
- Whether a failed send is retried and, if so, within what time limit (FR-065).
- Behavior when the configured text channel is deleted or becomes inaccessible.
- Behavior when the bot lacks `Mention Everyone` for an `@everyone` or role target, the configured role is deleted, or the role cannot be mentioned. Silent fallback to `@everyone` is not implied.
- Whether more than one role may be selectable as the mention target. The confirmed behavior covers one role.

### 5. Reliability and scheduling

| ID | Status | Requirement |
| --- | --- | --- |
| FR-080 | Confirmed | For each prayer occurrence, the bot shall run at most one voice reminder cycle and send at most one text reminder, including across restarts, schedule rebuilds, and configuration changes. |
| FR-081 | Confirmed | On startup, the bot shall rebuild future scheduled events from persisted configuration. |
| FR-082 | Confirmed | Events whose trigger time passed while the bot was offline shall not be sent as catch-up on startup. |
| FR-083 | Confirmed | Configuration changes that affect prayer times or announcements shall rebuild future scheduled events. Superseded events shall not fire, and already-delivered events shall not be repeated. |
| FR-084 | Confirmed | Unavailable channels, missing permissions, and Discord API failures shall be logged and contained. They shall not crash the bot or stop unrelated announcements or channels. |
| FR-085 | Confirmed | The bot shall log meaningful errors and important system events, including startup, configuration changes, enable/disable actions, reminder triggering, and announcement outcomes. |
| FR-086 | Proposed | If configuration is missing or invalid at startup, the bot shall start without crashing, perform no automated announcements, and report that administrator action is required. |

**Open in this area:**

- Whether an event that fires late while the bot is running is still announced, or only events missed during downtime are skipped (FR-082).
- The mechanism and persistence model for duplicate prevention (FR-080).
- The scheduler implementation and how schedule rebuilds handle an in-flight announcement (FR-081, FR-083).
- Log destinations, retention, and whether alerts are required (FR-085).

## Non-functional requirements

| ID | Status | Requirement |
| --- | --- | --- |
| NFR-001 | Confirmed | The architecture shall remain a Modular Monolith with the module separation described in the [project overview](project-overview.md#architecture-philosophy). Business rules for prayer times, scheduling, and eligibility shall be independent of Discord-specific details wherever practical. |
| NFR-002 | Confirmed | Failures in one announcement path or channel shall be isolated as specified in FR-050, FR-052, and FR-065. A single failure shall not prevent the remaining work from completing or crash the process. |
| NFR-003 | Confirmed | Prayer-time calculations shall follow a recognized, documented calculation convention and produce correct results for the configured location and method, using the Standard Asr rule. Correctness shall be verified against a trusted reference during development. |
| NFR-004 | Confirmed | All local date and time handling shall use the configured IANA timezone. Fixed UTC offsets shall not replace timezone identifiers, and daylight saving transitions shall be handled correctly. |
| NFR-005 | Confirmed | The system shall be sized for one Discord server, one Node.js process, and at most five prayer cycles per day. No numerical throughput or latency targets are established until there is evidence to justify them. |
| NFR-006 | Confirmed | Prayer-time calculation, scheduling decisions, eligibility rules, and duplicate prevention shall be testable without a live Discord connection. Time-dependent behavior shall be testable with a controlled clock. |
| NFR-007 | Confirmed | The bot shall emit logs sufficient to diagnose failed announcements, permission problems, scheduling errors, and configuration changes. |
| NFR-008 | Proposed | Log entries shall include enough context to identify the affected event and outcome, such as prayer, event type, server, channel where relevant, and error detail. No specific log format or retention period is proposed. |
| NFR-009 | Confirmed | The bot shall request and use only the Discord permissions needed for its functions, shall never bypass Discord permission checks, and shall treat all administrator input as untrusted until validated. Secrets and tokens shall not be written to logs. |
| NFR-010 | Confirmed | Server configuration and enabled/disabled state shall survive process restarts and normal shutdowns without silent data loss. |
| NFR-011 | Proposed | Invalid or unreadable persisted data shall be detected and reported without silently overwriting it with defaults; recovery procedures shall be documented under operations. |
| NFR-012 | Confirmed | Configuration and scheduling data shall be scoped to a Discord server, and the design shall not preclude future multi-server operation. Multi-server operation itself remains **Future**. |
| NFR-013 | Confirmed | The initial release shall not introduce microservices, Redis, message brokers, Kubernetes, multiple workers, or distributed scheduling. |

**Open in this area:**

- Concrete permission requirements for the bot and for administrators (NFR-009). These require technical design.
- Performance and resource expectations beyond the single-server scope (NFR-005).
- The persistence and recovery technology, including how invalid data is detected (NFR-010, NFR-011).
- The concrete test strategy and coverage expectations (NFR-006).

## Open product decisions

These decisions are not requirements. They need explicit approval before they are treated as settled.

| Area | Open decision | Related |
| --- | --- | --- |
| Configuration | Default for private-channel inclusion | FR-007 |
| Configuration | Global versus per-prayer lead time, and its allowed range | FR-006 |
| Configuration | Exact administrator permission | FR-012, NFR-009 |
| Configuration | Enable/disable granularity | FR-014 |
| Configuration | Whether setup may save a draft, auto-enable announcements, and how re-running setup behaves | FR-001, FR-008 |
| Location | Optional future timezone override; initial flow uses Location select menus and canonical codes/IDs | FR-002 |
| Prayer calculation | Supported methods and high-latitude behavior | FR-003, FR-024 |
| Voice | Behavior when no channel is eligible | FR-043 |
| Voice | Stage channel and AFK channel support; other eligibility edge cases | FR-043, FR-045 |
| Voice | Retry policy and missing-audio fallback | FR-050, FR-051 |
| Voice | Voice selection, volume, audio format, and prayer-to-file mapping | FR-042 |
| Text | Exact wording and optional content | FR-062, FR-063 |
| Text | Whether more than one role may be selected as the mention target | FR-015 |
| Text | How an already-scheduled reminder reflects a mention-target change | FR-015, FR-083 |
| Text | Retry and late-send policy for failed text delivery | FR-065 |
| Text | Behavior when the configured channel or mention target is unavailable, including a deleted or unmentionable role and missing `Mention Everyone` | FR-061, FR-062, FR-015 |
| Reliability | Late-event handling while the bot is running | FR-082 |
| Reliability | Duplicate-prevention persistence model and scheduler implementation | FR-080, FR-081 |
| Commands | Access to `/prayer-times`; scope and behavior of `/test` | [Command specification](command-specification.md) |

## Traceability

The [business rules](business-rules.md) define the precise conditions behind these requirements. The [command specification](command-specification.md) maps the proposed commands to the requirements they exercise. Where a requirement and a business rule address the same behavior, the business rule states the condition and the requirement states the required outcome; neither document should restate the other in full.
