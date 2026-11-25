/*
Prayer time calculation.
Explain: Thin wrapper around adhan. Maps our CalculationMethod values to the
library's parameter factories, fixes Asr to the Standard rule (Madhab.Shafi),
and converts the library's absolute UTC dates into times in the configured IANA
timezone. No I/O, no scheduling, and no persistence.
*/

import {
  CalculationMethod,
  Coordinates,
  HighLatitudeRule,
  Madhab,
  PrayerTimes,
  type CalculationParameters
} from 'adhan';
import { prayerTimesUnavailableError } from './prayer-times.errors.js';
import type {
  CalculationMethod as AppCalculationMethod,
  DailyPrayerTimes,
  PrayerName,
  PrayerTimesInput
} from './prayer-time.types.js';

const METHOD_PARAMETERS: Record<AppCalculationMethod, () => CalculationParameters> = {
  Egyptian: () => CalculationMethod.Egyptian(),
  MuslimWorldLeague: () => CalculationMethod.MuslimWorldLeague(),
  UmmAlQura: () => CalculationMethod.UmmAlQura(),
  NorthAmerica: () => CalculationMethod.NorthAmerica(),
  Karachi: () => CalculationMethod.Karachi(),
  Dubai: () => CalculationMethod.Dubai(),
  Kuwait: () => CalculationMethod.Kuwait(),
  Qatar: () => CalculationMethod.Qatar(),
  Singapore: () => CalculationMethod.Singapore(),
  Tehran: () => CalculationMethod.Tehran(),
  Turkey: () => CalculationMethod.Turkey(),
  MoonsightingCommittee: () => CalculationMethod.MoonsightingCommittee()
};

function formatLocalTime(instant: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(instant);

  const hour = parts.find((part) => part.type === 'hour')?.value ?? '00';
  const minute = parts.find((part) => part.type === 'minute')?.value ?? '00';
  return `${hour}:${minute}`;
}

export function calculatePrayerTimes(input: PrayerTimesInput): DailyPrayerTimes {
  const [year, month, day] = input.date.split('-').map(Number);
  const date = new Date(year, month - 1, day, 12);
  const coordinates = new Coordinates(input.latitude, input.longitude);

  const parameters = METHOD_PARAMETERS[input.calculationMethod]();
  parameters.madhab = Madhab.Shafi;
  parameters.highLatitudeRule = HighLatitudeRule.TwilightAngle;

  const times = new PrayerTimes(coordinates, date, parameters);
  const ordered: readonly [PrayerName, Date][] = [
    ['fajr', times.fajr],
    ['dhuhr', times.dhuhr],
    ['asr', times.asr],
    ['maghrib', times.maghrib],
    ['isha', times.isha]
  ];

  if (ordered.some(([, instant]) => Number.isNaN(instant.getTime()))) {
    throw prayerTimesUnavailableError;
  }

  return {
    date: input.date,
    timezone: input.timezone,
    calculationMethod: input.calculationMethod,
    prayers: ordered.map(([prayer, instant]) => ({
      prayer,
      instant,
      localTime: formatLocalTime(instant, input.timezone)
    }))
  };
}
