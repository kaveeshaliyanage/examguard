import Chip from '@mui/material/Chip';
import type { ChipProps } from '@mui/material/Chip';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import type { PriorityBand } from '../api/types';

const colors: Record<PriorityBand, ChipProps['color']> = {
  LOW: 'default',
  MEDIUM: 'warning',
  HIGH: 'error',
  CRITICAL: 'error',
};

export function BandChip({ band }: { band: PriorityBand }) {
  return (
    <Chip
      size="small"
      color={colors[band]}
      variant={band === 'CRITICAL' ? 'filled' : 'outlined'}
      icon={band === 'CRITICAL' ? <ErrorOutlineIcon /> : undefined}
      label={band}
      aria-label={`Review priority band ${band}`}
    />
  );
}
