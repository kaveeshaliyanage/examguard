import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import GroupOutlinedIcon from '@mui/icons-material/GroupOutlined';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import PersonSearchOutlinedIcon from '@mui/icons-material/PersonSearchOutlined';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { useMemo } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { useExamFindings } from '../../api/staffQueries';
import type { FindingStatus, FindingSummary, FindingType } from '../../api/types';
import { BandChip } from '../../components/BandChip';
import { DataTable } from '../../components/DataTable';
import type { DataTableColumn } from '../../components/DataTable';
import { StatusChip } from '../../components/StatusChip';
import { formatDateTime, humanize } from '../../lib/format';
import { useTableUrlState } from '../../lib/tableState';

const statuses: FindingStatus[] = [
  'OPEN',
  'CONFIRMED',
  'DISMISSED',
  'NEEDS_INFO',
  'ESCALATED',
  'SUPERSEDED',
];

const sortableColumns = new Set(['band', 'priority', 'candidates', 'status', 'created', 'evidence']);

const tableOptions = {
  keys: { sort: 'fsort', dir: 'fdir', query: 'fq', page: 'fpage', size: 'fsize' },
  sortable: sortableColumns,
} as const;

const typeCopy: Record<
  FindingType,
  { tab: string; aria: string; guidance: string; emptyTitle: string; emptyBody: string }
> = {
  CANDIDATE_PAIR: {
    tab: 'Pairs',
    aria: 'Pair findings',
    guidance:
      'Pair findings compare answers and timing only. Activity data is never used in a pair finding.',
    emptyTitle: 'No pair findings',
    emptyBody: 'Run analysis after candidates submit. Findings appear here for human review.',
  },
  CANDIDATE_INCIDENT: {
    tab: 'Incidents',
    aria: 'Incident findings',
    guidance:
      'Incident findings show one candidate’s domain-level observations, coverage and nearby answer changes.',
    emptyTitle: 'No incident findings',
    emptyBody: 'Run analysis after candidates submit. Findings appear here for human review.',
  },
  CANDIDATE_AUTHORSHIP: {
    tab: 'Authorship',
    aria: 'Authorship findings',
    guidance:
      'Authorship findings describe one candidate’s prose style. They are a review aid capped at MEDIUM priority — never proof of AI use and never evidence of copying.',
    emptyTitle: 'No authorship findings',
    emptyBody:
      'Run analysis after candidates submit. Short answers are skipped; longer prose is scored for stylistic signals.',
  },
};

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
  const navigate = useNavigate();
  const [tableState, setTableState] = useTableUrlState(tableOptions);
  const copy = typeCopy[type];

  const columns = useMemo<DataTableColumn<FindingSummary>[]>(
    () => [
      {
        id: 'band',
        header: 'Band',
        accessorFn: (finding) => finding.priorityBand,
        cell: (finding) => <BandChip band={finding.priorityBand} />,
      },
      {
        id: 'priority',
        header: 'Priority',
        align: 'right',
        accessorFn: (finding) => finding.priorityScore,
        cell: (finding) => Math.round(finding.priorityScore),
      },
      {
        id: 'candidates',
        header: 'Candidates',
        accessorFn: (finding) => `${finding.candidateA} ${finding.candidateB ?? ''}`,
        cell: (finding) => (
          <Typography
            component={RouterLink}
            to={`/findings/${finding.id}`}
            onClick={(event) => event.stopPropagation()}
            sx={{ fontWeight: 600 }}
          >
            {finding.candidateA}
            {finding.candidateB ? ` / ${finding.candidateB}` : ''}
          </Typography>
        ),
      },
      {
        id: 'summary',
        header: 'Summary',
        accessorFn: (finding) => finding.summary,
        cell: (finding) => <Box sx={{ maxWidth: 360 }}>{finding.summary}</Box>,
      },
      {
        id: 'coverage',
        header: 'Coverage',
        align: 'center',
        accessorFn: (finding) => (finding.coverageWarning ? 'warning' : 'ok'),
        cell: (finding) =>
          finding.coverageWarning ? (
            <Tooltip title="Monitoring data is incomplete. Missing observations are unknown, not clean.">
              <WarningAmberIcon color="warning" aria-label="Coverage warning" fontSize="small" />
            </Tooltip>
          ) : (
            <Box component="span" color="text.secondary">
              —
            </Box>
          ),
      },
      {
        id: 'evidence',
        header: 'Evidence',
        align: 'right',
        accessorFn: (finding) => finding.evidenceCount,
      },
      {
        id: 'status',
        header: 'Status',
        accessorFn: (finding) => finding.status,
        cell: (finding) => <StatusChip status={finding.status} />,
      },
      {
        id: 'created',
        header: 'Created',
        accessorFn: (finding) => finding.createdAt,
        cell: (finding) => formatDateTime(finding.createdAt),
      },
    ],
    [],
  );

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
          <Tab
            value="CANDIDATE_AUTHORSHIP"
            label="Authorship"
            icon={<AutoAwesomeOutlinedIcon />}
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
        {copy.guidance}
      </Typography>

      {findings.isError ? <Alert severity="error">{findings.error.message}</Alert> : null}

      <DataTable
        data={findings.data ?? []}
        columns={columns}
        ariaLabel={copy.aria}
        isLoading={findings.isLoading}
        searchPlaceholder="Search candidates or summaries…"
        emptyTitle={copy.emptyTitle}
        emptyBody={
          status === 'ALL'
            ? copy.emptyBody
            : 'No findings match this status. Try another filter or run analysis again.'
        }
        state={tableState}
        onStateChange={setTableState}
        onRowClick={(finding) => navigate(`/findings/${finding.id}`)}
        getRowId={(finding) => String(finding.id)}
      />
    </Stack>
  );
}
