import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Collapse from '@mui/material/Collapse';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { Fragment, useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { useAudit, useExam } from '../../api/staffQueries';
import { AppShell } from '../../components/AppShell';
import { EmptyState } from '../../components/EmptyState';
import { LoadingBlock } from '../../components/LoadingBlock';
import { formatDateTime } from '../../lib/format';

function prettyDetail(detail: string | null): string {
  if (!detail) {
    return 'No additional detail.';
  }
  try {
    return JSON.stringify(JSON.parse(detail), null, 2);
  } catch {
    return detail;
  }
}

export function AuditPage() {
  const { examId } = useParams();
  const id = Number(examId);
  const valid = Number.isFinite(id);
  const examQuery = useExam(valid ? id : undefined);
  const auditQuery = useAudit(valid ? id : undefined);
  const [expanded, setExpanded] = useState<number | null>(null);

  return (
    <AppShell
      breadcrumb={
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography
            component={RouterLink}
            to={valid ? `/exams/${id}` : '/exams'}
            color="inherit"
            sx={{ textDecoration: 'none' }}
          >
            {examQuery.data?.code ?? 'Exam'}
          </Typography>
          <Typography color="text.secondary">Audit trail</Typography>
        </Stack>
      }
    >
      <Stack spacing={3}>
        <Box>
          <Typography variant="h4">Audit trail</Typography>
          <Typography variant="body2" color="text.secondary">
            Every staff mutation and review decision is recorded. This view is read-only.
          </Typography>
        </Box>

        {!valid ? <Alert severity="error">This audit link is invalid.</Alert> : null}
        {auditQuery.isLoading ? <LoadingBlock rows={6} /> : null}
        {auditQuery.isError ? <Alert severity="error">{auditQuery.error.message}</Alert> : null}

        {auditQuery.data && auditQuery.data.length === 0 ? (
          <EmptyState
            title="No audit entries yet"
            body="Creating the exam, changing its status and recording decisions will appear here."
          />
        ) : null}

        {auditQuery.data && auditQuery.data.length > 0 ? (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox" />
                  <TableCell>Time</TableCell>
                  <TableCell>Actor</TableCell>
                  <TableCell>Action</TableCell>
                  <TableCell>Entity</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {auditQuery.data.map((entry) => (
                  <Fragment key={entry.id}>
                    <TableRow hover>
                      <TableCell padding="checkbox">
                        <IconButton
                          size="small"
                          aria-label="Toggle detail"
                          onClick={() => setExpanded(expanded === entry.id ? null : entry.id)}
                        >
                          <ExpandMoreIcon
                            fontSize="small"
                            sx={{
                              transform: expanded === entry.id ? 'rotate(180deg)' : 'none',
                              transition: 'transform 0.2s',
                            }}
                          />
                        </IconButton>
                      </TableCell>
                      <TableCell>{formatDateTime(entry.createdAt)}</TableCell>
                      <TableCell>{entry.actor}</TableCell>
                      <TableCell>{entry.action}</TableCell>
                      <TableCell>
                        {entry.entityType}
                        {entry.entityId !== null ? ` #${entry.entityId}` : ''}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell colSpan={5} sx={{ py: 0, borderBottom: expanded === entry.id ? undefined : 0 }}>
                        <Collapse in={expanded === entry.id} timeout="auto" unmountOnExit>
                          <Box
                            component="pre"
                            sx={{
                              m: 1,
                              p: 2,
                              bgcolor: 'grey.50',
                              borderRadius: 1,
                              fontSize: 12,
                              overflowX: 'auto',
                            }}
                          >
                            {prettyDetail(entry.detail)}
                          </Box>
                        </Collapse>
                      </TableCell>
                    </TableRow>
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        ) : null}
      </Stack>
    </AppShell>
  );
}
