/*
Text announcement service.
Explain: Builds the message and delegates delivery to the injected port. It
reads no settings store, owns no timers, and knows nothing about voice.
*/

import { injectable, inject } from 'tsyringe';
import { TOKENS } from '../../../shared/di/tokens.js';
import { Logger } from '../../../shared/logging/logger.port.js';
import type { PrayerName } from '../../prayer-times/index.js';
import type { GuildSettings } from '../../settings/index.js';
import { buildTextAnnouncement } from './text-message.builder.js';
import { ITextMessageSender } from './text-message-sender.port.js';

export interface ITextAnnouncementService {
  send(prayer: PrayerName, settings: GuildSettings): Promise<void>;
}

@injectable()
export class TextAnnouncementService implements ITextAnnouncementService {
  constructor(
    @inject(TOKENS.TextMessageSender) private readonly sender: ITextMessageSender,
    @inject(TOKENS.Logger) private readonly logger?: Logger
  ) {}

  async send(prayer: PrayerName, settings: GuildSettings): Promise<void> {
    const announcement = buildTextAnnouncement(prayer, settings);

    try {
      await this.sender.send({
        channelId: settings.textChannelId,
        content: announcement.content,
        allowedMentions: announcement.allowedMentions
      });
      this.logger?.info({ guildId: settings.guildId, prayer }, 'Text announcement sent');
    } catch (error) {
      // Text failure is contained here; it never affects the voice path.
      this.logger?.error({ guildId: settings.guildId, prayer, err: error }, 'Text announcement failed');
    }
  }
}
