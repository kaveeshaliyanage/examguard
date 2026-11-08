import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import AssignmentLateOutlinedIcon from '@mui/icons-material/AssignmentLateOutlined';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import { useMemo } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { useLecturerDashboard } from '../../api/dashboardApi';
import type { ExamHealthRow, FlaggedCandidate, UngradedAttempt } from '../../api/types';
import { AppShell } from '../../components/AppShell';
import { BandChip } from '../../components/BandChip';
import { DataTable } from '../../components/DataTable';
import type { DataTableColumn } from '../../components/DataTable';
import { EmptyState } from '../../components/EmptyState';
import { LoadingBlock } from '../../components/LoadingBlock';
import { StatusChip } from '../../components/StatusChip';
import { formatDateTime } from '../../lib/format';
import { AttemptFunnelChart } from './AttemptFunnelChart';
import { BandMixChart } from './BandMixChart';
import { IntegrityTrendChart } from './IntegrityTrendChart';
import { ChartCard, ScoreDistributionChart } from './ScoreDistributionChart';
import { StatCard } from './StatCard';

const examColumns: DataTableColumn<ExamHealthRow>[] = [
  {
    id: 'exam',
    header: 'Exam',
    accessorFn: (row) => `${row.title} ${row.code}`,
    cell: (row) => (
      <Box>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {row.title}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {row.code}
        </Typography>
      </Box>
    ),
  },
  {
    id: 'status',
    header: 'Status',
    accessorFn: (row) => row.status,
    cell: (row) => <StatusChip status={row.status} />,
  },
  {
    id: 'submitted',
    header: 'Submitted',
    align: 'right',
    accessorFn: (row) => row.submitted,
    cell: (row) => `${row.submitted} / ${row.attempts}`,
  },
  {
    id: 'ungraded',
    header: 'Ungraded',
    align: 'right',
    accessorFn: (row) => row.ungraded,
    cell: (row) =>
      row.ungraded > 0 ? (
        <Chip size="small" color="warning" variant="outlined" label={row.ungraded} />
      ) : (
        <Chip size="small" color="success" variant="outlined" label="0" />
      ),
  },
  {
    id: 'flagged',
    header: 'Flagged',
    align: 'right',
    accessorFn: (row) => row.flaggedCandidates,
  },
  {
    id: 'release',
    header: 'Awaiting release',
    align: 'right',
    accessorFn: (row) => row.awaitingRelease,
  },
  {
    id: 'analysis',
    header: 'Last analysis',
    accessorFn: (row) => row.lastAnalysisAt ?? '',
    cell: (row) => formatDateTime(row.lastAnalysisAt),
  },
];

const ungradedColumns: DataTableColumn<UngradedAttempt>[] = [
  {
    id: 'candidate',
    header: 'Candidate',
    accessorFn: (row) => row.candidateCode,
  },
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
    id: 'pending',
    header: 'Pending answers',
    align: 'right',
    accessorFn: (row) => row.pendingQuestions,
  },
];

