import { createTheme } from '@mui/material/styles';
import type { PriorityBand } from './api/types';

export const bandColors: Record<PriorityBand, 'default' | 'warning' | 'error' | 'success'> = {
  LOW: 'default',
  MEDIUM: 'warning',
  HIGH: 'error',
  CRITICAL: 'error',
};

export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#1f4e79' },
    secondary: { main: '#5b6b7c' },
    background: { default: '#f5f7fa', paper: '#ffffff' },
  },
  typography: {
    h4: { fontWeight: 600 },
    h6: { fontWeight: 600 },
    button: { textTransform: 'none' },
  },
  shape: { borderRadius: 10 },
  components: {
    MuiTableCell: {
      styleOverrides: {
        head: { fontWeight: 600, color: '#425466' },
      },
    },
  },
});
