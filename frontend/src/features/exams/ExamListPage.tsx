import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import { useMemo } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../AuthProvider';
import { useExams } from '../../api/staffQueries';
import type { ExamSummary } from '../../api/types';
import { AppShell } from '../../components/AppShell';
import { DataTable } from '../../components/DataTable';
import type { DataTableColumn } from '../../components/DataTable';
import { StatusChip } from '../../components/StatusChip';
import { formatDateTime } from '../../lib/format';
import { useTableUrlState } from '../../lib/tableState';

const sortableColumns = new Set([
  'code',
  'title',
  'status',
  'attempts',
  'submitted',
  'findings',
  'analysis',
]);

const tableOptions = { sortable: sortableColumns } as const;

export function ExamListPage() {
  const { session } = useAuth();
  const exams = useExams();
  const navigate = useNavigate();
  const [tableState, setTableState] = useTableUrlState(tableOptions);
  const canCreate = session?.user.role === 'LECTURER' || session?.user.role === 'ADMIN';

  const columns = useMemo<DataTableColumn<ExamSummary>[]>(
    () => [
      {
        id: 'code',
        header: 'Code',
        accessorFn: (exam) => exam.code,
        cell: (exam) => (
          <Typography
            component={RouterLink}
            to={`/exams/${exam.id}`}
            onClick={(event) => event.stopPropagation()}
            sx={{ fontWeight: 600 }}
          >
            {exam.code}
          </Typography>
        ),
      },
      {
        id: 'title',
        header: 'Title',
        accessorFn: (exam) => exam.title,
      },
      {
        id: 'status',
        header: 'Status',
        accessorFn: (exam) => exam.status,
        cell: (exam) => <StatusChip status={exam.status} />,
      },
      {
        id: 'attempts',
        header: 'Attempts',
        align: 'right',
        accessorFn: (exam) => exam.attemptCount,
      },
      {
        id: 'submitted',
        header: 'Submitted',
        align: 'right',
        accessorFn: (exam) => exam.submittedCount,
      },
      {
        id: 'findings',
        header: 'Open findings',
        align: 'right',
        accessorFn: (exam) => exam.openFindingCount,
        cell: (exam) =>
          exam.openFindingCount > 0 ? (
            <Button
              size="small"
              onClick={(event) => {
                event.stopPropagation();
                navigate(`/exams/${exam.id}?tab=findings&status=OPEN`);
              }}
            >
              {exam.openFindingCount}
            </Button>
          ) : (
            '0'
          ),
      },
      {
        id: 'analysis',
        header: 'Last analysis',
        accessorFn: (exam) => exam.lastAnalysisAt ?? '',
        cell: (exam) => formatDateTime(exam.lastAnalysisAt),
      },
    ],
    [navigate],
  );

  return (
    <AppShell
      breadcrumb={<Typography variant="body2">Exams</Typography>}
      actions={
        canCreate ? (
          <Button variant="contained" startIcon={<AddIcon />} component={RouterLink} to="/exams/new">
            Create exam
          </Button>
        ) : null
      }
    >
      <Stack spacing={2}>
        <Box>
          <Typography variant="h4">Exams</Typography>
          <Typography color="text.secondary">
            Open an exam to review pairs, incidents and the audit trail.
          </Typography>
        </Box>

        {exams.isError ? <Alert severity="error">{exams.error.message}</Alert> : null}

        <DataTable
          data={exams.data ?? []}
          columns={columns}
          ariaLabel="Exams"
          isLoading={exams.isLoading}
          searchPlaceholder="Search exams by code, title or status…"
          emptyTitle={exams.data && exams.data.length === 0 ? 'No exams yet' : 'No exams match the filters'}
          emptyBody={
            exams.data && exams.data.length === 0
              ? 'Create an exam with questions and resource rules, then open it for candidates.'
              : 'Try a different search or clear the filter.'
          }
          emptyAction={
            exams.data && exams.data.length === 0 && canCreate ? (
              <Button variant="contained" component={RouterLink} to="/exams/new">
                Create the first exam
              </Button>
            ) : undefined
          }
          state={tableState}
          onStateChange={setTableState}
          onRowClick={(exam) => navigate(`/exams/${exam.id}`)}
          getRowId={(exam) => String(exam.id)}
        />
      </Stack>
    </AppShell>
  );
}
