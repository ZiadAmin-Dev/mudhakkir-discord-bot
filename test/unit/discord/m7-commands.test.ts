import 'reflect-metadata';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PermissionFlagsBits } from 'discord.js';
import { CommandAuthorization } from '../../../src/discord/authorization.js';
import { CommandRouter } from '../../../src/discord/command-router.js';
import type { ICommandHandler, InteractionFlow } from '../../../src/discord/commands/command-handler.js';
import { EnableCommand } from '../../../src/discord/commands/enable.js';
import { DisableCommand } from '../../../src/discord/commands/disable.js';
import { PrayerTimesCommand } from '../../../src/discord/commands/prayer-times.js';
import { TestCommand } from '../../../src/discord/commands/test.js';
import { SetupFlow, paginate } from '../../../src/discord/flows/setup-flow.js';
import { buildSlashCommands } from '../../../src/discord/register-commands.js';
import { Clock } from '../../../src/shared/clock.js';
import { LocationService } from '../../../src/modules/location/index.js';
import {
  CreateGuildSettingsInput,
  GuildSettings,
  ISettingsService,
  SettingsChangeCallback,
  SettingsService,
  UpdateGuildSettingsInput
} from '../../../src/modules/settings/index.js';
import { ISettingsStore } from '../../../src/modules/settings/settings-store/index.js';
import { PrayerTimesService } from '../../../src/modules/prayer-times/index.js';
import { ITextAnnouncementService, IVoiceAnnouncementService } from '../../../src/modules/reminders/index.js';

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

interface FakeInteraction {
  interaction: never;
  replies: Array<{ content?: string; ephemeral?: boolean }>;
  edits: Array<{ content?: string }>;
  modals: unknown[];
}

function makeInteraction(options: {
  userId?: string;
  guildId?: string | null;
  commandName?: string;
  admin?: boolean;
  customId?: string;
  values?: string[];
  fields?: Record<string, string>;
  optionValues?: Record<string, string>;
} = {}): FakeInteraction {
  const replies: Array<{ content?: string; ephemeral?: boolean }> = [];
  const edits: Array<{ content?: string }> = [];
  const modals: unknown[] = [];
  const state = { deferred: false, replied: false };
  const permissions = new Set<bigint>(
    options.admin === false ? [] : [PermissionFlagsBits.Administrator, PermissionFlagsBits.ManageGuild]
  );
  const base = {
    guildId: options.guildId === undefined ? 'guild-1' : options.guildId,
    user: { id: options.userId ?? 'user-1' },
    channelId: 'channel-1',
    id: 'interaction-1',
    commandName: options.commandName ?? 'setup',
    customId: options.customId ?? 'setup:country',
    values: options.values ?? [],
    memberPermissions: { has: (permission: bigint) => permissions.has(permission) },
    options: { getString: (name: string) => options.optionValues?.[name] ?? null },
    fields: { getTextInputValue: (name: string) => options.fields?.[name] ?? '' },
    isChatInputCommand: () => options.commandName !== undefined,
    isButton: () => options.customId !== undefined,
    isStringSelectMenu: () => options.values !== undefined,
    isModalSubmit: () => options.fields !== undefined,
    reply: async (payload: { content?: string; ephemeral?: boolean }) => {
      replies.push(payload);
      state.replied = true;
    },
    deferReply: async (payload?: { ephemeral?: boolean }) => {
      state.deferred = true;
      replies.push({ ephemeral: payload?.ephemeral });
    },
    deferUpdate: async () => {
      state.deferred = true;
    },
    editReply: async (payload: { content?: string }) => {
      edits.push(payload);
    },
    showModal: async (modal: unknown) => {
      modals.push(modal);
    },
    guild: {
      channels: { fetch: async () => ({ isTextBased: () => true }) }
    },
    get replied() {
      return state.replied;
    },
    get deferred() {
      return state.deferred;
    }
  };
  return { interaction: base as never, replies, edits, modals };
}

class FakeSettingsService implements ISettingsService {
  readonly saved: CreateGuildSettingsInput[] = [];
  readonly updated: Array<{ guildId: string; input: UpdateGuildSettingsInput }> = [];
  current: GuildSettings | null = settings;

  getSettings(): GuildSettings | null {
    return this.current;
  }
  listSettings(): GuildSettings[] {
    return this.current ? [this.current] : [];
  }
  saveSettings(input: CreateGuildSettingsInput): GuildSettings {
    this.saved.push(input);
    return { ...input, updatedAt: settings.updatedAt };
  }
  updateSettings(guildId: string, input: UpdateGuildSettingsInput): GuildSettings {
    this.updated.push({ guildId, input });
    return { ...settings, ...input };
  }
  setEnabled(guildId: string, enabled: boolean): GuildSettings {
    this.updated.push({ guildId, input: { enabled } });
    return { ...settings, enabled };
  }
  deleteSettings(): boolean {
    return true;
  }
}

