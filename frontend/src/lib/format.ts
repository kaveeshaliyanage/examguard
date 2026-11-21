const dateTime = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

const dateOnly = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

export function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return '—';
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : dateTime.format(date);
}

/** ISO instant to the `datetime-local` input value in the browser's time zone. */
export function toDateTimeLocalValue(value: string | null | undefined): string {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

/** `datetime-local` value (browser-local) to an ISO instant, or null when blank/invalid. */
export function fromDateTimeLocalValue(value: string): string | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function formatDate(value: string | null | undefined): string {
  if (!value) {
    return '—';
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : dateOnly.format(date);
}

export function formatPercent(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(1)}%` : '—';
}

export function formatDurationMinutes(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

export function humanize(value: string | null | undefined): string {
  if (!value) {
    return '—';
  }
  const lower = value.replaceAll('_', ' ').toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

export function coverageText(warning: boolean): string {
  return warning
    ? 'Monitoring data is incomplete. Missing observations are unknown, not clean.'
    : 'Monitoring coverage is within the configured threshold.';
}
