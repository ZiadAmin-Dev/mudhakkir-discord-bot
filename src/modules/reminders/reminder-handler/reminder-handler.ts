/*
Due-event dispatcher.
Explain: The scheduler's injected callback. It loads a fresh settings snapshot
for every event and routes by event type. Text and voice are independent error
boundaries; neither awaits or controls the other.
*/

import { injectable, inject } from 'tsyringe';
import { TOKENS } from '../../../shared/di/tokens.js';
import { Logger } from '../../../shared/logging/logger.port.js';
import { PrayerEvent } from '../../scheduling/index.js';
import { ISettingsService } from '../../settings/index.js';
import { ITextAnnouncementService } from '../text/index.js';
import { IVoiceAnnouncementService } from '../voice/index.js';

export interface IReminderHandler {
  handle(event: PrayerEvent): void;
}

@injectable()
export class ReminderHandler implements IReminderHandler {
  constructor(
    @inject(TOKENS.SettingsService) private readonly settingsService: ISettingsService,
    @inject(TOKENS.TextAnnouncementService) private readonly textService: ITextAnnouncementService,
    @inject(TOKENS.VoiceAnnouncementService) private readonly voiceService: IVoiceAnnouncementService,
    @inject(TOKENS.Logger) private readonly logger?: Logger
  ) {}

  handle(event: PrayerEvent): void {
    let settings;
    try {
      settings = this.settingsService.getSettings(event.guildId);
    } catch (error) {
      this.logger?.error({ eventKey: event.eventKey, err: error }, 'Failed to load settings for due event');
      return;
    }

    if (!settings || !settings.enabled) {
      this.logger?.warn({ eventKey: event.eventKey }, 'Due event has no enabled guild settings; skipping');
      return;
    }

    if (event.eventType === 'PRAYER_APPROACHING') {
      void this.voiceService.runCycle(event.prayer, settings).catch((error: unknown) => {
        this.logger?.error({ eventKey: event.eventKey, err: error }, 'Voice cycle failed');
      });
      return;
    }

    void this.textService.send(event.prayer, settings).catch((error: unknown) => {
      this.logger?.error({ eventKey: event.eventKey, err: error }, 'Reminder dispatch failed');
    });
  }
}
