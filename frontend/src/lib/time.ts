export function serverOffsetMs(serverNow: string, localNow: number = Date.now()): number {
  const parsed = Date.parse(serverNow);
  return Number.isNaN(parsed) ? 0 : parsed - localNow;
}

export function deadlineMs(startedAt: string, durationMinutes: number): number {
  return Date.parse(startedAt) + durationMinutes * 60_000;
}

export function remainingMs(
  deadline: number,
  offsetMs: number,
  localNow: number = Date.now(),
): number {
  return Math.max(0, deadline - (localNow + offsetMs));
}

export function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value: number) => value.toString().padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

export function clockTime(value: Date = new Date()): string {
  return value.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
