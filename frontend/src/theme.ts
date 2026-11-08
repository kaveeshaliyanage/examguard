import { createTheme } from '@mui/material/styles';
import type { PriorityBand } from './api/types';
import {
  brand,
  elevation,
  fontFamily,
  integrityTones,
  layout,
  monoFontFamily,
  radii,
  spacing,
  surfaces,
} from './design/tokens';

export type { PriorityBand };

/** Legacy helper kept for callers that map a band onto a MUI chip colour. */
export const bandColors: Record<PriorityBand, 'default' | 'warning' | 'error' | 'success'> = {
  LOW: 'default',
  MEDIUM: 'warning',
  HIGH: 'error',
  CRITICAL: 'error',
};

export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: brand.primary, dark: brand.primaryDark, light: '#2f6ca8', contrastText: '#ffffff' },
    secondary: { main: brand.accent, contrastText: '#ffffff' },
    background: { default: surfaces.page, paper: surfaces.raised },
    text: { primary: surfaces.textPrimary, secondary: surfaces.textSecondary },
    divider: surfaces.border,
    success: { main: integrityTones.safe.main, light: integrityTones.safe.soft, dark: integrityTones.safe.text },
    warning: { main: integrityTones.warning.main, light: integrityTones.warning.soft, dark: integrityTones.warning.text },
    error: { main: integrityTones.danger.main, light: integrityTones.danger.soft, dark: integrityTones.danger.text },
    info: { main: integrityTones.info.main, light: integrityTones.info.soft, dark: integrityTones.info.text },
  },
  shape: { borderRadius: radii.sm },
  spacing: (factor: number) => factor * spacing.sm,
  typography: {
    fontFamily,
    fontWeightLight: 300,
    fontWeightRegular: 400,
    fontWeightMedium: 500,
    fontWeightBold: 700,
    h1: { fontWeight: 700, letterSpacing: '-0.02em' },
    h2: { fontWeight: 700, letterSpacing: '-0.015em' },
    h3: { fontWeight: 700, letterSpacing: '-0.01em' },
    h4: { fontWeight: 700, letterSpacing: '-0.01em', fontSize: '1.75rem' },
    h5: { fontWeight: 600, letterSpacing: '-0.005em' },
    h6: { fontWeight: 600 },
    subtitle1: { fontWeight: 600 },
    subtitle2: { fontWeight: 600 },
    body1: { fontSize: '0.9375rem', lineHeight: 1.6 },
    body2: { fontSize: '0.875rem', lineHeight: 1.55 },
    caption: { fontSize: '0.75rem', letterSpacing: '0.01em' },
    button: { textTransform: 'none', fontWeight: 600 },
    overline: { fontWeight: 700, letterSpacing: '0.08em' },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        html: { WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale' },
        body: { backgroundColor: surfaces.page },
        '::selection': { backgroundColor: brand.primarySoft },
        code: { fontFamily: monoFontFamily, fontSize: '0.85em' },
        '*::-webkit-scrollbar': { width: 10, height: 10 },
        '*::-webkit-scrollbar-thumb': {
          backgroundColor: surfaces.borderStrong,
          borderRadius: radii.pill,
        },
        '@media print': {
          // Component styles are injected after CssBaseline, so the print shell overrides
          // need !important to actually win on a report page.
          '.MuiAppBar-root, .MuiDrawer-root, .MuiButton-root': { display: 'none !important' },
          'main, .MuiContainer-root': {
            padding: '0 !important',
            margin: '0 !important',
            maxWidth: 'none !important',
          },
          '.MuiPaper-root': { boxShadow: 'none !important', border: '1px solid #d5dde7' },
          a: { textDecoration: 'none', color: 'inherit' },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: 'none' },
        rounded: { borderRadius: radii.md },
        outlined: { borderColor: surfaces.border },
        elevation1: { boxShadow: '0 1px 2px rgba(18, 32, 47, 0.06), 0 1px 3px rgba(18, 32, 47, 0.08)' },
        elevation2: { boxShadow: '0 2px 6px rgba(18, 32, 47, 0.08), 0 1px 2px rgba(18, 32, 47, 0.06)' },
        elevation3: {
          boxShadow: '0 8px 24px rgba(18, 32, 47, 0.10), 0 2px 6px rgba(18, 32, 47, 0.06)',
        },
        elevation8: { boxShadow: '0 16px 40px rgba(18, 32, 47, 0.16)' },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          borderRadius: radii.sm,
          paddingInline: spacing.lg,
          minHeight: 36,
          '&.MuiButton-sizeLarge': { minHeight: 44, paddingInline: spacing.xl },
        },
        outlined: { borderColor: surfaces.borderStrong },
      },
    },
    MuiIconButton: {
      styleOverrides: { root: { borderRadius: radii.sm } },
    },
    MuiChip: {
      styleOverrides: {
        root: { borderRadius: radii.sm, fontWeight: 500 },
        outlined: { borderColor: surfaces.borderStrong },
        sizeSmall: { height: 24, fontSize: '0.75rem' },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          padding: `${spacing.sm}px ${spacing.md}px`,
          borderBottomColor: surfaces.border,
          fontSize: '0.8125rem',
        },
        head: {
          fontWeight: 600,
          color: surfaces.textSecondary,
          backgroundColor: surfaces.sunken,
          fontSize: '0.75rem',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          whiteSpace: 'nowrap',
        },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: { '&.MuiTableRow-hover:hover': { backgroundColor: '#f2f6fb' } },
      },
    },
    MuiTextField: {
      defaultProps: { size: 'small' },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: { borderRadius: radii.sm, backgroundColor: surfaces.raised },
        notchedOutline: { borderColor: surfaces.border },
      },
    },
    MuiInputLabel: {
      styleOverrides: { root: { fontSize: '0.875rem' } },
    },
    MuiDialog: {
      styleOverrides: {
        paper: { borderRadius: radii.lg, boxShadow: '0 24px 64px rgba(18, 32, 47, 0.24)' },
      },
    },
    MuiDialogTitle: {
      styleOverrides: { root: { fontSize: '1.125rem', fontWeight: 600, paddingBottom: spacing.sm } },
    },
    MuiTooltip: {
      defaultProps: { arrow: true },
      styleOverrides: {
        tooltip: {
          backgroundColor: surfaces.textPrimary,
          fontSize: '0.75rem',
          borderRadius: radii.xs,
          padding: `${spacing.xs}px ${spacing.sm}px`,
        },
      },
    },
    MuiTabs: {
      styleOverrides: {
        root: { minHeight: 40 },
        indicator: { height: 2, borderRadius: radii.pill },
      },
    },
    MuiTab: {
      styleOverrides: { root: { minHeight: 40, paddingInline: spacing.md, fontWeight: 500 } },
    },
    MuiAlert: {
      styleOverrides: {
        root: { borderRadius: radii.sm, alignItems: 'center' },
        standardInfo: { backgroundColor: integrityTones.info.soft, color: integrityTones.info.text },
        standardWarning: { backgroundColor: integrityTones.warning.soft, color: integrityTones.warning.text },
        standardError: { backgroundColor: integrityTones.danger.soft, color: integrityTones.danger.text },
        standardSuccess: { backgroundColor: integrityTones.safe.soft, color: integrityTones.safe.text },
      },
    },
    MuiLinearProgress: {
      styleOverrides: {
        root: { borderRadius: radii.pill, height: 6, backgroundColor: surfaces.sunken },
      },
    },
    MuiSkeleton: {
      styleOverrides: { rounded: { borderRadius: radii.sm } },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: radii.sm,
          marginInline: spacing.sm,
          minHeight: 40,
          '&.Mui-selected': {
            backgroundColor: brand.primarySoft,
            color: brand.primaryDark,
            '&:hover': { backgroundColor: '#dbe9f8' },
          },
        },
      },
    },
    MuiAvatar: {
      styleOverrides: { root: { fontSize: '0.875rem', fontWeight: 600 } },
    },
    MuiAppBar: {
      styleOverrides: {
        root: { boxShadow: 'none', backgroundImage: 'none' },
      },
    },
    MuiContainer: {
      styleOverrides: {
        root: { paddingInline: spacing.xl },
      },
    },
    MuiStack: {
      defaultProps: { useFlexGap: true },
    },
  },
});

export { elevation, layout, radii, spacing };
