import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { CoverageMeta } from '../../lib/evidence';
import { formatPercent } from '../../lib/format';

export function CoveragePanel({ meta }: { meta: CoverageMeta }) {
  return (
    <Stack spacing={1}>
      <Alert severity="warning" variant="outlined">
        <AlertTitle>Monitoring data is incomplete</AlertTitle>
        Missing observations are unknown, not clean. The priority is capped while coverage is
        incomplete.
      </Alert>
      {meta.coveragePercent !== null ? (
        <Typography variant="body2" color="text.secondary">
          Observed coverage: {formatPercent(meta.coveragePercent)}
        </Typography>
      ) : null}
      {meta.substantiveQuestions !== null ? (
        <Typography variant="body2" color="text.secondary">
          Questions with substantive answers from both candidates: {meta.substantiveQuestions}
        </Typography>
      ) : null}
      {meta.eventCount !== null ? (
        <Typography variant="body2" color="text.secondary">
          Events observed: {meta.eventCount}
        </Typography>
      ) : null}
    </Stack>
  );
}
