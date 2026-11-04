export type MonitoredEventType =
  | 'NAVIGATION'
  | 'HEARTBEAT'
  | 'TAB_HIDDEN'
  | 'TAB_VISIBLE'
  | 'EXTENSION_CONNECTED'
  | 'EXTENSION_DISCONNECTED';

export interface Connection {
  apiBase: string;
  token: string;
  attemptId: number;
  connectedAt: string;
}

export interface QueuedEvent {
  clientEventId: string;
  eventType: MonitoredEventType;
  domain: string | null;
  occurredAt: string;
  tabId?: number;
}

export interface QueueState {
  events: QueuedEvent[];
  dropped: number;
}

export interface FlushState {
  failureCount: number;
  nextFlushAt: number;
  lastFlushAt: number | null;
  lastError: string | null;
  reconnectRequired: boolean;
}

export interface EventAck {
  accepted: number;
  duplicates: number;
  rejected: number;
}
