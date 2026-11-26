/*
Voice announcement entry point.
Explain: Public voice service for the reminder handler. It owns no timers and
no Discord calls; it acquires the guild lock and runs the sequential cycle.
*/

import { injectable, inject } from 'tsyringe';
import { TOKENS } from '../../../shared/di/tokens.js';
import { Logger } from '../../../shared/logging/logger.port.js';
import type { PrayerName } from '../../prayer-times/index.js';
import type { GuildSettings } from '../../settings/index.js';
import { IVoiceChannelDirectory, IVoiceTransport } from './voice-channels.port.js';
import { VoiceCoordinator } from './voice-coordinator.js';
import { runVoiceCycle } from './voice-cycle.js';

export interface IVoiceAnnouncementService {
  runCycle(prayer: PrayerName, settings: GuildSettings, isTest?: boolean): Promise<void>;
}

@injectable()
export class VoiceAnnouncementService implements IVoiceAnnouncementService {
  constructor(
    @inject(TOKENS.VoiceChannelDirectory) private readonly directory: IVoiceChannelDirectory,
    @inject(TOKENS.VoiceTransport) private readonly transport: IVoiceTransport,
    @inject(TOKENS.VoiceCoordinator) private readonly coordinator: VoiceCoordinator,
    @inject(TOKENS.Logger) private readonly logger?: Logger
  ) {}

  async runCycle(prayer: PrayerName, settings: GuildSettings, isTest = false): Promise<void> {
    // A test is allowed while automation is disabled; a real approaching event is not.
    if (!settings.enabled && !isTest) {
      return;
    }

    const started = await this.coordinator.runExclusive(settings.guildId, () =>
      runVoiceCycle(
        {
          guildId: settings.guildId,
          prayer,
          includePrivateVoice: settings.includePrivateVoice
        },
        { directory: this.directory, transport: this.transport, logger: this.logger }
      )
    );

    if (!started) {
      this.logger?.debug({ guildId: settings.guildId, prayer, isTest }, 'Voice cycle already active; skipping');
    }
  }
}
