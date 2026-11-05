import type { MonitoredEventType, QueuedEvent } from './types';

export const QUEUE_LIMIT = 500;
export const BATCH_SIZE = 20;

export function newEvent(
  eventType: MonitoredEventType,
  domain: string | null = null,
  tabId?: number,
): QueuedEvent {
  return {
    clientEventId: crypto.randomUUID(),
    eventType,
    domain,
    occurredAt: new Date().toISOString(),
    ...(tabId === undefined ? {} : { tabId }),
  };
}

export function appendEvent(
  queue: { events: QueuedEvent[]; dropped: number },
  event: QueuedEvent,
  limit: number = QUEUE_LIMIT,
): { events: QueuedEvent[]; dropped: number } {
  const events = [...queue.events, event];
  let dropped = queue.dropped;
  while (events.length > limit) {
    events.shift();
    dropped += 1;
  }
  return { events, dropped };
}

export function takeBatch(queue: { events: QueuedEvent[] }, size: number = BATCH_SIZE): QueuedEvent[] {
  return queue.events.slice(0, size);
}

export function dropBatch(
  queue: { events: QueuedEvent[]; dropped: number },
  batch: QueuedEvent[],
): { events: QueuedEvent[]; dropped: number } {
  const sent = new Set(batch.map((event) => event.clientEventId));
  return { events: queue.events.filter((event) => !sent.has(event.clientEventId)), dropped: queue.dropped };
}