class FakeTextService implements ITextAnnouncementService {
  calls = 0;
  async send(): Promise<void> {
    this.calls += 1;
  }
}

class FakeVoiceService implements IVoiceAnnouncementService {
  calls = 0;
  async runCycle(): Promise<void> {
    this.calls += 1;
  }
}

class MemoryStore implements ISettingsStore {
  value: GuildSettings | null = null;
  get(): GuildSettings | null {
    return this.value;
  }
  list(): GuildSettings[] {
    return this.value ? [this.value] : [];
  }
  save(value: GuildSettings): void {
    this.value = value;
  }
  delete(): boolean {
    const existed = this.value !== null;
    this.value = null;
    return existed;
  }
}

describe('M7 — authorization and command definitions', () => {
  it('requires a guild and an admin/manage-guild permission for configuration', () => {
    const auth = new CommandAuthorization();
    assert.equal(auth.canConfigure(makeInteraction().interaction), true);
    assert.equal(auth.canConfigure(makeInteraction({ admin: false }).interaction), false);
    assert.equal(auth.canConfigure(makeInteraction({ guildId: null }).interaction), false);
  });

  it('defines all six commands with admin defaults on configuration commands', () => {
    const commands = buildSlashCommands().map((command) => command.toJSON());
    assert.deepEqual(
      commands.map((command) => command.name),
      ['setup', 'prayer-times', 'settings', 'test', 'enable', 'disable']
    );
    const byName = new Map(commands.map((command) => [command.name, command]));
    assert.equal(byName.get('setup')?.default_member_permissions, PermissionFlagsBits.ManageGuild.toString());
    assert.equal(byName.get('prayer-times')?.default_member_permissions, undefined);
  });
});

describe('M7 — command router', () => {
  it('rejects unknown commands and unauthorized configuration attempts', async () => {
    const router = new CommandRouter([], new CommandAuthorization());
    const unknown = makeInteraction({ commandName: 'nope' });
    await router.handle(unknown.interaction);
    assert.match(String(unknown.replies[0]?.content), /Unknown command/);

    const handler: ICommandHandler = { name: 'enable', requiresAdmin: true, execute: async () => {} };
    const denied = new CommandRouter([handler], new CommandAuthorization());
    const interaction = makeInteraction({ commandName: 'enable', admin: false });
    await denied.handle(interaction.interaction);
    assert.match(String(interaction.replies[0]?.content), /not authorized/);
  });

  it('routes component interactions only to the owning user active flow', async () => {
    const handled: string[] = [];
    const flow: InteractionFlow = {
      name: 'setup',
      expiresAt: Date.now() + 60_000,
      handle: async (interaction) => {
        handled.push(interaction.customId);
      }
    };
    const handler: ICommandHandler = { name: 'setup', requiresAdmin: false, execute: async () => flow };
    const router = new CommandRouter([handler], new CommandAuthorization());
    await router.handle(makeInteraction({ commandName: 'setup' }).interaction);

    const owner = makeInteraction({ commandName: undefined, customId: 'setup:city' });
    await router.handle(owner.interaction);
    assert.deepEqual(handled, ['setup:city']);

    const stranger = makeInteraction({ userId: 'other', commandName: undefined, customId: 'setup:city' });
    await router.handle(stranger.interaction);
    assert.deepEqual(handled, ['setup:city']);
    assert.match(String(stranger.replies[0]?.content), /expired/);
  });

  it('rejects expired flows', async () => {
    const flow: InteractionFlow = { name: 'settings', expiresAt: Date.now() - 1, handle: async () => {} };
    const handler: ICommandHandler = { name: 'settings', requiresAdmin: false, execute: async () => flow };
    const router = new CommandRouter([handler], new CommandAuthorization());
    await router.handle(makeInteraction({ commandName: 'settings' }).interaction);
    const component = makeInteraction({ commandName: undefined, customId: 'settings:section' });
    await router.handle(component.interaction);
    assert.match(String(component.replies[0]?.content), /expired/);
  });
});

