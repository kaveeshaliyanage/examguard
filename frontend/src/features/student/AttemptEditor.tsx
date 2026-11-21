import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import LinearProgress from '@mui/material/LinearProgress';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import FlagOutlinedIcon from '@mui/icons-material/FlagOutlined';
import FlagIcon from '@mui/icons-material/Flag';
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '../../api/client';
import { submitAttempt } from '../../api/attemptApi';
import type { AnswerView, AttemptState, ExamQuestion, SubmitResponse } from '../../api/types';
import { writeAttemptReceipt, type AttemptSession } from '../../auth/storage';
import { UnsavedChangesGuard } from '../../components/UnsavedChangesGuard';
import { useToast } from '../../components/ToastProvider';
import { integrityToneFor, integrityTones } from '../../design/tokens';
import { formatDurationMinutes, humanize } from '../../lib/format';
import { AttemptStatusChip, ExamHeader } from './AttemptHeader';
import { ExtensionPanel } from './ExtensionPanel';
import { IntegrityWarningDialog } from './IntegrityWarningDialog';
import { QuestionNavigator } from './QuestionNavigator';
import { QuestionRenderer } from './QuestionRenderer';
import { SaveIndicator } from './SaveIndicator';
import { StudentShell } from './StudentShell';
import { TerminatedScreen } from './TerminatedScreen';
import { useAutosave } from './useAutosave';
import { useCountdown } from './useCountdown';
import { useIntegrityMonitor } from './useIntegrityMonitor';

function receiptFor(state: AttemptState, session: AttemptSession, response: SubmitResponse): void {
  writeAttemptReceipt({
    attemptId: state.attemptId,
    candidateCode: session.candidateCode,
    examCode: state.exam.code,
    examTitle: state.exam.title,
    submittedAt: response.submittedAt,
    late: response.late,
  });
}

function answerIsEmpty(text: string | undefined, selected: string[] | undefined): boolean {
  return (text ?? '').trim().length === 0 && (selected ?? []).length === 0;
}

/** The attempt payload may omit untouched questions; autosave still needs an entry for each. */
function withEveryQuestion(questions: ExamQuestion[], answers: AnswerView[]): AnswerView[] {
  const byId = new Map(answers.map((answer) => [answer.questionId, answer]));
  return questions.map(
    (question) =>
      byId.get(question.id) ?? {
        questionId: question.id,
        text: question.type === 'CODE' ? question.content?.starterCode ?? '' : '',
        selectedOptions: [],
        revisionNo: 0,
        savedAt: null,
      },
  );
}

