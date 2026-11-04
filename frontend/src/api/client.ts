export type TokenScope = 'staff' | 'attempt';

export type ApiErrorKind = 'http' | 'network' | 'shape';

export class ApiError extends Error {
  readonly status: number;
  readonly path: string;
  readonly kind: ApiErrorKind;

  constructor(status: number, message: string, path: string, kind: ApiErrorKind = 'http') {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.path = path;
    this.kind = kind;
  }
}

export const API_BASE: string = import.meta.env.VITE_API_BASE ?? '/api';

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  token?: string | null;
  scope?: TokenScope;
  signal?: AbortSignal;
  validate?: (value: unknown) => boolean;
}

const DEFAULT_ERROR = 'Request failed. Please retry.';

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error;
    }
    throw new ApiError(0, 'Network unavailable. Check your connection and retry.', path, 'network');
  }

  const payload = await readJson(response);

  if (response.status === 401) {
    window.dispatchEvent(
      new CustomEvent('examguard:unauthorized', {
        detail: { path, scope: options.scope ?? 'staff' },
      }),
    );
  }

  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === 'string' && payload.message.length > 0
        ? payload.message
        : response.status >= 500
          ? 'The server could not complete the request. Please retry.'
          : DEFAULT_ERROR;
    throw new ApiError(response.status, message, path);
  }

  if (options.validate && !options.validate(payload)) {
    throw new ApiError(
      response.status,
      'The server returned an unexpected response shape.',
      path,
      'shape',
    );
  }

  return payload as T;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function isArrayOf(value: unknown, guard: (item: unknown) => boolean): boolean {
  return Array.isArray(value) && value.every(guard);
}

export function isUser(value: unknown): boolean {
  return (
    isRecord(value) &&
    isNumber(value.id) &&
    isString(value.email) &&
    isString(value.displayName) &&
    isString(value.role)
  );
}

export function isLoginResponse(value: unknown): boolean {
  return isRecord(value) && isString(value.token) && isUser(value.user);
}

export function isJoinResponse(value: unknown): boolean {
  return (
    isRecord(value) &&
    isNumber(value.attemptId) &&
    isString(value.sessionToken) &&
    isString(value.collectorToken) &&
    isString(value.startedAt) &&
    isString(value.serverNow) &&
    isRecord(value.exam) &&
    Array.isArray(value.answers)
  );
}

export function isFindingDetail(value: unknown): boolean {
  return (
    isRecord(value) &&
    isNumber(value.id) &&
    isString(value.type) &&
    isNumber(value.priorityScore) &&
    isString(value.priorityBand) &&
    isString(value.status) &&
    isString(value.candidateA) &&
    Array.isArray(value.evidence) &&
    Array.isArray(value.decisions)
  );
}

export function isExamList(value: unknown): boolean {
  return isArrayOf(
    value,
    (item) =>
      isRecord(item) &&
      isNumber(item.id) &&
      isString(item.code) &&
      isString(item.title) &&
      isString(item.status),
  );
}
