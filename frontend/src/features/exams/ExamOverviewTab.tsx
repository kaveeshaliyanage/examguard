import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { AnalysisRun, ExamDetail } from '../../api/types';
import { StatusChip } from '../../components/StatusChip';
import { formatDateTime, formatDurationMinutes } from '../../lib/format';

interface ExamOverviewTabProps {
  exam: ExamDetail;
  latestRun: AnalysisRun | undefined;
}

export function ExamOverviewTab({ exam, latestRun }: ExamOverviewTabProps) {
  return (
    <Stack spacing={3}>
      <Paper variant="outlined" sx={{ p: 3 }}>
        <Stack spacing={1}>
          <Typography variant="h6">Description</Typography>
          <Typography color={exam.description ? 'text.primary' : 'text.secondary'}>
            {exam.description || 'No description provided.'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Duration: {formatDurationMinutes(exam.durationMinutes)} · Extension:{' '}
            {exam.allowExtension ? 'allowed' : 'not offered'} · Created {formatDateTime(exam.createdAt)}
          </Typography>
          {latestRun ? (
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="body2" color="text.secondary">
                Latest analysis:
              </Typography>
              <StatusChip status={latestRun.status} />
              <Typography variant="body2" color="text.secondary">
                {latestRun.modelVersion ?? 'model pending'} · {formatDateTime(latestRun.finishedAt)}
              </Typography>
            </Stack>
          ) : (
            <Typography variant="body2" color="text.secondary">
              No analysis run yet.
            </Typography>
          )}
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          Questions
        </Typography>
        <Stack spacing={2} divider={<Divider flexItem />}>
          {exam.questions.map((question) => (
            <div key={question.id}>
              <Typography variant="subtitle2">
                {question.orderIndex}. {question.prompt}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Maximum {question.maxWords} words
              </Typography>
            </div>
          ))}
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          Resource rules
        </Typography>
        {exam.resourceRules.length === 0 ? (
          <Typography color="text.secondary">No resource rules configured.</Typography>
        ) : (
          <Stack spacing={1}>
            {exam.resourceRules.map((rule) => (
              <Stack key={rule.id} direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                <Chip
                  size="small"
                  label={rule.category}
                  color={rule.category === 'PROHIBITED' ? 'error' : rule.category === 'PERMITTED' ? 'success' : 'default'}
                  variant="outlined"
                />
                <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                  {rule.domainPattern}
                </Typography>
                {rule.note ? (
                  <Typography variant="body2" color="text.secondary">
                    {rule.note}
                  </Typography>
                ) : null}
              </Stack>
            ))}
          </Stack>
        )}
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          Rules classify domain-level observations for review. They do not block navigation.
        </Typography>
      </Paper>
    </Stack>
  );
}
