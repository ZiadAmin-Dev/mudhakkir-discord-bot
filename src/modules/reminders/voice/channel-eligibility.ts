/*
Pure voice-channel eligibility rules.
Explain: A private channel is one that @everyone cannot view — a permission
fact, never a guess based on the channel name. Privacy classification remains
Proposed until M7 exposes the setting in commands.
*/

import type { VoiceChannelSnapshot } from './voice-channels.port.js';

export interface EligibilityPolicy {
  includePrivateVoice: boolean;
}

export function isChannelEligible(channel: VoiceChannelSnapshot, policy: EligibilityPolicy): boolean {
  if (!channel.isGuildVoice) {
    return false;
  }
  if (channel.humanCount === 0) {
    return false;
  }
  if (!channel.canView || !channel.canConnect || !channel.canSpeak) {
    return false;
  }
  if (channel.hiddenFromEveryone && !policy.includePrivateVoice) {
    return false;
  }
  return true;
}
