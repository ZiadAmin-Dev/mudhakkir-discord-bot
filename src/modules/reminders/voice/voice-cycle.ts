/*
Sequential voice announcement cycle.
Explain: Each eligible channel is rechecked immediately before joining. One
channel's failure is contained and never prevents the next one; the whole cycle
is isolated from text delivery by the reminder handler.
*/

import type { Logger } from '../../../shared/logging/logger.port.js';
import type { PrayerName } from '../../prayer-times/index.js';
import { isChannelEligible } from './channel-eligibility.js';
import { IVoiceChannelDirectory, IVoiceTransport } from './voice-channels.port.js';

export interface VoiceCycleInput {
  guildId: string;
  prayer: PrayerName;
  includePrivateVoice: boolean;
}

export interface VoiceCycleDependencies {
  directory: IVoiceChannelDirectory;
  transport: IVoiceTransport;
  logger?: Logger;
}

export async function runVoiceCycle(
  input: VoiceCycleInput,
  dependencies: VoiceCycleDependencies
): Promise<void> {
  const policy = { includePrivateVoice: input.includePrivateVoice };
  const candidates = (await dependencies.directory.list(input.guildId)).filter((channel) =>
    isChannelEligible(channel, policy)
  );

  for (const candidate of candidates) {
    // BR-016: fresh data immediately before connecting.
    let current;
    try {
      current = await dependencies.directory.get(input.guildId, candidate.id);
    } catch (error) {
      dependencies.logger?.error(
        { guildId: input.guildId, channelId: candidate.id, err: error },
        'Voice eligibility recheck failed; skipping channel'
      );
      continue;
    }

    if (!current || !isChannelEligible(current, policy)) {
      dependencies.logger?.debug(
        { guildId: input.guildId, channelId: candidate.id },
        'Voice channel no longer eligible; skipping'
      );
      continue;
    }

    try {
      await dependencies.transport.announce({
        guildId: input.guildId,
        channelId: current.id,
        prayer: input.prayer
      });
      dependencies.logger?.info(
        { guildId: input.guildId, channelId: current.id, prayer: input.prayer },
        'Voice announcement played'
      );
    } catch (error) {
      dependencies.logger?.error(
        { guildId: input.guildId, channelId: current.id, err: error },
        'Voice announcement failed; continuing to next channel'
      );
    }
  }
}
