import Chip from '@mui/material/Chip';
import type { ChipProps } from '@mui/material/Chip';
import { humanize } from '../lib/format';

const colors: Record<string, ChipProps['color']> = {
  DRAFT: 'default',
  OPEN: 'success',
  CLOSED: 'warning',
  ANALYSED: 'info',
  IN_PROGRESS: 'info',
  SUBMITTED: 'success',
  EXPIRED: 'default',
  TERMINATED: 'error',
  CONFIRMED: 'error',
  DISMISSED: 'default',
  NEEDS_INFO: 'warning',
  ESCALATED: 'error',
  SUPERSEDED: 'default',
  PENDING: 'default',
  RUNNING: 'info',
  COMPLETED: 'success',
  FAILED: 'error',
};

export function StatusChip({ status }: { status: string }) {
  return (
    <Chip
      size="small"
      label={humanize(status)}
      color={colors[status] ?? 'default'}
      variant="outlined"
    />
  );
}
