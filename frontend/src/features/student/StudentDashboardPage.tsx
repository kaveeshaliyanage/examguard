import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import LoginIcon from '@mui/icons-material/Login';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { ApiError } from '../../api/client';
import { useStudentDashboard } from '../../api/dashboardApi';
import { joinStudentExam } from '../../api/studentApi';
import type { StudentAttemptSummary } from '../../api/types';
import { writeAttemptSession } from '../../auth/storage';
import { AppShell } from '../../components/AppShell';
import { DataTable } from '../../components/DataTable';
import type { DataTableColumn } from '../../components/DataTable';
import { EmptyState } from '../../components/EmptyState';
import { LoadingBlock } from '../../components/LoadingBlock';
import { StatusChip } from '../../components/StatusChip';
import { StatCard } from '../dashboard/StatCard';
import { useToast } from '../../components/ToastProvider';
import { formatDateTime } from '../../lib/format';
import { useStudentAuth } from './StudentAuthProvider';

function StudentSignInCard() {
  const { signIn, register } = useStudentAuth();
  const { showToast } = useToast();
  const [tab, setTab] = useState(0);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (tab === 0) {
        await signIn(email.trim(), password);
      } else {
        await register(email.trim(), password, displayName.trim());
      }
      showToast('Signed in. Welcome back.', { severity: 'success' });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Sign-in failed. Please retry.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Paper elevation={2} sx={{ p: { xs: 2.5, md: 4 }, maxWidth: 520, mx: 'auto', width: '100%' }}>
      <Stack spacing={2}>
        <Box>
          <Typography variant="h5" gutterBottom>
            Student portal
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Sign in to see your exams and results, or register with the email your lecturer has on file.
          </Typography>
        </Box>
        <Tabs value={tab} onChange={(_, value: number) => setTab(value)} aria-label="Student account">
          <Tab label="Sign in" />
          <Tab label="Register" />
        </Tabs>
        {error ? <Alert severity="error">{error}</Alert> : null}
        <Stack component="form" spacing={2} onSubmit={submit}>
          {tab === 1 ? (
            <TextField
              label="Display name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              required
              fullWidth
              autoComplete="name"
            />
          ) : null}
          <TextField
            label="Email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            fullWidth
            autoComplete="username"
          />
          <TextField
            label="Password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            fullWidth
            autoComplete={tab === 0 ? 'current-password' : 'new-password'}
          />
          <Button type="submit" variant="contained" size="large" disabled={busy}>
            {busy ? 'Please wait…' : tab === 0 ? 'Sign in' : 'Create account'}
          </Button>
        </Stack>
        <Button component={RouterLink} to="/join" variant="text" startIcon={<LoginIcon />}>
          Join an exam with a code without signing in
        </Button>
      </Stack>
    </Paper>
  );
}

interface JoinByCodeCardProps {
  token: string;
  examCode: string;
  onExamCodeChange: (value: string) => void;
}

function JoinByCodeCard({ token, examCode, onExamCodeChange }: JoinByCodeCardProps) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [candidateCode, setCandidateCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const response = await joinStudentExam(token, examCode.trim(), candidateCode.trim());
      writeAttemptSession({
        attemptId: response.attemptId,
        sessionToken: response.sessionToken,
        collectorToken: response.collectorToken,
        candidateCode: candidateCode.trim(),
        examCode: response.exam.code,
      });
      showToast('Joined. Read the briefing before you begin.', { severity: 'success' });
      navigate(`/attempt/${response.attemptId}/instructions`);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not join the exam. Please retry.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Paper variant="outlined" sx={{ p: 2.5 }}>
      <Stack spacing={2}>
        <Box>
          <Typography variant="h6" component="h5">Join an exam</Typography>
          <Typography variant="body2" color="text.secondary">
            Enter the exam code from your invigilator and your candidate code.
          </Typography>
        </Box>
        {error ? <Alert severity="error">{error}</Alert> : null}
        <Stack component="form" onSubmit={submit} spacing={2} direction={{ xs: 'column', sm: 'row' }}>
          <TextField
            label="Exam code"
            value={examCode}
            onChange={(event) => onExamCodeChange(event.target.value)}
            required
            fullWidth
            autoComplete="off"
          />
          <TextField
            label="Candidate code"
            value={candidateCode}
            onChange={(event) => setCandidateCode(event.target.value)}
            required
            fullWidth
            autoComplete="off"
          />
          <Button type="submit" variant="contained" disabled={busy} sx={{ flexShrink: 0, height: 40 }}>
            {busy ? 'Joining…' : 'Join'}
          </Button>
        </Stack>
      </Stack>
    </Paper>
  );
}

