import type { PriorityBand } from '../api/types';

/**
 * Single source of truth for the ExamGuard design language.
 *
 * Everything is expressed on a 4px grid so an 8px rhythm falls out of using
 * `spacing.sm`, `spacing.md`, `spacing.lg` and friends.
 */
export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  xxxl: 64,
} as const;

export const layout = {
  sidebarWidth: 244,
  topBarHeight: 64,
  contentMaxWidth: 1320,
  readingMaxWidth: 880,
} as const;

export const radii = {
  none: 0,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;

export const elevation = {
  none: 0,
  low: 1,
  medium: 3,
  high: 8,
  overlay: 16,
} as const;

export const motion = {
  fast: 120,
  base: 200,
  slow: 320,
} as const;

export const fontFamily = [
  'Inter',
  '-apple-system',
  'BlinkMacSystemFont',
  '"Segoe UI"',
  'Roboto',
  'Helvetica',
  'Arial',
  'sans-serif',
].join(', ');

export const monoFontFamily = [
  '"JetBrains Mono"',
  'SFMono-Regular',
  'Menlo',
  'Consolas',
  'monospace',
].join(', ');

export interface ColorToken {
  /** Foreground / accent colour. Meets AA against `soft` and white. */
  main: string;
  /** Tinted background for banners and chips. */
  soft: string;
  /** Border that pairs with `soft`. */
  border: string;
  /** Readable text colour on `soft`. */
  text: string;
}

export const surfaces = {
  page: '#f6f8fb',
  raised: '#ffffff',
  sunken: '#eef2f7',
  border: '#d7dee8',
  borderStrong: '#b9c4d2',
  textPrimary: '#12202f',
  textSecondary: '#4a5a6b',
  textMuted: '#6b7c8f',
} as const;

export const brand = {
  primary: '#18538f',
  primaryDark: '#0f3d6e',
  primarySoft: '#e8f1fb',
  accent: '#0f766e',
} as const;

/** Review-priority bands used by findings. */
export const priorityBands: Record<PriorityBand, ColorToken> = {
  LOW: { main: '#475569', soft: '#f1f5f9', border: '#cbd5e1', text: '#334155' },
  MEDIUM: { main: '#a16207', soft: '#fefce8', border: '#fde68a', text: '#854d0e' },
  HIGH: { main: '#c2410c', soft: '#fff7ed', border: '#fdba74', text: '#9a3412' },
  CRITICAL: { main: '#b91c1c', soft: '#fef2f2', border: '#fca5a5', text: '#991b1b' },
};

/** Integrity states used by the attempt experience. */
export const integrityTones = {
  neutral: { main: '#4a5a6b', soft: '#f1f5f9', border: '#cbd5e1', text: '#334155' },
  info: { main: '#18538f', soft: '#e8f1fb', border: '#bfd7f0', text: '#0f3d6e' },
  safe: { main: '#15803d', soft: '#f0fdf4', border: '#bbf7d0', text: '#166534' },
  warning: { main: '#a16207', soft: '#fefce8', border: '#fde68a', text: '#854d0e' },
  danger: { main: '#b91c1c', soft: '#fef2f2', border: '#fca5a5', text: '#991b1b' },
  terminated: { main: '#7f1d1d', soft: '#fef2f2', border: '#ef4444', text: '#7f1d1d' },
} as const satisfies Record<string, ColorToken>;

export type IntegrityTone = keyof typeof integrityTones;

export function integrityToneFor(remaining: number, max: number): IntegrityTone {
  if (remaining <= 0) {
    return 'terminated';
  }
  if (remaining === 1) {
    return 'danger';
  }
  if (max - remaining <= 0) {
    return 'safe';
  }
  return 'warning';
}

export const statusTones: Record<string, ColorToken> = {
  IN_PROGRESS: integrityTones.info,
  SUBMITTED: integrityTones.safe,
  TERMINATED: integrityTones.terminated,
  EXPIRED: integrityTones.neutral,
};
