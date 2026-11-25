/*
SQLite adapter for the delivery ledger.
Explain: Owned by the scheduling module. It uses explicit columns, row validation
and a private mapper, like the settings module's store adapter.
*/

import { injectable, inject } from 'tsyringe';
import { Database } from 'better-sqlite3';
import { z } from 'zod';
import { TOKENS } from '../../../shared/di/tokens.js';
import { DeliveryLedgerEntry, IDeliveryLedgerStore } from './delivery-ledger-store.port.js';

const LEDGER_COLUMNS = ['event_key', 'guild_id', 'prayer_date', 'prayer_name', 'event_type', 'delivered_at'] as const;

const SELECT_LEDGER_ENTRY = `SELECT ${LEDGER_COLUMNS.join(', ')} FROM delivery_ledger WHERE event_key = ?`;

const DeliveryLedgerRowSchema = z.object({
  event_key: z.string(),
  guild_id: z.string(),
  prayer_date: z.string(),
  prayer_name: z.string(),
  event_type: z.string(),
  delivered_at: z.string()
});

type DeliveryLedgerRow = z.infer<typeof DeliveryLedgerRowSchema>;

function toEntity(row: DeliveryLedgerRow): DeliveryLedgerEntry {
  return {
    eventKey: row.event_key,
    guildId: row.guild_id,
    prayerDate: row.prayer_date,
    prayerName: row.prayer_name,
    eventType: row.event_type as DeliveryLedgerEntry['eventType'],
    deliveredAt: row.delivered_at
  };
}

@injectable()
export class DeliveryLedgerStore implements IDeliveryLedgerStore {
  constructor(@inject(TOKENS.Database) private readonly db: Database) {}

  has(eventKey: string): boolean {
    const row = this.db.prepare(SELECT_LEDGER_ENTRY).get(eventKey);
    if (row === undefined) {
      return false;
    }
    toEntity(DeliveryLedgerRowSchema.parse(row));
    return true;
  }

  insert(entry: DeliveryLedgerEntry): boolean {
    const result = this.db
      .prepare(
        `INSERT OR IGNORE INTO delivery_ledger (
          event_key, guild_id, prayer_date, prayer_name, event_type, delivered_at
        ) VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        entry.eventKey,
        entry.guildId,
        entry.prayerDate,
        entry.prayerName,
        entry.eventType,
        entry.deliveredAt
      );

    return result.changes > 0;
  }

  prune(cutoff: string): number {
    return this.db.prepare('DELETE FROM delivery_ledger WHERE delivered_at < ?').run(cutoff).changes;
  }
}
