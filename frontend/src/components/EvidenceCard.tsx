import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { EvidenceView } from '../api/types';
import {
  changeRows,
  coverageMeta,
  metadataStrings,
  patternDomains,
  similarityRows,
  timingRows,
  visitRows,
} from '../lib/evidence';
import { humanize } from '../lib/format';
import { ActivityPanel } from './evidence/ActivityPanel';
import { AnswerChangePanel } from './evidence/AnswerChangePanel';
import { CoveragePanel } from './evidence/CoveragePanel';
import { PatternPanel } from './evidence/PatternPanel';
import { SimilarityPanel } from './evidence/SimilarityPanel';
import { TimingPanel } from './evidence/TimingPanel';
import { questionLabel, type QuestionMap } from './evidence/questions';

const sourceAccent: Record<string, 'default' | 'info' | 'warning' | 'error'> = {
  SIMILARITY: 'info',
  PATTERN: 'warning',
  TIMING: 'info',
  ACTIVITY: 'error',
  ANSWER_CHANGE: 'warning',
  COVERAGE: 'warning',
};

export function EvidenceCard({
  evidence,
  questions,
}: {
  evidence: EvidenceView;
  questions: QuestionMap;
}) {
  const visits = visitRows(evidence);
  const permittedDomains = patternDomains(evidence);

  return (
    <Card variant="outlined">
      <CardContent>
        <Stack spacing={1.5}>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            <Chip
              size="small"
              color={sourceAccent[evidence.source] ?? 'default'}
              label={humanize(evidence.source)}
              variant="outlined"
            />
            {evidence.questionId !== null ? (
              <Typography variant="caption" color="text.secondary">
                {questionLabel(evidence.questionId, questions)}
              </Typography>
            ) : null}
            {evidence.weight > 0 ? (
              <Typography variant="caption" color="text.secondary">
                Evidence weight {evidence.weight.toFixed(1)}
              </Typography>
            ) : null}
          </Stack>

          <Typography variant="body2">{evidence.detail}</Typography>

          {evidence.source === 'SIMILARITY' ? (
            <SimilarityPanel rows={similarityRows(evidence)} questions={questions} />
          ) : null}
          {evidence.source === 'PATTERN' ? (
            <PatternPanel
              shingles={metadataStrings(evidence, 'sharedShingles')}
              tokens={metadataStrings(evidence, 'sharedTokens')}
              variants={metadataStrings(evidence, 'spellingVariants')}
              crossQuestion={metadataStrings(evidence, 'crossQuestionShingles')}
              domains={permittedDomains}
            />
          ) : null}
          {evidence.source === 'TIMING' ? (
            <TimingPanel rows={timingRows(evidence)} questions={questions} />
          ) : null}
          {evidence.source === 'ACTIVITY' ? (
            <ActivityPanel visits={visits} permittedDomains={permittedDomains} />
          ) : null}
          {evidence.source === 'ANSWER_CHANGE' ? (
            <AnswerChangePanel rows={changeRows(evidence)} questions={questions} />
          ) : null}
          {evidence.source === 'COVERAGE' ? (
            <CoveragePanel meta={coverageMeta(evidence)} />
          ) : null}
        </Stack>
      </CardContent>
    </Card>
  );
}
