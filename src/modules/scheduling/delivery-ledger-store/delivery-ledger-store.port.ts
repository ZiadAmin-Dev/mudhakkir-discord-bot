/*
Delivery-ledger persistence port.
Explain: The scheduling module owns this abstraction; its SQLite adapter
implements it using the shared database connection.
*/

import type { PrayerEventType } from '../event.types.js';

export interface DeliveryLedgerEntry {
  eventKey: string;
  guildId: string;
  prayerDate: string;
  prayerName: string;
  eventType: PrayerEventType;
  deliveredAt: string;
}

export interface IDeliveryLedgerStore {
  has(eventKey: string): boolean;
  /** Atomically records the key; returns false when it already exists. */
  insert(entry: DeliveryLedgerEntry): boolean;
  prune(cutoff: string): number;
}
