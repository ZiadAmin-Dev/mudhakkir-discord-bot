import 'reflect-metadata';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PrayerName } from '../../../src/modules/prayer-times/index.js';
import { PrayerEvent } from '../../../src/modules/scheduling/index.js';
import { GuildSettings, ISettingsService } from '../../../src/modules/settings/index.js';
import {
  ITextAnnouncementService,
  IVoiceAnnouncementService,
  ReminderHandler
} from '../../../src/modules/reminders/index.js';

const settings: GuildSettings = {
  guildId: 'guild-1',
  enabled: true,
  cityName: 'Cairo',
  countryName: 'Egypt',
  latitude: 30.0444,
  longitude: 31.2357,
  timezone: 'Africa/Cairo',
  calculationMethod: 'Egyptian',
  textChannelId: 'channel-1',
  mentionType: 'everyone',
  mentionRoleId: null,
  voiceLeadTimeMinutes: 10,
  includePrivateVoice: false,
  updatedAt: '2026-11-25T00:00:00.000Z'
};

function makeEvent(eventType: PrayerEvent['eventType'], prayer: PrayerName = 'fajr'): PrayerEvent {
  return {
    eventKey: `guild-1:2026-11-25:${prayer}:${eventType}`,
    guildId: 'guild-1',
    prayerDate: '2026-11-25',
    prayer,
    eventType,
    triggerAt: new Date('2026-11-25T02:57:00.000Z')
  };
}

class FakeSettingsService implements ISettingsService {
  current: GuildSettings | null = settings;
  throwOnRead = false;

  getSettings(): GuildSettings | null {
    if (this.throwOnRead) {
      throw new Error('storage failure');
    }
    return this.current;
  }
  listSettings(): GuildSettings[] {
    return this.current ? [this.current] : [];
  }
  saveSettings(input: Omit<GuildSettings, 'updatedAt'>): GuildSettings {
    return { ...input, updatedAt: settings.updatedAt };
  }
  updateSettings(): GuildSettings {
    return settings;
  }
  setEnabled(): GuildSettings {
    return settings;
  }
  deleteSettings(): boolean {
    return true;
  }
}

class FakeTextService implements ITextAnnouncementService {
  readonly calls: Array<{ prayer: PrayerName; settings: GuildSettings }> = [];
  fail = false;

  async send(prayer: PrayerName, snapshot: GuildSettings): Promise<void> {
    if (this.fail) {
      throw new Error('text failed');
    }
    this.calls.push({ prayer, settings: snapshot });
  }
}

class FakeVoiceService implements IVoiceAnnouncementService {
  readonly calls: Array<{ prayer: PrayerName; settings: GuildSettings }> = [];

  async runCycle(prayer: PrayerName, snapshot: GuildSettings): Promise<void> {
    this.calls.push({ prayer, settings: snapshot });
  }
}

describe('Reminder handler (Milestone 5)', () => {
  it('dispatches a reached event with a fresh settings snapshot', async () => {
    const settingsService = new FakeSettingsService();
    const text = new FakeTextService();
    new ReminderHandler(settingsService, text, new FakeVoiceService()).handle(makeEvent('PRAYER_TIME_REACHED', 'asr'));
    await Promise.resolve();

    assert.deepEqual(
      text.calls.map((call) => call.prayer),
      ['asr']
    );
    assert.equal(text.calls[0].settings, settings);
  });

  it('routes approaching events to voice and leaves text untouched', async () => {
    const text = new FakeTextService();
    const voice = new FakeVoiceService();
    new ReminderHandler(new FakeSettingsService(), text, voice).handle(makeEvent('PRAYER_APPROACHING', 'asr'));
    await Promise.resolve();

    assert.equal(text.calls.length, 0);
    assert.deepEqual(voice.calls.map((call) => call.prayer), ['asr']);
  });

  it('skips events without enabled settings', async () => {
    const settingsService = new FakeSettingsService();
    const text = new FakeTextService();
    const handler = new ReminderHandler(settingsService, text, new FakeVoiceService());

    settingsService.current = null;
    handler.handle(makeEvent('PRAYER_TIME_REACHED'));
    settingsService.current = { ...settings, enabled: false };
    handler.handle(makeEvent('PRAYER_TIME_REACHED'));
    await Promise.resolve();

    assert.equal(text.calls.length, 0);
  });

  it('contains settings read failures and text delivery failures', async () => {
    const settingsService = new FakeSettingsService();
    const text = new FakeTextService();
    const handler = new ReminderHandler(settingsService, text, new FakeVoiceService());

    settingsService.throwOnRead = true;
    handler.handle(makeEvent('PRAYER_TIME_REACHED')); // must not throw
    settingsService.throwOnRead = false;
    text.fail = true;
    handler.handle(makeEvent('PRAYER_TIME_REACHED')); // must not throw
    await Promise.resolve();

    assert.equal(text.calls.length, 0);
  });
});
