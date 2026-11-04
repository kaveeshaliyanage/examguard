import { useEffect, useRef, useState } from 'react';
import { deadlineMs, formatCountdown, remainingMs, serverOffsetMs } from '../../lib/time';

export interface UseCountdownArgs {
  startedAt: string;
  durationMinutes: number;
  serverNow: string;
  enabled?: boolean;
  onExpire: () => void;
}

export interface CountdownState {
  remainingMs: number;
  label: string;
  warning: boolean;
  expired: boolean;
}

const WARNING_MS = 5 * 60_000;

export function useCountdown({
  startedAt,
  durationMinutes,
  serverNow,
  enabled = true,
  onExpire,
}: UseCountdownArgs): CountdownState {
  const offsetRef = useRef<number | null>(null);
  if (offsetRef.current === null) {
    offsetRef.current = serverOffsetMs(serverNow);
  }
  const deadline = deadlineMs(startedAt, durationMinutes);
  const [remaining, setRemaining] = useState(() =>
    remainingMs(deadline, offsetRef.current ?? 0),
  );
  const expireRef = useRef(onExpire);
  expireRef.current = onExpire;
  const firedRef = useRef(false);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }
    const offset = offsetRef.current ?? 0;
    const tick = () => {
      const next = remainingMs(deadline, offset);
      setRemaining(next);
      if (next <= 0 && !firedRef.current) {
        firedRef.current = true;
        expireRef.current();
      }
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [deadline, enabled]);

  return {
    remainingMs: remaining,
    label: formatCountdown(remaining),
    warning: remaining > 0 && remaining <= WARNING_MS,
    expired: remaining <= 0,
  };
}
