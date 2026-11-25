/*
Location service.
Explain: The Location module's public service. It owns the curated country/city
reference data, applies location business rules, and returns validated results.
It expects canonical input from the Discord presentation layer; no request
validation or normalization happens here.
*/

import { injectable, inject } from 'tsyringe';
import countriesData from '../data/countries.json' with { type: 'json' };
import citiesData from '../data/cities.json' with { type: 'json' };
import { TOKENS } from '../../../shared/di/tokens.js';
import { Logger } from '../../../shared/logging/logger.port.js';
import { cityNotFoundError, cityRequiredError, countryNotFoundError } from '../location.errors.js';
import type { City, Country, ResolvedLocation, ResolveLocationInput } from '../location.types.js';
import { validateResolvedLocation } from '../location.validation.js';

export interface ILocationService {
  listCountries(): readonly Country[];
  findCountries(query: string): readonly Country[];
  getCountry(code: string): Country | null;
  listCities(countryCode?: string): readonly City[];
  findCities(query: string, countryCode?: string): readonly City[];
  resolve(input: ResolveLocationInput): Promise<ResolvedLocation>;
}

// Curated reference data is reviewed and trusted; no runtime validation on load.
const countries = countriesData as Country[];
const cities = citiesData as City[];

function findCity(countryCode: string, city: string): City | undefined {
  return cities.find(
    (candidate) =>
      candidate.countryCode === countryCode && (candidate.id === city || candidate.name === city)
  );
}

@injectable()
export class LocationService implements ILocationService {
  constructor(@inject(TOKENS.Logger) private readonly logger?: Logger) {}

  listCountries(): readonly Country[] {
    return countries;
  }

  findCountries(query: string): readonly Country[] {
    return countries.filter(
      (country) => country.code.includes(query) || country.name.includes(query)
    );
  }

  getCountry(code: string): Country | null {
    return countries.find((country) => country.code === code) ?? null;
  }

  listCities(countryCode?: string): readonly City[] {
    if (!countryCode) {
      return cities;
    }

    return cities.filter((city) => city.countryCode === countryCode);
  }

  findCities(query: string, countryCode?: string): readonly City[] {
    return this.listCities(countryCode).filter(
      (city) => city.name.includes(query) || city.id.includes(query)
    );
  }

  async resolve(input: ResolveLocationInput): Promise<ResolvedLocation> {
    const country = this.getCountry(input.countryCode);
    if (!country) {
      throw countryNotFoundError;
    }

    const requestedCity = input.city;
    let city: City;

    if (!requestedCity) {
      if (country.cityRequired) {
        throw cityRequiredError;
      }
      if (!country.defaultCity) {
        throw cityNotFoundError;
      }

      const defaultCity = findCity(country.code, country.defaultCity);
      if (!defaultCity) {
        throw cityNotFoundError;
      }
      city = defaultCity;
    } else {
      const knownCity = findCity(country.code, requestedCity);
      if (!knownCity) {
        throw cityNotFoundError;
      }
      city = knownCity;
    }

    const location = validateResolvedLocation({
      countryCode: country.code,
      countryName: country.name,
      cityName: city.name,
      latitude: city.latitude,
      longitude: city.longitude,
      timezone: city.timezone,
      calculationMethod: city.calculationMethod ?? country.defaultCalculationMethod
    });

    this.logger?.info(
      { countryCode: location.countryCode, cityName: location.cityName },
      'Location resolved'
    );
    return location;
  }
}
