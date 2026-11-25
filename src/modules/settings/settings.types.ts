export type CalculationMethod =
  | 'Egyptian'
  | 'MuslimWorldLeague'
  | 'UmmAlQura'
  | 'NorthAmerica'
  | 'Karachi'
  | 'Dubai'
  | 'Kuwait'
  | 'Qatar'
  | 'Singapore'
  | 'Tehran'
  | 'Turkey'
  | 'MoonsightingCommittee';

export type MentionType = 'everyone' | 'role';

export interface GuildSettings {
  guildId: string;
  enabled: boolean;
  cityName: string;
  countryName: string;
  latitude: number;
  longitude: number;
  timezone: string;
  calculationMethod: CalculationMethod;
  textChannelId: string;
  mentionType: MentionType;
  mentionRoleId: string | null;
  voiceLeadTimeMinutes: number;
  includePrivateVoice: boolean;
  updatedAt: string;
}

export type CreateGuildSettingsInput = Omit<GuildSettings, 'updatedAt'>;

export type UpdateGuildSettingsInput = Partial<Omit<GuildSettings, 'guildId' | 'updatedAt'>>;
