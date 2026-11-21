import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import TravelExploreOutlinedIcon from '@mui/icons-material/TravelExploreOutlined';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import { useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { ApiError } from '../../api/client';
import { useAdminDashboard } from '../../api/dashboardApi';
import { downloadAdminOverviewPdf, useOverviewFindings } from '../../api/staffQueries';
import type {
  AdminAuditRow,
  AdminRunRow,
  FindingOverviewRow,
  FindingStatus,
  FindingType,
  PriorityBand,
} from '../../api/types';
import { AppShell } from '../../components/AppShell';
import { BandChip } from '../../components/BandChip';
import { DataTable } from '../../components/DataTable';
import type { DataTableColumn } from '../../components/DataTable';
import { LoadingBlock } from '../../components/LoadingBlock';
import { StatusChip } from '../../components/StatusChip';
import { useToast } from '../../components/ToastProvider';
import { saveBlob } from '../../lib/download';
import { formatDateTime, humanize } from '../../lib/format';
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

const findingTypes: FindingType[] = ['CANDIDATE_PAIR', 'CANDIDATE_INCIDENT', 'CANDIDATE_AUTHORSHIP'];
const priorityBandValues: PriorityBand[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const findingStatuses: FindingStatus[] = [
  'OPEN',
  'CONFIRMED',
  'DISMISSED',
  'NEEDS_INFO',
  'ESCALATED',
  'SUPERSEDED',
];

const typeLabels: Record<FindingType, string> = {
  CANDIDATE_PAIR: 'Pair',
  CANDIDATE_INCIDENT: 'Incident',
  CANDIDATE_AUTHORSHIP: 'Authorship',
};

const findingColumns: DataTableColumn<FindingOverviewRow>[] = [
  {
    id: 'band',
    header: 'Band',
    accessorFn: (row) => row.priorityBand,
    cell: (row) => <BandChip band={row.priorityBand} />,
  },
  {
    id: 'priority',
    header: 'Priority',
    align: 'right',
    accessorFn: (row) => row.priorityScore,
    cell: (row) => Math.round(row.priorityScore),
  },
  {
    id: 'type',
    header: 'Type',
    accessorFn: (row) => typeLabels[row.type],
  },
  {
    id: 'exam',
    header: 'Exam',
    accessorFn: (row) => `${row.exam.code} ${row.exam.title}`,
    cell: (row) => (
      <Box>
        <Typography
          component={RouterLink}
          to={`/exams/${row.exam.id}?tab=findings`}
          onClick={(event) => event.stopPropagation()}
          variant="body2"
          sx={{ fontWeight: 600 }}
        >
          {row.exam.title}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {row.exam.code}
        </Typography>
      </Box>
    ),
  },
  {
    id: 'candidates',
    header: 'Candidates',
    accessorFn: (row) => `${row.candidateA} ${row.candidateB ?? ''}`,
    cell: (row) => (row.candidateB ? `${row.candidateA} / ${row.candidateB}` : row.candidateA),
  },
  {
    id: 'status',
    header: 'Status',
    accessorFn: (row) => row.status,
    cell: (row) => <StatusChip status={row.status} />,
  },
  {
    id: 'created',
    header: 'Created',
    accessorFn: (row) => row.createdAt,
    cell: (row) => formatDateTime(row.createdAt),
  },
];

export function AdminDashboardPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const dashboard = useAdminDashboard();
  const [showAll, setShowAll] = useState(false);
  const [type, setType] = useState<FindingType | 'ALL'>('ALL');
  const [band, setBand] = useState<PriorityBand | 'ALL'>('ALL');
  const [status, setStatus] = useState<FindingStatus | 'ALL'>('ALL');
  const [downloading, setDownloading] = useState(false);

  const findings = useOverviewFindings({
    type: type === 'ALL' ? undefined : type,
    band: band === 'ALL' ? undefined : band,
    status: status === 'ALL' ? undefined : status,
  });

  const downloadOverview = async () => {
    setDownloading(true);
    try {
      const blob = await downloadAdminOverviewPdf();
      saveBlob(blob, 'examguard-overview.pdf');
      showToast('Administration overview downloaded.', { severity: 'success' });
    } catch (caught) {
      showToast(
        caught instanceof ApiError ? caught.message : 'The report could not be downloaded.',
        { severity: 'error' },
      );
    } finally {
      setDownloading(false);
    }
  };

  const data = dashboard.data;
  const filtersApplied = type !== 'ALL' || band !== 'ALL' || status !== 'ALL';

  return (
    <AppShell
      breadcrumb={<Typography variant="body2">Administration</Typography>}
      actions={
        <Button
          variant="outlined"
          size="small"
          startIcon={<DownloadOutlinedIcon />}
          onClick={() => void downloadOverview()}
          disabled={downloading}
        >
          {downloading ? 'Preparing…' : 'Download overview PDF'}
        </Button>
      }
    >
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
                Review findings across exams
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Analysis findings from every exam, highest priority first. Open a finding to review the
                evidence; a person makes any decision.
              </Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 2 }}>
                <TextField
                  select
                  size="small"
                  label="Type"
                  value={type}
                  onChange={(event) => setType(event.target.value as FindingType | 'ALL')}
                  sx={{ minWidth: 160 }}
                >
                  <MenuItem value="ALL">All types</MenuItem>
                  {findingTypes.map((value) => (
                    <MenuItem key={value} value={value}>
                      {typeLabels[value]}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  select
                  size="small"
                  label="Band"
                  value={band}
                  onChange={(event) => setBand(event.target.value as PriorityBand | 'ALL')}
                  sx={{ minWidth: 150 }}
                >
                  <MenuItem value="ALL">All bands</MenuItem>
                  {priorityBandValues.map((value) => (
                    <MenuItem key={value} value={value}>
                      {humanize(value)}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  select
                  size="small"
                  label="Status"
                  value={status}
                  onChange={(event) => setStatus(event.target.value as FindingStatus | 'ALL')}
                  sx={{ minWidth: 170 }}
                >
                  <MenuItem value="ALL">All statuses</MenuItem>
                  {findingStatuses.map((value) => (
                    <MenuItem key={value} value={value}>
                      {humanize(value)}
                    </MenuItem>
                  ))}
                </TextField>
              </Stack>

              {findings.isError ? <Alert severity="error">{findings.error.message}</Alert> : null}

              <DataTable
                data={findings.data ?? []}
                columns={findingColumns}
                ariaLabel="Review findings across exams"
                isLoading={findings.isLoading}
                searchPlaceholder="Search candidates, exams or summaries…"
                emptyTitle={filtersApplied ? 'No findings match these filters' : 'No findings yet'}
                emptyBody={
                  filtersApplied
                    ? 'Try another band, type or status, or clear the filters.'
                    : 'Run analysis on a closed exam to populate the cross-exam review queue.'
                }
                getRowId={(row) => String(row.id)}
                onRowClick={(row) => navigate(`/findings/${row.id}`)}
                initialState={{ pageSize: 10 }}
              />
            </Box>

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
