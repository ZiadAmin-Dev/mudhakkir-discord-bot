/*
Prayer Times module types.
Explain: CalculationMethod is reused from the Settings module as a type-only
import so no supported values are duplicated. Input is canonical: a Gregorian
local date in YYYY-MM-DD form for the configured IANA timezone.
*/

import type { CalculationMethod } from '../settings/index.js';

export type { CalculationMethod };

export type PrayerName = 'fajr' | 'dhuhr' | 'asr' | 'maghrib' | 'isha';

export interface PrayerTime {
  prayer: PrayerName;
  instant: Date;
  localTime: string;
}

export interface PrayerTimesInput {
  date: string;
  latitude: number;
  longitude: number;
  timezone: string;
  calculationMethod: CalculationMethod;
}

export interface DailyPrayerTimes {
  date: string;
  timezone: string;
  calculationMethod: CalculationMethod;
  prayers: readonly PrayerTime[];
}
