import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import type { EvidenceView, PairContext, PairCandidate, RevisionView } from '../../api/types';
import { sharedPhrases } from '../../lib/evidence';
import { formatDateTime } from '../../lib/format';
import { HighlightedText } from '../../components/evidence/HighlightedText';

function RevisionHistory({ revisions }: { revisions: RevisionView[] }) {
  if (revisions.length <= 1) {
    return null;
  }
  return (
    <Accordion disableGutters elevation={0} sx={{ bgcolor: 'transparent', '&:before': { display: 'none' } }}>
      <AccordionSummary expandIcon={<ExpandMoreIcon fontSize="small" />}>
        <Typography variant="caption" color="text.secondary">
          {revisions.length} saved revisions
        </Typography>
      </AccordionSummary>
      <AccordionDetails>
        <Stack spacing={1}>
          {revisions.map((revision) => (
            <Box key={revision.revisionNo}>
              <Typography variant="caption" color="text.secondary">
                Revision {revision.revisionNo} · {formatDateTime(revision.savedAt)}
              </Typography>
              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                {revision.text || '—'}
              </Typography>
            </Box>
          ))}
        </Stack>
      </AccordionDetails>
    </Accordion>
  );
}

function CandidateAnswer({
  candidate,
  questionId,
  phrases,
}: {
  candidate: PairCandidate;
  questionId: number;
  phrases: string[];
}) {
  const answer = candidate.answers.find((item) => item.questionId === questionId);
  return (
    <Box>
      <Typography variant="subtitle2" gutterBottom>
        {candidate.candidateCode}
      </Typography>
      <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', minHeight: 40 }}>
        {answer && answer.text ? (
          <HighlightedText text={answer.text} phrases={phrases} />
        ) : (
          <Typography component="span" variant="body2" color="text.secondary">
            No substantive answer saved.
          </Typography>
        )}
      </Typography>
      {answer ? <RevisionHistory revisions={answer.revisions} /> : null}
    </Box>
  );
}

export function PairContextView({
  context,
  evidence,
}: {
  context: PairContext;
  evidence: EvidenceView[];
}) {
  const phrases = evidence.flatMap((item) => sharedPhrases(item));
  return (
    <Stack spacing={2}>
      <Alert severity="info" variant="outlined">
        No activity data is used in pair findings. This view shows only the two candidates' answers.
      </Alert>
      {context.questions.map((question) => (
        <Card variant="outlined" key={question.id}>
          <CardContent>
            <Typography variant="subtitle1" gutterBottom>
              Q{question.orderIndex}: {question.prompt}
            </Typography>
            <Grid container spacing={3}>
              {context.candidates.map((candidate) => (
                <Grid item xs={12} md={6} key={candidate.candidateCode}>
                  <CandidateAnswer candidate={candidate} questionId={question.id} phrases={phrases} />
                </Grid>
              ))}
            </Grid>
          </CardContent>
        </Card>
      ))}
    </Stack>
  );
}
