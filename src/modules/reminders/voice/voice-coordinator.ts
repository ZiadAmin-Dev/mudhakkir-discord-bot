/*
Per-guild voice lock.
Explain: Enforces one active voice connection per guild (BR-020/BR-021). A
second cycle requested while one is active is skipped, not queued — Proposed
policy recorded in the scheduling design. Tests share this lock with real cycles.
*/

export class VoiceCoordinator {
  private readonly active = new Set<string>();

  isActive(guildId: string): boolean {
    return this.active.has(guildId);
  }

  /** Returns false when a cycle is already running for this guild. */
  async runExclusive(guildId: string, work: () => Promise<void>): Promise<boolean> {
    if (this.active.has(guildId)) {
      return false;
    }

    this.active.add(guildId);
    try {
      await work();
      return true;
    } finally {
      this.active.delete(guildId);
    }
  }
}
