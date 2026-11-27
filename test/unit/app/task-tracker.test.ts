import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryTaskTracker } from '../../../src/shared/lifecycle/task-tracker.js';

describe('In-flight task tracker (Milestone 8)', () => {
  it('drains tracked tasks and clears them', async () => {
    const tracker = new InMemoryTaskTracker();
    let release: (() => void) | null = null;
    const task = new Promise<void>((resolve) => {
      release = resolve;
    });

    tracker.track(task);
    assert.equal(tracker.pending, 1);
    release!();

    assert.equal(await tracker.drain(1_000), true);
    assert.equal(tracker.pending, 0);
  });

  it('reports failure when the grace period expires', async () => {
    const tracker = new InMemoryTaskTracker();
    tracker.track(new Promise<void>(() => {}));

    assert.equal(await tracker.drain(10), false);
    assert.equal(tracker.pending, 1);
  });

  it('settles rejected tasks without unhandled rejections', async () => {
    const tracker = new InMemoryTaskTracker();
    tracker.track(Promise.reject(new Error('delivery failed')));

    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(await tracker.drain(100), true);
    assert.equal(tracker.pending, 0);
  });
});
