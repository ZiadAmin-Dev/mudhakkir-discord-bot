# Mudhakkir — Project Overview

## Purpose

Mudhakkir is a Discord bot that reminds the members of a server about the five daily Islamic prayers. It delivers reminders in two independent ways: a **voice reminder** shortly before each prayer, and a **text reminder** at the prayer time itself.

The project aims to be a dependable, low-complexity bot for a single Discord community, with a structure that can grow later without adopting distributed-system complexity now.

## Main features

### Voice reminder

A configurable number of minutes before each prayer — **10 minutes by default** — the bot:

1. Finds the voice channels in the server that are eligible for the reminder.
2. Ignores channels that contain only bots.
3. Visits eligible channels **sequentially**, never simultaneously.
4. Joins a channel, plays the corresponding **local audio** announcement, then disconnects before moving to the next channel.
5. Supports a configurable option to include or exclude **private voice channels**.
6. Always respects Discord's actual channel visibility and permissions.

Sequential processing is intentional: a single bot instance cannot be connected to multiple voice channels in the same guild at the same time.

### Text reminder

At the actual prayer time, the bot:

- Sends a message to a **text channel configured by the server administrator**.
- Mentions a **configured mention target**: `@everyone` by default, or one specific role selected by the administrator.
- Includes the **prayer name** in the message.

Exactly the configured target is used. When a role is selected, the message does not also mention `@everyone`.

Voice and text reminders are independent. A failure in the voice reminder must never prevent the text reminder from being sent.

## Initial scope

The first release is deliberately limited:

- **One Discord server.**
- **One Node.js process.**
- **One bot instance.**
- **TypeScript**, compiled to JavaScript.
- A **Modular Monolith** architecture.
- **Local prayer-time calculation**, rather than depending on a prayer-time API.
- **Local audio files** for announcements.
- **Persistent storage** for server configuration.
- A maintainable structure that can evolve without unnecessary complexity.

Future growth should remain possible, but the initial design should not include microservices, Redis, message brokers, Kubernetes, multiple workers, or distributed scheduling.

## Core constraints

### Location and prayer times

The bot is configured for a **specific location**, not merely a country name. The configuration is expected to store:

- City and country.
- Latitude and longitude.
- An IANA timezone identifier (for example, `Africa/Cairo` or `America/New_York`).
- Prayer calculation method.
- Standard Asr calculation (1x shadow length).

The default calculation method should be appropriate for Egypt — the **Egyptian General Authority of Survey** — while remaining configurable.

Timezone handling must account for daylight saving time. A fixed UTC offset must not be used as a substitute for an IANA timezone.

Locations come from curated offline country/city data through the Location module's public interface. Administrators select a country and, when required, a city from Discord select menus using canonical codes/IDs; there is no external geocoding or fuzzy name search in the initial release.

### Voice channel eligibility

- Eligible channels are processed sequentially.
- Channels containing only bots are ignored.
- Eligibility is **rechecked immediately before joining**, because members may leave while other channels are being processed.
- Discord permissions are respected, including the permissions required to **view**, **connect**, and **speak**.
- Whether private channels are included is configurable. Enabling private-channel inclusion must never bypass Discord permissions.
- A failure in one channel must not stop processing of the remaining eligible channels.

### Reliability

The system should:

- Avoid duplicate prayer announcements.
- Rebuild upcoming scheduled events after a restart.
- Avoid sending announcements that were missed while the bot was offline.
- Handle timezone and configuration changes correctly.
- Isolate failures between voice and text announcements.
- Log meaningful errors and important system events.

Detailed reliability and scheduling decisions are deferred to later documentation.

## Architecture philosophy

Mudhakkir uses a **Modular Monolith** with clear separation between:

- Discord commands and interactions.
- Prayer calculation.
- Prayer scheduling.
- Voice announcements.
- Text announcements.
- Server settings.
- Location handling.
- Infrastructure such as Discord, persistence, and audio playback.

Business logic should remain independent of Discord-specific implementation details wherever practical. This keeps prayer calculation, scheduling rules, and eligibility policy testable and understandable without requiring a live Discord connection.

