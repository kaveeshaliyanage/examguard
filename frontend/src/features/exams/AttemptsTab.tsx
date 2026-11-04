import Alert from '@mui/material/Alert';
import Chip from '@mui/material/Chip';
import Paper from '@mui/material/Paper';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import { useExamAttempts } from '../../api/staffQueries';
import { EmptyState } from '../../components/EmptyState';
import { LoadingBlock } from '../../components/LoadingBlock';
import { StatusChip } from '../../components/StatusChip';
import { formatDateTime, formatPercent } from '../../lib/format';

export function AttemptsTab({ examId }: { examId: number }) {
  const attempts = useExamAttempts(examId);

  if (attempts.isLoading) {
    return <LoadingBlock rows={4} />;
  }
  if (attempts.isError) {
    return <Alert severity="error">{attempts.error.message}</Alert>;
  }
  if (!attempts.data || attempts.data.length === 0) {
    return (
      <EmptyState
        title="No attempts yet"
        body="Share the exam code with candidates. Submitted attempts appear here after they join."
      />
    );
  }

  return (
    <TableContainer component={Paper} variant="outlined">
      <Table size="small" aria-label="Attempts">
        <TableHead>
          <TableRow>
            <TableCell>Candidate</TableCell>
            <TableCell>Status</TableCell>
            <TableCell>Started</TableCell>
            <TableCell>Submitted</TableCell>
            <TableCell align="right">Answers</TableCell>
            <TableCell align="right">Events</TableCell>
            <TableCell>Coverage</TableCell>
            <TableCell>Late</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {attempts.data.map((attempt) => (
            <TableRow key={attempt.attemptId} hover>
              <TableCell sx={{ fontWeight: 600 }}>{attempt.candidateCode}</TableCell>
              <TableCell>
                <StatusChip status={attempt.status} />
              </TableCell>
              <TableCell>{formatDateTime(attempt.startedAt)}</TableCell>
              <TableCell>{formatDateTime(attempt.submittedAt)}</TableCell>
              <TableCell align="right">{attempt.answerCount}</TableCell>
              <TableCell align="right">{attempt.eventCount}</TableCell>
              <TableCell>
                <Chip
                  size="small"
                  variant="outlined"
                  color={attempt.coverageWarning ? 'warning' : 'default'}
                  label={
                    attempt.coverageWarning
                      ? `Coverage ${formatPercent(attempt.coveragePercent)} — unknown, not clean`
                      : `Coverage ${formatPercent(attempt.coveragePercent)}`
                  }
                />
              </TableCell>
              <TableCell>{attempt.lateSubmission ? 'Yes' : 'No'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
