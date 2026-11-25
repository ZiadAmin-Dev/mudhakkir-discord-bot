/*
Prayer event model.
Explain: Each occurrence is one-shot and identified by guild, local prayer date,
prayer and event type. The same identity is the delivery-ledger key, so dedup
and logging share a single stable value. Trigger instants are absolute UTC.
*/

import type { PrayerName } from '../prayer-times/index.js';

export type PrayerEventType = 'PRAYER_APPROACHING' | 'PRAYER_TIME_REACHED';

export interface PrayerEvent {
  eventKey: string;
  guildId: string;
  prayerDate: string;
  prayer: PrayerName;
  eventType: PrayerEventType;
  triggerAt: Date;
}

export type DueEventCallback = (event: PrayerEvent) => void;

export function createEventKey(
  guildId: string,
  prayerDate: string,
  prayer: PrayerName,
  eventType: PrayerEventType
): string {
  return `${guildId}:${prayerDate}:${prayer}:${eventType}`;
}