Abstractions should be introduced only when they provide a real architectural or testing benefit. Unnecessary interfaces, classes, and layers are to be avoided.

## Confirmed decisions

The following are agreed requirements for the project:

| Area | Decision |
| --- | --- |
| Product | A Discord bot reminding server members of the five daily Islamic prayers. |
| Delivery | Voice reminders before prayer and text reminders at prayer time, as independent paths. |
| Voice timing | Configurable lead time, **10 minutes before prayer by default**. |
| Voice channels | Process eligible channels sequentially; ignore bot-only channels; recheck eligibility before joining. |
| Voice playback | Local audio files; join, play, disconnect, then move to the next channel. |
| Private channels | Inclusion is configurable and never overrides Discord permissions. |
| Permissions | View, connect, and speak permissions are respected. |
| Failure isolation | One channel's failure does not stop the remaining channels; voice failure does not block the text reminder. |
| Text reminder | Sent at prayer time to an administrator-configured text channel, mentioning the configured mention target — `@everyone` by default or one specific role — and including the prayer name. |
| Scale | One server, one Node.js process, and one bot instance initially. |
| Language | TypeScript compiled to JavaScript. |
| Architecture | Modular Monolith with the module separation described above. |
| Prayer times | Calculated locally; no prayer-time API dependency. |
| Location | City and country, latitude and longitude, IANA timezone, and calculation method. Asr always uses the Standard rule (1x shadow length). |
| Default method | Egyptian General Authority of Survey, configurable. |
| Timezones | IANA timezone identifiers, with daylight saving time handled correctly; no fixed UTC offset. |
| Storage | Persistent storage for server configuration. |
| Exclusions | No microservices, Redis, message brokers, Kubernetes, multiple workers, or distributed scheduling. |
| Reliability | No duplicate announcements; schedule rebuilt after restart; missed announcements not sent late; timezone and configuration changes handled; meaningful logging. |

## Open decisions

The following questions are open and must not be treated as settled. They are candidates for upcoming documentation and ADRs. The [requirements](requirements.md#open-product-decisions) document maintains the consolidated register of product-level open decisions; this section provides the broader project context.

### Product behavior
- Default for private-channel inclusion (the setting is confirmed; its default is not).
- Whether all five prayers use one lead time or per-prayer lead times.
- Exact text message wording and formatting beyond the configured mention target and the prayer name.
- Behavior when no eligible voice channels exist.
- Behavior when the configured text channel is missing, deleted, or inaccessible.
- Behavior when the configured mention role is deleted, becomes unmentionable, or otherwise cannot be mentioned.
- Whether the mention target may be changed without rescheduling, and how it applies to an already-scheduled prayer.
- Stage channel support.
- AFK channel handling and other channel eligibility edge cases.
- Voice selection, volume, and audio file format/organization.

### Location and prayer calculation
- Whether a manual timezone override is offered in a later release (initial setup uses the timezone from Location).
- Country/city select-menu pagination details if the curated list grows beyond 25 options.
- Whether a future release should let administrators override the Location-provided calculation method (the current setup uses the resolved method).
- How timezone and calculation changes affect already-scheduled events.

### Architecture and technology
- The persistence technology and schema.
- The Discord library and command framework.
- The audio playback approach and required system dependencies.
- Project structure conventions and module boundaries in detail.
- Testing strategy and the level of test coverage expected.
- Scheduling mechanism and how duplicates and missed events are prevented in practice.
- Configuration and secrets management.

### Operations
- Hosting environment and deployment method.
- Logging destinations and retention.
- Backup and recovery expectations for configuration data.
- Monitoring and alerting expectations.
- How the single-server limitation will be relaxed in a future release.

## Related documentation

- [Documentation index](../README.md) — how the documentation is organized and what is planned.
- [Requirements](requirements.md) — testable functional and non-functional requirements, plus the consolidated open product decisions.
- [Business rules](business-rules.md) — precise event, eligibility, independence, scheduling, permission, and audio rules.
- [Command specification](command-specification.md) — the proposed administrator command set.
