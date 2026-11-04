function decodeBase64Url(value: string): string {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  return atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='));
}

/** Reads the attempt id from the collector JWT without trusting it for authorisation. */
export function attemptIdFromToken(token: string): number | null {
  const parts = token.trim().split('.');
  if (parts.length !== 3) {
    return null;
  }
  const payloadPart = parts[1];
  if (!payloadPart) {
    return null;
  }
  try {
    const payload: unknown = JSON.parse(decodeBase64Url(payloadPart));
    if (typeof payload !== 'object' || payload === null) {
      return null;
    }
    const record = payload as Record<string, unknown>;
    if (record.role !== undefined && record.role !== 'STUDENT') {
      return null;
    }
    const raw = record.sub;
    const id = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
    return Number.isInteger(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}
