import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import TravelExploreOutlinedIcon from '@mui/icons-material/TravelExploreOutlined';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useAdminDashboard } from '../../api/dashboardApi';
import type { AdminAuditRow, AdminRunRow } from '../../api/types';
import { AppShell } from '../../components/AppShell';
import { DataTable } from '../../components/DataTable';
import type { DataTableColumn } from '../../components/DataTable';
import { LoadingBlock } from '../../components/LoadingBlock';
import { StatusChip } from '../../components/StatusChip';
import { formatDateTime } from '../../lib/format';
import { StatCard } from './StatCard';

const runColumns: DataTableColumn<AdminRunRow>[] = [
  {
    id: 'exam',
    header: 'Exam',
    accessorFn: (row) => row.examTitle,
  },
  {
    id: 'status',
    header: 'Status',
    accessorFn: (row) => row.status,
    cell: (row) => <StatusChip status={row.status} />,
  },
  {
    id: 'model',
    header: 'Model',
    accessorFn: (row) => row.modelVersion ?? '',
    cell: (row) => row.modelVersion ?? '—',
  },
  {
    id: 'started',
    header: 'Started',
    accessorFn: (row) => row.startedAt,
    cell: (row) => formatDateTime(row.startedAt),
  },
  {
    id: 'finished',
    header: 'Finished',
    accessorFn: (row) => row.finishedAt ?? '',
    cell: (row) => formatDateTime(row.finishedAt),
  },
];

const auditColumns: DataTableColumn<AdminAuditRow>[] = [
  { id: 'action', header: 'Action', accessorFn: (row) => row.action },
  { id: 'actor', header: 'Actor', accessorFn: (row) => row.actor },
  {
    id: 'entity',
    header: 'Entity',
    accessorFn: (row) => `${row.entityType}:${row.entityId ?? ''}`,
  },
  {
    id: 'time',
    header: 'When',
    accessorFn: (row) => row.createdAt,
    cell: (row) => formatDateTime(row.createdAt),
  },
];

export function AdminDashboardPage() {
  const navigate = useNavigate();
  const dashboard = useAdminDashboard();
  const [showAll, setShowAll] = useState(false);
  const data = dashboard.data;

  return (
    <AppShell breadcrumb={<Typography variant="body2">Administration</Typography>}>
      <Stack spacing={3}>
        <Box>
          <Typography variant="h4" gutterBottom>
            Administration
          </Typography>
          <Typography color="text.secondary">
            Accounts, exams, the analysis service and the audit trail in one place.
          </Typography>
        </Box>

        {dashboard.isError ? <Alert severity="error">{dashboard.error.message}</Alert> : null}
        {dashboard.isLoading ? <LoadingBlock rows={4} /> : null}

        {data ? (
          <>
            <Box
              sx={{
                display: 'grid',
                gap: 2,
                gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(4, 1fr)' },
              }}
            >
              <StatCard
                label="Accounts"
                value={data.counts.users}
                icon={<GroupsOutlinedIcon />}
                hint={`${data.counts.students} students · ${data.counts.lecturers} lecturers · ${data.counts.admins} admins`}
              />
              <StatCard
                label="Exams"
                value={data.counts.exams}
                icon={<SchoolOutlinedIcon />}
                to="/exams"
              />
              <StatCard
                label="Attempts"
                value={data.counts.attempts}
                icon={<FactCheckOutlinedIcon />}
              />
              <StatCard
                label="Findings"
                value={data.counts.findings}
                icon={<TravelExploreOutlinedIcon />}
                hint="Signals produced by analysis runs"
              />
            </Box>

            <Paper variant="outlined" sx={{ p: 2.5 }}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }}>
                <Box sx={{ flexGrow: 1 }}>
                  <Typography variant="h6" component="h5">AI analysis service</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Pair similarity and candidate incident scoring run in the FastAPI service. When it is
                    unreachable, analysis runs fail with a clear error instead of producing partial results.
                  </Typography>
                </Box>
                <Chip
                  color={data.aiHealthy ? 'success' : 'error'}
                  variant={data.aiHealthy ? 'filled' : 'outlined'}
                  label={data.aiHealthy ? 'Healthy' : 'Unreachable'}
                />
              </Stack>
            </Paper>

            <Box>
              <Typography variant="h6" component="h5" gutterBottom>
                Recent analysis runs
              </Typography>
              <DataTable
                data={data.recentRuns}
                columns={runColumns}
                ariaLabel="Recent analysis runs"
                emptyTitle="No analysis runs"
                emptyBody="Close an exam and run the analysis to populate this list."
                getRowId={(row) => String(row.id)}
                onRowClick={(row) => navigate(`/exams/${row.examId}?tab=runs`)}
                initialState={{ pageSize: 10 }}
              />
            </Box>

            <Box>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography variant="h6" component="h5" gutterBottom>
                  Audit trail
                </Typography>
                <Button size="small" onClick={() => setShowAll((value) => !value)}>
                  {showAll ? 'Show recent only' : 'Show all'}
                </Button>
              </Stack>
              <DataTable
                data={showAll ? data.recentAudit : data.recentAudit.slice(0, 8)}
                columns={auditColumns}
                ariaLabel="Audit trail"
                searchPlaceholder="Search audit entries…"
                emptyTitle="No audit entries"
                emptyBody="Actions such as grading, releases and analysis runs are recorded here."
                getRowId={(row) => String(row.id)}
                initialState={{ pageSize: 10 }}
              />
            </Box>

            <Alert severity="info" variant="outlined">
              Review priority is not a finding of misconduct. The audit trail records staff actions so
              decisions can be explained to students and external reviewers.
            </Alert>
          </>
        ) : null}
      </Stack>
    </AppShell>
  );
}
