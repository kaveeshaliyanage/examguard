import { describe, expect, it } from 'vitest';
import { attemptIdFromToken } from './auth';

function token(payload: Record<string, unknown>): string {
  const encode = (value: unknown) =>
    btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(payload)}.signature`;
}

describe('attemptIdFromToken', () => {
  it('reads the attempt id from a student token', () => {
    expect(attemptIdFromToken(token({ sub: '42', role: 'STUDENT' }))).toBe(42);
    expect(attemptIdFromToken(token({ sub: 7, role: 'STUDENT' }))).toBe(7);
  });

  it('rejects staff tokens, malformed tokens and missing subjects', () => {
    expect(attemptIdFromToken(token({ sub: '42', role: 'LECTURER' }))).toBeNull();
    expect(attemptIdFromToken(token({ role: 'STUDENT' }))).toBeNull();
    expect(attemptIdFromToken(token({ sub: '0', role: 'STUDENT' }))).toBeNull();
    expect(attemptIdFromToken('not-a-token')).toBeNull();
    expect(attemptIdFromToken('a.%%%.c')).toBeNull();
  });
});
