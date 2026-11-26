# Mudhakkir — Command Specification

This document describes the proposed initial Discord command set and the interactions administrators use to configure and operate **Mudhakkir**. It is product behavior, not a finalized Discord implementation. Command names, option names, component layouts, and response visibility may change during technical design.

Status labels follow the [documentation index](../README.md#status-labels). The entire command set is **Proposed** unless a specific behavior is marked otherwise. Nothing here overrides the [requirements](requirements.md) or [business rules](business-rules.md).

## Shared conventions

These conventions apply to every command in this document unless stated otherwise.

- **Guild-only operation (Proposed):** Commands operate inside a Discord server. Direct-message use is not part of the initial release.
- **Authorization (Confirmed requirement, exact permission Open):** Configuration-changing commands are restricted to authorized server administrators. The exact Discord permission is not decided; see [business rules §5.2](business-rules.md#52-discord-permissions-required-by-the-configuring-person).
- **Server-side validation (Confirmed):** Every input is validated on the bot's side. Interface restrictions and hidden commands are not a security boundary.
- **No exact wording commitment (Open):** Message text in this document is descriptive. Any quoted text is an example only and is not final copy.
- **Configuration responses are private by default (Proposed):** Setup, settings, test results, and enable/disable responses should be visible only to the invoking administrator. The final visibility is Open.
- **Commands do not bypass permissions (Confirmed):** A command may report that the bot lacks a permission, but it must never use an alternative path to perform a forbidden action.

## Command summary

| Command | Purpose | Proposed access | Status |
| --- | --- | --- | --- |
| `/setup` | Guide initial configuration | Authorized administrator | Proposed |
| `/prayer-times` | Show today's five prayer times | Server members | Proposed |
| `/settings` | View and edit configuration | Authorized administrator | Proposed |
| `/test` | Exercise voice and/or text announcements on demand | Authorized administrator | Proposed |
| `/enable` | Enable automated prayer announcements | Authorized administrator | Proposed |
| `/disable` | Disable automated prayer announcements | Authorized administrator | Proposed |

## `/setup`

### Purpose

Create the initial server configuration through a guided interaction sequence, without requiring the administrator to supply all values as a long list of command arguments. This supports FR-008 and the configuration requirements FR-001 to FR-015.

### Who can use it

An authorized server administrator in the server being configured (BR-063). The exact required Discord permission is Open (BR-064). Use outside a server is rejected.

### Inputs

No slash-command options are required beyond invoking the command. Configuration is collected through follow-up interactions. The proposed sequence is:

1. **Country:** the bot retrieves available countries through `ILocationService.listCountries()` and displays a Discord String Select Menu. The option value is the **canonical country code**; the label is the country name from Location. Country names are never typed, translated, aliased, or fuzzy-matched.
2. **City:** a city select menu is built from `ILocationService.listCities(countryCode)`, so it shows only cities belonging to the chosen country; the option value is the canonical city ID. City choice is **optional for countries with a default city** — a "Use default city" button resolves the country without a city. For countries where Location marks `cityRequired` (for example the USA, whose cities span multiple timezones), a city **must** be chosen.
3. **Timezone, coordinates, and calculation method:** all come from `LocationService.resolve()`. The method is **not user-selectable**; this release keeps setup simple by using the city override or country default from Location. No manual coordinate or timezone entry is part of the flow.
4. **Text channel:** the administrator picks the reminder channel from Discord's native **channel select menu**, restricted to text channels. No channel ID needs to be copied.
5. **Mention target:** optional — a select menu offers `@everyone`, one specific role, or **Skip (use @everyone)**. If a role is chosen, a native **role select menu** provides the role ID. The default is `@everyone`; no role ID needs to be copied.
6. **Lead time:** enter the number of minutes before prayer for the voice reminder (1–60); the default is 10.
7. **Private voice channels:** choose whether restricted voice channels are included.
8. **Review and confirm:** show a summary of all values before saving.

Location owns all location business rules (country existence, city membership, required-city and default-city rules, final resolution). The Discord layer only validates the interaction and the selected option, then passes the canonical code/ID to Location; it does not duplicate reference data or location rules.

Discord String Select Menus allow at most 25 options. Country and city menus must be paginated (for example, with Previous/Next buttons carrying the page index) when the list from Location exceeds 25 entries. Current curated data has 9 countries and at most 3 cities per country, so pagination is a forward-looking requirement. Other interaction components for the remaining steps remain an implementation detail.

### Expected output or interaction

- An ephemeral prompt sequence that collects the values above.
- Validation feedback at each step, without discarding values already entered where practical.
- A final summary for confirmation.
- On confirmation, persisted configuration and a success response that identifies what was saved.
- On cancellation or validation failure, no unconfirmed configuration is persisted; the previous configuration, if any, remains authoritative (BR-067).

**Proposed:** setup does not automatically enable automated announcements. The administrator enables them separately with `/enable`, after reviewing the configuration. Whether setup may leave a draft configuration is Open.

### Validation requirements

- The invoking member is authorized (BR-063).
- The command is used in a server, not a direct message.
- The location resolves to coordinates and an IANA timezone; a country name alone is insufficient (BR-068).
- The timezone is a valid IANA identifier, not a numeric offset (BR-069).
- The calculation method is the value returned by Location for the selected country/city; it is not entered by the administrator (BR-070).
- The selected text channel exists in the same server and is a type the bot can send to (BR-071).
- The mention target is either `@everyone` or a role in the same server (FR-015, BR-036, BR-038). If a role is selected, the bot should check or clearly report whether it can mention it.
- The lead time is within the permitted range (BR-072; range and per-prayer scope Open).
- The private-channel choice is a boolean value (FR-007).
- The bot's ability to send in the selected text channel should be checked or clearly reported. `Mention Everyone` is required for both `@everyone` and role mentions. The final enforcement point is Open (BR-074 Proposed).

### Failure cases

| Condition | Expected handling |
| --- | --- |
| Used outside a server | Reject with an explanation; make no changes. |
| Invoking member is not authorized | Reject; make no changes. |
| Location reference data is unavailable or the selected option is no longer valid | Report the failure, discard the current menu, and allow retry; no partial configuration is saved. |
| Selected country requires a city but no city options are available | Report the configuration problem; do not guess a city or fall back to coordinates. |
| Invalid timezone, method, or lead time | Reject the value with an actionable message; keep the previous valid value. |
| Mention target is a role ID that does not exist in this server, or is an unsupported value | Reject the choice and ask for another; keep the previous valid target. |
| Text channel is deleted, inaccessible, or unsupported | Reject the selection and ask for another. |
| Selected mention role is invalid, from another server, or cannot be mentioned | Reject the selection and ask for another; whether saving is allowed is Open. |
| Bot lacks required permissions in the selected text channel | Report the missing permissions; whether the configuration may still be saved is Open. This includes missing `Mention Everyone` for either target. |
| Interaction expires or the administrator cancels | Save nothing; the previous configuration, if any, remains in effect. |
| Setup is run when a configuration already exists | Proposed: treat it as reconfiguration, show the existing values, and require confirmation before overwriting. Whether all values must be re-entered is Open. |
| Persistence fails on confirmation | Report the failure and do not claim success; previous configuration remains authoritative. |

### Open decisions

- Whether a manual timezone override is offered in a later release (the initial flow uses the timezone from Location).
- Whether setup can be partially saved as a draft.
- Whether setup automatically enables announcements or requires `/enable`.
- Whether re-running `/setup` edits or replaces the existing configuration.
- Final response visibility and wording.

## `/prayer-times`

### Purpose

Display today's five prayer times for the configured location, in the configured timezone (FR-026 and FR-028).

### Who can use it

**Proposed:** any member of the server. Whether access is restricted to administrators or a specific channel is Open (BR-065).

### Inputs

- **Initial release:** no required inputs. The command uses the stored location, timezone, and calculation method.
- **Future:** an optional date, or a comparison with another location, is outside the initial release.

### Expected output or interaction

An ephemeral response (Proposed) showing Fajr, Dhuhr, Asr, Maghrib, and Isha for the current local prayer date, expressed in the configured timezone. It should identify the location and timezone so the values cannot be mistaken for another location's times (FR-028, Proposed). Whether the calculation method is also shown is Open.

**Example — wording is illustrative only, not final copy:**

```text
Prayer times for Cairo, Egypt — Africa/Cairo
Fajr      05:12
Dhuhr     11:48
Asr       15:03
Maghrib   17:01
Isha      18:19
```

The exact wording, table layout, and use of Discord embeds are Open.

### Validation requirements

- The command is used in a server.
- A complete and valid configuration exists, including location, timezone, and calculation preferences.
- The local prayer date is determined from the configured IANA timezone, not the host's timezone (BR-040, BR-043).

### Failure cases

| Condition | Expected handling |
| --- | --- |
| No configuration exists | Explain that setup is required and point to `/setup`; do not display guessed times. |
| Configuration is incomplete or invalid | Explain what is missing; do not display calculated values. |
| Prayer calculation fails | Report that times are temporarily unavailable and log the error; do not crash. |
| Timezone data is unavailable or invalid | Report the configuration problem; do not fall back to a fixed offset (BR-041). |

### Open decisions

- Whether all members or only administrators may use the command.
- Whether responses are ephemeral or public.
- Whether the response includes the calculation method, Hijri date, or other context.
- Whether a date input will be added later (**Future**).

## `/settings`

### Purpose

Provide access to the current configuration and allow authorized administrators to change individual settings without repeating the entire setup (FR-009, FR-010, FR-027).

### Who can use it

An authorized server administrator (BR-063). The exact permission is Open (BR-064).

### Inputs

- No required options: invoking the command shows a configuration summary (Proposed).
- **Proposed:** an optional section selector for Location, Calculation, Announcements, Voice, or Status. The final sections and option names are not decided.
- Changes are made through follow-up interactions (select menus, modals, or buttons), not a long argument list.

### Expected output or interaction

- An ephemeral summary of the current configuration, including whether announcements are enabled.
- Editing controls for the selected section.
- A confirmation step for consequential changes such as location, timezone, or text channel. Whether confirmation is required is **Proposed**, not confirmed.
- On save, validation feedback and a clear indication that future scheduling has been updated (BR-048, BR-076).

Settings that must be reachable through this command include location, timezone, calculation method, text channel, mention target (`@everyone` or a role), lead time, and private-channel inclusion. Whether the enable/disable state is also editable here, in addition to `/enable` and `/disable`, is Open.

### Validation requirements

All validation rules from `/setup` apply (BR-066 to BR-076). In addition:

- The invoking member is authorized.
- Changes are applied atomically; an invalid change does not leave the configuration partially updated (BR-067).
- Changes that affect prayer times or reminders trigger recalculation and rescheduling of future events (FR-027, BR-048).
- Already-delivered events are not repeated after a change (FR-013, BR-049).

### Failure cases

| Condition | Expected handling |
| --- | --- |
| Invoking member is not authorized | Reject; make no changes. |
| No configuration exists | Point to `/setup`; show no editable settings form. |
| Invalid location, timezone, method, lead time, or channel | Reject that change with an actionable message and keep the previous value. |
| Mention target is a role ID that does not exist in this server, or is an unsupported value | Reject that change and keep the previous valid target. |
| Selected channel was deleted or is inaccessible | Reject the change and explain why. |
| Bot lacks permissions after a valid change | Report the affected function and what will fail; whether such a change is blocked is Open. |
| Persistence fails | Report failure and retain the previous configuration as authoritative. |
| Two administrators edit concurrently | Conflict behavior is Open; the final state must not be a silent partial merge. |

### Open decisions

- Whether the command displays a full summary or only the selected section.
- Which changes require explicit confirmation.
- Whether a location change can affect today's remaining reminders, or only the next local day. Business rules require future events to be rebuilt, but the exact cut-off is Open.
- Whether a mention-target change applies to a reminder already scheduled for the current day, and whether it counts as a reschedule trigger.
- Concurrent-edit behavior.
- Whether `/settings` can toggle announcements or defers that to `/enable` and `/disable`.

## `/test`

### Purpose

Exercise the announcement paths without waiting for a real prayer event, so administrators can verify configuration, permissions, audio, and text delivery (FR-041 to FR-052 and FR-060 to FR-065).

### Who can use it

An authorized server administrator (BR-063). The exact permission is Open.

### Inputs

**Proposed:**

- **Announcement type:** voice, text, or both. The default is not decided.
- **Prayer:** one of the five prayers, used to choose the voice audio and to label the text test.
- **Target channel (Open):** whether voice tests use the full eligibility cycle, a single selected voice channel, or the administrator's current channel.
- **Text destination (Open):** whether text tests go to the configured reminder channel or to the channel where the command was used.

The final option set is not decided. A test must be distinguishable from a real reminder in its output and logs.

### Expected output or interaction

- An immediate acknowledgment that the test has started.
- Results reported per path and per channel, including failures and their causes. Report output is ephemeral by default (Proposed).
- A test announcement may be visible to server members if it is played or sent through the real channels. The specification does not promise that tests are private to the administrator.
- A text test uses the configured mention target, `@everyone` or the selected role. It must not silently use `@everyone` when the configuration selects a role.
- A completed test does not mark the real event as delivered and does not alter enable/disable state (BR-051).

### Validation requirements

- The invoking member is authorized.
- The configuration includes enough valid settings to perform the requested test. A voice test requires a usable audio asset; a text test requires a usable text channel.
- The bot has the effective permissions needed for the requested paths.
- The test does not consume, suppress, or duplicate the corresponding real prayer event (BR-051).

### Failure cases

| Condition | Expected handling |
| --- | --- |
| Invoking member is not authorized | Reject; perform no test. |
| Configuration is missing the settings needed for the requested test | Report exactly what is missing; do not run a partial test silently. |
| No eligible voice channel exists for a voice test | Report that no channel was eligible; whether this is treated as a failure depends on the Open no-channel behavior. |
| Audio file is missing or invalid | Report the audio problem; do not crash; continue a text test if one was requested. |
| Text channel is missing, inaccessible, or the configured mention target cannot be used | Report the failure; do not bypass permissions. Missing `Mention Everyone` affects both `@everyone` and role targets. |
| Discord API or playback failure | Report the failure per channel or path; do not crash or alter real scheduling. |
| Test is run while a real announcement is in progress | Behavior is Open: queue, reject, or run independently. |
| Test is run while announcements are disabled | **Proposed:** allow it, since testing should not require enabling automation. Open. |

### Open decisions

- Exact inputs and defaults for type and prayer.
- Whether a voice test uses all eligible channels, one selected channel, or the invoker's channel.
- Whether a text test sends a real mention using the configured target or a preview without a ping.
- Whether tests are allowed while announcements are disabled.
- Whether tests can run during a real announcement cycle and how they are serialized.
- Whether test messages are marked as tests and with what wording.

## `/enable`

### Purpose

Enable automated prayer announcements after a valid configuration exists (FR-001, FR-014).

### Who can use it

An authorized server administrator (BR-063).

### Inputs

None.

### Expected output or interaction

- Confirmation that automated announcements are enabled.
- The enabled state is persisted (FR-011).
- Future events are scheduled from the current configuration (FR-081, BR-048).
- **Proposed:** the response summarizes the next upcoming reminder or the current configuration state. No wording is final.

### Validation requirements

- The invoking member is authorized.
- A complete and valid configuration exists (BR-073). If not, the command is rejected and points to `/setup`.
- Required bot permissions are present, or the response clearly identifies missing permissions. Whether a missing permission blocks enabling or only produces a warning is Open (BR-074 Proposed).
- Enabling does not replay events missed while disabled (BR-047).

### Failure cases

| Condition | Expected handling |
| --- | --- |
| Invoking member is not authorized | Reject; remain disabled. |
| Configuration is missing or invalid | Reject; explain what must be completed; remain disabled. |
| Required bot permissions are missing | Report them; final enforcement behavior is Open. |
| Persistence fails | Report failure; do not claim the enabled state changed. |
| Already enabled | **Proposed:** respond that it is already enabled without treating it as an error. |
| Configuration or timezone data is unreadable | Remain disabled and log the error; do not enable with guessed values. |

### Open decisions

- Whether enabling covers voice and text together or separately (FR-014).
- Whether enabling requires every permission to be present or only the permissions for the paths currently configured.
- Whether the response includes the next scheduled event and how much detail it shows.
- Whether enabling is also available through `/settings`.

## `/disable`

### Purpose

Disable automated prayer announcements while preserving configuration (FR-014).

### Who can use it

An authorized server administrator (BR-063).

### Inputs

None.

### Expected output or interaction

- Confirmation that automated announcements are disabled.
- The disabled state is persisted (FR-011).
- Future automated voice and text reminders are suppressed while disabled.
- **Proposed:** manual `/test` and `/prayer-times` remain available, since they are not automated reminders. This is Open.

### Validation requirements

- The invoking member is authorized.
- The command may be used even if the configuration is incomplete or invalid, so an administrator can always stop automation (Proposed).
- Disabling does not delete configuration or prayer-time data.

### Failure cases

| Condition | Expected handling |
| --- | --- |
| Invoking member is not authorized | Reject; automation state is unchanged. |
| Already disabled | **Proposed:** respond that it is already disabled without treating it as an error. |
| Persistence fails | Report failure; do not claim the state changed. |
| A voice cycle is in progress | Behavior is Open (BR-053). The response must not claim an immediate stop unless the implementation guarantees it. |
| A text reminder is being sent concurrently | Behavior is Open; the response must accurately describe what was stopped. |

### Open decisions

- Whether disabling covers voice and text together or separately.
- Whether an in-progress voice cycle finishes, stops immediately, or is allowed to disconnect only.
- Whether `/test` and `/prayer-times` remain available while disabled.
- Whether disabling is also available through `/settings`.

## Traceability

| Command | Primary requirements |
| --- | --- |
| `/setup` | FR-001 to FR-015, FR-005, FR-008, NFR-009 |
| `/prayer-times` | FR-026, FR-028, BR-040, BR-043 |
| `/settings` | FR-009, FR-010, FR-013, FR-015, FR-027, BR-048, BR-067 |
| `/test` | FR-040 to FR-052, FR-060 to FR-065, BR-051 |
| `/enable` | FR-001, FR-011, FR-014, FR-081, BR-047, BR-073 |
| `/disable` | FR-014, BR-053 |

## Open command-surface decisions

- Final command names, option names, and interaction components.
- Exact administrator permission and whether `/prayer-times` is open to all members.
- Response visibility for every command.
- Whether commands are registered globally or per server; this is a technical design decision, not a product requirement.
- Localization and language of command names and responses; not specified for the initial release.
- Exact wording for all responses and announcements.
