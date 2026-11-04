import { attemptIdFromToken } from './auth';
import { normalizeApiBase } from './domains';
import { readConnection, readFlushState, readQueue, writeConnection } from './storage';
import type { Connection } from './types';

function mustGet<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing element #${id}`);
  }
  return element as T;
}

const form = mustGet<HTMLFormElement>('connection-form');
const apiInput = mustGet<HTMLInputElement>('api-base');
const tokenInput = mustGet<HTMLTextAreaElement>('token');
const connectButton = mustGet<HTMLButtonElement>('connect');
const disconnectButton = mustGet<HTMLButtonElement>('disconnect');
const status = mustGet<HTMLElement>('status');
const statusLabel = mustGet<HTMLElement>('status-label');
const statusDetail = mustGet<HTMLElement>('status-detail');
const message = mustGet<HTMLElement>('message');

async function renderStatus(): Promise<void> {
  const connection = await readConnection();
  status.classList.remove('connected', 'warning');
  statusDetail.textContent = '';
  message.textContent = '';
  disconnectButton.disabled = connection === null;

  if (!connection) {
    statusLabel.textContent = 'Not connected';
    statusDetail.textContent = 'Paste the connection token shown on your exam page.';
    return;
  }

  const [queue, flush] = await Promise.all([readQueue(), readFlushState()]);
  statusLabel.textContent = `Attempt #${connection.attemptId}`;
  if (flush.reconnectRequired) {
    status.classList.add('warning');
    statusDetail.textContent =
      `Reconnect required: the server rejected this token.\n` +
      `${queue.events.length} event(s) are kept locally until you reconnect.`;
    return;
  }

  status.classList.add('connected');
  const parts = [`${queue.events.length} event(s) queued locally`];
  if (queue.dropped > 0) {
    parts.push(`${queue.dropped} oldest event(s) dropped at the local limit`);
  }
  if (flush.lastFlushAt) {
    parts.push(`Last upload ${new Date(flush.lastFlushAt).toLocaleTimeString()}`);
  }
  if (flush.lastError) {
    parts.push(flush.lastError);
  }
  statusDetail.textContent = parts.join('\n');
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  void (async () => {
    connectButton.disabled = true;
    try {
      await connect();
    } finally {
      connectButton.disabled = false;
    }
  })();
});

async function connect(): Promise<void> {
  const apiBase = normalizeApiBase(apiInput.value);
  if (!apiBase) {
    message.textContent = 'Enter a valid http(s) API base URL without query parameters.';
    return;
  }
  const token = tokenInput.value.trim();
  const attemptId = attemptIdFromToken(token);
  if (attemptId === null) {
    message.textContent = 'This is not a valid attempt connection token.';
    return;
  }

  const previous = await readConnection();
  const reset =
    previous === null ||
    previous.apiBase !== apiBase ||
    previous.token !== token ||
    previous.attemptId !== attemptId;

  const connection: Connection = {
    apiBase,
    token,
    attemptId,
    connectedAt: new Date().toISOString(),
  };
  await writeConnection(connection);
  try {
    await chrome.runtime.sendMessage({ type: 'examguard:connect', reset });
    message.textContent = reset
      ? 'Connected. Monitoring is running.'
      : 'Reconnected with the same attempt. Queued events were kept.';
  } catch {
    message.textContent = 'Saved the connection, but the background worker did not respond.';
  }
  await renderStatus();
}

disconnectButton.addEventListener('click', () => {
  disconnectButton.disabled = true;
  void (async () => {
    try {
      await chrome.runtime.sendMessage({ type: 'examguard:disconnect' });
    } catch {
      message.textContent = 'The background worker did not respond. Reload the extension.';
    }
    apiInput.value = '';
    tokenInput.value = '';
    await renderStatus();
    message.textContent = 'Disconnected. Local monitoring data was removed.';
  })();
});

void (async () => {
  const connection = await readConnection();
  if (connection) {
    apiInput.value = connection.apiBase;
    tokenInput.value = connection.token;
  }
  await renderStatus();
})();
