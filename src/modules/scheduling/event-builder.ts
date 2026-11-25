/*
Builds one-shot prayer events for the current and next local calendar day.
Explain: Pure translation of a settings snapshot plus calculated prayer instants
into events. It performs no I/O besides calling the prayer-times service and
never decides whether an event should be announced.
*/

import type { Logger } from '../../shared/logging/logger.port.js';
import { IPrayerTimesService } from '../prayer-times/index.js';
import type { GuildSettings } from '../settings/index.js';
import { createEventKey, type PrayerEvent } from './event.types.js';

export interface BuildEventsOptions {
  settings: GuildSettings;
  now: Date;
  prayerTimes: IPrayerTimesService;
  logger?: Logger;
}

/** Local calendar date in the configured IANA zone, as YYYY-MM-DD. */
export function localDateInZone(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(instant);

  const part = (type: Intl.DateTimeFormatPartTypes): string => {
    const value = parts.find((item) => item.type === type)?.value;
    if (value === undefined) {
      throw new Error(`Missing ${type} when formatting a local date`);
    }
    return value;
  };

  return `${part('year')}-${part('month')}-${part('day')}`;
}

/** Advances a YYYY-MM-DD local date by one calendar day (23/25-hour DST days are safe). */
export function nextLocalDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
}

export function buildEvents(options: BuildEventsOptions): PrayerEvent[] {
  const { settings, now, prayerTimes, logger } = options;
  const today = localDateInZone(now, settings.timezone);
  const dates = [today, nextLocalDate(today)];
  const events: PrayerEvent[] = [];

  for (const prayerDate of dates) {
    let dailyTimes;
    try {
      dailyTimes = prayerTimes.calculate({
        date: prayerDate,
        latitude: settings.latitude,
        longitude: settings.longitude,
        timezone: settings.timezone,
        calculationMethod: settings.calculationMethod
      });
    } catch (error) {
      // An uncalculable date (for example polar twilight) must not stop the horizon.
      logger?.warn({ guildId: settings.guildId, prayerDate, err: error }, 'Skipping uncalculable prayer date');
      continue;
    }

    for (const time of dailyTimes.prayers) {
      const base = {
        guildId: settings.guildId,
        prayerDate,
        prayer: time.prayer
      };

      const approachingAt = new Date(time.instant.getTime() - settings.voiceLeadTimeMinutes * 60_000);
      if (approachingAt.getTime() > now.getTime()) {
        events.push({
          ...base,
          eventType: 'PRAYER_APPROACHING',
          eventKey: createEventKey(settings.guildId, prayerDate, time.prayer, 'PRAYER_APPROACHING'),
          triggerAt: approachingAt
        });
      }

      if (time.instant.getTime() > now.getTime()) {
        events.push({
          ...base,
          eventType: 'PRAYER_TIME_REACHED',
          eventKey: createEventKey(settings.guildId, prayerDate, time.prayer, 'PRAYER_TIME_REACHED'),
          triggerAt: time.instant
        });
      }
    }
  }

  return events.sort((a, b) => a.triggerAt.getTime() - b.triggerAt.getTime() || a.eventKey.localeCompare(b.eventKey));
}
