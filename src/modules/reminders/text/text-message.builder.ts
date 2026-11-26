/*
Text announcement builder.
Explain: Pure formatting of a prayer name and settings snapshot into message
content and an allowed-mentions payload. Exactly one mention mode is applied.
*/

import type { PrayerName } from '../../prayer-times/index.js';
import type { GuildSettings } from '../../settings/index.js';
import { missingRoleMentionError } from '../reminders.errors.js';
import type { AllowedMentionsPayload } from './text-message-sender.port.js';

const PRAYER_LABELS: Record<PrayerName, string> = {
  fajr: 'Fajr',
  dhuhr: 'Dhuhr',
  asr: 'Asr',
  maghrib: 'Maghrib',
  isha: 'Isha'
};

export interface TextAnnouncement {
  content: string;
  allowedMentions: AllowedMentionsPayload;
}

export function buildTextAnnouncement(
  prayer: PrayerName,
  settings: GuildSettings,
  isTest = false
): TextAnnouncement {
  const body = `It's time for ${PRAYER_LABELS[prayer]} prayer.`;
  const prefix = isTest ? '[TEST] ' : '';

  if (settings.mentionType === 'role') {
    const roleId = settings.mentionRoleId;
    if (!roleId) {
      throw missingRoleMentionError;
    }
    return {
      content: `${prefix}<@&${roleId}> — ${body}`,
      allowedMentions: isTest ? { parse: [], roles: [] } : { parse: [], roles: [roleId] }
    };
  }

  return {
    content: `${prefix}@everyone — ${body}`,
    allowedMentions: isTest ? { parse: [], roles: [] } : { parse: ['everyone'] }
  };
}
