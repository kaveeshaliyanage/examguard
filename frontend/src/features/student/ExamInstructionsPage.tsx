import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import HighlightOffOutlinedIcon from '@mui/icons-material/HighlightOffOutlined';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { fetchAttemptState } from '../../api/attemptApi';
import { clearAttemptSession, readAttemptSession } from '../../auth/storage';
import { LoadingBlock } from '../../components/LoadingBlock';
import { formatDateTime, formatDurationMinutes } from '../../lib/format';
import { ExtensionPanel } from './ExtensionPanel';
import { StudentShell } from './StudentShell';

function Rule({ ok, children }: { ok: boolean; children: string }) {
  return (
    <ListItem disableGutters alignItems="flex-start" sx={{ py: 0.5 }}>
      <ListItemIcon sx={{ minWidth: 32, mt: 0.25 }}>
        {ok ? (
          <CheckCircleOutlineIcon fontSize="small" color="success" />
        ) : (
          <HighlightOffOutlinedIcon fontSize="small" color="disabled" />
        )}
      </ListItemIcon>
      <ListItemText primaryTypographyProps={{ variant: 'body2' }}>{children}</ListItemText>
    </ListItem>
  );
}

export function ExamInstructionsPage() {
  const { attemptId } = useParams();
  const navigate = useNavigate();
  const id = Number(attemptId);
  const valid = Number.isFinite(id);
  const session = valid ? readAttemptSession(id) : null;

  useEffect(() => {
    const onUnauthorized = (event: Event) => {
      const detail = (event as CustomEvent<{ scope?: string }>).detail;
      if (detail?.scope === 'attempt') {
        if (valid) {
          clearAttemptSession(id);
        }
        navigate('/join', { replace: true });
      }
    };
    window.addEventListener('examguard:unauthorized', onUnauthorized);
    return () => window.removeEventListener('examguard:unauthorized', onUnauthorized);
  }, [id, navigate, valid]);

  const stateQuery = useQuery({
    queryKey: ['attempt', id, 'instructions'],
    enabled: valid && Boolean(session),
    retry: false,
    queryFn: () => fetchAttemptState(id, session!.sessionToken),
  });

  if (!valid || !session) {
    return <Navigate to="/join" replace />;
  }

  if (stateQuery.isLoading) {
    return (
      <StudentShell title="Exam briefing">
        <LoadingBlock rows={5} />
      </StudentShell>
    );
  }

  if (stateQuery.isError) {
    return (
      <StudentShell title="Exam briefing">
        <Alert severity="error">
          {stateQuery.error.message} If this keeps happening, ask your invigilator for help.
        </Alert>
      </StudentShell>
    );
  }

  const state = stateQuery.data;
  if (!state) {
    return (
      <StudentShell title="Exam briefing">
        <LoadingBlock rows={5} />
      </StudentShell>
    );
  }

  if (state.status === 'SUBMITTED') {
    return <Navigate to={`/attempt/${id}/submitted`} replace />;
  }

  if (state.status === 'TERMINATED') {
    return <Navigate to={`/attempt/${id}`} replace />;
  }

  const maxStrikes = state.maxStrikes ?? state.exam.maxStrikes ?? 3;
  const instructions = state.exam.instructions?.trim();

  return (
    <StudentShell
      title={state.exam.title}
      right={
        <Chip
          size="small"
          variant="outlined"
          label={`${state.exam.questions.length} questions · ${formatDurationMinutes(state.exam.durationMinutes)}`}
        />
      }
    >
      <Stack spacing={3}>
        <Box>
          <Typography variant="overline" color="text.secondary">
            Pre-exam briefing
          </Typography>
          <Typography variant="h4" gutterBottom>
            {state.exam.title}
          </Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Chip size="small" variant="outlined" label={state.exam.code} />
            <Chip size="small" variant="outlined" label={`Candidate ${session.candidateCode}`} />
            <Chip
              size="small"
              variant="outlined"
              label={`Started ${formatDateTime(state.startedAt)}`}
            />
            <Chip size="small" variant="outlined" label={`${maxStrikes} strikes allowed`} />
          </Stack>
        </Box>

        {instructions ? (
          <Paper variant="outlined" sx={{ p: 2.5 }}>
            <Typography variant="subtitle1" gutterBottom>
              Instructions from your lecturer
            </Typography>
            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
              {instructions}
            </Typography>
          </Paper>
        ) : null}

        <Paper variant="outlined" sx={{ p: 2.5 }}>
          <Typography variant="h6" gutterBottom>
            Pre-exam checks and photo
          </Typography>
          <Typography variant="body2" gutterBottom>
            The exam clock does not start when you join. It starts when you finish these checks and
            confirm your photo:
          </Typography>
          <List dense disablePadding>
            <Rule ok>Full screen, so other windows cannot share the screen.</Rule>
            <Rule ok>A live connection test to the exam server.</Rule>
            <Rule ok>A device check (screen size, processor and that other applications are closed).</Rule>
            <Rule ok>Microphone access and a two-second room-noise sample.</Rule>
            <Rule ok>Camera access, with a check that your face is visible and looking at the screen.</Rule>
            <Rule ok>A photo you review and confirm before the timer starts.</Rule>
          </List>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            You get the full {formatDurationMinutes(state.exam.durationMinutes)} from the moment you
            confirm. The microphone and camera are released once the photo is taken.
          </Typography>
        </Paper>

        <Paper variant="outlined" sx={{ p: 2.5 }}>
          <Typography variant="h6" gutterBottom>
            How this exam is monitored
          </Typography>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={3}>
            <Box sx={{ flex: 1 }}>
              <Typography variant="subtitle2" gutterBottom>
                What this browser records
              </Typography>
              <List dense disablePadding>
                <Rule ok>The pre-exam checks and the photo you confirmed.</Rule>
                <Rule ok>
                  Every time the exam tab is hidden, the exam window loses focus or full screen is
                  exited, with a timestamp.
                </Rule>
                <Rule ok>Connection loss and when it is restored.</Rule>
                <Rule ok>When each answer is saved and revised.</Rule>
                <Rule ok>
                  Domain-level browsing observations, only if you install the monitoring extension.
                </Rule>
              </List>
            </Box>
            <Divider orientation="vertical" flexItem sx={{ display: { xs: 'none', md: 'block' } }} />
            <Box sx={{ flex: 1 }}>
              <Typography variant="subtitle2" gutterBottom>
                What it cannot do
              </Typography>
              <List dense disablePadding>
                <Rule ok={false}>Read the content of other tabs or applications.</Rule>
                <Rule ok={false}>Capture keystrokes or screenshots.</Rule>
                <Rule ok={false}>
                  Keep the camera or microphone on during the exam; both are released before the
                  first question appears.
                </Rule>
                <Rule ok={false}>
                  Guarantee that every off-screen action is observed. Missing observations are unknown,
                  not proof of clean behaviour.
                </Rule>
              </List>
            </Box>
          </Stack>
        </Paper>

        <Paper
          variant="outlined"
          sx={{ p: 2.5, borderColor: 'warning.main', bgcolor: 'warning.light' }}
        >
          <Typography variant="h6" gutterBottom>
            Strike policy
          </Typography>
          <Typography variant="body2" gutterBottom>
            Leaving the exam window is recorded as a focus loss. You may lose focus{' '}
            {Math.max(0, maxStrikes - 1)} time{maxStrikes - 1 === 1 ? '' : 's'}. On focus loss{' '}
            {maxStrikes} of {maxStrikes}, the attempt is terminated automatically and cannot be
            submitted.
          </Typography>
          <Typography variant="body2">
            A blocking warning appears when you return. Reading it and pressing “Resume exam” does not
            add a strike; only leaving does.
          </Typography>
        </Paper>

        <Paper variant="outlined" sx={{ p: 2.5 }}>
          <Typography variant="h6" gutterBottom>
            Answering and autosave
          </Typography>
          <Typography variant="body2">
            Your answers save automatically while the attempt is in progress, including a copy kept in
            this tab. The save indicator in the header tells you whether the latest edit reached the
            server. You can navigate between questions freely before submitting. When the timer reaches
            zero the exam stops immediately and whatever was saved up to that moment is submitted;
            questions not answered by then stay unanswered. Submitting more than once is safe.
          </Typography>
        </Paper>

        <ExtensionPanel
          collectorToken={session.collectorToken}
          connected={state.extensionConnected}
          lastSeenAt={state.lastSeenAt}
        />

        <Alert severity="info" variant="outlined">
          Review priority is not a finding of misconduct. A person reviews any finding before any
          action is taken.
        </Alert>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="flex-end">
          <Button
            variant="contained"
            size="large"
            startIcon={<PlayArrowIcon />}
            onClick={() =>
              navigate(
                state.requiresPreflight && !state.preflightCompletedAt
                  ? `/attempt/${id}/preflight`
                  : `/attempt/${id}`,
                { replace: true },
              )
            }
          >
            {state.requiresPreflight && !state.preflightCompletedAt ? 'Start pre-exam checks' : 'Begin exam'}
          </Button>
        </Stack>
      </Stack>
    </StudentShell>
  );
}
