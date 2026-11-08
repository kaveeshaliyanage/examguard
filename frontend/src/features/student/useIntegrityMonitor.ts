import { useEffect, useRef } from 'react';
import { postIntegritySignal } from '../../api/attemptApi';
import { ApiError } from '../../api/client';
import type { IntegritySignal, IntegritySignalResponse } from '../../api/types';

export interface UseIntegrityMonitorArgs {
  attemptId: number;
  token: string;
  enabled?: boolean;
  /** Pause while a blocking dialog is open or the attempt has ended. */
  paused?: boolean;
  onSignal?: (result: IntegritySignalResponse, signal: IntegritySignal) => void;
  onError?: (error: unknown) => void;
}

interface Episode {
  key: string;
}

function newEpisodeKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Older runtimes: still unique per episode, just not RFC 4122.
  return `episode-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Watches the exam window for focus loss.
 *
 * A leave (tab hidden or window blur) opens one episode with a single UUID.
 * The matching return (visible or focus) closes that same episode. Listeners
 * are only attached after mount, so the initial render never records a signal,
 * and the episode guard makes duplicate blur/visibility events harmless under
 * React StrictMode.
 */
export function useIntegrityMonitor({
  attemptId,
  token,
  enabled = true,
  paused = false,
  onSignal,
  onError,
}: UseIntegrityMonitorArgs): void {
  const episodeRef = useRef<Episode | null>(null);
  const inFlightRef = useRef<Promise<void> | null>(null);
  const signalRef = useRef(onSignal);
  signalRef.current = onSignal;
  const errorRef = useRef(onError);
  errorRef.current = onError;
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!enabled || paused) {
      return undefined;
    }

    const send = (episodeKey: string, signal: IntegritySignal, occurredAt: string) => {
      const request = postIntegritySignal(attemptId, token, episodeKey, signal, occurredAt)
        .then((result) => {
          if (mountedRef.current) {
            signalRef.current?.(result, signal);
          }
        })
        .catch((caught: unknown) => {
          if (caught instanceof ApiError && caught.status === 401) {
            return;
          }
          if (mountedRef.current) {
            errorRef.current?.(caught);
          }
        });
      inFlightRef.current = request;
      return request;
    };

    const leave = () => {
      if (episodeRef.current) {
        return;
      }
      const episode: Episode = { key: newEpisodeKey() };
      episodeRef.current = episode;
      send(episode.key, 'FOCUS_LOSS', new Date().toISOString());
    };

    const returnToExam = () => {
      const episode = episodeRef.current;
      if (!episode) {
        return;
      }
      episodeRef.current = null;
      const occurredAt = new Date().toISOString();
      // Close the episode only after the leave has settled: the server dedupes on
      // (attemptId, episodeKey), so overlapping requests would race the unique key.
      const pending = inFlightRef.current;
      if (pending) {
        void pending.then(() => send(episode.key, 'FOCUS_RETURN', occurredAt));
      } else {
        send(episode.key, 'FOCUS_RETURN', occurredAt);
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        leave();
      } else {
        returnToExam();
      }
    };
    const onBlur = () => leave();
    const onFocus = () => returnToExam();

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      episodeRef.current = null;
      inFlightRef.current = null;
    };
  }, [attemptId, enabled, paused, token]);
}
