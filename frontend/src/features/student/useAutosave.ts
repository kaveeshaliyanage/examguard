import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError } from '../../api/client';
import { saveAnswer } from '../../api/attemptApi';
import type { AnswerView } from '../../api/types';

export type SaveStatus = 'saved' | 'dirty' | 'saving' | 'error';

export interface DraftAnswer {
  text: string;
  selectedOptions: string[];
  revisionNo: number;
  savedAt: string | null;
  status: SaveStatus;
}

interface AutosaveEntry {
  text: string;
  selectedOptions: string[];
  revisionNo: number;
  savedAt: string | null;
  status: SaveStatus;
  seq: number;
  lastSavedText: string;
  lastSavedOptions: string[];
  debounceTimer: ReturnType<typeof setTimeout> | null;
  retryTimer: ReturnType<typeof setTimeout> | null;
  inFlight: Promise<void> | null;
  retryCount: number;
  halted: boolean;
  disposed: boolean;
}

export interface UseAutosaveArgs {
  attemptId: number;
  token: string;
  initialAnswers: AnswerView[];
  enabled?: boolean;
  debounceMs?: number;
  maxRetries?: number;
  onUnauthorized?: () => void;
  onSaveStopped?: (error: ApiError, questionId: number) => void;
}

export interface UseAutosaveResult {
  answers: Record<number, DraftAnswer>;
  setAnswer: (questionId: number, text: string, selectedOptions?: string[]) => void;
  flush: (questionId: number) => Promise<void>;
  flushAll: () => Promise<void>;
  overallStatus: SaveStatus;
  lastSavedAt: string | null;
  hasUnsavedChanges: boolean;
  halted: boolean;
}

function sameOptions(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  const left = [...a].sort();
  const right = [...b].sort();
  return left.every((value, index) => value === right[index]);
}

function entryFrom(answer: AnswerView): AutosaveEntry {
  const selectedOptions = answer.selectedOptions ?? [];
  return {
    text: answer.text,
    selectedOptions,
    revisionNo: answer.revisionNo,
    savedAt: answer.savedAt,
    status: 'saved',
    seq: 0,
    lastSavedText: answer.text,
    lastSavedOptions: [...selectedOptions],
    debounceTimer: null,
    retryTimer: null,
    inFlight: null,
    retryCount: 0,
    halted: false,
    disposed: false,
  };
}

function isUpToDate(entry: AutosaveEntry): boolean {
  return entry.text === entry.lastSavedText && sameOptions(entry.selectedOptions, entry.lastSavedOptions);
}

