import Chip from '@mui/material/Chip';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { AttemptState } from '../../api/types';
import { formatDurationMinutes, humanize } from '../../lib/format';

export function AttemptStatusChip({ status }: { status: string }) {
  return (
    <Chip
      size="small"
      variant="outlined"
      color={
        status === 'SUBMITTED'
          ? 'success'
          : status === 'TERMINATED'
            ? 'error'
            : status === 'EXPIRED'
              ? 'default'
              : 'info'
      }
      label={humanize(status)}
    />
  );
}

export function ExamHeader({
  state,
  candidateCode,
  countdownWarning,
}: {
  state: AttemptState;
  candidateCode: string;
  countdownWarning: boolean;
}) {
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={1}>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <Typography variant="h5">{state.exam.title}</Typography>
          <AttemptStatusChip status={state.status} />
        </Stack>
        <Typography variant="body2" color="text.secondary">
          {state.exam.code} · Candidate {candidateCode} · Duration{' '}
          {formatDurationMinutes(state.exam.durationMinutes)} · {state.exam.questions.length}{' '}
          question(s)
        </Typography>
        {!state.extensionConnected ? (
          <Typography variant="body2" color="text.secondary">
            Monitoring extension not detected. Missing observations are unknown, not clean; you can
            still answer and submit.
          </Typography>
        ) : null}
        {countdownWarning ? (
          <Typography variant="body2" color="warning.main">
            The timer is almost finished. Submit soon.
          </Typography>
        ) : null}
      </Stack>
    </Paper>
  );
}
