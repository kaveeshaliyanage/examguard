import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../AuthProvider';
import { useExams } from '../../api/staffQueries';
import { AppShell } from '../../components/AppShell';
import { EmptyState } from '../../components/EmptyState';
import { LoadingBlock } from '../../components/LoadingBlock';
import { StatusChip } from '../../components/StatusChip';
import { formatDateTime } from '../../lib/format';

export function ExamListPage() {
  const { session } = useAuth();
  const exams = useExams();
  const navigate = useNavigate();
  const canCreate = session?.user.role === 'LECTURER' || session?.user.role === 'ADMIN';

  const sorted = [...(exams.data ?? [])].sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
  );

  return (
    <AppShell
      actions={
        canCreate ? (
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            component={RouterLink}
            to="/exams/new"
          >
            Create exam
          </Button>
        ) : null
      }
    >
      <Stack spacing={2}>
        <Box>
          <Typography variant="h4">Exams</Typography>
          <Typography color="text.secondary">
            Open an exam to review pairs, incidents and the audit trail.
          </Typography>
        </Box>

        {exams.isError ? <Alert severity="error">{exams.error.message}</Alert> : null}
        {exams.isLoading ? <LoadingBlock rows={5} /> : null}

        {exams.data && sorted.length === 0 ? (
          <EmptyState
            title="No exams yet"
            body="Create an exam with questions and resource rules, then open it for candidates."
            action={
              canCreate ? (
                <Button variant="contained" component={RouterLink} to="/exams/new">
                  Create the first exam
                </Button>
              ) : undefined
            }
          />
        ) : null}

        {sorted.length > 0 ? (
          <TableContainer component={Paper} variant="outlined">
            <Table size="small" aria-label="Exams">
              <TableHead>
                <TableRow>
                  <TableCell>Code</TableCell>
                  <TableCell>Title</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Attempts</TableCell>
                  <TableCell align="right">Submitted</TableCell>
                  <TableCell align="right">Open findings</TableCell>
                  <TableCell>Last analysis</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {sorted.map((exam) => (
                  <TableRow
                    key={exam.id}
                    hover
                    sx={{ cursor: 'pointer' }}
                    onClick={() => navigate(`/exams/${exam.id}`)}
                  >
                    <TableCell>
                      <Typography
                        component={RouterLink}
                        to={`/exams/${exam.id}`}
                        onClick={(event) => event.stopPropagation()}
                        sx={{ fontWeight: 600 }}
                      >
                        {exam.code}
                      </Typography>
                    </TableCell>
                    <TableCell>{exam.title}</TableCell>
                    <TableCell>
                      <StatusChip status={exam.status} />
                    </TableCell>
                    <TableCell align="right">{exam.attemptCount}</TableCell>
                    <TableCell align="right">{exam.submittedCount}</TableCell>
                    <TableCell align="right">
                      {exam.openFindingCount > 0 ? (
                        <Button
                          size="small"
                          onClick={(event) => {
                            event.stopPropagation();
                            navigate(`/exams/${exam.id}?tab=findings&status=OPEN`);
                          }}
                        >
                          {exam.openFindingCount}
                        </Button>
                      ) : (
                        '0'
                      )}
                    </TableCell>
                    <TableCell>{formatDateTime(exam.lastAnalysisAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        ) : null}
      </Stack>
    </AppShell>
  );
}
