/*
Prayer Times module errors.
Explain: Named error for dates/locations where the library cannot produce times.
*/

import { ValidationError } from '../../shared/error/app-error.js';

export const prayerTimesUnavailableError = new ValidationError(
  'Prayer times could not be calculated for this date and location'
);
