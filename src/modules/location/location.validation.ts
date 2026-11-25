/*
Location module validation.
Explain: Validates resolved location output before it leaves the module. Curated
reference data is trusted, and request input is validated in the Discord layer.
*/

import { z } from 'zod';
import type { ResolvedLocation } from './location.types.js';

const CALCULATION_METHODS = [
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
] as const;

const CountryCodeSchema = z
  .string()
  .regex(/^[A-Z]{2}$/, 'countryCode must be a two-letter uppercase country code');

const ResolvedLocationSchema = z.object({
  countryCode: CountryCodeSchema,
  countryName: z.string().min(1),
  cityName: z.string().min(1),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  timezone: z.string().refine((tz) => {
    try {
      Intl.DateTimeFormat(undefined, { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, 'timezone must be a valid IANA identifier'),
  calculationMethod: z.enum(CALCULATION_METHODS)
});

export function validateResolvedLocation(data: unknown): ResolvedLocation {
  return ResolvedLocationSchema.parse(data);
}
