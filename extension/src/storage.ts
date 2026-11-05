import { newEvent } from './queue';
import { appendEvent, BATCH_SIZE, QUEUE_LIMIT, takeBatch } from './queue';
import type {
  Connection,
  FlushState,
  MonitoredEventType,
  QueueState,
  QueuedEvent,
} from './types';

const CONNECTION_KEY = 'examguard.connection';
const QUEUE_KEY = 'examguard.queue';
const FLUSH_KEY = 'examguard.flush';

export function emptyFlushState(): FlushState {
  return {
    failureCount: 0,
    nextFlushAt: 0,
    lastFlushAt: null,
    lastError: null,
    reconnectRequired: false,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isConnection(value: unknown): value is Connection {
  return (
    isRecord(value) &&
    typeof value.apiBase === 'string' &&
    typeof value.token === 'string' &&
    typeof value.attemptId === 'number' &&
    typeof value.connectedAt === 'string'
  );
}

function isQueuedEvent(value: unknown): value is QueuedEvent {
  return (
    isRecord(value) &&
    typeof value.clientEventId === 'string' &&
    typeof value.eventType === 'string' &&
    (typeof value.domain === 'string' || value.domain === null) &&
    typeof value.occurredAt === 'string'
  );
}

function isFlushState(value: unknown): value is FlushState {
  return (
    isRecord(value) &&
    typeof value.failureCount === 'number' &&
    typeof value.nextFlushAt === 'number' &&
    (value.lastFlushAt === null || typeof value.lastFlushAt === 'number') &&
    (value.lastError === null || typeof value.lastError === 'string') &&
    typeof value.reconnectRequired === 'boolean'
  );
}

export async function readConnection(): Promise<Connection | null> {
  const stored = await chrome.storage.local.get(CONNECTION_KEY);
  const value = stored[CONNECTION_KEY];
  return isConnection(value) ? value : null;
}

export async function writeConnection(connection: Connection): Promise<void> {
  await chrome.storage.local.set({ [CONNECTION_KEY]: connection });
}

export async function readQueue(): Promise<QueueState> {
  const stored = await chrome.storage.local.get(QUEUE_KEY);
  const value = stored[QUEUE_KEY];
  if (isRecord(value) && Array.isArray(value.events)) {
    return {
      events: value.events.filter(isQueuedEvent).slice(-QUEUE_LIMIT),
      dropped: typeof value.dropped === 'number' ? value.dropped : 0,
    };
  }
  return { events: [], dropped: 0 };
}

async function writeQueue(queue: QueueState): Promise<void> {
  await chrome.storage.local.set({ [QUEUE_KEY]: queue });
}

export async function readFlushState(): Promise<FlushState> {
  const stored = await chrome.storage.local.get(FLUSH_KEY);
  const value = stored[FLUSH_KEY];
  return isFlushState(value) ? value : emptyFlushState();
}

export async function writeFlushState(state: FlushState): Promise<void> {
  await chrome.storage.local.set({ [FLUSH_KEY]: state });
}

let mutationChain: Promise<unknown> = Promise.resolve();

function withLock<T>(operation: () => Promise<T>): Promise<T> {
  const next = mutationChain.then(operation, operation);
  mutationChain = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

export async function enqueueEvent(
  eventType: MonitoredEventType,
  domain: string | null = null,
  tabId?: number,
): Promise<boolean> {
  const connection = await readConnection();
  if (!connection) {
    return false;
  }
  const event = newEvent(eventType, domain, tabId);
  await withLock(async () => {
    const queue = await readQueue();
    await writeQueue(appendEvent(queue, event));
  });
  return true;
}

export async function nextBatch(): Promise<QueuedEvent[]> {
  return takeBatch(await readQueue(), BATCH_SIZE);
}

export async function dropQueuedBatch(batch: QueuedEvent[]): Promise<void> {
  if (batch.length === 0) {
    return;
  }
  const ids = new Set(batch.map((event) => event.clientEventId));
  await withLock(async () => {
    const queue = await readQueue();
    await writeQueue({
      events: queue.events.filter((event) => !ids.has(event.clientEventId)),
      dropped: queue.dropped,
    });
  });
}

export async function resetQueue(): Promise<void> {
  await withLock(async () => {
    await writeQueue({ events: [], dropped: 0 });
  });
}

export async function clearConnectionState(): Promise<void> {
  await withLock(async () => {
    await chrome.storage.local.remove([CONNECTION_KEY, QUEUE_KEY, FLUSH_KEY]);
  });
}
