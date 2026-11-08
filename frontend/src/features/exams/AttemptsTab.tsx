import Alert from '@mui/material/Alert';
import Chip from '@mui/material/Chip';
import { useExamAttempts } from '../../api/staffQueries';
import type { AttemptSummary } from '../../api/types';
import { DataTable } from '../../components/DataTable';
import type { DataTableColumn } from '../../components/DataTable';
import { StatusChip } from '../../components/StatusChip';
import { formatDateTime, formatPercent } from '../../lib/format';
import { useTableUrlState } from '../../lib/tableState';

const sortableColumns = new Set([
  'candidate',
  'status',
  'started',
  'submitted',
  'answers',
  'events',
  'coverage',
  'late',
]);

const tableOptions = {
  keys: { sort: 'asort', dir: 'adir', query: 'aq', page: 'apage', size: 'asize' },
  sortable: sortableColumns,
} as const;

const columns: DataTableColumn<AttemptSummary>[] = [
  {
    id: 'candidate',
    header: 'Candidate',
    accessorFn: (attempt) => attempt.candidateCode,
  },
  {
    id: 'status',
    header: 'Status',
    accessorFn: (attempt) => attempt.status,
    cell: (attempt) => <StatusChip status={attempt.status} />,
  },
  {
    id: 'started',
    header: 'Started',
    accessorFn: (attempt) => attempt.startedAt,
    cell: (attempt) => formatDateTime(attempt.startedAt),
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
];

export function AttemptsTab({ examId }: { examId: number }) {
  const attempts = useExamAttempts(examId);
  const [tableState, setTableState] = useTableUrlState(tableOptions);

  if (attempts.isError) {
    return <Alert severity="error">{attempts.error.message}</Alert>;
  }

  return (
    <DataTable
      data={attempts.data ?? []}
      columns={columns}
      ariaLabel="Attempts"
      isLoading={attempts.isLoading}
      searchPlaceholder="Search candidates or status…"
      emptyTitle="No attempts yet"
      emptyBody="Share the exam code with candidates. Submitted attempts appear here after they join."
      getRowId={(attempt) => String(attempt.attemptId)}
      state={tableState}
      onStateChange={setTableState}
    />
  );
}
