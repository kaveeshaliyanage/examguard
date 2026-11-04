import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import GroupOutlinedIcon from '@mui/icons-material/GroupOutlined';
import PersonSearchOutlinedIcon from '@mui/icons-material/PersonSearchOutlined';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { Link as RouterLink } from 'react-router-dom';
import { useExamFindings } from '../../api/staffQueries';
import type { FindingStatus, FindingType } from '../../api/types';
import { BandChip } from '../../components/BandChip';
import { EmptyState } from '../../components/EmptyState';
import { LoadingBlock } from '../../components/LoadingBlock';
import { StatusChip } from '../../components/StatusChip';
import { formatDateTime, humanize } from '../../lib/format';

const statuses: FindingStatus[] = [
  'OPEN',
  'CONFIRMED',
  'DISMISSED',
  'NEEDS_INFO',
  'ESCALATED',
  'SUPERSEDED',
];

interface FindingsTabProps {
  examId: number;
  type: FindingType;
  status: FindingStatus | 'ALL';
  onTypeChange: (type: FindingType) => void;
  onStatusChange: (status: FindingStatus | 'ALL') => void;
}

export function FindingsTab({ examId, type, status, onTypeChange, onStatusChange }: FindingsTabProps) {
  const findings = useExamFindings(examId, {
    type,
    status: status === 'ALL' ? undefined : status,
  });
  const isPair = type === 'CANDIDATE_PAIR';

  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={2}>
        <Tabs
          value={type}
          onChange={(_, value: FindingType) => onTypeChange(value)}
          aria-label="Finding type"
        >
          <Tab
            value="CANDIDATE_PAIR"
            label="Pairs"
            icon={<GroupOutlinedIcon />}
            iconPosition="start"
          />
          <Tab
            value="CANDIDATE_INCIDENT"
            label="Incidents"
            icon={<PersonSearchOutlinedIcon />}
            iconPosition="start"
          />
        </Tabs>
        <TextField
          select
          size="small"
          label="Status"
          value={status}
          onChange={(event) => onStatusChange(event.target.value as FindingStatus | 'ALL')}
          sx={{ minWidth: 180 }}
        >
          <MenuItem value="ALL">All statuses</MenuItem>
          {statuses.map((value) => (
            <MenuItem key={value} value={value}>
              {humanize(value)}
            </MenuItem>
          ))}
        </TextField>
      </Stack>

      <Typography variant="body2" color="text.secondary">
        {isPair
          ? 'Pair findings compare answers and timing only. Activity data is never used in a pair finding.'
          : 'Incident findings show one candidate’s domain-level observations, coverage and nearby answer changes.'}
      </Typography>

      {findings.isLoading ? <LoadingBlock rows={4} /> : null}
      {findings.isError ? <Alert severity="error">{findings.error.message}</Alert> : null}

      {findings.data && findings.data.length === 0 ? (
        <EmptyState
          title={isPair ? 'No pair findings' : 'No incident findings'}
          body={
            status === 'ALL'
              ? 'Run analysis after candidates submit. Findings appear here for human review.'
              : 'No findings match this status. Try another filter or run analysis again.'
          }
        />
      ) : null}

      {findings.data && findings.data.length > 0 ? (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small" aria-label={isPair ? 'Pair findings' : 'Incident findings'}>
            <TableHead>
              <TableRow>
                <TableCell>Band</TableCell>
                <TableCell align="right">Priority</TableCell>
                <TableCell>Candidates</TableCell>
                <TableCell>Summary</TableCell>
                <TableCell align="center">Coverage</TableCell>
                <TableCell align="right">Evidence</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Created</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {findings.data.map((finding) => (
                <TableRow key={finding.id} hover>
                  <TableCell>
                    <BandChip band={finding.priorityBand} />
                  </TableCell>
                  <TableCell align="right">{Math.round(finding.priorityScore)}</TableCell>
                  <TableCell>
                    <Typography component={RouterLink} to={`/findings/${finding.id}`} sx={{ fontWeight: 600 }}>
                      {finding.candidateA}
                      {finding.candidateB ? ` / ${finding.candidateB}` : ''}
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ maxWidth: 360 }}>{finding.summary}</TableCell>
                  <TableCell align="center">
                    {finding.coverageWarning ? (
                      <Tooltip title="Monitoring data is incomplete. Missing observations are unknown, not clean.">
                        <WarningAmberIcon color="warning" aria-label="Coverage warning" fontSize="small" />
                      </Tooltip>
                    ) : (
                      <Box component="span" color="text.secondary">
                        —
                      </Box>
                    )}
                  </TableCell>
                  <TableCell align="right">{finding.evidenceCount}</TableCell>
                  <TableCell>
                    <StatusChip status={finding.status} />
                  </TableCell>
                  <TableCell>{formatDateTime(finding.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      ) : null}
    </Stack>
  );
}
