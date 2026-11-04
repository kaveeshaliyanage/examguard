import Alert from '@mui/material/Alert';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import type { TimingRow } from '../../lib/evidence';
import { questionLabel, type QuestionMap } from './questions';

export function TimingPanel({ rows, questions }: { rows: TimingRow[]; questions: QuestionMap }) {
  if (rows.length === 0) {
    return null;
  }
  return (
    <>
      <Table size="small" aria-label="Aligned answer revisions">
        <TableHead>
          <TableRow>
            <TableCell>Question</TableCell>
            <TableCell>Leader</TableCell>
            <TableCell>Follower</TableCell>
            <TableCell align="right">Delta (s)</TableCell>
            <TableCell align="right">Similarity</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row, index) => (
            <TableRow key={`${row.questionId}-${row.leader}-${row.follower}-${index}`}>
              <TableCell>{questionLabel(row.questionId, questions)}</TableCell>
              <TableCell>{row.leader}</TableCell>
              <TableCell>{row.follower}</TableCell>
              <TableCell align="right">{row.deltaSeconds.toFixed(0)}</TableCell>
              <TableCell align="right">{row.similarity.toFixed(2)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Alert severity="info" variant="outlined" sx={{ mt: 1.5 }}>
        Alignment shows order in time only. Direction alone is not proof of copying.
      </Alert>
    </>
  );
}
