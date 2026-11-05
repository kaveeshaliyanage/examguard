import { postEvents } from './api';
import { flushQueue } from './flush';
import { normalizeDomain } from './domains';
import {
  clearConnectionState,
  dropQueuedBatch,
  emptyFlushState,
  enqueueEvent,
  readConnection,
  readFlushState,
  readQueue,
  resetQueue,
  writeFlushState,
} from './storage';

const FLUSH_ALARM = 'examguard-flush';
const HEARTBEAT_ALARM = 'examguard-heartbeat';
const NAVIGATION_DEDUPE_MS = 10_000;

const lastNavigationAt = new Map<string, number>();
let flushing = false;

async function ensureAlarms(): Promise<void> {
  const flush = await chrome.alarms.get(FLUSH_ALARM);
  if (!flush) {
    chrome.alarms.create(FLUSH_ALARM, { periodInMinutes: 0.5 });
  }
  const heartbeat = await chrome.alarms.get(HEARTBEAT_ALARM);
  if (!heartbeat) {
    chrome.alarms.create(HEARTBEAT_ALARM, { periodInMinutes: 1 });
  }
}

async function runFlush(): Promise<void> {
  if (flushing) {
    return;
  }
  flushing = true;
  try {
    await flushQueue({
      getConnection: readConnection,
      getQueue: readQueue,
      dropBatch: dropQueuedBatch,
      getFlushState: readFlushState,
      setFlushState: writeFlushState,
      send: postEvents,
      now: () => Date.now(),
    });
  } finally {
    flushing = false;
  }
}

async function onNavigation(tabId: number, rawUrl: string | undefined): Promise<void> {
  if (!rawUrl) {
    return;
  }
  const domain = normalizeDomain(rawUrl);
  if (!domain) {
    return;
  }
  const key = `${tabId}|${domain}`;
  const now = Date.now();
  const previous = lastNavigationAt.get(key);
  if (previous !== undefined && now - previous < NAVIGATION_DEDUPE_MS) {
    return;
  }
  lastNavigationAt.set(key, now);
  const queued = await enqueueEvent('NAVIGATION', domain, tabId);
  if (queued) {
    await runFlush();
  }
}

async function onFocusChanged(windowId: number): Promise<void> {
  const connection = await readConnection();
  if (!connection) {
    return;
  }
  await enqueueEvent(windowId === chrome.windows.WINDOW_ID_NONE ? 'TAB_HIDDEN' : 'TAB_VISIBLE');
  await runFlush();
}

async function onHeartbeat(): Promise<void> {
  const connection = await readConnection();
  if (!connection) {
    return;
  }
  await enqueueEvent('HEARTBEAT');
  await runFlush();
}

async function handleConnect(reset: boolean): Promise<void> {
  const connection = await readConnection();
  if (!connection) {
    return;
  }
  if (reset) {
    await resetQueue();
  }
  await writeFlushState(emptyFlushState());
  await enqueueEvent('EXTENSION_CONNECTED');
  await runFlush();
}

async function handleDisconnect(): Promise<void> {
  const connection = await readConnection();
  if (connection) {
    await enqueueEvent('EXTENSION_DISCONNECTED');
    await writeFlushState(emptyFlushState());
    await runFlush();
  }
  await clearConnectionState();
}

chrome.runtime.onInstalled.addListener(() => {
  void ensureAlarms();
});

chrome.runtime.onStartup.addListener(() => {
  void ensureAlarms();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === FLUSH_ALARM) {
    void runFlush();
  } else if (alarm.name === HEARTBEAT_ALARM) {
    void onHeartbeat();
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url) {
    void onNavigation(tabId, changeInfo.url);
  }
});

chrome.windows.onFocusChanged.addListener((windowId) => {
  void onFocusChanged(windowId);
});

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (typeof message !== 'object' || message === null) {
    return false;
  }
  const record = message as Record<string, unknown>;
  if (record.type === 'examguard:connect') {
    void handleConnect(record.reset === true).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (record.type === 'examguard:disconnect') {
    void handleDisconnect().then(() => sendResponse({ ok: true }));
    return true;
  }
  return false;
});

void ensureAlarms();
