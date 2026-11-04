import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import type { ChangeRow } from '../../lib/evidence';
import { questionLabel, type QuestionMap } from './questions';

export function AnswerChangePanel({
  rows,
  questions,
}: {
  rows: ChangeRow[];
  questions: QuestionMap;
}) {
  if (rows.length === 0) {
    return null;
  }
  return (
    <Table size="small" aria-label="Answer changes following flagged visits">
      <TableHead>
        <TableRow>
          <TableCell>Question</TableCell>
          <TableCell align="right">Revision</TableCell>
          <TableCell>Domain</TableCell>
          <TableCell align="right">Delay (s)</TableCell>
          <TableCell align="right">Characters</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {rows.map((row, index) => (
          <TableRow key={`${row.questionId}-${row.revisionNo}-${index}`}>
            <TableCell>{questionLabel(row.questionId, questions)}</TableCell>
            <TableCell align="right">{row.revisionNo}</TableCell>
            <TableCell>{row.domain}</TableCell>
            <TableCell align="right">{row.deltaSeconds.toFixed(0)}</TableCell>
            <TableCell align="right">{row.deltaChars > 0 ? `+${row.deltaChars}` : row.deltaChars}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
