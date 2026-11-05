import { UnauthorizedError } from './api';
import type { Connection, EventAck, FlushState, QueueState, QueuedEvent } from './types';

export const BACKOFF_BASE_MS = 30_000;
export const BACKOFF_MAX_MS = 10 * 60_000;
const MAX_BATCHES_PER_FLUSH = 5;

export interface FlushDeps {
  getConnection: () => Promise<Connection | null>;
  getQueue: () => Promise<QueueState>;
  dropBatch: (batch: QueuedEvent[]) => Promise<void>;
  getFlushState: () => Promise<FlushState>;
  setFlushState: (state: FlushState) => Promise<void>;
  send: (connection: Connection, events: QueuedEvent[]) => Promise<EventAck>;
  now: () => number;
}

export type FlushStatus =
  | 'no-connection'
  | 'idle'
  | 'flushed'
  | 'unauthorized'
  | 'deferred'
  | 'failed';

export interface FlushOutcome {
  status: FlushStatus;
  sent: number;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Event upload failed';
}

export async function flushQueue(deps: FlushDeps): Promise<FlushOutcome> {
  const connection = await deps.getConnection();
  if (!connection) {
    return { status: 'no-connection', sent: 0 };
  }

  let state = await deps.getFlushState();
  if (state.reconnectRequired) {
    return { status: 'deferred', sent: 0 };
  }
  const now = deps.now();
  if (state.nextFlushAt > now) {
    return { status: 'deferred', sent: 0 };
  }

  const initial = await deps.getQueue();
  if (initial.events.length === 0) {
    if (state.lastError !== null) {
      state = { ...state, lastError: null };
      await deps.setFlushState(state);
    }
    return { status: 'idle', sent: 0 };
  }

  let sent = 0;
  for (let batchIndex = 0; batchIndex < MAX_BATCHES_PER_FLUSH; batchIndex += 1) {
    const queue = await deps.getQueue();
    const batch = queue.events.slice(0, 20);
    if (batch.length === 0) {
      break;
    }
    try {
      await deps.send(connection, batch);
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        await deps.setFlushState({
          ...state,
          reconnectRequired: true,
          lastError: 'Reconnect required: the token was rejected.',
        });
        return { status: 'unauthorized', sent };
      }
      const failureCount = state.failureCount + 1;
      const delay = Math.min(BACKOFF_BASE_MS * 2 ** (failureCount - 1), BACKOFF_MAX_MS);
      await deps.setFlushState({
        ...state,
        failureCount,
        nextFlushAt: now + delay,
        lastError: errorMessage(error),
      });
      return { status: 'failed', sent };
    }
    await deps.dropBatch(batch);
    sent += batch.length;
  }

  await deps.setFlushState({
    failureCount: 0,
    nextFlushAt: 0,
    lastFlushAt: now,
    lastError: null,
    reconnectRequired: false,
  });
  return { status: 'flushed', sent };
}