describe('M7 — setup flow', () => {
  it('paginates select options at 25 entries', () => {
    const first = paginate(Array.from({ length: 30 }, (_, i) => i), 0);
    const second = paginate(Array.from({ length: 30 }, (_, i) => i), 1);
    assert.equal(first.items.length, 25);
    assert.deepEqual(second.items, [25, 26, 27, 28, 29]);
    assert.equal(first.pages, 2);
  });

  it('uses canonical country codes and saves resolved coordinates with enabled=false', async () => {
    const locations = new LocationService();
    const settingsService = new FakeSettingsService();
    const start = makeInteraction();
    const flow = new SetupFlow(start.interaction, locations, settingsService);

    await flow.start();
    const country = makeInteraction({ commandName: undefined, customId: 'setup:country', values: ['EG'] });
    await flow.handle(country.interaction);
    assert.match(String(start.edits[0]?.content), /country/i);

    const open = makeInteraction({ commandName: undefined, customId: 'setup:details-open' });
    await flow.handle(open.interaction);
    assert.equal(open.modals.length, 1);

    const details = makeInteraction({
      commandName: undefined,
      customId: 'setup:details',
      fields: { channel: 'channel-1', mention: 'everyone', role: '', leadTime: '15', method: 'Egyptian' }
    });
    await flow.handle(details.interaction);

    const confirm = makeInteraction({ commandName: undefined, customId: 'setup:confirm' });
    await flow.handle(confirm.interaction);

    assert.equal(settingsService.saved.length, 1);
    assert.equal(settingsService.saved[0].countryName, 'Egypt');
    assert.equal(settingsService.saved[0].cityName, 'Cairo');
    assert.equal(settingsService.saved[0].latitude, 30.0444);
    assert.equal(settingsService.saved[0].enabled, false);
    assert.equal(settingsService.saved[0].voiceLeadTimeMinutes, 15);
  });

  it('shows a city menu when Location reports cityRequired', async () => {
    const locations = new LocationService();
    const start = makeInteraction();
    const flow = new SetupFlow(start.interaction, locations, new FakeSettingsService());
    await flow.start();
    const country = makeInteraction({ commandName: undefined, customId: 'setup:country', values: ['US'] });
    await flow.handle(country.interaction);
    assert.match(String(start.edits.at(-1)?.content), /city is required/i);
  });
});

describe('M7 — command handlers', () => {
  it('enable and disable mutate settings and are blocked for non-admins', async () => {
    const service = new FakeSettingsService();
    const auth = new CommandAuthorization();
    const enable = new EnableCommand(auth, service);
    await enable.execute(makeInteraction({ commandName: 'enable', admin: false }).interaction);
    assert.equal(service.updated.length, 0);

    await enable.execute(makeInteraction({ commandName: 'enable' }).interaction);
    assert.deepEqual(service.updated[0], { guildId: 'guild-1', input: { enabled: true } });

    const disable = new DisableCommand(auth, service);
    await disable.execute(makeInteraction({ commandName: 'disable' }).interaction);
    assert.deepEqual(service.updated[1], { guildId: 'guild-1', input: { enabled: false } });
  });

  it('prayer-times displays calculated values from stored settings', async () => {
    const clock: Clock = { now: () => new Date('2026-11-25T00:00:00.000Z') };
    const command = new PrayerTimesCommand(new FakeSettingsService(), new PrayerTimesService(), clock);
    const interaction = makeInteraction({ commandName: 'prayer-times' });
    await command.execute(interaction.interaction);

    assert.equal(interaction.replies.length, 1);
    assert.match(String(interaction.edits[0]?.content), /fajr/i);
    assert.match(String(interaction.edits[0]?.content), /Africa\/Cairo/);
  });

  it('/test calls text and voice services directly without ledger writes', async () => {
    const text = new FakeTextService();
    const voice = new FakeVoiceService();
    const command = new TestCommand(new CommandAuthorization(), new FakeSettingsService(), text, voice);
    const interaction = makeInteraction({ commandName: 'test', optionValues: { type: 'both', prayer: 'asr' } });
    await command.execute(interaction.interaction);

    assert.equal(text.calls, 1);
    assert.equal(voice.calls, 1);
    assert.match(String(interaction.edits[0]?.content), /ledger were not modified/);
  });
});

describe('M7 — settings change callback', () => {
  it('notifies the scheduler for every successful settings mutation', () => {
    const notified: string[] = [];
    const service = new SettingsService(new MemoryStore(), undefined, ((guildId: string) => notified.push(guildId)) as SettingsChangeCallback);
    const { updatedAt: _ignored, ...input } = settings;

    service.saveSettings(input);
    service.updateSettings('guild-1', { voiceLeadTimeMinutes: 20 });
    service.setEnabled('guild-1', false);
    service.deleteSettings('guild-1');

    assert.deepEqual(notified, ['guild-1', 'guild-1', 'guild-1', 'guild-1']);
  });
});