export function LecturerDashboardPage() {
  const navigate = useNavigate();
  const dashboard = useLecturerDashboard();
  const data = dashboard.data;

  const flagged = useMemo<FlaggedCandidate[]>(() => data?.flagged ?? [], [data]);

  return (
    <AppShell
      breadcrumb={<Typography variant="body2">Lecturer dashboard</Typography>}
      actions={
        <Button component={RouterLink} to="/exams" size="small" variant="outlined">
          All exams
        </Button>
      }
    >
      <Stack spacing={3}>
        <Box>
          <Typography variant="h4" gutterBottom>
            Lecturer dashboard
          </Typography>
          <Typography color="text.secondary">
            Exam health, the marking queue and integrity signals that need a human decision.
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
                label="Exams you can see"
                value={data.exams.length}
                icon={<SchoolOutlinedIcon />}
              />
              <StatCard
                label="Answers to mark"
                value={data.ungradedTotal}
                icon={<AssignmentLateOutlinedIcon />}
                tone={data.ungradedTotal > 0 ? 'warning' : 'success'}
                to="/exams"
              />
              <StatCard
                label="Flagged candidates"
                value={data.flaggedTotal}
                icon={<WarningAmberOutlinedIcon />}
                tone={data.flaggedTotal > 0 ? 'warning' : 'success'}
                hint="Review priority, not proof"
              />
              <StatCard
                label="Awaiting release"
                value={data.awaitingRelease}
                icon={<FactCheckOutlinedIcon />}
                hint="Graded attempts students cannot see yet"
              />
            </Box>

            <Paper variant="outlined" sx={{ p: 2.5 }}>
              <Typography variant="h6" component="h5" gutterBottom>
                Score distribution
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Released results across your exams, grouped by percentage.
              </Typography>
              <ScoreDistributionChart data={data.distribution} />
            </Paper>

            <Box
              sx={{
                display: 'grid',
                gap: 2,
                gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' },
              }}
            >
              <ChartCard title="Integrity trend">
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  Focus-loss signals per day across your exams (last 14 days, UTC).
                </Typography>
                <IntegrityTrendChart data={data.integrityTrend} />
              </ChartCard>
              <ChartCard title="Band mix">
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  Open findings by review priority. A band is a reason to look, not proof.
                </Typography>
                <BandMixChart data={data.bandMix} />
              </ChartCard>
              <ChartCard title="Attempt funnel">
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  From started to released, across every exam you can see.
                </Typography>
                <AttemptFunnelChart data={data.funnel} />
              </ChartCard>
            </Box>

            <Box>
              <Typography variant="h6" component="h5" gutterBottom>
                Exam health
              </Typography>
              <DataTable
                data={data.exams}
                columns={examColumns}
                ariaLabel="Exam health"
                searchPlaceholder="Search exams…"
                emptyTitle="No exams yet"
                emptyBody="Create an exam to start collecting attempts."
                getRowId={(row) => String(row.examId)}
                onRowClick={(row) => navigate(`/exams/${row.examId}`)}
                initialState={{ pageSize: 10 }}
              />
            </Box>

            <Box>
              <Typography variant="h6" component="h5" gutterBottom>
                Marking queue
              </Typography>
              {data.ungradedQueue.length === 0 ? (
                <EmptyState title="Nothing to mark" body="Every submitted answer has a score." />
              ) : (
                <DataTable
                  data={data.ungradedQueue}
                  columns={ungradedColumns}
                  ariaLabel="Marking queue"
                  searchPlaceholder="Search candidates…"
                  getRowId={(row) => String(row.attemptId)}
                  onRowClick={(row) => navigate(`/exams/${row.examId}?tab=grading`)}
                  initialState={{ pageSize: 10 }}
                />
              )}
            </Box>

            <Box>
              <Typography variant="h6" component="h5" gutterBottom>
                Integrity signals
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                Ranked by review priority. A signal is a reason to look, not a finding of misconduct.
              </Typography>
              {flagged.length === 0 ? (
                <EmptyState
                  title="No open integrity signals"
                  body="Run an analysis on an exam after submissions close to surface similar answers and activity incidents."
                />
              ) : (
                <Stack spacing={1}>
                  {flagged.map((item) => (
                    <Paper key={item.findingId} variant="outlined" sx={{ p: 1.5 }}>
                      <Stack
                        direction={{ xs: 'column', sm: 'row' }}
                        spacing={1.5}
                        alignItems={{ sm: 'center' }}
                        justifyContent="space-between"
                      >
                        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                          <BandChip band={item.band} />
                          <Typography sx={{ fontWeight: 600 }}>{item.candidateCode}</Typography>
                          <Typography variant="body2" color="text.secondary">
                            {item.examTitle}
                          </Typography>
                          <Chip
                            size="small"
                            variant="outlined"
                            label={
                              item.type === 'CANDIDATE_PAIR'
                                ? 'Answer overlap'
                                : item.type === 'CANDIDATE_AUTHORSHIP'
                                  ? 'Authorship signal'
                                  : 'Activity incident'
                            }
                          />
                        </Stack>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Typography variant="body2" color="text.secondary">
                            Priority {Math.round(item.priorityScore)}
                          </Typography>
                          <Button
                            size="small"
                            onClick={() => navigate(`/findings/${item.findingId}`)}
                          >
                            Review
                          </Button>
                        </Stack>
                      </Stack>
                    </Paper>
                  ))}
                </Stack>
              )}
            </Box>
          </>
        ) : null}
      </Stack>
    </AppShell>
  );
}
