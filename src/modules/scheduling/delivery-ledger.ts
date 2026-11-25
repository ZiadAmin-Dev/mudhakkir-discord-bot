/*
Delivery-ledger service.
Explain: The single deduplication policy point. Commit happens before dispatch
(Confirmed in M4.1): a recorded key means at-most-once handling, so a crash can
lose an announcement but never repeats one.
*/

import { injectable, inject } from 'tsyringe';
import { Clock } from '../../shared/clock.js';
import { TOKENS } from '../../shared/di/tokens.js';
import { Logger } from '../../shared/logging/logger.port.js';
import { DeliveryLedgerEntry, IDeliveryLedgerStore } from './delivery-ledger-store/index.js';

export interface IDeliveryLedger {
  isHandled(eventKey: string): boolean;
  /** Returns true only when this call recorded the key. */
  commit(entry: DeliveryLedgerEntry): boolean;
  prune(retentionDays: number): number;
}

@injectable()
export class DeliveryLedger implements IDeliveryLedger {
  constructor(
    @inject(TOKENS.DeliveryLedgerStore) private readonly store: IDeliveryLedgerStore,
    @inject(TOKENS.Clock) private readonly clock: Clock,
    @inject(TOKENS.Logger) private readonly logger?: Logger
  ) {}

  isHandled(eventKey: string): boolean {
    return this.store.has(eventKey);
  }

  commit(entry: DeliveryLedgerEntry): boolean {
    const inserted = this.store.insert(entry);
    if (inserted) {
      this.logger?.debug({ eventKey: entry.eventKey }, 'Delivery ledger key committed');
    }
    return inserted;
  }

  prune(retentionDays: number): number {
    const cutoff = new Date(this.clock.now().getTime() - retentionDays * 86_400_000).toISOString();
    return this.store.prune(cutoff);
  }
}