export function AttemptEditor({
  state,
  session,
}: {
  state: AttemptState;
  session: AttemptSession;
}) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resumeDismissed, setResumeDismissed] = useState(false);
  const [activeId, setActiveId] = useState<number>(state.exam.questions[0]?.id ?? 0);
  const [flagged, setFlagged] = useState<Set<number>>(() => new Set());
  const [strikeCount, setStrikeCount] = useState(state.strikeCount ?? 0);
  const [maxStrikes, setMaxStrikes] = useState(state.maxStrikes ?? state.exam.maxStrikes ?? 3);
  const [terminated, setTerminated] = useState(state.status === 'TERMINATED');
  const [termination, setTermination] = useState({
    at: state.terminatedAt,
    reason:
      state.terminationReason ??
      (state.status === 'TERMINATED' ? 'The attempt was terminated after repeated focus loss.' : null),
  });
  const [warning, setWarning] = useState<number | null>(null);
  const [integrityError, setIntegrityError] = useState<string | null>(null);
  const [autosaveStopped, setAutosaveStopped] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const questions = state.exam.questions;
  const initialAnswers = useMemo(() => withEveryQuestion(questions, state.answers), [questions, state.answers]);

  const autosave = useAutosave({
    attemptId: state.attemptId,
    token: session.sessionToken,
    initialAnswers,
    enabled: state.status === 'IN_PROGRESS' && !terminated,
    onUnauthorized: () => navigate('/join', { replace: true }),
    onSaveStopped: (caught) => {
      setAutosaveStopped(caught.message);
      showToast('Autosave stopped. Your latest text is kept in this tab.', { severity: 'error' });
    },
  });

  const submit = useCallback(
    async (auto: boolean) => {
      if (submittingRef.current || terminated) {
        return;
      }
      submittingRef.current = true;
      setSubmitting(true);
      setError(null);
      try {
        await autosave.flushAll();
        const response = await submitAttempt(state.attemptId, session.sessionToken);
        receiptFor(state, session, response);
        navigate(`/attempt/${state.attemptId}/submitted`, { replace: true });
      } catch (caught) {
        const message =
          caught instanceof ApiError
            ? auto && caught.path === 'autosave'
              ? 'Time is up, but some answers could not be saved, so the exam was not submitted. Reconnect and submit again.'
              : caught.message
            : auto
              ? 'Time is up but the submission did not reach the server. Please submit again.'
              : 'Could not submit the exam. Your attempt is still open; please retry.';
        setError(message);
        setConfirmOpen(false);
        submittingRef.current = false;
        setSubmitting(false);
      }
    },
    [autosave, navigate, session, state, terminated],
  );

  const countdown = useCountdown({
    startedAt: state.startedAt,
    durationMinutes: state.exam.durationMinutes,
    serverNow: state.serverNow,
    enabled: state.status === 'IN_PROGRESS' && !submitting && !terminated,
    onExpire: () => {
      void submit(true);
    },
  });

  const applyTermination = useCallback((at: string | null, reason: string | null) => {
    setTerminated(true);
    setWarning(null);
    setTermination({ at, reason });
  }, []);

  const handleSignal = useCallback(
    (result: { strikeCount: number; maxStrikes: number; terminated: boolean; status: string }, signal: string) => {
      setStrikeCount(result.strikeCount);
      setMaxStrikes(result.maxStrikes);
      if (result.terminated || result.status === 'TERMINATED') {
        applyTermination(new Date().toISOString(), 'Three focus losses were recorded during the attempt.');
        return;
      }
      if (signal === 'FOCUS_RETURN') {
        setWarning(result.strikeCount);
      }
    },
    [applyTermination],
  );

  useIntegrityMonitor({
    attemptId: state.attemptId,
    token: session.sessionToken,
    enabled: state.status === 'IN_PROGRESS' && !terminated,
    paused: warning !== null,
    onSignal: handleSignal,
    onError: () => {
      setIntegrityError(
        'A focus change could not be recorded on the server. Stay in this window and keep this tab open; the attempt is still running.',
      );
    },
  });

  const activeIndex = Math.max(
    0,
    questions.findIndex((question) => question.id === activeId),
  );
  const activeQuestion: ExamQuestion | undefined = questions[activeIndex];
  const draft = activeQuestion ? autosave.answers[activeQuestion.id] : undefined;
  const currentValue = {
    text: draft?.text ?? '',
    selectedOptions: draft?.selectedOptions ?? [],
  };

  const navigatorAnswers = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(autosave.answers).map(([key, value]) => [
          Number(key),
          { text: value.text, selectedOptions: value.selectedOptions },
        ]),
      ) as Record<number, { text: string; selectedOptions: string[] }>,
    [autosave.answers],
  );

  const unanswered = useMemo(
    () =>
      questions.filter((question) => {
        const answer = autosave.answers[question.id];
        return answerIsEmpty(answer?.text, answer?.selectedOptions);
      }),
    [autosave.answers, questions],
  );

  const remainingStrikes = Math.max(0, maxStrikes - strikeCount);
  const tone = integrityTones[integrityToneFor(remainingStrikes, maxStrikes)];
  const resumed = !resumeDismissed && state.answers.some((answer) => answer.text.trim().length > 0);

  const goTo = (offset: number) => {
    const next = questions[activeIndex + offset];
    if (next) {
      setActiveId(next.id);
    }
  };

  const toggleFlag = () => {
    if (!activeQuestion) {
      return;
    }
    setFlagged((previous) => {
      const next = new Set(previous);
      if (next.has(activeQuestion.id)) {
        next.delete(activeQuestion.id);
      } else {
        next.add(activeQuestion.id);
      }
      return next;
    });
  };

  if (terminated) {
    return (
      <StudentShell title={state.exam.title} maxWidth="lg">
        <TerminatedScreen
          examTitle={state.exam.title}
          candidateCode={session.candidateCode}
          attemptId={state.attemptId}
          terminatedAt={termination.at}
          reason={termination.reason}
          strikeCount={strikeCount}
          maxStrikes={maxStrikes}
          questions={questions}
          answers={navigatorAnswers}
        />
      </StudentShell>
    );
  }

  return (
    <StudentShell
      title={state.exam.title}
      maxWidth="xl"
      right={
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <Chip
            label={`Time remaining ${countdown.label}`}
            color={countdown.expired ? 'error' : countdown.warning ? 'warning' : 'default'}
            variant={countdown.expired || countdown.warning ? 'filled' : 'outlined'}
            aria-label="Time remaining"
          />
          <SaveIndicator status={autosave.overallStatus} lastSavedAt={autosave.lastSavedAt} />
          <Chip
            size="small"
            label={`Strikes ${strikeCount} / ${maxStrikes} · ${remainingStrikes} left`}
            aria-label="Strikes remaining"
            sx={{
              bgcolor: tone.soft,
              color: tone.text,
              border: `1px solid ${tone.border}`,
            }}
          />
        </Stack>
      }
    >
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', lg: '296px minmax(0, 1fr)' },
          gap: 2,
          alignItems: 'start',
        }}
      >
        <Stack spacing={2} sx={{ order: { xs: 2, lg: 1 }, position: { lg: 'sticky' }, top: { lg: 88 } }}>
          <QuestionNavigator
            questions={questions}
            answers={navigatorAnswers}
            flagged={flagged}
            activeQuestionId={activeQuestion?.id ?? 0}
            onJump={setActiveId}
            onSubmit={() => setConfirmOpen(true)}
            submitting={submitting}
          />
          <ExtensionPanel
            collectorToken={session.collectorToken}
            connected={state.extensionConnected}
            lastSeenAt={state.lastSeenAt}
          />
        </Stack>

        <Stack spacing={2} sx={{ order: { xs: 1, lg: 2 }, minWidth: 0 }}>
          <ExamHeader
            state={state}
            candidateCode={session.candidateCode}
            countdownWarning={countdown.warning}
          />

          {resumed ? (
            <Alert severity="info" onClose={() => setResumeDismissed(true)}>
              Your previous answers were restored. Autosave is on.
            </Alert>
          ) : null}

          {countdown.warning && state.status === 'IN_PROGRESS' ? (
            <Alert severity="warning">
              Less than 5 minutes remain. Your answers are saved automatically; submit before the timer
              reaches zero.
            </Alert>
          ) : null}

          {state.status === 'EXPIRED' ? (
            <Alert severity="warning">
              The allotted time has ended. Autosave is off; submit now to send the answers already saved.
            </Alert>
          ) : null}

          {integrityError ? (
            <Alert severity="warning" onClose={() => setIntegrityError(null)}>
              {integrityError}
            </Alert>
          ) : null}

          {autosaveStopped ? (
            <Alert severity="error" onClose={() => setAutosaveStopped(null)}>
              {autosaveStopped}
            </Alert>
          ) : null}

          {error ? <Alert severity="error">{error}</Alert> : null}
          {submitting ? <LinearProgress /> : null}

          {activeQuestion ? (
            <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
              <Stack spacing={2}>
                <Stack
                  direction="row"
                  spacing={1}
                  alignItems="center"
                  flexWrap="wrap"
                  useFlexGap
                  justifyContent="space-between"
                >
                  <Box>
                    <Typography variant="overline" color="text.secondary">
                      Question {activeQuestion.orderIndex} of {questions.length}
                    </Typography>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Chip size="small" variant="outlined" label={humanize(activeQuestion.type)} />
                      <Chip size="small" variant="outlined" label={`${activeQuestion.points} pts`} />
                    </Stack>
                  </Box>
                  <Button
                    size="small"
                    color={flagged.has(activeQuestion.id) ? 'warning' : 'inherit'}
                    startIcon={flagged.has(activeQuestion.id) ? <FlagIcon /> : <FlagOutlinedIcon />}
                    onClick={toggleFlag}
                    aria-pressed={flagged.has(activeQuestion.id)}
                  >
                    {flagged.has(activeQuestion.id) ? 'Flagged for review' : 'Flag for review'}
                  </Button>
                </Stack>

                <Typography variant="h6" component="h2" sx={{ lineHeight: 1.45 }}>
                  {activeQuestion.prompt}
                </Typography>

                <QuestionRenderer
                  question={activeQuestion}
                  value={currentValue}
                  disabled={submitting || state.status === 'EXPIRED'}
                  onChange={(value) =>
                    autosave.setAnswer(activeQuestion.id, value.text, value.selectedOptions)
                  }
                />

                <Divider />
                <Stack direction="row" spacing={1} justifyContent="space-between">
                  <Button
                    startIcon={<NavigateBeforeIcon />}
                    onClick={() => goTo(-1)}
                    disabled={activeIndex === 0}
                  >
                    Previous
                  </Button>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <AttemptStatusChip status={state.status} />
                    <Button
                      endIcon={<NavigateNextIcon />}
                      onClick={() => goTo(1)}
                      disabled={activeIndex >= questions.length - 1}
                    >
                      Next
                    </Button>
                  </Stack>
                </Stack>
              </Stack>
            </Paper>
          ) : (
            <Alert severity="info">This exam has no questions yet.</Alert>
          )}

          <Paper variant="outlined" sx={{ p: 2 }}>
            <Stack
              direction="row"
              spacing={2}
              alignItems="center"
              justifyContent="space-between"
              flexWrap="wrap"
            >
              <Box>
                <Typography variant="subtitle2">
                  {unanswered.length === 0
                    ? 'All questions have an answer.'
                    : `${unanswered.length} question(s) still have no answer.`}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {formatDurationMinutes(state.exam.durationMinutes)} allowed · answers autosave
                </Typography>
              </Box>
              <Button
                variant="contained"
                size="large"
                onClick={() => setConfirmOpen(true)}
                disabled={submitting}
              >
                {submitting ? 'Submitting…' : 'Submit exam'}
              </Button>
            </Stack>
          </Paper>
        </Stack>
      </Box>

      <IntegrityWarningDialog
        open={warning !== null}
        strikeCount={warning ?? strikeCount}
        maxStrikes={maxStrikes}
        onResume={() => {
          setWarning(null);
          void autosave
            .flushAll()
            .then(() => {
              showToast('Resumed. Your answers are saved.', { severity: 'success', duration: 3500 });
            })
            .catch(() => {
              showToast('Resumed, but some answers are still not saved. Reconnect and retry.', {
                severity: 'error',
              });
            });
        }}
      />

      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Submit exam?</DialogTitle>
        <DialogContent>
          <Stack spacing={2}>
            <Typography>
              You cannot edit your answers after submitting. Submitting more than once is safe.
            </Typography>
            {unanswered.length > 0 ? (
              <Alert severity="warning">
                <Typography variant="body2" gutterBottom>
                  Unanswered questions:
                </Typography>
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {unanswered.map((question) => (
                    <li key={question.id}>
                      Q{question.orderIndex}: {question.prompt}
                    </li>
                  ))}
                </ul>
              </Alert>
            ) : (
              <Alert severity="success">Every question has an answer.</Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)} disabled={submitting}>
            Keep editing
          </Button>
          <Button variant="contained" onClick={() => void submit(false)} disabled={submitting}>
            Submit now
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={countdown.expired && submitting} disableEscapeKeyDown fullWidth maxWidth="xs">
        <DialogContent>
          <Stack spacing={2}>
            <Typography variant="h6">Time is up</Typography>
            <Typography>Submitting your answers. Please keep this tab open.</Typography>
            <LinearProgress />
          </Stack>
        </DialogContent>
      </Dialog>

      <UnsavedChangesGuard when={autosave.hasUnsavedChanges && !submitting && !terminated} />
    </StudentShell>
  );
}
