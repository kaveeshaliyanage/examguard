import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useMemo } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { useFinding } from '../../api/staffQueries';
import type { FindingType } from '../../api/types';
import { AppShell } from '../../components/AppShell';
import { CoverageBanner } from '../../components/CoverageBanner';
import { EvidenceCard } from '../../components/EvidenceCard';
import { LoadingBlock } from '../../components/LoadingBlock';
import { ReviewPriority } from '../../components/ReviewPriority';
import { StatusChip } from '../../components/StatusChip';
import { toQuestionMap } from '../../components/evidence/questions';
import { formatDateTime } from '../../lib/format';
import { DecisionPanel } from './DecisionPanel';
import { IncidentContextView } from './IncidentContextView';
import { PairContextView } from './PairContextView';

const typeLabel: Record<FindingType, string> = {
  CANDIDATE_PAIR: 'Candidate pair',
  CANDIDATE_INCIDENT: 'Candidate incident',
  CANDIDATE_AUTHORSHIP: 'Authorship signal',
};

export function FindingDetailPage() {
  const { findingId } = useParams();
  const id = Number(findingId);
  const findingQuery = useFinding(Number.isFinite(id) ? id : undefined);
  const finding = findingQuery.data;
  const questions = useMemo(
    () => toQuestionMap(finding?.pairContext?.questions),
    [finding?.pairContext],
  );

  if (!Number.isFinite(id)) {
    return (
      <AppShell>
        <Alert severity="error">This finding link is invalid.</Alert>
      </AppShell>
    );
  }

  const isPair = finding?.type === 'CANDIDATE_PAIR';
  const visibleEvidence = (finding?.evidence ?? []).filter(
    (item) => !(isPair && item.source === 'ACTIVITY'),
  );

  return (
    <AppShell
      breadcrumb={
        finding ? (
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            <Typography
              component={RouterLink}
              to={`/exams/${finding.exam.id}?tab=findings&type=${finding.type}`}
              color="inherit"
              sx={{ textDecoration: 'none' }}
            >
              {finding.exam.code}
            </Typography>
            <Typography color="text.secondary">{typeLabel[finding.type]}</Typography>
            <StatusChip status={finding.status} />
          </Stack>
        ) : null
      }
    >
      <Stack spacing={3}>
        {findingQuery.isLoading ? <LoadingBlock rows={6} /> : null}
        {findingQuery.isError ? <Alert severity="error">{findingQuery.error.message}</Alert> : null}

        {finding ? (
          <>
            <Box>
              <Typography variant="overline" color="text.secondary">
                {typeLabel[finding.type]}
              </Typography>
              <Typography variant="h4">
                {finding.candidateA}
                {finding.candidateB ? ` and ${finding.candidateB}` : ''}
              </Typography>
              <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
                <ReviewPriority score={finding.priorityScore} band={finding.priorityBand} />
                <Typography variant="caption" color="text.secondary">
                  Created {formatDateTime(finding.createdAt)}
                </Typography>
              </Stack>
            </Box>

            <CoverageBanner warning={finding.coverageWarning} />

            {finding.type === 'CANDIDATE_AUTHORSHIP' ? (
              <Alert severity="info" variant="outlined">
                Stylometry describes how this answer was written. It is a review aid capped at MEDIUM
                priority: it is not proof that AI was used, and copying is handled by pair findings.
              </Alert>
            ) : null}

            <Alert severity="info" variant="outlined">
              {finding.summary}
            </Alert>

            <Grid container spacing={3}>
              <Grid item xs={12} lg={7}>
                <Stack spacing={2}>
                  <Typography variant="h6">Evidence</Typography>
                  {visibleEvidence.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">
                      No evidence items were recorded for this finding.
                    </Typography>
                  ) : (
                    visibleEvidence.map((evidence) => (
                      <EvidenceCard key={evidence.id} evidence={evidence} questions={questions} />
                    ))
                  )}
                </Stack>
              </Grid>
              <Grid item xs={12} lg={5}>
                <Stack spacing={2}>
                  <Typography variant="h6">Context</Typography>
                  {finding.pairContext ? (
                    <PairContextView context={finding.pairContext} evidence={finding.evidence} />
                  ) : null}
                  {finding.incidentContext ? (
                    <IncidentContextView context={finding.incidentContext} />
                  ) : null}
                  {!finding.pairContext && !finding.incidentContext ? (
                    <Typography variant="body2" color="text.secondary">
                      No context was returned for this finding.
                    </Typography>
                  ) : null}
                </Stack>
              </Grid>
            </Grid>

            <DecisionPanel findingId={finding.id} decisions={finding.decisions} />
          </>
        ) : null}
      </Stack>
    </AppShell>
  );
}
