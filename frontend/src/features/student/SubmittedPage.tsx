import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import { useQuery } from '@tanstack/react-query';
import { Navigate, useParams } from 'react-router-dom';
import { fetchAttemptState } from '../../api/attemptApi';
import { readAttemptReceipt, readAttemptSession } from '../../auth/storage';
import { EmptyState } from '../../components/EmptyState';
import { LoadingBlock } from '../../components/LoadingBlock';
import { formatDateTime } from '../../lib/format';
import { StudentShell } from './StudentShell';

export function SubmittedPage() {
  const { attemptId } = useParams();
  const id = Number(attemptId);
  const valid = Number.isFinite(id);
  const receipt = valid ? readAttemptReceipt(id) : null;
  const session = valid ? readAttemptSession(id) : null;

  const stateQuery = useQuery({
    queryKey: ['attempt', id, 'receipt'],
    enabled: valid && Boolean(session) && receipt === null,
    retry: false,
    queryFn: () => fetchAttemptState(id, session!.sessionToken),
  });

  if (!valid) {
    return (
      <StudentShell>
        <Alert severity="error">This receipt link is invalid.</Alert>
      </StudentShell>
    );
  }

  if (!receipt && session && stateQuery.isLoading) {
    return (
      <StudentShell>
        <LoadingBlock rows={3} />
      </StudentShell>
    );
  }

  if (!receipt && stateQuery.data?.status === 'IN_PROGRESS') {
    return <Navigate to={`/attempt/${id}`} replace />;
  }

  const submittedAt = receipt?.submittedAt ?? stateQuery.data?.submittedAt ?? null;
  const examTitle = receipt?.examTitle ?? stateQuery.data?.exam.title ?? 'Exam';
  const examCode = receipt?.examCode ?? stateQuery.data?.exam.code ?? '';
  const candidateCode = receipt?.candidateCode ?? session?.candidateCode ?? '';
  const late = receipt?.late ?? false;

  if (!submittedAt && !receipt) {
    return (
      <StudentShell>
        <EmptyState
          title="Submission not confirmed"
          body="We could not confirm the submission from this tab. Ask your invigilator to check the exam attempt list before closing."
        />
      </StudentShell>
    );
  }

  return (
    <StudentShell>
      <Stack spacing={3}>
        <Paper elevation={2} sx={{ p: 4 }}>
          <Stack spacing={2}>
            <Stack direction="row" spacing={1.5} alignItems="center">
              <CheckCircleOutlineIcon color="success" fontSize="large" />
              <Typography variant="h4">Submission received</Typography>
            </Stack>
            <Typography>
              Your answers for <strong>{examTitle}</strong> were received. You can close this tab.
            </Typography>
            <Box>
              <Typography variant="body2" color="text.secondary">
                Candidate: {candidateCode || '—'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Exam code: {examCode || '—'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Submitted: {formatDateTime(submittedAt)}
              </Typography>
            </Box>
            {late ? (
              <Alert severity="warning">
                This submission arrived after the allotted time. The late flag is recorded for review;
                it is not itself a misconduct finding.
              </Alert>
            ) : null}
            <Alert severity="info" variant="outlined">
              Review priority is not a finding of misconduct. A person reviews any finding before any
              action is taken.
            </Alert>
          </Stack>
        </Paper>
        <Button variant="outlined" onClick={() => window.close()} sx={{ alignSelf: 'flex-start' }}>
          Close this tab
        </Button>
      </Stack>
    </StudentShell>
  );
}