export function useAutosave({
  attemptId,
  token,
  initialAnswers,
  enabled = true,
  debounceMs = 800,
  maxRetries = 5,
  onUnauthorized,
  onSaveStopped,
}: UseAutosaveArgs): UseAutosaveResult {
  const entries = useRef<Map<number, AutosaveEntry>>(
    new Map(initialAnswers.map((answer) => [answer.questionId, entryFrom(answer)])),
  );
  const [drafts, setDrafts] = useState<Record<number, DraftAnswer>>(() =>
    Object.fromEntries(
      initialAnswers.map((answer) => [
        answer.questionId,
        {
          text: answer.text,
          selectedOptions: answer.selectedOptions ?? [],
          revisionNo: answer.revisionNo,
          savedAt: answer.savedAt,
          status: 'saved' as SaveStatus,
        },
      ]),
    ),
  );
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const unauthorizedRef = useRef(onUnauthorized);
  unauthorizedRef.current = onUnauthorized;
  const stoppedRef = useRef(onSaveStopped);
  stoppedRef.current = onSaveStopped;

  const patch = useCallback((questionId: number, next: Partial<DraftAnswer>) => {
    setDrafts((previous) => {
      const current = previous[questionId];
      if (!current) {
        return previous;
      }
      return { ...previous, [questionId]: { ...current, ...next } };
    });
  }, []);

  const performSave = useCallback(
    (questionId: number): Promise<void> => {
      const entry = entries.current.get(questionId);
      if (!entry || entry.disposed || entry.halted || !enabledRef.current) {
        return Promise.resolve();
      }
      if (entry.inFlight) {
        return entry.inFlight;
      }
      if (isUpToDate(entry)) {
        return Promise.resolve();
      }
      if (entry.retryTimer) {
        clearTimeout(entry.retryTimer);
        entry.retryTimer = null;
      }
      entry.seq += 1;
      const seq = entry.seq;
      const text = entry.text;
      const selectedOptions = [...entry.selectedOptions];

      entry.status = 'saving';
      const run = (async () => {
        patch(questionId, { status: 'saving' });
        try {
          const saved =
            selectedOptions.length > 0
              ? await saveAnswer(attemptId, token, questionId, text, seq, selectedOptions)
              : await saveAnswer(attemptId, token, questionId, text, seq);
          if (entry.disposed) {
            return;
          }
          entry.revisionNo = saved.revisionNo;
          entry.savedAt = saved.savedAt;
          entry.lastSavedText = text;
          entry.lastSavedOptions = selectedOptions;
          entry.retryCount = 0;
          entry.status = isUpToDate(entry) ? 'saved' : 'dirty';
          patch(questionId, {
            status: entry.status,
            revisionNo: saved.revisionNo,
            savedAt: saved.savedAt,
          });
        } catch (caught) {
          if (entry.disposed) {
            return;
          }
          entry.status = 'error';
          patch(questionId, { status: 'error' });
          if (caught instanceof ApiError && caught.status === 401) {
            entry.halted = true;
            unauthorizedRef.current?.();
            return;
          }
          // 409/410 mean the attempt can no longer accept edits. Retrying cannot help.
          if (caught instanceof ApiError && (caught.status === 409 || caught.status === 410)) {
            entry.halted = true;
            stoppedRef.current?.(caught, questionId);
            return;
          }
          if (entry.retryCount >= Math.max(1, maxRetries) - 1) {
            entry.halted = true;
            const exhausted = new ApiError(
              caught instanceof ApiError ? caught.status : 0,
              'Autosave stopped after repeated failures. Your latest text is still in this tab.',
              'autosave',
              'network',
            );
            stoppedRef.current?.(exhausted, questionId);
            return;
          }
          entry.retryCount += 1;
          const delay = Math.min(1000 * 2 ** (entry.retryCount - 1), 10_000);
          entry.retryTimer = setTimeout(() => {
            entry.retryTimer = null;
            void performSaveRef.current(questionId);
          }, delay);
        } finally {
          entry.inFlight = null;
        }
      })();

      entry.inFlight = run;
      void run.then(() => {
        const current = entries.current.get(questionId);
        if (current && !current.halted && !isUpToDate(current) && current.status !== 'error') {
          void performSaveRef.current(questionId);
        }
      });
      return run;
    },
    [attemptId, maxRetries, patch, token],
  );

  const performSaveRef = useRef(performSave);
  performSaveRef.current = performSave;

  const scheduleSave = useCallback((questionId: number) => {
    const entry = entries.current.get(questionId);
    if (!entry || entry.disposed || entry.halted) {
      return;
    }
    if (entry.debounceTimer) {
      clearTimeout(entry.debounceTimer);
    }
    entry.debounceTimer = setTimeout(() => {
      entry.debounceTimer = null;
      void performSaveRef.current(questionId);
    }, debounceMs);
  }, [debounceMs]);

  const setAnswer = useCallback(
    (questionId: number, text: string, selectedOptions?: string[]) => {
      const entry = entries.current.get(questionId);
      if (!entry || entry.disposed) {
        return;
      }
      entry.text = text;
      if (selectedOptions) {
        entry.selectedOptions = [...selectedOptions];
      }
      entry.status = isUpToDate(entry) ? 'saved' : 'dirty';
      patch(questionId, {
        text,
        selectedOptions: entry.selectedOptions,
        status: entry.status,
      });
      if (!enabledRef.current || entry.halted || isUpToDate(entry)) {
        return;
      }
      scheduleSave(questionId);
    },
    [patch, scheduleSave],
  );

  const flush = useCallback((questionId: number): Promise<void> => {
    const entry = entries.current.get(questionId);
    if (!entry) {
      return Promise.resolve();
    }
    if (entry.debounceTimer) {
      clearTimeout(entry.debounceTimer);
      entry.debounceTimer = null;
    }
    return performSaveRef.current(questionId);
  }, []);

  const flushAll = useCallback(async () => {
    const pending = [...entries.current.keys()].map((questionId) => flush(questionId));
    await Promise.all(pending);
  }, [flush]);

  useEffect(() => {
    const flushAllRef = () => {
      void flushAll();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        flushAllRef();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flushAllRef);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flushAllRef);
    };
  }, [flushAll]);

  useEffect(() => {
    const current = entries.current;
    // React StrictMode remounts effects in development; a fresh mount must not inherit the
    // disposed flag set by the simulated cleanup.
    current.forEach((entry) => {
      entry.disposed = false;
    });
    return () => {
      current.forEach((entry) => {
        entry.disposed = true;
        if (entry.debounceTimer) {
          clearTimeout(entry.debounceTimer);
        }
        if (entry.retryTimer) {
          clearTimeout(entry.retryTimer);
        }
      });
    };
  }, []);

  const overallStatus = useMemo<SaveStatus>(() => {
    const statuses = Object.values(drafts).map((draft) => draft.status);
    if (statuses.includes('error')) {
      return 'error';
    }
    if (statuses.includes('saving')) {
      return 'saving';
    }
    if (statuses.includes('dirty')) {
      return 'dirty';
    }
    return 'saved';
  }, [drafts]);

  const lastSavedAt = useMemo(() => {
    const values = Object.values(drafts)
      .map((draft) => draft.savedAt)
      .filter((value): value is string => typeof value === 'string');
    return values.length === 0 ? null : values.sort().at(-1) ?? null;
  }, [drafts]);

  const hasUnsavedChanges = useMemo(
    () =>
      [...entries.current.values()].some(
        (entry) => !entry.halted && !entry.disposed && !isUpToDate(entry),
      ),
    // Recompute whenever a draft is patched.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [drafts],
  );

  const halted = useMemo(
    () => [...entries.current.values()].some((entry) => entry.halted),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [drafts],
  );

  return {
    answers: drafts,
    setAnswer,
    flush,
    flushAll,
    overallStatus,
    lastSavedAt,
    hasUnsavedChanges,
    halted,
  };
}
