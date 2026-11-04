import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import LinearProgress from '@mui/material/LinearProgress';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Typography from '@mui/material/Typography';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import { useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../AuthProvider';
import { ApiError } from '../../api/client';
import { useAnalysisRuns, useExam, useRunAnalysis } from '../../api/staffQueries';
import type { FindingStatus, FindingType } from '../../api/types';
import { AppShell } from '../../components/AppShell';
import { LoadingBlock } from '../../components/LoadingBlock';
import { StatusChip } from '../../components/StatusChip';
import { formatDurationMinutes, humanize } from '../../lib/format';
import { AttemptsTab } from './AttemptsTab';
import { ExamOverviewTab } from './ExamOverviewTab';
import { FindingsTab } from './FindingsTab';
import { RunsTab } from './RunsTab';
import { SettingsTab } from './SettingsTab';

const tabs = ['overview', 'attempts', 'findings', 'runs', 'settings'] as const;
type TabValue = (typeof tabs)[number];

const findingTypes: FindingType[] = ['CANDIDATE_PAIR', 'CANDIDATE_INCIDENT'];
const findingStatuses: FindingStatus[] = [
  'OPEN',
  'CONFIRMED',
  'DISMISSED',
  'NEEDS_INFO',
  'ESCALATED',
  'SUPERSEDED',
];

export function ExamDetailPage() {
  const { examId } = useParams();
  const id = Number(examId);
  const { session } = useAuth();
  const [params, setParams] = useSearchParams();
  const examQuery = useExam(Number.isFinite(id) ? id : undefined);
  const runsQuery = useAnalysisRuns(Number.isFinite(id) ? id : undefined);
  const runAnalysis = useRunAnalysis(Number.isFinite(id) ? id : 0);
  const [runError, setRunError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const tab: TabValue = tabs.includes(params.get('tab') as TabValue)
    ? (params.get('tab') as TabValue)
    : 'overview';
  const type: FindingType = findingTypes.includes(params.get('type') as FindingType)
    ? (params.get('type') as FindingType)
    : 'CANDIDATE_PAIR';
  const status: FindingStatus | 'ALL' = findingStatuses.includes(params.get('status') as FindingStatus)
    ? (params.get('status') as FindingStatus)
    : 'ALL';

  const update = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([key, value]) => next.set(key, value));
    setParams(next, { replace: true });
  };

  if (!Number.isFinite(id)) {
    return (
      <AppShell>
        <Alert severity="error">This exam link is invalid.</Alert>
      </AppShell>
    );
  }

  const exam = examQuery.data;
  const runs = runsQuery.data ?? [];
  const latestRun = runs[0];
  const inFlight = runs.some((run) => run.status === 'PENDING' || run.status === 'RUNNING');
  const isAdmin = session?.user.role === 'ADMIN';
  const isOwner =
    isAdmin ||
    (session?.user.role === 'LECTURER' &&
      Boolean(
        exam?.permissions.some(
          (permission) => permission.userId === session.user.id && permission.level === 'OWNER',
        ),
      ));
  const canRun = Boolean(exam) && isOwner && exam!.submittedCount > 0 && !inFlight;

  const startRun = () => {
    setRunError(null);
    setNotice(null);
    runAnalysis.mutate(undefined, {
      onSuccess: (run) => {
        if (run.status === 'FAILED') {
          setRunError(run.error ?? 'The analysis run failed. Previous findings were kept.');
        } else {
          setNotice(`Analysis completed. ${run.findingsCreated} finding(s) created.`);
        }
      },
      onError: (caught) => {
        setRunError(caught instanceof ApiError ? caught.message : 'Could not start the analysis.');
      },
    });
  };

  return (
    <AppShell
      breadcrumb={
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography color="text.secondary">{exam?.code ?? 'Exam'}</Typography>
          {exam ? <StatusChip status={exam.status} /> : null}
        </Stack>
      }
      actions={
        <Button
          variant="contained"
          startIcon={<PlayArrowIcon />}
          onClick={startRun}
          disabled={!canRun || runAnalysis.isPending}
        >
          {runAnalysis.isPending ? 'Analysing…' : 'Run analysis'}
        </Button>
      }
    >
      <Stack spacing={3}>
        {examQuery.isLoading ? <LoadingBlock rows={5} /> : null}
        {examQuery.isError ? <Alert severity="error">{examQuery.error.message}</Alert> : null}
        {runError ? <Alert severity="error">{runError}</Alert> : null}
        {notice ? <Alert severity="success">{notice}</Alert> : null}
        {exam && !canRun && !inFlight && exam.submittedCount === 0 ? (
          <Alert severity="info">
            Analysis needs at least one submitted attempt. Share the exam code with candidates first.
          </Alert>
        ) : null}

        {exam ? (
          <>
            <Box>
              <Typography variant="h4">{exam.title}</Typography>
              <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" sx={{ mt: 1 }}>
                <Typography variant="body2" color="text.secondary">
                  {exam.code} · {formatDurationMinutes(exam.durationMinutes)} ·{' '}
                  {exam.submittedCount} submitted of {exam.attemptCount}
                </Typography>
                <Chip
                  size="small"
                  variant="outlined"
                  label={`Your access: ${humanize(
                    exam.permissions.find((permission) => permission.userId === session?.user.id)?.level ??
                      (isAdmin ? 'ADMIN' : 'VIEW'),
                  )}`}
                />
              </Stack>
            </Box>

            <Tabs value={tab} onChange={(_, value: TabValue) => update({ tab: value })} variant="scrollable">
              <Tab value="overview" label="Overview" />
              <Tab value="attempts" label="Attempts" />
              <Tab value="findings" label="Findings" />
              <Tab value="runs" label="Runs" />
              <Tab value="settings" label="Settings" />
            </Tabs>

            {tab === 'overview' ? <ExamOverviewTab exam={exam} latestRun={latestRun} /> : null}
            {tab === 'attempts' ? <AttemptsTab examId={exam.id} /> : null}
            {tab === 'findings' ? (
              <FindingsTab
                examId={exam.id}
                type={type}
                status={status}
                onTypeChange={(next) => update({ type: next })}
                onStatusChange={(next) => update({ status: next })}
              />
            ) : null}
            {tab === 'runs' ? <RunsTab examId={exam.id} /> : null}
            {tab === 'settings' ? <SettingsTab exam={exam} canManage={isOwner} /> : null}
          </>
        ) : null}
      </Stack>

      <Dialog open={runAnalysis.isPending} disableEscapeKeyDown fullWidth maxWidth="sm">
        <DialogContent>
          <Stack spacing={2}>
            <Typography variant="h6">Running analysis</Typography>
            <Typography color="text.secondary">
              Pair and incident analyses run separately. This can take a few seconds.
            </Typography>
            <LinearProgress />
          </Stack>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
