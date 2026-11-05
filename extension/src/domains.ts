const WEB_PROTOCOLS = new Set(['http:', 'https:', 'ws:', 'wss:']);

/**
 * Only a bare hostname can leave the browser. The full URL never reaches storage or the network.
 * Internal pages, extension pages, files and empty values are ignored entirely.
 */
export function normalizeDomain(raw: string | null | undefined): string | null {
  if (!raw) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (!WEB_PROTOCOLS.has(url.protocol)) {
    return null;
  }
  let host = url.hostname.toLowerCase();
  while (host.endsWith('.')) {
    host = host.slice(0, -1);
  }
  if (host.startsWith('www.')) {
    host = host.slice(4);
  }
  return host.length > 0 ? host : null;
}

export function normalizeApiBase(raw: string): string | null {
  const value = raw.trim().replace(/\/+$/, '');
  if (!value) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return null;
  }
  if (url.username || url.password || url.search || url.hash) {
    return null;
  }
  return value;
}
