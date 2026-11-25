/*
Prayer scheduler.
Explain: Owns the single timer for the earliest event. All timing decisions are
here; delivery happens through an injected callback. A fake clock plus tick()
makes the loop deterministic in unit tests.
*/

import { injectable, inject } from 'tsyringe';
import { Clock } from '../../../shared/clock.js';
import { TOKENS } from '../../../shared/di/tokens.js';
import { Logger } from '../../../shared/logging/logger.port.js';
import { IPrayerTimesService } from '../../prayer-times/index.js';
import { GuildSettings, ISettingsService } from '../../settings/index.js';
import { buildEvents } from '../event-builder.js';
import { IDeliveryLedger } from '../delivery-ledger.js';
import { DueEventCallback, PrayerEvent } from '../event.types.js';

export const LATE_EVENT_GRACE_MS = 60_000;
export const HEARTBEAT_INTERVAL_MS = 15 * 60_000;
export const MAX_TIMER_DELAY_MS = 12 * 60 * 60_000;
export const LEDGER_RETENTION_DAYS = 7;

export interface ISchedulingService {
  start(): void;
  stop(): void;
  rebuild(guildId?: string): void;
  tick(): void;
  getPendingEvents(): readonly PrayerEvent[];
}

@injectable()
export class SchedulingService implements ISchedulingService {
  private plan: PrayerEvent[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private stopped = true;

  constructor(
    @inject(TOKENS.SettingsService) private readonly settingsService: ISettingsService,
    @inject(TOKENS.PrayerTimesService) private readonly prayerTimes: IPrayerTimesService,
    @inject(TOKENS.DeliveryLedger) private readonly ledger: IDeliveryLedger,
    @inject(TOKENS.Clock) private readonly clock: Clock,
    @inject(TOKENS.DueEventCallback) private readonly callback: DueEventCallback,
    @inject(TOKENS.Logger) private readonly logger?: Logger
  ) {}

  start(): void {
    if (!this.stopped) {
      return;
    }
    this.stopped = false;
    this.logger?.info('Prayer scheduler started');

    try {
      this.ledger.prune(LEDGER_RETENTION_DAYS);
    } catch (error) {
      this.logger?.error({ err: error }, 'Failed to prune delivery ledger');
    }

    this.rebuild();
    if (!this.stopped) {
      this.heartbeat = setInterval(() => this.tick(), HEARTBEAT_INTERVAL_MS);
      this.heartbeat.unref?.();
    }
  }

  stop(): void {
    this.stopped = true;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.heartbeat !== null) {
      clearInterval(this.heartbeat);
      this.heartbeat = null;
    }
    this.plan = [];
    this.logger?.info('Prayer scheduler stopped');
  }

  /** Rebuilds all guilds, or only one guild while retaining the others' events. */
  rebuild(guildId?: string): void {
    if (this.stopped) {
      return;
    }

    let settingsList: GuildSettings[];
    try {
      settingsList = guildId
        ? [this.settingsService.getSettings(guildId)].filter((item): item is GuildSettings => item !== null)
        : this.settingsService.listSettings();
    } catch (error) {
      this.logger?.error({ guildId, err: error }, 'Failed to load settings for schedule rebuild');
      return;
    }

    const events: PrayerEvent[] = [];
    for (const settings of settingsList) {
      if (!settings.enabled) {
        continue;
      }

      const built = buildEvents({ settings, now: this.clock.now(), prayerTimes: this.prayerTimes, logger: this.logger });
      for (const event of built) {
        try {
          if (!this.ledger.isHandled(event.eventKey)) {
            events.push(event);
          }
        } catch (error) {
          this.logger?.error({ eventKey: event.eventKey, err: error }, 'Ledger check failed; skipping event');
        }
      }
    }

    const byTime = (a: PrayerEvent, b: PrayerEvent): number =>
      a.triggerAt.getTime() - b.triggerAt.getTime() || a.eventKey.localeCompare(b.eventKey);

    const retained = guildId ? this.plan.filter((event) => event.guildId !== guildId) : [];
    this.plan = [...retained, ...events].sort(byTime);
    this.arm();
  }

  /** Processes all events due at the clock's current time, then re-arms. */
  tick(): void {
    if (this.stopped) {
      return;
    }

    const now = this.clock.now();
    const due = this.plan.filter((event) => event.triggerAt.getTime() <= now.getTime());
    if (due.length === 0) {
      this.arm();
      return;
    }

    this.plan = this.plan.filter((event) => event.triggerAt.getTime() > now.getTime());
    for (const event of due) {
      this.dispatch(event, now);
    }
    this.rebuild();
  }

  getPendingEvents(): readonly PrayerEvent[] {
    return [...this.plan];
  }

  private dispatch(event: PrayerEvent, now: Date): void {
    const lateness = now.getTime() - event.triggerAt.getTime();
    if (lateness > LATE_EVENT_GRACE_MS) {
      this.logger?.warn({ eventKey: event.eventKey, lateness }, 'Skipping event dispatched too late');
      return;
    }

    try {
      const committed = this.ledger.commit({
        eventKey: event.eventKey,
        guildId: event.guildId,
        prayerDate: event.prayerDate,
        prayerName: event.prayer,
        eventType: event.eventType,
        deliveredAt: now.toISOString()
      });
      if (!committed) {
        this.logger?.debug({ eventKey: event.eventKey }, 'Event already handled; skipping');
        return;
      }
    } catch (error) {
      // Fail closed: without a durable key we cannot guarantee at-most-once.
      this.logger?.error({ eventKey: event.eventKey, err: error }, 'Ledger commit failed; skipping dispatch');
      return;
    }

    try {
      void Promise.resolve(this.callback(event)).catch((error: unknown) => {
        this.logger?.error({ eventKey: event.eventKey, err: error }, 'Due-event callback failed');
      });
    } catch (error) {
      this.logger?.error({ eventKey: event.eventKey, err: error }, 'Due-event callback threw');
    }
  }

  private arm(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.stopped || this.plan.length === 0) {
      return;
    }

    const remaining = this.plan[0].triggerAt.getTime() - this.clock.now().getTime();
    const delay = Math.min(Math.max(Math.ceil(remaining), 0), MAX_TIMER_DELAY_MS);
    this.timer = setTimeout(() => this.tick(), delay);
    this.timer.unref?.();
  }
}
