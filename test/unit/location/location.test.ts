import 'reflect-metadata';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  cityNotFoundError,
  cityRequiredError,
  countryNotFoundError,
  LocationService
} from '../../../src/modules/location/index.js';

describe('Location module (Milestone 3)', () => {
  describe('LocationService', () => {
    it('lists and searches curated countries and cities', () => {
      const service = new LocationService();

      assert.ok(service.listCountries().some((country) => country.code === 'EG'));
      assert.deepEqual(
        service.findCountries('Egypt').map((country) => country.code),
        ['EG']
      );
      const egypt = service.getCountry('EG');
      assert.equal(egypt?.name, 'Egypt');
      assert.deepEqual(egypt?.timezones, ['Africa/Cairo']);
      assert.equal(service.getCountry('ZZ'), null);

      const unitedStates = service.getCountry('US');
      assert.equal(unitedStates?.defaultCity, null);
      assert.equal(unitedStates?.timezones.length, 6);

      assert.ok(service.listCities('EG').length >= 9);
      assert.ok(service.listCities('EG').some((city) => city.id === 'giza'));
      assert.equal(service.listCities('AE')[0].calculationMethod, null);
      assert.deepEqual(
        service.findCities('Cairo').map((city) => city.id),
        ['cairo']
      );
    });

    it('uses the country default city when city selection is skipped', async () => {
      const service = new LocationService();
      const location = await service.resolve({ countryCode: 'EG' });

      assert.equal(location.cityName, 'Cairo');
      assert.equal(location.timezone, 'Africa/Cairo');
      assert.equal(location.calculationMethod, 'Egyptian');
      assert.equal(location.latitude, 30.0444);
    });

    it('resolves a curated city by id or exact name', async () => {
      const service = new LocationService();

      const byId = await service.resolve({ countryCode: 'AE', city: 'dubai' });
      const byName = await service.resolve({ countryCode: 'AE', city: 'Dubai' });

      assert.equal(byId.cityName, 'Dubai');
      assert.equal(byName.cityName, 'Dubai');
      assert.equal(byId.calculationMethod, 'Dubai');
    });

    it('requires a city for countries with multiple timezones', async () => {
      const service = new LocationService();

      await assert.rejects(
        () => service.resolve({ countryCode: 'US' }),
        (error: unknown) => error === cityRequiredError
      );
    });

    it('uses the country-level calculation method when cities have no override', async () => {
      const service = new LocationService();

      const dubai = await service.resolve({ countryCode: 'AE', city: 'dubai' });
      const defaulted = await service.resolve({ countryCode: 'AE' });

      assert.equal(dubai.calculationMethod, 'Dubai');
      assert.equal(defaulted.cityName, 'Abu Dhabi');
      assert.equal(defaulted.calculationMethod, 'Dubai');
      assert.ok(service.listCities().every((city) => city.calculationMethod === null));
    });

    it('rejects unknown countries and cities that are not in the reference data', async () => {
      const service = new LocationService();

      await assert.rejects(
        () => service.resolve({ countryCode: 'ZZ' }),
        (error: unknown) => error === countryNotFoundError
      );
      await assert.rejects(
        () => service.resolve({ countryCode: 'EG', city: 'unknown-city' }),
        (error: unknown) => error === cityNotFoundError
      );
    });

    it('does not normalize input: a lowercase country code is not resolved', async () => {
      const service = new LocationService();

      await assert.rejects(
        () => service.resolve({ countryCode: 'eg' }),
        (error: unknown) => error === countryNotFoundError
      );
    });

    it('keeps the curated country/city reference data internally consistent', () => {
      const service = new LocationService();
      const countries = service.listCountries();
      const cities = service.listCities();
      const countryCodes = new Set<string>();

      for (const country of countries) {
        assert.equal(countryCodes.has(country.code), false, `duplicate country ${country.code}`);
        countryCodes.add(country.code);
        assert.match(country.code, /^[A-Z]{2}$/);
        for (const timezone of country.timezones) {
          assert.doesNotThrow(() => Intl.DateTimeFormat('en', { timeZone: timezone }), timezone);
        }
        if (!country.cityRequired && country.defaultCity) {
          assert.ok(
            cities.some((city) => city.countryCode === country.code && city.id === country.defaultCity),
            `missing default city ${country.defaultCity} for ${country.code}`
          );
        }
      }

      const cityKeys = new Set<string>();
      for (const city of cities) {
        const key = `${city.countryCode}:${city.id}`;
        assert.equal(cityKeys.has(key), false, `duplicate city ${key}`);
        cityKeys.add(key);
        const country = service.getCountry(city.countryCode);
        assert.ok(country, `unknown country ${city.countryCode}`);
        assert.ok(country!.timezones.includes(city.timezone), `timezone mismatch for ${key}`);
        assert.equal(city.calculationMethod, null);
        assert.ok(city.latitude >= -90 && city.latitude <= 90);
        assert.ok(city.longitude >= -180 && city.longitude <= 180);
      }
    });

    it('throws a dedicated error when a curated country references a missing default city', async () => {
      const service = new LocationService();
      const originalGetCountry = service.getCountry.bind(service);

      service.getCountry = (code: string) => {
        const country = originalGetCountry(code);
        return country ? { ...country, defaultCity: 'missing-city' } : null;
      };

      await assert.rejects(
        () => service.resolve({ countryCode: 'EG' }),
        (error: unknown) => error === cityNotFoundError
      );
    });
  });
});
