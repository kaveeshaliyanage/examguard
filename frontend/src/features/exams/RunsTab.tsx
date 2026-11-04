import Alert from '@mui/material/Alert';
import Paper from '@mui/material/Paper';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { useAnalysisRuns } from '../../api/staffQueries';
import { EmptyState } from '../../components/EmptyState';
import { LoadingBlock } from '../../components/LoadingBlock';
import { StatusChip } from '../../components/StatusChip';
import { formatDateTime } from '../../lib/format';

export function RunsTab({ examId }: { examId: number }) {
  const runs = useAnalysisRuns(examId);

  if (runs.isLoading) {
    return <LoadingBlock rows={3} />;
  }
  if (runs.isError) {
    return <Alert severity="error">{runs.error.message}</Alert>;
  }
  if (!runs.data || runs.data.length === 0) {
    return (
      <EmptyState
        title="No analysis runs yet"
        body="Run analysis after candidates submit. Pair and incident findings appear on the Findings tab."
      />
    );
  }

  return (
    <TableContainer component={Paper} variant="outlined">
      <Table size="small" aria-label="Analysis runs">
        <TableHead>
          <TableRow>
            <TableCell>Run</TableCell>
            <TableCell>Status</TableCell>
            <TableCell>Model</TableCell>
            <TableCell align="right">Findings created</TableCell>
            <TableCell>Started</TableCell>
            <TableCell>Finished</TableCell>
            <TableCell>Error</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {runs.data.map((run) => (
            <TableRow key={run.id} hover>
              <TableCell>#{run.id}</TableCell>
              <TableCell>
                <StatusChip status={run.status} />
              </TableCell>
              <TableCell>{run.modelVersion ?? '—'}</TableCell>
              <TableCell align="right">{run.findingsCreated}</TableCell>
              <TableCell>{formatDateTime(run.startedAt)}</TableCell>
              <TableCell>{formatDateTime(run.finishedAt)}</TableCell>
              <TableCell>
                {run.error ? (
                  <Typography variant="body2" color="error">
                    {run.error}
                  </Typography>
                ) : (
                  '—'
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
