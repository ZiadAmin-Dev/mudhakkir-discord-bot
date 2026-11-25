import { z } from 'zod';
import { CalculationMethod, MentionType } from './settings.types.js';

const CALCULATION_METHODS: [CalculationMethod, ...CalculationMethod[]] = [
  'Egyptian',
  'MuslimWorldLeague',
  'UmmAlQura',
  'NorthAmerica',
  'Karachi',
  'Dubai',
  'Kuwait',
  'Qatar',
  'Singapore',
  'Tehran',
  'Turkey',
  'MoonsightingCommittee'
];

const MENTION_TYPES: [MentionType, ...MentionType[]] = ['everyone', 'role'];

// Validates that timezone string is a valid IANA timezone identifier
function isValidIanaTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export const GuildSettingsSchema = z.object({
  guildId: z.string().min(1, 'guildId is required'),
  enabled: z.boolean(),
  cityName: z.string().min(1, 'cityName cannot be empty'),
  countryName: z.string().min(1, 'countryName cannot be empty'),
  latitude: z
    .number()
    .min(-90, 'Latitude must be >= -90')
    .max(90, 'Latitude must be <= 90'),
  longitude: z
    .number()
    .min(-180, 'Longitude must be >= -180')
    .max(180, 'Longitude must be <= 180'),
  timezone: z
    .string()
    .min(1, 'Timezone is required')
    .refine(isValidIanaTimezone, {
      message: 'Invalid IANA timezone identifier'
    }),
  calculationMethod: z.enum(CALCULATION_METHODS),
  textChannelId: z.string().min(1, 'textChannelId is required'),
  mentionType: z.enum(MENTION_TYPES),
  mentionRoleId: z.string().nullable(),
  voiceLeadTimeMinutes: z
    .number()
    .int('Lead time must be an integer')
    .min(1, 'Lead time must be at least 1 minute')
    .max(60, 'Lead time cannot exceed 60 minutes'),
  includePrivateVoice: z.boolean(),
  updatedAt: z.string().datetime({ message: 'updatedAt must be an ISO8601 string' })
}).refine(
  (data) => {
    if (data.mentionType === 'role' && (!data.mentionRoleId || data.mentionRoleId.trim() === '')) {
      return false;
    }
    return true;
  },
  {
    message: 'mentionRoleId is required when mentionType is "role"',
    path: ['mentionRoleId']
  }
);

export function validateGuildSettings(data: unknown) {
  return GuildSettingsSchema.parse(data);
}
