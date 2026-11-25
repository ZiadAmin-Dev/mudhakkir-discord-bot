/*
Location module types.
Explain: Shared value types for the module. CalculationMethod is imported as a
type from the settings module's public entry so the resolved method can be stored
directly by Settings without duplicating the supported values.
*/

import type { CalculationMethod } from '../settings/index.js';

export type { CalculationMethod };

export interface Country {
  code: string;
  name: string;
  cityRequired: boolean;
  defaultCity: string | null;
  timezones: string[];
  defaultCalculationMethod: CalculationMethod;
}

export interface City {
  id: string;
  countryCode: string;
  name: string;
  latitude: number;
  longitude: number;
  timezone: string;
  calculationMethod: CalculationMethod | null;
}

export interface ResolveLocationInput {
  countryCode: string;
  city?: string;
}

export interface ResolvedLocation {
  countryCode: string;
  countryName: string;
  cityName: string;
  latitude: number;
  longitude: number;
  timezone: string;
  calculationMethod: CalculationMethod;
}
