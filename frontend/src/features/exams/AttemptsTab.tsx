import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useMemo, useState } from 'react';
import { useExamAttempts, useAttemptPreflight } from '../../api/staffQueries';
import type { AttemptSummary } from '../../api/types';
import { DataTable } from '../../components/DataTable';
import type { DataTableColumn } from '../../components/DataTable';
import { StatusChip } from '../../components/StatusChip';
import { formatDateTime, formatPercent, humanize } from '../../lib/format';
import { useTableUrlState } from '../../lib/tableState';

const sortableColumns = new Set([
  'candidate',
  'status',
  'started',
  'submitted',
  'preflight',
  'answers',
  'events',
  'coverage',
  'late',
]);

const tableOptions = {
  keys: { sort: 'asort', dir: 'adir', query: 'aq', page: 'apage', size: 'asize' },
  sortable: sortableColumns,
} as const;

function checkEntries(checks: Record<string, unknown> | null): Array<[string, string]> {
  if (!checks) {
    return [];
  }
  return Object.entries(checks).map(([key, value]) => [key, typeof value === 'object' ? JSON.stringify(value) : String(value)]);
}

export function AttemptsTab({ examId }: { examId: number }) {
  const attempts = useExamAttempts(examId);
  const [tableState, setTableState] = useTableUrlState(tableOptions);
  const [photoAttempt, setPhotoAttempt] = useState<AttemptSummary | null>(null);
  const preflight = useAttemptPreflight(examId, photoAttempt?.attemptId ?? null);

  const columns = useMemo<DataTableColumn<AttemptSummary>[]>(
    () => [
      {
        id: 'candidate',
        header: 'Candidate',
        accessorFn: (attempt) => attempt.candidateCode,
      },
      {
        id: 'status',
        header: 'Status',
        accessorFn: (attempt) => attempt.status,
        cell: (attempt) => (
          <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap" useFlexGap>
            <StatusChip status={attempt.status} />
            {attempt.autoSubmitted ? <Chip size="small" color="warning" variant="outlined" label="Time up" /> : null}
          </Stack>
        ),
      },
      {
        id: 'started',
        header: 'Timer started',
        accessorFn: (attempt) => attempt.activeStartedAt ?? '',
        cell: (attempt) =>
          attempt.activeStartedAt ? (
            <Box>
              <Typography variant="body2">{formatDateTime(attempt.activeStartedAt)}</Typography>
              <Typography variant="caption" color="text.secondary">
                joined {formatDateTime(attempt.startedAt)}
              </Typography>
            </Box>
          ) : (
            <Chip size="small" variant="outlined" label="Pre-exam checks" />
          ),
      },
      {
        id: 'preflight',
        header: 'Identity photo',
        accessorFn: (attempt) => (attempt.hasPhoto ? 1 : 0),
        cell: (attempt) =>
          attempt.hasPhoto ? (
            <Button size="small" onClick={() => setPhotoAttempt(attempt)}>
              View photo
            </Button>
          ) : attempt.preflightCompletedAt ? (
            <Chip size="small" variant="outlined" label="No photo" />
          ) : (
            <Typography variant="caption" color="text.secondary">
              Not completed
            </Typography>
          ),
      },
      {
        id: 'submitted',
        header: 'Submitted',
        accessorFn: (attempt) => attempt.submittedAt ?? '',
        cell: (attempt) => formatDateTime(attempt.submittedAt),
      },
      {
        id: 'answers',
        header: 'Answers',
        align: 'right',
        accessorFn: (attempt) => attempt.answerCount,
      },
      {
        id: 'events',
        header: 'Events',
        align: 'right',
        accessorFn: (attempt) => attempt.eventCount,
      },
      {
        id: 'coverage',
        header: 'Coverage',
        accessorFn: (attempt) => attempt.coveragePercent,
        cell: (attempt) => (
          <Chip
            size="small"
            variant="outlined"
            color={attempt.coverageWarning ? 'warning' : 'default'}
            label={
              attempt.coverageWarning
                ? `Coverage ${formatPercent(attempt.coveragePercent)} — unknown, not clean`
                : `Coverage ${formatPercent(attempt.coveragePercent)}`
            }
          />
        ),
      },
      {
        id: 'late',
        header: 'Late',
        accessorFn: (attempt) => (attempt.lateSubmission ? 'Yes' : 'No'),
      },
    ],
    [],
  );

  if (attempts.isError) {
    return <Alert severity="error">{attempts.error.message}</Alert>;
  }

  const checks = checkEntries(preflight.data?.checks ?? null);

  return (
    <>
      <DataTable
        data={attempts.data ?? []}
        columns={columns}
        ariaLabel="Attempts"
        isLoading={attempts.isLoading}
        searchPlaceholder="Search candidates or status…"
        emptyTitle="No attempts yet"
        emptyBody="Share the exam code and PIN with candidates. Attempts appear here after they join."
        getRowId={(attempt) => String(attempt.attemptId)}
        state={tableState}
        onStateChange={setTableState}
      />
      <Dialog open={photoAttempt !== null} onClose={() => setPhotoAttempt(null)} fullWidth maxWidth="sm">
        <DialogTitle>
          Identity photo · {photoAttempt?.candidateCode}
        </DialogTitle>
        <DialogContent>
          {preflight.isLoading ? <Typography>Loading…</Typography> : null}
          {preflight.isError ? <Alert severity="error">{preflight.error.message}</Alert> : null}
          {preflight.data ? (
            <Stack spacing={2}>
              {preflight.data.photoDataUrl ? (
                <img
                  src={preflight.data.photoDataUrl}
                  alt={`Identity photo for ${photoAttempt?.candidateCode ?? 'candidate'}`}
                  style={{ width: '100%', borderRadius: 8 }}
                />
              ) : (
                <Typography color="text.secondary">No photo was stored for this attempt.</Typography>
              )}
              <Typography variant="body2" color="text.secondary">
                Checks completed {formatDateTime(preflight.data.completedAt)}
                {preflight.data.photoTakenAt
                  ? ` · photo taken ${formatDateTime(preflight.data.photoTakenAt)}`
                  : ''}
              </Typography>
              <Divider />
              <Stack spacing={0.5}>
                {checks.length === 0 ? (
                  <Typography color="text.secondary">No check details recorded.</Typography>
                ) : (
                  checks.map(([key, value]) => (
                    <Stack key={key} direction="row" spacing={1} justifyContent="space-between">
                      <Typography variant="body2" color="text.secondary">
                        {humanize(key)}
                      </Typography>
                      <Typography variant="body2">{value}</Typography>
                    </Stack>
                  ))
                )}
              </Stack>
            </Stack>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
