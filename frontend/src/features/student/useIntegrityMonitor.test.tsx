import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { IntegritySignalResponse } from '../../api/types';
import { useIntegrityMonitor } from './useIntegrityMonitor';

const { postIntegritySignalMock } = vi.hoisted(() => ({ postIntegritySignalMock: vi.fn() }));

vi.mock('../../api/attemptApi', () => ({ postIntegritySignal: postIntegritySignalMock }));

function response(strikeCount: number): IntegritySignalResponse {
  return {
    strikeCount,
    maxStrikes: 3,
    terminated: strikeCount >= 3,
    status: strikeCount >= 3 ? 'TERMINATED' : 'IN_PROGRESS',
  };
}

describe('useIntegrityMonitor', () => {
  it('closes an episode only after the recorded leave has settled', async () => {
    let resolveLoss!: (value: IntegritySignalResponse) => void;
    const loss = new Promise<IntegritySignalResponse>((resolve) => {
      resolveLoss = resolve;
    });
    postIntegritySignalMock.mockReset();
    postIntegritySignalMock.mockReturnValueOnce(loss).mockResolvedValueOnce(response(1));

    const onSignal = vi.fn();
    renderHook(() => useIntegrityMonitor({ attemptId: 9, token: 'token', onSignal }));

    act(() => {
      window.dispatchEvent(new Event('blur'));
    });
    expect(postIntegritySignalMock).toHaveBeenCalledTimes(1);
    expect(postIntegritySignalMock.mock.calls[0]?.[3]).toBe('FOCUS_LOSS');

    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(postIntegritySignalMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveLoss(response(1));
      await loss;
    });
    expect(postIntegritySignalMock).toHaveBeenCalledTimes(2);
    expect(postIntegritySignalMock.mock.calls[1]?.[3]).toBe('FOCUS_RETURN');
    expect(postIntegritySignalMock.mock.calls[1]?.[2]).toBe(
      postIntegritySignalMock.mock.calls[0]?.[2],
    );
    expect(onSignal).toHaveBeenCalledTimes(2);
  });

  it('records one leave per episode even when blur repeats', () => {
    postIntegritySignalMock.mockReset();
    postIntegritySignalMock.mockResolvedValue(response(1));

    renderHook(() => useIntegrityMonitor({ attemptId: 9, token: 'token' }));

    act(() => {
      window.dispatchEvent(new Event('blur'));
      window.dispatchEvent(new Event('blur'));
    });
    expect(postIntegritySignalMock).toHaveBeenCalledTimes(1);
  });

  it('does not listen while paused', () => {
    postIntegritySignalMock.mockReset();
    renderHook(() => useIntegrityMonitor({ attemptId: 9, token: 'token', paused: true }));

    act(() => {
      window.dispatchEvent(new Event('blur'));
    });
    expect(postIntegritySignalMock).not.toHaveBeenCalled();
  });
});
