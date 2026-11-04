import type { Connection, EventAck, QueuedEvent } from './types';

export class UnauthorizedError extends Error {
  constructor() {
    super('The server rejected the connection token');
    this.name = 'UnauthorizedError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toApiEvent(event: QueuedEvent): Record<string, unknown> {
  return {
    clientEventId: event.clientEventId,
    eventType: event.eventType,
    occurredAt: event.occurredAt,
    ...(event.eventType === 'NAVIGATION' && event.domain ? { domain: event.domain } : {}),
    ...(event.tabId === undefined ? {} : { tabId: event.tabId }),
    metadata: {},
  };
}

export async function postEvents(
  connection: Connection,
  events: QueuedEvent[],
  fetchImpl: typeof fetch = fetch,
): Promise<EventAck> {
  const response = await fetchImpl(`${connection.apiBase}/attempts/${connection.attemptId}/events`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${connection.token}`,
    },
    body: JSON.stringify({ events: events.map(toApiEvent) }),
    signal: AbortSignal.timeout(15_000),
  });

  if (response.status === 401) {
    throw new UnauthorizedError();
  }
  if (!response.ok) {
    throw new Error(`Event upload failed with status ${response.status}`);
  }

  const payload: unknown = await response.json();
  if (
    !isRecord(payload) ||
    typeof payload.accepted !== 'number' ||
    typeof payload.duplicates !== 'number' ||
    typeof payload.rejected !== 'number'
  ) {
    throw new Error('Event upload returned an unexpected response shape');
  }
  return {
    accepted: payload.accepted,
    duplicates: payload.duplicates,
    rejected: payload.rejected,
  };
}
