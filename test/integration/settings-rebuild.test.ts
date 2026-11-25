import 'reflect-metadata';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { container, initContainer, TOKENS } from '../../src/app/composition.js';
import { AppConfig } from '../../src/app/config.js';
import { CreateGuildSettingsInput, ISettingsService } from '../../src/modules/settings/index.js';
import { ISchedulingService } from '../../src/modules/scheduling/index.js';

const config: AppConfig = {
  DISCORD_TOKEN: 'fake_token_for_di_test',
  CLIENT_ID: 'fake_client_id_123',
  LOG_LEVEL: 'fatal',
  NODE_ENV: 'test'
};

const input: CreateGuildSettingsInput = {
  guildId: '123456789012345678',
  enabled: true,
  cityName: 'Cairo',
  countryName: 'Egypt',
  latitude: 30.0444,
  longitude: 31.2357,
  timezone: 'Africa/Cairo',
  calculationMethod: 'Egyptian',
  textChannelId: '987654321098765432',
  mentionType: 'everyone',
  mentionRoleId: null,
  voiceLeadTimeMinutes: 10,
  includePrivateVoice: false
};

describe('Settings → scheduler rebuild integration (Milestone 7)', () => {
  it('reschedules a guild when a settings change is saved through DI', () => {
    const di = container.createChildContainer();
    initContainer(config, ':memory:', di);
    const settings = di.resolve<ISettingsService>(TOKENS.SettingsService);
    const scheduler = di.resolve<ISchedulingService>(TOKENS.SchedulerService);

    try {
      settings.saveSettings(input);
      scheduler.start();
      const before = scheduler
        .getPendingEvents()
        .find((event) => event.prayer === 'dhuhr' && event.eventType === 'PRAYER_APPROACHING')!;

      settings.updateSettings(input.guildId, { voiceLeadTimeMinutes: 20 });
      const after = scheduler
        .getPendingEvents()
        .find((event) => event.prayer === 'dhuhr' && event.eventType === 'PRAYER_APPROACHING')!;

      assert.equal(after.triggerAt.getTime(), before.triggerAt.getTime() - 10 * 60_000);
    } finally {
      scheduler.stop();
    }
  });
});
