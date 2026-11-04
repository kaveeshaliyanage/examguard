import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import { formatPercent } from '../lib/format';

interface CoverageBannerProps {
  warning: boolean;
  percent?: number;
}

export function CoverageBanner({ warning, percent }: CoverageBannerProps) {
  if (!warning) {
    return null;
  }
  return (
    <Alert severity="warning" variant="outlined" role="status">
      <AlertTitle>Monitoring data is incomplete</AlertTitle>
      Missing observations are unknown, not clean.
      {typeof percent === 'number' ? ` Observed coverage: ${formatPercent(percent)}.` : ''}
    </Alert>
  );
}
