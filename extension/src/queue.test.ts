import { describe, expect, it } from 'vitest';
import { appendEvent, BATCH_SIZE, dropBatch, newEvent, QUEUE_LIMIT, takeBatch } from './queue';

describe('event queue', () => {
  it('drops the oldest events when the local cap is exceeded', () => {
    let queue = { events: [] as ReturnType<typeof newEvent>[], dropped: 0 };
    for (let index = 0; index < QUEUE_LIMIT + 1; index += 1) {
      queue = appendEvent(queue, { ...newEvent('HEARTBEAT'), clientEventId: `event-${index}` });
    }
    expect(queue.events).toHaveLength(QUEUE_LIMIT);
    expect(queue.dropped).toBe(1);
    expect(queue.events[0]?.clientEventId).toBe('event-1');
  });

  it('takes and removes batches of at most twenty', () => {
    const events = Array.from({ length: 45 }, (_, index) => ({
      ...newEvent('HEARTBEAT'),
      clientEventId: `event-${index}`,
    }));
    const queue = { events, dropped: 0 };
    const batch = takeBatch(queue);
    expect(batch).toHaveLength(BATCH_SIZE);
    expect(batch[0]?.clientEventId).toBe('event-0');

    const remaining = dropBatch(queue, batch);
    expect(remaining.events).toHaveLength(45 - BATCH_SIZE);
    expect(remaining.events[0]?.clientEventId).toBe('event-20');
  });

  it('creates events without any page content or URL', () => {
    const event = newEvent('NAVIGATION', 'example.com', 3);
    expect(event).toMatchObject({ eventType: 'NAVIGATION', domain: 'example.com', tabId: 3 });
    expect(Object.keys(event).sort()).toEqual(
      ['clientEventId', 'domain', 'eventType', 'occurredAt', 'tabId'].sort(),
    );
  });
});
