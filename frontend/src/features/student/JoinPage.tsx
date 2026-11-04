import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '../../api/client';
import { joinExam } from '../../api/attemptApi';
import { writeAttemptSession } from '../../auth/storage';
import { EmptyState } from '../../components/EmptyState';
import { StudentShell } from './StudentShell';

type Failure = { kind: 'conflict' | 'rejected' | 'error'; message: string };

export function JoinPage() {
  const navigate = useNavigate();
  const [examCode, setExamCode] = useState(import.meta.env.VITE_DEFAULT_EXAM_CODE ?? '');
  const [candidateCode, setCandidateCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setFailure(null);
    setBusy(true);
    try {
      const response = await joinExam(examCode.trim(), candidateCode.trim());
      writeAttemptSession({
        attemptId: response.attemptId,
        sessionToken: response.sessionToken,
        collectorToken: response.collectorToken,
        candidateCode: candidateCode.trim(),
        examCode: response.exam.code,
      });
      navigate(`/attempt/${response.attemptId}`, { replace: true });
    } catch (caught) {
      if (caught instanceof ApiError) {
        if (caught.status === 409) {
          setFailure({ kind: 'conflict', message: caught.message });
        } else if (caught.status === 401 || caught.status === 404) {
          setFailure({ kind: 'rejected', message: caught.message });
        } else {
          setFailure({ kind: 'error', message: caught.message });
        }
      } else {
        setFailure({ kind: 'error', message: 'Could not join the exam. Please retry.' });
      }
    } finally {
      setBusy(false);
    }
  };

  const reset = () => setFailure(null);

  return (
    <StudentShell>
      <Stack spacing={3}>
        <Box>
          <Typography variant="h4" gutterBottom>
            Join an exam
          </Typography>
          <Typography color="text.secondary">
            Enter the exam code from your invigilator and your own candidate code.
          </Typography>
        </Box>

        {failure?.kind === 'conflict' ? (
          <EmptyState
            title={
              /already (been )?submitted/i.test(failure.message) ? 'Already submitted' : 'Exam is not open'
            }
            body={`${failure.message}. If you believe this is wrong, contact your invigilator.`}
            action={
              <Button variant="outlined" onClick={reset}>
                Back to join
              </Button>
            }
          />
        ) : null}

        {failure?.kind === 'rejected' ? (
          <EmptyState
            title="Codes not accepted"
            body={`${failure.message}. Check the exam code and your candidate code, then try again.`}
            action={
              <Button variant="outlined" onClick={reset}>
                Try different codes
              </Button>
            }
          />
        ) : null}

        {failure?.kind === 'error' ? (
          <Alert severity="error" onClose={reset}>
            {failure.message}
          </Alert>
        ) : null}

        {failure === null || failure.kind === 'error' ? (
          <Paper elevation={2} sx={{ p: 3 }}>
            <Stack component="form" spacing={2} onSubmit={submit}>
              <TextField
                label="Exam code"
                value={examCode}
                onChange={(event) => setExamCode(event.target.value)}
                required
                fullWidth
                autoComplete="off"
                helperText="For example, DEMO-101."
              />
              <TextField
                label="Candidate code"
                value={candidateCode}
                onChange={(event) => setCandidateCode(event.target.value)}
                required
                fullWidth
                autoComplete="off"
                inputProps={{ autoCapitalize: 'characters' }}
                helperText="Use the candidate code assigned to you, not your name or email."
              />
              <Box>
                <Button type="submit" variant="contained" size="large" disabled={busy}>
                  {busy ? 'Joining…' : 'Join exam'}
                </Button>
              </Box>
            </Stack>
          </Paper>
        ) : null}
      </Stack>
    </StudentShell>
  );
}
