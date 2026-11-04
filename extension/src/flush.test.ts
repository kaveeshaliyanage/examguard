import { describe, expect, it, vi } from 'vitest';
import { UnauthorizedError } from './api';
import { flushQueue, type FlushDeps } from './flush';
import { emptyFlushState } from './storage';
import type { Connection, FlushState, QueueState, QueuedEvent } from './types';

const connection: Connection = {
  apiBase: 'http://localhost:8080/api',
  token: 'token',
  attemptId: 7,
  connectedAt: '2026-11-01T09:00:00Z',
};

function events(count: number): QueuedEvent[] {
  return Array.from({ length: count }, (_, index) => ({
    clientEventId: `event-${index}`,
    eventType: 'HEARTBEAT',
    domain: null,
    occurredAt: '2026-11-01T09:00:00Z',
  }));
}

function harness(
  count: number,
  options: { unauthorized?: boolean; failure?: boolean; now?: number } = {},
) {
  let queue: QueueState = { events: events(count), dropped: 0 };
  let state: FlushState = emptyFlushState();
  const now = options.now ?? 1_000_000;
  const sent: QueuedEvent[][] = [];
  const send = vi.fn(async (_connection: Connection, batch: QueuedEvent[]) => {
    if (options.unauthorized) {
      throw new UnauthorizedError();
    }
    if (options.failure) {
      throw new Error('network unavailable');
    }
    sent.push(batch);
    return { accepted: batch.length, duplicates: 0, rejected: 0 };
  });

  const deps: FlushDeps = {
    getConnection: async () => connection,
    getQueue: async () => queue,
    dropBatch: async (batch) => {
      const ids = new Set(batch.map((event) => event.clientEventId));
      queue = { ...queue, events: queue.events.filter((event) => !ids.has(event.clientEventId)) };
    },
    getFlushState: async () => state,
    setFlushState: async (next) => {
      state = next;
    },
    send,
    now: () => now,
  };

  return {
    deps,
    send,
    sent,
    queue: () => queue,
    state: () => state,
  };
}

describe('flushQueue', () => {
  it('uploads queued events in batches of twenty and removes them', async () => {
    const test = harness(45);
    const outcome = await flushQueue(test.deps);
    expect(outcome).toEqual({ status: 'flushed', sent: 45 });
    expect(test.sent.map((batch) => batch.length)).toEqual([20, 20, 5]);
    expect(test.queue().events).toHaveLength(0);
    expect(test.state().lastFlushAt).toBe(1_000_000);
    expect(test.state().failureCount).toBe(0);
  });

  it('keeps the queue and stops on a rejected token', async () => {
    const test = harness(25, { unauthorized: true });
    const outcome = await flushQueue(test.deps);
    expect(outcome.status).toBe('unauthorized');
    expect(test.queue().events).toHaveLength(25);
    expect(test.state().reconnectRequired).toBe(true);

    const second = await flushQueue(test.deps);
    expect(second).toEqual({ status: 'deferred', sent: 0 });
    expect(test.send).toHaveBeenCalledTimes(1);
  });

  it('keeps the queue and backs off after a transient failure', async () => {
    const test = harness(25, { failure: true, now: 5_000 });
    const outcome = await flushQueue(test.deps);
    expect(outcome.status).toBe('failed');
    expect(test.queue().events).toHaveLength(25);
    expect(test.state().failureCount).toBe(1);
    expect(test.state().nextFlushAt).toBe(35_000);
    expect(test.state().lastError).toContain('network unavailable');

    const second = await flushQueue(test.deps);
    expect(second.status).toBe('deferred');
    expect(test.send).toHaveBeenCalledTimes(1);
  });
});
