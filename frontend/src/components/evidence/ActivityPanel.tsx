import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import type { VisitRow } from '../../lib/evidence';
import { formatDateTime } from '../../lib/format';

export function ActivityPanel({
  visits,
  permittedDomains,
}: {
  visits: VisitRow[];
  permittedDomains: string[];
}) {
  return (
    <Stack spacing={2}>
      {visits.length > 0 ? (
        <Table size="small" aria-label="Observed domain visits">
          <TableHead>
            <TableRow>
              <TableCell>Domain</TableCell>
              <TableCell>Observed at</TableCell>
              <TableCell>Rule</TableCell>
              <TableCell>Rule note</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {visits.map((visit, index) => (
              <TableRow key={`${visit.domain}-${visit.occurredAt}-${index}`}>
                <TableCell>{visit.domain}</TableCell>
                <TableCell>{formatDateTime(visit.occurredAt)}</TableCell>
                <TableCell>{visit.rule ?? 'No matching rule'}</TableCell>
                <TableCell>{visit.note ?? '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}

      {permittedDomains.length > 0 ? (
        <Box sx={{ opacity: 0.8 }}>
          <Typography variant="caption" color="text.secondary">
            Permitted domains also observed
          </Typography>
          <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mt: 0.5 }}>
            {permittedDomains.map((domain) => (
              <Chip key={domain} size="small" label={domain} variant="outlined" />
            ))}
          </Stack>
        </Box>
      ) : null}
    </Stack>
  );
}
