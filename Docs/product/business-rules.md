# Mudhakkir — Business Rules

This document defines the business behavior that the requirements depend on. It states conditions and invariants precisely; the required outcomes are recorded as `FR-` requirements in [requirements.md](requirements.md). Where this document and a requirement cover the same behavior, this document defines **when and why** it applies, and the requirement defines **what must be observed**.

Status labels follow the [documentation index](../README.md#status-labels). Rules marked **Open** are not decisions and must not be implemented as though they were.

## 1. Prayer events

### 1.1 Event model

Every prayer occurrence on a local day produces two conceptual events. The names are descriptive; they are not a commitment to code identifiers or an event bus.

| Event | Trigger time | Primary effect | Requirements |
| --- | --- | --- | --- |
| `PRAYER_APPROACHING` | Prayer time minus the configured lead time | Voice reminder cycle | FR-040 to FR-052 |
| `PRAYER_TIME_REACHED` | The calculated prayer time | Text reminder | FR-060 to FR-066 |

- **BR-001 (Confirmed):** Each of the five prayers produces one `PRAYER_APPROACHING` event and one `PRAYER_TIME_REACHED` event per local prayer date.
- **BR-002 (Confirmed):** The `PRAYER_APPROACHING` trigger is the prayer's calculated instant minus the configured lead time. The default lead time is 10 minutes.
- **BR-003 (Open):** Whether the lead time is global or configurable per prayer is not decided.
- **BR-004 (Confirmed):** The two event types are independent. The occurrence, failure, or suppression of one does not by itself affect the other.
- **BR-005 (Confirmed):** `PRAYER_APPROACHING` is the trigger for voice announcements only. `PRAYER_TIME_REACHED` is the trigger for the text announcement only.

### 1.2 Calculation and scheduling are separate

Prayer-time calculation and event scheduling are distinct responsibilities:

- **Calculation** determines the five prayer instants for a location, local date, and calculation method. It answers "when is the prayer?" (FR-020 to FR-025).
- **Scheduling** turns those instants plus the configured lead time into upcoming events, tracks which events are due, and ensures each is handled at most once. It answers "what should happen, and when?" (FR-040, FR-080 to FR-083).

Neither responsibility owns the other. The scheduler must not perform astronomical calculation, and the calculator must not send reminders or decide whether an event has already been delivered. This separation is what allows prayer times to be tested independently of Discord and allows upcoming events to be rebuilt after a restart.

### 1.3 Example timeline

For a prayer at 18:00 with the default 10-minute lead time:

| Local time | Event | Expected behavior |
| --- | --- | --- |
| 17:50 | `PRAYER_APPROACHING` | Voice reminder cycle begins, subject to channel eligibility. |
| 18:00 | `PRAYER_TIME_REACHED` | Text reminder is sent to the configured channel. |

If the bot starts at 17:55, the approaching event was missed and is not replayed. The 18:00 text event is still due and is sent (BR-045, BR-046). If no voice channel is eligible at 17:50, the voice path performs no announcement; the 18:00 text event is unaffected.

## 2. Voice channel eligibility

### 2.1 Three distinct concepts

These concepts are frequently confused and must remain separate:

| Concept | Meaning | Consequence |
| --- | --- | --- |
| **Channel visibility** | Whether the bot can see the channel at all, based on its effective View Channel permission. | An invisible channel cannot be evaluated or joined. |
| **Privacy classification** | A product-level classification of whether the channel is restricted to a selected audience through permission overwrites. | Determines whether the private-channel inclusion setting applies. |
| **Effective bot permissions** | The permissions Discord resolves for the bot from `@everyone`, roles, channel overwrites, and category inheritance at the time of the check. | Determines whether the bot may connect, speak, send, or mention. |

- **BR-010 (Confirmed):** Privacy is not inferred from a channel's name, category, position, bitrate, or user limit. A channel is not "private" merely because its name suggests it.
- **BR-011 (Open):** The exact privacy-classification rule is not decided. It must be defined using Discord permission overwrites and documented before implementation. It must not rely on channel names.

### 2.2 Eligibility conditions

A voice channel is eligible for a voice reminder only when all applicable conditions hold at the moment of evaluation:

1. The channel is a supported voice channel type (see the Stage channel question below).
2. The bot can see the channel and has effective **View Channel**, **Connect**, and **Speak** permissions.
3. If the channel is classified as private, private-channel inclusion is enabled.
4. At least one non-bot member is present in the channel.
5. The channel is not excluded by an AFK or other exclusion rule. No such exclusion is currently confirmed.

- **BR-012 (Confirmed):** A channel containing only bots, or no members at all, is not eligible.
- **BR-013 (Confirmed):** A channel containing one human member is eligible, subject to the other conditions. A single human is sufficient; there is no minimum beyond one.
- **BR-014 (Confirmed):** Enabling private-channel inclusion changes only condition 3. It never waives conditions 2, 4, or any Discord permission. The bot must never attempt to join a channel it cannot access or speak in.
- **BR-015 (Confirmed):** A channel that fails any condition is skipped without stopping the cycle.
- **BR-016 (Confirmed):** Eligibility is rechecked immediately before joining, not only when the cycle begins. Membership and permissions may change while earlier channels are processed.

The exact ordering of checks is an implementation concern. The observable results are that an ineligible channel is never joined and that a permission failure is reported clearly enough to diagnose the cause.

### 2.3 Sequential processing

- **BR-020 (Confirmed):** The bot processes channels one at a time and holds at most one active voice connection in the guild.
- **BR-021 (Confirmed):** It must never attempt simultaneous voice connections to multiple channels in the same guild.
- **BR-022 (Confirmed):** Before joining the next channel, the bot must have ended its previous voice connection, or have confirmed that it is no longer active.
- **BR-023 (Confirmed):** The order in which eligible channels are processed is not a product requirement. Any order is acceptable provided all eligible channels are considered once per cycle.
- **BR-024 (Confirmed):** A failure in one channel — discovery, join, playback, or disconnect — is logged and does not prevent processing of subsequent eligible channels (FR-050).
- **BR-025 (Open):** Whether failed channels are retried within the same cycle, and how many times, is not decided.

A single bot instance cannot be connected to multiple voice channels in one guild simultaneously. Sequential processing is therefore intentional, not a temporary limitation.

### 2.4 Open eligibility questions

The following are **not** eligible by implication and must be decided explicitly:

- Stage channel support.
- AFK channel handling, including whether the AFK channel can ever be eligible.
- Channels at their user limit when the bot attempts to join.
- A channel that is deleted, moved, or made inaccessible while the cycle is running.
- Behavior when the bot is already connected to a channel at the start of a cycle.
- Whether any channel is excluded by explicit server configuration.

## 3. Announcement independence

- **BR-030 (Confirmed invariant):** Voice and text announcements are independent. A failed, skipped, or delayed voice announcement must not prevent, delay past its own trigger, or cancel the text announcement at prayer time.
- **BR-031 (Confirmed):** The text reminder is triggered by its own event and sent regardless of whether the voice cycle has started, is running, has failed, or was skipped.
- **BR-032 (Confirmed):** The text reminder must not be queued behind the voice cycle. A voice cycle still processing at prayer time does not justify sending the text reminder late.
- **BR-033 (Confirmed):** A text delivery failure must not stop or alter the voice announcement for the same or later prayers.
- **BR-034 (Confirmed):** Failures in either path are reported separately, with enough context to identify which path failed.
- **BR-035 (Confirmed):** Both paths may read the same configuration and may be disabled together, but neither path's runtime outcome is an input to the other's decision to run.

**Testable invariant:** With voice deliberately unable to run (for example, no eligible channels or a simulated playback failure), the text reminder is still sent at prayer time. With text delivery deliberately failing, the voice cycle still runs to completion.

### 3.1 Text mention target

- **BR-036 (Confirmed):** The text reminder mention target is configurable as either `@everyone` or one specific role in the same server. A new configuration defaults to `@everyone`.
- **BR-037 (Confirmed):** The reminder mentions exactly the configured target. When a role is configured, the message does not also mention `@everyone`; when `@everyone` is configured, the message does not mention a role.
- **BR-038 (Confirmed):** A role selected as the mention target must exist in the same server at the time it is selected.
- **BR-039 (Open):** Behavior when the configured role is later deleted, becomes unmentionable, or the bot lacks the permission to mention it is not decided. Silent fallback to `@everyone` must not be assumed.

## 4. Time and scheduling

### 4.1 Timezone authority

- **BR-040 (Confirmed):** The configured IANA timezone identifier is authoritative for determining the local prayer date and for expressing prayer times to users.
- **BR-041 (Confirmed):** A fixed UTC offset must not be stored or used in place of an IANA timezone.
- **BR-042 (Confirmed):** Daylight saving time is applied through the IANA timezone. A DST transition must not cause an event to be duplicated, skipped, or scheduled at the wrong instant.
- **BR-043 (Confirmed):** Each event belongs to a prayer occurrence on the local prayer date in the configured timezone. The local date is not derived from the server's operating-system timezone.

### 4.2 Rebuilding and missed events

- **BR-044 (Confirmed):** After a restart, future events are rebuilt from persisted configuration. The bot does not rely on an in-memory schedule surviving the process.
- **BR-045 (Confirmed):** Events whose trigger time passed while the bot was offline are not replayed at startup. This applies even when the bot starts shortly after the trigger.
- **BR-046 (Confirmed):** Starting after a missed `PRAYER_APPROACHING` event does not suppress the later `PRAYER_TIME_REACHED` event. Events are evaluated independently.
- **BR-047 (Confirmed):** Re-enabling announcements after a period of being disabled does not replay events missed while disabled.

### 4.3 Changes and duplicate prevention

- **BR-048 (Confirmed):** Changes to location, timezone, calculation method, lead time, or text channel invalidate future scheduled events and cause them to be rebuilt.
- **BR-049 (Confirmed):** A rebuilt schedule must not fire superseded events and must not repeat events already delivered.
- **BR-050 (Confirmed):** Each event type is handled at most once per prayer occurrence, including across restarts, rebuilds, and configuration changes.
- **BR-051 (Confirmed):** A test announcement does not consume, suppress, or modify the real event for that prayer.
- **BR-052 (Open):** Whether an event that becomes due while the bot is running but fires late (for example, because the process was briefly blocked) is announced or skipped is not decided. This is distinct from downtime, where replay is prohibited.
- **BR-053 (Open):** How an in-flight voice cycle is treated when configuration changes or announcements are disabled is not decided.

### 4.4 Scheduler boundary

The exact scheduling mechanism — timers, polling, persisted queue, or another approach — is **not** decided here. The business rules require only that future events can be rebuilt, missed events are not replayed, and duplicates are prevented. Any implementation must satisfy those observable rules.

## 5. Configuration and permissions

Three permission categories must not be conflated.

### 5.1 Discord permissions required by the bot

These allow the bot to perform its work. The exact final set requires technical design, but the following are functionally necessary:

| Function | Candidate required permissions |
| --- | --- |
| Voice reminder | View Channel, Connect, Speak in an eligible voice channel |
| Text reminder | View Channel, Send Messages, Mention Everyone (required for `@everyone` and role mentions) in the configured text channel |
| Command interactions | Ability to receive and respond to the command interaction |

- **BR-060 (Confirmed):** The bot checks its effective permissions at the point of use. Possessing a permission at setup time does not guarantee it later.
- **BR-061 (Confirmed):** Missing permissions cause the affected action to fail safely and be logged. They do not cause the bot to bypass Discord's checks.
- **BR-062 (Open):** The final required bot permission set, including whether any additional permissions are needed for channel discovery or replies, is deferred to technical design.

### 5.2 Discord permissions required by the configuring person

- **BR-063 (Confirmed):** Only authorized server administrators may run configuration-changing operations: initial setup, settings changes, and enable/disable.
- **BR-064 (Open):** The exact Discord permission or role that makes a member "authorized" is not decided. The application must enforce the check on the server side; hiding a command in the interface is not sufficient.
- **BR-065 (Proposed):** Read-only operations such as viewing today's prayer times may be available to a broader audience; their access rule is not finalized.

### 5.3 Application-level configuration rules

- **BR-066 (Confirmed):** Configuration is server-scoped and only valid for the Discord server where it is applied.
- **BR-067 (Confirmed):** All configuration input is validated before it is persisted or used. Invalid input is rejected with an actionable message and does not partially apply.
- **BR-068 (Confirmed):** A location must resolve to coordinates and an IANA timezone. A country name alone is not a valid location.
- **BR-069 (Confirmed):** The timezone must be a valid IANA identifier; a numeric offset is not accepted as a timezone.
- **BR-070 (Confirmed):** The calculation method must be a value the system supports. The supported set is **Open**.
- **BR-071 (Confirmed):** The text channel must exist in the same server and be a channel type the bot can send to.
- **BR-072 (Confirmed):** The lead time must be an accepted value. Its range and whether it is global or per-prayer are **Open** (BR-003).
- **BR-073 (Confirmed):** Enabling automated announcements requires a complete, valid configuration. An incomplete configuration cannot be treated as enabled.
- **BR-074 (Proposed):** Where the bot lacks a required permission in the selected text channel, setup reports the problem and does not silently accept a configuration that cannot deliver reminders.
- **BR-075 (Confirmed):** Configuration changes are logged with enough context to identify what changed and by whom.
- **BR-076 (Confirmed):** A successful configuration change triggers recalculation and rescheduling of future events as required by BR-048.

## 6. Audio rules

- **BR-080 (Confirmed):** Announcement audio files are local project assets, not fetched from a remote service at announcement time.
- **BR-081 (Confirmed):** Each of the five prayers has a corresponding audio announcement.
- **BR-082 (Confirmed):** Missing, unreadable, or invalid audio must be detected and handled without crashing the application.
- **BR-083 (Confirmed):** An audio problem is isolated: it does not prevent the text reminder, does not stop later eligible voice channels from being attempted, and does not affect other prayers.
- **BR-084 (Confirmed):** The bot plays the announcement and disconnects after playback, before moving to the next channel. If playback fails, it must still make a best effort to leave the channel cleanly.
- **BR-085 (Confirmed):** Audio playback is sequential; two announcements are never played in the same guild at the same time.
- **BR-086 (Open):** The behavior when a prayer's audio is missing — skip that prayer's voice cycle, use a fallback, or abort the cycle — is not decided.
- **BR-087 (Open):** The exact encoding, playback library, file naming convention, and whether the prayer-to-file mapping is fixed or configurable are not decided. Volume and use of a specific Discord voice region are also Open. No library choice is implied by this document.

## 7. Related decisions

The consolidated list of undecided product behavior is maintained in [requirements.md § Open product decisions](requirements.md#open-product-decisions). That list is the source of truth for what still needs approval; this document only explains the open points in context.
