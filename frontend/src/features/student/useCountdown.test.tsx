import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCountdown } from './useCountdown';

describe('useCountdown', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-01T09:59:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses the server offset and triggers exactly one auto-submit at zero', () => {
    const onExpire = vi.fn();
    const { result } = renderHook(() =>
      useCountdown({
        startedAt: '2026-11-01T09:59:00Z',
        durationMinutes: 2,
        serverNow: '2026-11-01T10:00:00Z',
        onExpire,
      }),
    );

    expect(result.current.label).toBe('1:00');

    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(result.current.label).toBe('0:00');
    expect(onExpire).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(onExpire).toHaveBeenCalledTimes(1);
  });
});
