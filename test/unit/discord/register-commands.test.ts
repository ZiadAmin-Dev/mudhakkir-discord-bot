import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildSlashCommands, registrationTargets } from '../../../src/discord/register-commands.js';

describe('Slash command registration (Milestone 7)', () => {
  it('registers global commands when no dev guild is configured', () => {
    assert.deepEqual(registrationTargets(), [{ scope: 'global' }]);
    assert.deepEqual(registrationTargets('   '), [{ scope: 'global' }]);
  });

  it('adds a dev guild override without dropping global commands', () => {
    assert.deepEqual(registrationTargets('1520905350587482243'), [
      { scope: 'global' },
      { scope: 'guild', guildId: '1520905350587482243' }
    ]);
  });

  it('supports several dev guilds and ignores blank entries', () => {
    assert.deepEqual(registrationTargets(' guild-a , , guild-b ,'), [
      { scope: 'global' },
      { scope: 'guild', guildId: 'guild-a' },
      { scope: 'guild', guildId: 'guild-b' }
    ]);
  });

  it('defines unique, described commands', () => {
    const commands = buildSlashCommands().map((command) => command.toJSON());
    assert.equal(new Set(commands.map((command) => command.name)).size, commands.length);
    assert.ok(commands.every((command) => command.description.length > 0));
  });
});
