import 'reflect-metadata';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculatePrayerTimes,
  prayerTimesUnavailableError,
  PrayerTimesService,
  type CalculationMethod
} from '../../../src/modules/prayer-times/index.js';

const cairo = {
  date: '2026-11-25',
  latitude: 30.0444,
  longitude: 31.2357,
  timezone: 'Africa/Cairo',
  calculationMethod: 'Egyptian' as CalculationMethod
};

describe('Prayer Times module (Milestone 3)', () => {
  describe('calculatePrayerTimes', () => {
    it('returns five Standard-Asr times for a known city and date', () => {
      const result = calculatePrayerTimes(cairo);

      assert.equal(result.date, cairo.date);
      assert.equal(result.timezone, 'Africa/Cairo');
      assert.equal(result.calculationMethod, 'Egyptian');
      assert.deepEqual(
        result.prayers.map((prayer) => [prayer.prayer, prayer.localTime]),
        [
          ['fajr', '04:57'],
          ['dhuhr', '11:43'],
          ['asr', '14:36'],
          ['maghrib', '16:55'],
          ['isha', '18:17']
        ]
      );
      assert.equal(result.prayers[0].instant.toISOString(), '2026-11-25T02:57:00.000Z');
    });

    it('maps every supported CalculationMethod to valid times', () => {
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
        const result = calculatePrayerTimes({ ...cairo, calculationMethod });
        assert.equal(result.prayers.length, 5);
        assert.equal(result.calculationMethod, calculationMethod);
        assert.ok(result.prayers.every((prayer) => /^\d{2}:\d{2}$/.test(prayer.localTime)));
      }
    });

    it('changes times when the calculation method changes', () => {
      const egyptian = calculatePrayerTimes(cairo);
      const ummAlQura = calculatePrayerTimes({ ...cairo, calculationMethod: 'UmmAlQura' });

      assert.notDeepEqual(
        egyptian.prayers.map((prayer) => prayer.localTime),
        ummAlQura.prayers.map((prayer) => prayer.localTime)
      );
    });

    it('applies DST through the configured IANA timezone', () => {
      const london = {
        latitude: 51.5074,
        longitude: -0.1278,
        timezone: 'Europe/London',
        calculationMethod: 'MuslimWorldLeague' as CalculationMethod
      };

      const beforeSpringForward = calculatePrayerTimes({ ...london, date: '2026-03-28' });
      const afterSpringForward = calculatePrayerTimes({ ...london, date: '2026-03-29' });
      const beforeFallback = calculatePrayerTimes({ ...london, date: '2026-10-24' });
      const afterFallback = calculatePrayerTimes({ ...london, date: '2026-10-25' });

      const dhuhr = (times: ReturnType<typeof calculatePrayerTimes>) =>
        times.prayers.find((prayer) => prayer.prayer === 'dhuhr')!;

      assert.equal(dhuhr(beforeSpringForward).localTime, '12:07');
      assert.equal(dhuhr(afterSpringForward).localTime, '13:06');
      assert.equal(dhuhr(beforeFallback).localTime, '12:46');
      assert.equal(dhuhr(afterFallback).localTime, '11:46');

      const springGap =
        dhuhr(afterSpringForward).instant.getTime() -
        dhuhr(beforeSpringForward).instant.getTime();
      const fallGap =
        dhuhr(afterFallback).instant.getTime() - dhuhr(beforeFallback).instant.getTime();

      assert.equal(springGap, 24 * 60 * 60 * 1000 - 60 * 1000);
      assert.equal(fallGap, 24 * 60 * 60 * 1000);
    });

    it('raises the module error when prayer times cannot be determined', () => {
      assert.throws(
        () =>
          calculatePrayerTimes({
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

  describe('PrayerTimesService', () => {
    it('delegates to the calculation function', () => {
      const service = new PrayerTimesService();
      const result = service.calculate(cairo);

      assert.deepEqual(
        result.prayers.map((prayer) => prayer.localTime),
        ['04:57', '11:43', '14:36', '16:55', '18:17']
      );
    });
  });
});