const resultColumns: DataTableColumn<StudentAttemptSummary>[] = [
  {
    id: 'exam',
    header: 'Exam',
    accessorFn: (row) => row.examTitle,
    cell: (row) => (
      <Box>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {row.examTitle}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {row.examCode}
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
    accessorFn: (row) => row.submittedAt ?? '',
    cell: (row) => formatDateTime(row.submittedAt),
  },
  {
    id: 'score',
    header: 'Score',
    align: 'right',
    accessorFn: (row) => (row.released ? row.scorePoints ?? 0 : -1),
    cell: (row) =>
      row.released ? (
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {row.scorePoints ?? 0} / {row.maxPoints ?? 0}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Released
          </Typography>
        </Box>
      ) : (
        <Chip size="small" variant="outlined" label="Not released" />
      ),
  },
  {
    id: 'strikes',
    header: 'Strikes',
    align: 'right',
    accessorFn: (row) => row.strikes,
  },
];

export function StudentDashboardPage() {
  const { session } = useStudentAuth();
  const navigate = useNavigate();
  const attemptsQuery = useStudentDashboard(session?.token);
  const [examCode, setExamCode] = useState('');

  const upcoming = useMemo(() => attemptsQuery.data?.upcoming ?? [], [attemptsQuery.data]);
  const attempts = useMemo(() => attemptsQuery.data?.attempts ?? [], [attemptsQuery.data]);
  const stats = attemptsQuery.data?.stats;
  const inProgress = useMemo(
    () => attempts.filter((attempt) => attempt.status === 'IN_PROGRESS'),
    [attempts],
  );
  const results = useMemo(
    () => attempts.filter((attempt) => attempt.status !== 'IN_PROGRESS'),
    [attempts],
  );

  if (!session) {
    return (
      <AppShell area="student" maxWidth="md">
        <Stack spacing={3} sx={{ py: { xs: 2, md: 4 } }}>
          <StudentSignInCard />
        </Stack>
      </AppShell>
    );
  }

  return (
    <AppShell
      area="student"
      maxWidth="lg"
      breadcrumb={<Typography variant="body2">Dashboard</Typography>}
      actions={
        <Button component={RouterLink} to="/join" variant="outlined" startIcon={<LoginIcon />} size="small">
          Join with a code
        </Button>
      }
    >
      <Stack spacing={3}>
        <Box>
          <Typography variant="h4" gutterBottom>
            Welcome, {session.user.displayName}
          </Typography>
          <Typography color="text.secondary">
            Everything you need for upcoming exams, results and integrity records.
          </Typography>
        </Box>

        {attemptsQuery.isError ? (
          <Alert severity="error">
            {attemptsQuery.error.message} If this keeps happening, contact your lecturer.
          </Alert>
        ) : null}

        {stats ? (
          <Box
            sx={{
              display: 'grid',
              gap: 2,
              gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(4, 1fr)' },
            }}
          >
            <StatCard label="Attempts" value={stats.totalAttempts} />
            <StatCard label="Submitted" value={stats.submitted} />
            <StatCard label="Released results" value={stats.released} />
            <StatCard
              label="Average score"
              value={stats.averagePercentage === null ? '—' : `${stats.averagePercentage}%`}
              hint={stats.averagePercentage === null ? 'Available after release' : 'Released exams only'}
              tone={stats.terminated > 0 ? 'warning' : 'default'}
            />
          </Box>
        ) : null}

        {stats && stats.strikesThisTerm > 0 ? (
          <Alert severity="info" variant="outlined">
            {stats.strikesThisTerm} focus-loss signal{stats.strikesThisTerm === 1 ? '' : 's'} recorded
            across your attempts. Your answers are still saved and graded normally; a person reviews the
            record before any action is taken.
          </Alert>
        ) : null}

        <JoinByCodeCard
          token={session.token}
          examCode={examCode}
          onExamCodeChange={setExamCode}
        />

        <Box>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
            <Typography variant="h6" component="h5">Upcoming and available exams</Typography>
            {upcoming.length > 0 ? <Chip size="small" label={upcoming.length} /> : null}
          </Stack>
          {attemptsQuery.isLoading ? (
            <LoadingBlock rows={1} />
          ) : upcoming.length === 0 ? (
            <EmptyState
              title="Nothing scheduled"
              body="Exams your lecturer enrols you in appear here with their opening time."
            />
          ) : (
            <Stack spacing={1.5}>
              {upcoming.map((exam) => (
                <Paper key={exam.examId} variant="outlined" sx={{ p: 2 }}>
                  <Stack
                    direction={{ xs: 'column', sm: 'row' }}
                    spacing={2}
                    alignItems={{ xs: 'flex-start', sm: 'center' }}
                    justifyContent="space-between"
                  >
                    <Box>
                      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                          {exam.title}
                        </Typography>
                        <Chip size="small" variant="outlined" label={exam.code} />
                        <Chip
                          size="small"
                          variant="outlined"
                          color={exam.openNow ? 'success' : 'default'}
                          label={exam.openNow ? 'Open now' : 'Scheduled'}
                        />
                      </Stack>
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        {exam.openNow
                          ? exam.closesAt
                            ? `Closes ${formatDateTime(exam.closesAt)}`
                            : 'Open until your lecturer closes it'
                          : exam.opensAt
                            ? `Opens ${formatDateTime(exam.opensAt)}`
                            : 'Opening time not set'}
                      </Typography>
                    </Box>
                    {exam.openNow ? (
                      <Button
                        variant="contained"
                        startIcon={<PlayCircleOutlineIcon />}
                        onClick={() => setExamCode(exam.code)}
                      >
                        Join
                      </Button>
                    ) : null}
                  </Stack>
                </Paper>
              ))}
            </Stack>
          )}
        </Box>

        <Box>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
            <Typography variant="h6" component="h5">In progress</Typography>
            {inProgress.length > 0 ? <Chip size="small" label={inProgress.length} /> : null}
          </Stack>
          {attemptsQuery.isLoading ? (
            <LoadingBlock rows={2} />
          ) : inProgress.length === 0 ? (
            <EmptyState
              title="No exam in progress"
              body="Your lecturer will give you an exam code when it is time. Join by code above; the exam appears here once started."
            />
          ) : (
            <Stack spacing={1.5}>
              {inProgress.map((attempt) => (
                <Paper key={attempt.attemptId} variant="outlined" sx={{ p: 2 }}>
                  <Stack
                    direction={{ xs: 'column', sm: 'row' }}
                    spacing={2}
                    alignItems={{ xs: 'flex-start', sm: 'center' }}
                    justifyContent="space-between"
                  >
                    <Box>
                      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                          {attempt.examTitle}
                        </Typography>
                        <StatusChip status={attempt.status} />
                        <Chip size="small" variant="outlined" label={attempt.examCode} />
                      </Stack>
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        Started {formatDateTime(attempt.startedAt)} · strikes {attempt.strikes}
                      </Typography>
                    </Box>
                    <Button
                      variant="contained"
                      startIcon={<PlayCircleOutlineIcon />}
                      onClick={() => navigate(`/attempt/${attempt.attemptId}`)}
                    >
                      Resume exam
                    </Button>
                  </Stack>
                </Paper>
              ))}
            </Stack>
          )}
        </Box>

        <Box>
          <Typography variant="h6" component="h5" gutterBottom>
            Results
          </Typography>
          {attemptsQuery.isLoading ? (
            <LoadingBlock rows={3} />
          ) : (
            <DataTable
              data={results}
              columns={resultColumns}
              ariaLabel="My results"
              searchPlaceholder="Search results…"
              emptyTitle="No results yet"
              emptyBody="Submitted attempts and released marks will appear here after your exams."
              getRowId={(row) => String(row.attemptId)}
              onRowClick={(row) => navigate(`/attempt/${row.attemptId}/report`)}
              initialState={{ pageSize: 10 }}
            />
          )}
        </Box>

        <Alert severity="info" variant="outlined">
          Review priority is not a finding of misconduct. A person reviews any integrity signal before
          any action is taken.
        </Alert>
      </Stack>
    </AppShell>
  );
}
