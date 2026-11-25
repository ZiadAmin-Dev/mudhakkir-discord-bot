import 'reflect-metadata';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { container, initContainer, TOKENS } from '../../src/app/composition.js';
import { ISettingsService, SettingsService } from '../../src/modules/settings/settings.service.js';
import { AppConfig } from '../../src/app/config.js';
import { NotFoundError } from '../../src/shared/error/app-error.js';

describe('Dependency Injection & Composition (Refactor)', () => {
  const testConfig: AppConfig = {
    DISCORD_TOKEN: 'fake_token_for_di_test',
    CLIENT_ID: 'fake_client_id_123',
    LOG_LEVEL: 'fatal',
    NODE_ENV: 'test'
  };

  it('should register and resolve services from DI container', () => {
    const child = container.createChildContainer();
    initContainer(testConfig, ':memory:', child);

    const resolvedService = child.resolve<ISettingsService>(TOKENS.SettingsService);
    assert.ok(resolvedService instanceof SettingsService);

    const nonExistent = resolvedService.getSettings('999999');
    assert.equal(nonExistent, null);
  });

  it('should throw NotFoundError using AppError hierarchy when updating non-existent settings', () => {
    const child = container.createChildContainer();
    initContainer(testConfig, ':memory:', child);

    const service = child.resolve<ISettingsService>(TOKENS.SettingsService);

    assert.throws(
      () => service.updateSettings('999999', { enabled: true }),
      (err: unknown) => {
        return err instanceof NotFoundError && err.code === 'NOT_FOUND' && err.isOperational === true;
      }
    );
  });
});
