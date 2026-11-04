import { act, renderHook } from '@testing-library/react';
import { StrictMode, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SaveAnswerResponse } from '../../api/types';
import { useAutosave } from './useAutosave';

const { saveAnswerMock } = vi.hoisted(() => ({ saveAnswerMock: vi.fn() }));

vi.mock('../../api/attemptApi', () => ({ saveAnswer: saveAnswerMock }));

const initialAnswers = [{ questionId: 101, text: '', revisionNo: 0, savedAt: null }];

function saved(revisionNo: number): SaveAnswerResponse {
  return {
    questionId: 101,
    revisionNo,
    savedAt: '2026-11-01T09:20:00Z',
    wordCount: 2,
  };
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe('useAutosave', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    saveAnswerMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('debounces, sends increasing client sequences and keeps text after a failure', async () => {
    saveAnswerMock.mockResolvedValueOnce(saved(1)).mockResolvedValueOnce(saved(2));
    const { result } = renderHook(() =>
      useAutosave({ attemptId: 7, token: 'token', initialAnswers }),
    );

    act(() => result.current.setAnswer(101, 'first response'));
    expect(saveAnswerMock).not.toHaveBeenCalled();

    await advance(800);
    expect(saveAnswerMock).toHaveBeenCalledTimes(1);
    expect(saveAnswerMock.mock.calls[0]).toEqual([7, 'token', 101, 'first response', 1]);
    expect(result.current.answers[101]?.status).toBe('saved');

    act(() => result.current.setAnswer(101, 'second response'));
    await advance(800);
    expect(saveAnswerMock).toHaveBeenCalledTimes(2);
    expect(saveAnswerMock.mock.calls[1]).toEqual([7, 'token', 101, 'second response', 2]);

    saveAnswerMock.mockRejectedValueOnce(new Error('offline'));
    act(() => result.current.setAnswer(101, 'third response stays local'));
    await advance(800);
    expect(result.current.answers[101]?.text).toBe('third response stays local');
    expect(result.current.answers[101]?.status).toBe('error');
    expect(result.current.overallStatus).toBe('error');
  });

  it('flushes immediately on demand instead of waiting for the debounce', async () => {
    saveAnswerMock.mockResolvedValueOnce(saved(1));
    const { result } = renderHook(() =>
      useAutosave({ attemptId: 7, token: 'token', initialAnswers }),
    );

    act(() => result.current.setAnswer(101, 'blurred answer'));
    await act(async () => {
      await result.current.flush(101);
    });
    expect(saveAnswerMock).toHaveBeenCalledTimes(1);
    expect(result.current.answers[101]?.status).toBe('saved');
  });

  it('keeps saving after the StrictMode development remount', async () => {
    saveAnswerMock.mockResolvedValueOnce(saved(1));
    const wrapper = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>;
    const { result } = renderHook(
      () => useAutosave({ attemptId: 7, token: 'token', initialAnswers }),
      { wrapper },
    );

    act(() => result.current.setAnswer(101, 'typed after remount'));
    await advance(800);
    expect(saveAnswerMock).toHaveBeenCalledTimes(1);
    expect(result.current.answers[101]?.text).toBe('typed after remount');
    expect(result.current.answers[101]?.status).toBe('saved');
  });
});
