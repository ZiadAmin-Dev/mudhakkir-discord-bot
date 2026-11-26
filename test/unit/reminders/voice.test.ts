import 'reflect-metadata';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  IVoiceChannelDirectory,
  IVoiceTransport,
  VoiceAnnouncementService,
  VoiceChannelSnapshot,
  VoiceCoordinator,
  isChannelEligible,
  runVoiceCycle
} from '../../../src/modules/reminders/index.js';
import { GuildSettings } from '../../../src/modules/settings/index.js';

function channel(id: string, overrides: Partial<VoiceChannelSnapshot> = {}): VoiceChannelSnapshot {
  return {
    id,
    guildId: 'guild-1',
    name: id,
    isGuildVoice: true,
    canView: true,
    canConnect: true,
    canSpeak: true,
    humanCount: 1,
    hiddenFromEveryone: false,
    ...overrides
  };
}

const settings: GuildSettings = {
  guildId: 'guild-1',
  enabled: true,
  cityName: 'Cairo',
  countryName: 'Egypt',
  latitude: 30.0444,
  longitude: 31.2357,
  timezone: 'Africa/Cairo',
  calculationMethod: 'Egyptian',
  textChannelId: 'text-1',
  mentionType: 'everyone',
  mentionRoleId: null,
  voiceLeadTimeMinutes: 10,
  includePrivateVoice: false,
  updatedAt: '2026-11-25T00:00:00.000Z'
};

class FakeDirectory implements IVoiceChannelDirectory {
  channels: VoiceChannelSnapshot[] = [];
  readonly rechecks = new Map<string, VoiceChannelSnapshot>();
  listCalls = 0;
  getCalls: string[] = [];
  failList = false;

  async list(): Promise<VoiceChannelSnapshot[]> {
    this.listCalls += 1;
    if (this.failList) {
      throw new Error('directory unavailable');
    }
    return this.channels;
  }

  async get(_guildId: string, channelId: string): Promise<VoiceChannelSnapshot | null> {
    this.getCalls.push(channelId);
    return this.rechecks.get(channelId) ?? this.channels.find((item) => item.id === channelId) ?? null;
  }
}

class FakeTransport implements IVoiceTransport {
  readonly announced: string[] = [];
  readonly failing = new Set<string>();

  async announce(input: { channelId: string }): Promise<void> {
    this.announced.push(input.channelId);
    if (this.failing.has(input.channelId)) {
      throw new Error('playback failed');
    }
  }
}

describe('Voice announcements (Milestone 6)', () => {
  it('applies eligibility rules for humans, permissions, type, and privacy', () => {
    assert.equal(isChannelEligible(channel('ok'), { includePrivateVoice: false }), true);
    assert.equal(
      isChannelEligible(channel('empty', { humanCount: 0 }), { includePrivateVoice: false }),
      false
    );
    assert.equal(
      isChannelEligible(channel('bots', { humanCount: 0 }), { includePrivateVoice: true }),
      false
    );
    assert.equal(
      isChannelEligible(channel('no-connect', { canConnect: false }), { includePrivateVoice: true }),
      false
    );
    assert.equal(
      isChannelEligible(channel('stage', { isGuildVoice: false }), { includePrivateVoice: true }),
      false
    );
    assert.equal(
      isChannelEligible(channel('private', { hiddenFromEveryone: true }), { includePrivateVoice: false }),
      false
    );
    assert.equal(
      isChannelEligible(channel('private', { hiddenFromEveryone: true }), { includePrivateVoice: true }),
      true
    );
  });

  it('rechecks each channel immediately before announcing', async () => {
    const directory = new FakeDirectory();
    directory.channels = [channel('a'), channel('b')];
    directory.rechecks.set('b', channel('b', { humanCount: 0 }));
    const transport = new FakeTransport();

    await runVoiceCycle(
      { guildId: 'guild-1', prayer: 'asr', includePrivateVoice: false },
      { directory, transport }
    );

    assert.deepEqual(transport.announced, ['a']);
    assert.deepEqual(directory.getCalls, ['a', 'b']);
  });

  it('continues to the next channel after a playback failure', async () => {
    const directory = new FakeDirectory();
    directory.channels = [channel('a'), channel('b'), channel('c')];
    const transport = new FakeTransport();
    transport.failing.add('b');

    await runVoiceCycle(
      { guildId: 'guild-1', prayer: 'maghrib', includePrivateVoice: true },
      { directory, transport }
    );

    assert.deepEqual(transport.announced, ['a', 'b', 'c']);
  });

  it('allows only one concurrent cycle per guild', async () => {
    const coordinator = new VoiceCoordinator();
    let release: (() => void) | null = null;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const first = coordinator.runExclusive('guild-1', () => gate);
    assert.equal(coordinator.isActive('guild-1'), true);
    const second = await coordinator.runExclusive('guild-1', async () => {});

    assert.equal(second, false);
    release!();
    assert.equal(await first, true);
    assert.equal(coordinator.isActive('guild-1'), false);
  });

  it('allows a test cycle while automation is disabled', async () => {
    const directory = new FakeDirectory();
    directory.channels = [channel('a')];
    const transport = new FakeTransport();
    const service = new VoiceAnnouncementService(directory, transport, new VoiceCoordinator());

    await service.runCycle('fajr', { ...settings, enabled: false }, true);

    assert.deepEqual(transport.announced, ['a']);
  });

  it('skips disabled guilds and overlapping cycles in the voice service', async () => {
    const directory = new FakeDirectory();
    directory.channels = [channel('a')];
    const transport = new FakeTransport();
    const service = new VoiceAnnouncementService(directory, transport, new VoiceCoordinator());

    await service.runCycle('fajr', { ...settings, enabled: false });
    assert.equal(directory.listCalls, 0);

    await service.runCycle('fajr', settings);
    assert.deepEqual(transport.announced, ['a']);
  });
});
