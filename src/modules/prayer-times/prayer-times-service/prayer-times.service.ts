/*
Prayer Times service.
Explain: Public boundary of the module. Takes canonical input from callers and
delegates to the pure calculation function. No I/O, timers, or persistence.
*/

import { injectable, inject } from 'tsyringe';
import { TOKENS } from '../../../shared/di/tokens.js';
import { Logger } from '../../../shared/logging/logger.port.js';
import { calculatePrayerTimes } from '../prayer-calculation.js';
import type { DailyPrayerTimes, PrayerTimesInput } from '../prayer-time.types.js';

export interface IPrayerTimesService {
  calculate(input: PrayerTimesInput): DailyPrayerTimes;
}

@injectable()
export class PrayerTimesService implements IPrayerTimesService {
  constructor(@inject(TOKENS.Logger) private readonly logger?: Logger) {}

  calculate(input: PrayerTimesInput): DailyPrayerTimes {
    const result = calculatePrayerTimes(input);
    this.logger?.debug(
      { date: input.date, timezone: input.timezone, calculationMethod: input.calculationMethod },
      'Prayer times calculated'
    );
    return result;
  }
}
