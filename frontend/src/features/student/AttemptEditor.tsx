import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import LinearProgress from '@mui/material/LinearProgress';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '../../api/client';
import { submitAttempt } from '../../api/attemptApi';
import type { AttemptState, ExamQuestion, SubmitResponse } from '../../api/types';
import { writeAttemptReceipt, type AttemptSession } from '../../auth/storage';
import { AttemptStatusChip, ExamHeader } from './AttemptHeader';
import { ExtensionPanel } from './ExtensionPanel';
import { SaveIndicator } from './SaveIndicator';
import { StudentShell } from './StudentShell';
import { useAutosave } from './useAutosave';
import { useCountdown } from './useCountdown';

function wordCount(text: string): number {
  return text.trim().length === 0 ? 0 : text.trim().split(/\s+/).length;
}

function QuestionField({
  question,
  index,
  text,
  disabled,
  onChange,
  onBlur,
}: {
  question: ExamQuestion;
  index: number;
  text: string;
  disabled: boolean;
  onChange: (text: string) => void;
  onBlur: () => void;
}) {
  const count = wordCount(text);
  const over = count > question.maxWords;
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Typography variant="subtitle1" gutterBottom>
        Q{question.orderIndex ?? index + 1}. {question.prompt}
      </Typography>
      <TextField
        value={text}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        disabled={disabled}
        multiline
        minRows={4}
        maxRows={16}
        fullWidth
        placeholder="Type your answer here. It saves automatically."
        error={over}
        helperText={`${count} / ${question.maxWords} words${over ? ' — over the limit' : ''}`}
        inputProps={{ 'aria-label': `Answer for question ${question.orderIndex ?? index + 1}` }}
      />
    </Paper>
  );
}

function receiptFor(
  state: AttemptState,
  session: AttemptSession,
  response: SubmitResponse,
): void {
  writeAttemptReceipt({
    attemptId: state.attemptId,
    candidateCode: session.candidateCode,
    examCode: state.exam.code,
    examTitle: state.exam.title,
    submittedAt: response.submittedAt,
    late: response.late,
  });
}

export function AttemptEditor({
  state,
  session,
}: {
  state: AttemptState;
  session: AttemptSession;
}) {
  const navigate = useNavigate();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resumeDismissed, setResumeDismissed] = useState(false);
  const submittingRef = useRef(false);

  const autosave = useAutosave({
    attemptId: state.attemptId,
    token: session.sessionToken,
    initialAnswers: state.answers,
    enabled: state.status === 'IN_PROGRESS',
    onUnauthorized: () => navigate('/join', { replace: true }),
  });

  const submit = useCallback(
    async (auto: boolean) => {
      if (submittingRef.current) {
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
            ? caught.message
            : auto
              ? 'Time is up but the submission did not reach the server. Please submit again.'
              : 'Could not submit the exam. Your attempt is still open; please retry.';
        setError(message);
        setConfirmOpen(false);
        submittingRef.current = false;
        setSubmitting(false);
      }
    },
    [autosave, navigate, session, state],
  );

  const countdown = useCountdown({
    startedAt: state.startedAt,
    durationMinutes: state.exam.durationMinutes,
    serverNow: state.serverNow,
    enabled: state.status === 'IN_PROGRESS' && !submitting,
    onExpire: () => {
      void submit(true);
    },
  });

  const unanswered = useMemo(
    () =>
      state.exam.questions.filter(
        (question) => (autosave.answers[question.id]?.text ?? '').trim().length === 0,
      ),
    [autosave.answers, state.exam.questions],
  );

  const resumed = !resumeDismissed && state.answers.some((answer) => answer.text.trim().length > 0);

  return (
    <StudentShell
      title={state.exam.title}
      right={
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <Chip
            label={`Time remaining ${countdown.label}`}
            color={countdown.expired ? 'error' : countdown.warning ? 'warning' : 'default'}
            variant={countdown.expired || countdown.warning ? 'filled' : 'outlined'}
          />
          <SaveIndicator status={autosave.overallStatus} lastSavedAt={autosave.lastSavedAt} />
        </Stack>
      }
    >
      <Stack spacing={2}>
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

        {countdown.warning ? (
          <Alert severity="warning">
            Less than 5 minutes remain. Your answers are saved automatically; submit before the
            timer reaches zero.
          </Alert>
        ) : null}

        {error ? <Alert severity="error">{error}</Alert> : null}
        {submitting ? <LinearProgress /> : null}

        <ExtensionPanel
          collectorToken={session.collectorToken}
          connected={state.extensionConnected}
          lastSeenAt={state.lastSeenAt}
        />

        {state.exam.questions.map((question, index) => (
          <QuestionField
            key={question.id}
            question={question}
            index={index}
            text={autosave.answers[question.id]?.text ?? ''}
            disabled={submitting}
            onChange={(text) => autosave.setAnswer(question.id, text)}
            onBlur={() => void autosave.flush(question.id)}
          />
        ))}

        <Paper variant="outlined" sx={{ p: 2 }}>
          <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between" flexWrap="wrap">
            <Box>
              <AttemptStatusChip status={state.status} />
              <Typography variant="caption" display="block" color="text.secondary">
                {unanswered.length === 0
                  ? 'All questions have an answer.'
                  : `${unanswered.length} question(s) still have no answer.`}
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
    </StudentShell>
  );
}
