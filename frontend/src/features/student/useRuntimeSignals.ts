import { useEffect } from 'react';
import { postIntegritySignal } from '../../api/attemptApi';
import { ApiError } from '../../api/client';
import type { IntegritySignal } from '../../api/types';

export interface UseRuntimeSignalsArgs {
  attemptId: number;
  token: string;
  enabled?: boolean;
}

function key(suffix: string): string {
  return `runtime:${suffix}:${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36)}`;
}

/**
 * Records non-strike runtime signals: leaving full screen and losing the connection.
 * Each edge gets its own episode key so the "restored" event is not deduplicated away.
 * Signals never add a strike; they appear in the review record only.
 */
export function useRuntimeSignals({ attemptId, token, enabled = true }: UseRuntimeSignalsArgs): void {
  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    const send = (suffix: string, signal: IntegritySignal) => {
      postIntegritySignal(attemptId, token, key(suffix), signal, new Date().toISOString()).catch(
        (caught: unknown) => {
          // Signals are best effort: offline is expected while the network signal is firing.
          if (!(caught instanceof ApiError) || (caught.status !== 0 && caught.status !== 401)) {
            return;
          }
        },
      );
    };

    let leftFullscreen = false;
    const onFullscreen = () => {
      const active = document.fullscreenElement !== null;
      if (!active && !leftFullscreen) {
        leftFullscreen = true;
        send('fullscreen-exit', 'FULLSCREEN_EXIT');
      } else if (active) {
        leftFullscreen = false;
      }
    };

    let offline = navigator.onLine === false;
    const onOffline = () => {
      if (!offline) {
        offline = true;
        send('offline', 'NETWORK_LOST');
      }
    };
    const onOnline = () => {
      if (offline) {
        offline = false;
        send('online', 'NETWORK_RESTORED');
      }
    };

    document.addEventListener('fullscreenchange', onFullscreen);
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);

    return () => {
      document.removeEventListener('fullscreenchange', onFullscreen);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
    };
  }, [attemptId, enabled, token]);
}
