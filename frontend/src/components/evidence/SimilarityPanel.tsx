import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import type { SimilarityRow } from '../../lib/evidence';
import { questionLabel, type QuestionMap } from './questions';

export function SimilarityPanel({
  rows,
  questions,
}: {
  rows: SimilarityRow[];
  questions: QuestionMap;
}) {
  if (rows.length === 0) {
    return null;
  }
  return (
    <Table size="small" aria-label="Per-question similarity">
      <TableHead>
        <TableRow>
          <TableCell>Question</TableCell>
          <TableCell align="right">Cosine</TableCell>
          <TableCell align="right">Cohort mean</TableCell>
          <TableCell align="right">Excess over baseline</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.questionId}>
            <TableCell>{questionLabel(row.questionId, questions)}</TableCell>
            <TableCell align="right">{row.rawCosine.toFixed(3)}</TableCell>
            <TableCell align="right">{row.cohortMean.toFixed(3)}</TableCell>
            <TableCell align="right">{row.normalizedExcess.toFixed(2)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
