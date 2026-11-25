import 'reflect-metadata';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  cityRequiredError,
  LocationService,
  type ResolvedLocation
} from '../../src/modules/location/index.js';
import {
  PrayerTimesService,
  prayerTimesUnavailableError,
  type CalculationMethod,
  type DailyPrayerTimes
} from '../../src/modules/prayer-times/index.js';

const locationService = new LocationService();
const prayerService = new PrayerTimesService();

function calculateFor(location: ResolvedLocation, date: string): DailyPrayerTimes {
  return prayerService.calculate({
    date,
    latitude: location.latitude,
    longitude: location.longitude,
    timezone: location.timezone,
    calculationMethod: location.calculationMethod
  });
}

function toMinutes(time: string): number {
  const [hour, minute] = time.split(':').map(Number);
  return hour * 60 + minute;
}

// External values are from the aladhan.com reference API for the same coordinates,
// date and method. A 2-minute tolerance covers rounding and rule differences.
function assertMatchesReference(times: DailyPrayerTimes, reference: Record<string, string>): void {
  for (const prayer of times.prayers) {
    const expected = reference[prayer.prayer];
    assert.ok(expected, `Missing reference for ${prayer.prayer}`);
    assert.ok(
      Math.abs(toMinutes(prayer.localTime) - toMinutes(expected)) <= 2,
      `${prayer.prayer}: ${prayer.localTime} differs from reference ${expected}`
    );
  }
}

describe('Location → Prayer Times integration (Milestone 3)', () => {
  it('resolves a country without a city and calculates a full day of prayers', async () => {
    const location = await locationService.resolve({ countryCode: 'EG' });
    assert.equal(location.cityName, 'Cairo');
    assert.equal(location.calculationMethod, 'Egyptian');

    const times = calculateFor(location, '2026-11-25');

    assert.equal(times.date, '2026-11-25');
    assert.equal(times.timezone, 'Africa/Cairo');
    assert.deepEqual(
      times.prayers.map((prayer) => prayer.prayer),
      ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha']
    );
    assertMatchesReference(times, {
      fajr: '04:57',
      dhuhr: '11:42',
      asr: '14:37',
      maghrib: '16:55',
      isha: '18:17'
    });
  });

  it('resolves a selected city and uses its country-level method', async () => {
    const location = await locationService.resolve({ countryCode: 'GB', city: 'London' });
    assert.equal(location.cityName, 'London');
    assert.equal(location.calculationMethod, 'MuslimWorldLeague');

    const times = calculateFor(location, '2026-11-25');

    assert.equal(times.timezone, 'Europe/London');
    assert.equal(times.calculationMethod, 'MuslimWorldLeague');
    assert.equal(times.prayers.length, 5);
  });

  it('requires a city for multi-timezone countries and calculates once provided', async () => {
    await assert.rejects(
      () => locationService.resolve({ countryCode: 'US' }),
      (error: unknown) => error === cityRequiredError
    );

    const location = await locationService.resolve({ countryCode: 'US', city: 'New York' });
    assert.equal(location.timezone, 'America/New_York');

    const times = calculateFor(location, '2026-11-25');

    assert.equal(times.timezone, 'America/New_York');
    assert.ok(times.prayers.every((prayer) => /^\d{2}:\d{2}$/.test(prayer.localTime)));
  });

  it('supports a city method override and falls back to the country default', async () => {
    const fallbackLocation = await locationService.resolve({ countryCode: 'AE' });
    assert.equal(fallbackLocation.cityName, 'Abu Dhabi');
    assert.equal(fallbackLocation.calculationMethod, 'Dubai');

    const dubai = locationService.listCities('AE').find((city) => city.id === 'dubai')!;
    const originalMethod = dubai.calculationMethod;
    dubai.calculationMethod = 'Karachi';

    try {
      const overridden = await locationService.resolve({ countryCode: 'AE', city: 'dubai' });
      assert.equal(overridden.calculationMethod, 'Karachi');
      assert.equal(calculateFor(overridden, '2026-11-25').calculationMethod, 'Karachi');
    } finally {
      dubai.calculationMethod = originalMethod;
    }
  });

  it('calculates valid times for every supported CalculationMethod', () => {
    const methods: CalculationMethod[] = [
      'Egyptian',
      'MuslimWorldLeague',
      'UmmAlQura',
      'NorthAmerica',
      'Karachi',
      'Dubai',
      'Kuwait',
      'Qatar',
      'Singapore',
      'Tehran',
      'Turkey',
      'MoonsightingCommittee'
    ];

    for (const calculationMethod of methods) {
      const times = prayerService.calculate({
        date: '2026-11-25',
        latitude: 30.0444,
        longitude: 31.2357,
        timezone: 'Africa/Cairo',
        calculationMethod
      });
      assert.equal(times.prayers.length, 5);
      assert.equal(times.calculationMethod, calculationMethod);
      assert.ok(times.prayers.every((prayer) => !Number.isNaN(prayer.instant.getTime())));
    }
  });

  it('handles DST transitions and matches external references', async () => {
    const location = await locationService.resolve({ countryCode: 'GB', city: 'London' });
    const input = {
      date: '',
      latitude: location.latitude,
      longitude: location.longitude,
      timezone: location.timezone,
      calculationMethod: 'NorthAmerica' as CalculationMethod
    };

    const spring = prayerService.calculate({ ...input, date: '2026-03-29' });
    const autumn = prayerService.calculate({ ...input, date: '2026-10-25' });

    assertMatchesReference(spring, {
      fajr: '05:08',
      dhuhr: '13:05',
      asr: '16:34',
      maghrib: '19:29',
      isha: '21:04'
    });
    assertMatchesReference(autumn, {
      fajr: '05:09',
      dhuhr: '11:45',
      asr: '14:17',
      maghrib: '16:47',
      isha: '18:19'
    });

    const springDhuhr = spring.prayers.find((prayer) => prayer.prayer === 'dhuhr')!;
    const autumnDhuhr = autumn.prayers.find((prayer) => prayer.prayer === 'dhuhr')!;
    assert.equal(springDhuhr.localTime, '13:06');
    assert.equal(autumnDhuhr.localTime, '11:46');
    assert.equal(springDhuhr.instant.getUTCHours(), 12);
    assert.equal(autumnDhuhr.instant.getUTCHours(), 11);
  });

  it('covers high-latitude locations and rejects unavailable results', () => {
    const anchorage = prayerService.calculate({
      date: '2026-06-21',
      latitude: 61.2181,
      longitude: -149.9003,
      timezone: 'America/Anchorage',
      calculationMethod: 'NorthAmerica'
    });
    assert.equal(anchorage.prayers.length, 5);
    assert.ok(anchorage.prayers.every((prayer) => !Number.isNaN(prayer.instant.getTime())));

    assert.throws(
      () =>
        prayerService.calculate({
          date: '2026-06-21',
          latitude: 89,
          longitude: 0,
          timezone: 'Arctic/Longyearbyen',
          calculationMethod: 'Egyptian'
        }),
      (error: unknown) => error === prayerTimesUnavailableError
    );
  });
});
