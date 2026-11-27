/*
In-flight task tracking for graceful shutdown.
Explain: Delivery promises are fire-and-forget during normal operation. The
shutdown path drains them with a bounded grace period so announcements finish
before Discord and persistence are torn down. Pure TypeScript, no I/O.
*/

export interface TaskTracker {
  track(task: Promise<unknown>): void;
  drain(timeoutMs: number): Promise<boolean>;
  readonly pending: number;
}

export class InMemoryTaskTracker implements TaskTracker {
  private readonly tasks = new Set<Promise<unknown>>();

  get pending(): number {
    return this.tasks.size;
  }

  track(task: Promise<unknown>): void {
    this.tasks.add(task);
    // Settle both branches so a failed task never becomes an unhandled rejection.
    void task.then(
      () => this.tasks.delete(task),
      () => this.tasks.delete(task)
    );
  }

  async drain(timeoutMs: number): Promise<boolean> {
    if (this.tasks.size === 0) {
      return true;
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<'timeout'>((resolve) => {
      timer = setTimeout(() => resolve('timeout'), Math.max(0, timeoutMs));
      timer.unref?.();
    });
    const done = Promise.allSettled([...this.tasks]).then(() => 'done' as const);

    try {
      return (await Promise.race([done, timeout])) === 'done';
    } finally {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    }
  }
}
