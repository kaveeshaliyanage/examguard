import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import BlockOutlinedIcon from '@mui/icons-material/BlockOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import type { ExamQuestion } from '../../api/types';
import { formatDateTime } from '../../lib/format';
import { integrityTones } from '../../design/tokens';

export interface TerminatedScreenProps {
  examTitle: string;
  candidateCode: string;
  attemptId: number;
  terminatedAt: string | null;
  reason: string | null;
  strikeCount: number;
  maxStrikes: number;
  questions: ExamQuestion[];
  answers: Record<number, { text: string; selectedOptions: string[] }>;
}

function answerLabel(
  question: ExamQuestion,
  answer: { text: string; selectedOptions: string[] } | undefined,
): string {
  if (!answer) {
    return 'No answer saved';
  }
  const text = answer.text.trim();
  if (text.length > 0) {
    return text;
  }
  if (answer.selectedOptions.length > 0) {
    const options = question.content?.options ?? [];
    return answer.selectedOptions
      .map((key) => options.find((option) => option.key === key)?.text ?? key)
      .join('; ');
  }
  return 'No answer saved';
}

/**
 * Read-only end state after the third focus loss. There is deliberately no
 * submit control: the attempt is closed server-side and the answers already
 * saved are preserved for the lecturer.
 */
export function TerminatedScreen({
  examTitle,
  candidateCode,
  attemptId,
  terminatedAt,
  reason,
  strikeCount,
  maxStrikes,
  questions,
  answers,
}: TerminatedScreenProps) {
  const preserved = questions.filter((question) => {
    const answer = answers[question.id];
    return (
      (answer?.text ?? '').trim().length > 0 || (answer?.selectedOptions ?? []).length > 0
    );
  }).length;

  return (
    <Stack spacing={3}>
      <Paper
        variant="outlined"
        sx={{ p: { xs: 2.5, md: 4 }, borderColor: integrityTones.terminated.border }}
      >
        <Stack spacing={2}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <BlockOutlinedIcon sx={{ color: integrityTones.terminated.main, fontSize: 36 }} />
            <Box>
              <Typography variant="h4">Attempt terminated</Typography>
              <Typography variant="body2" color="text.secondary">
                {examTitle} · {candidateCode}
              </Typography>
            </Box>
          </Stack>

          <Alert severity="error" variant="outlined">
            <AlertTitle>Three focus losses were recorded</AlertTitle>
            The exam window lost focus {strikeCount} of {maxStrikes} allowed times. This attempt is
            closed and can no longer be edited or submitted.
          </Alert>

          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Chip
              size="small"
              label={`Strikes ${strikeCount} / ${maxStrikes}`}
              sx={{
                bgcolor: integrityTones.terminated.soft,
                color: integrityTones.terminated.text,
                border: `1px solid ${integrityTones.terminated.border}`,
              }}
            />
            <Chip size="small" variant="outlined" label={`Attempt #${attemptId}`} />
            {terminatedAt ? (
              <Chip size="small" variant="outlined" label={`Terminated ${formatDateTime(terminatedAt)}`} />
            ) : null}
          </Stack>

          <Box>
            <Typography variant="subtitle2" gutterBottom>
              What happens now
            </Typography>
            <Stack component="ul" spacing={0.5} sx={{ pl: 2.5, m: 0 }}>
              <Typography component="li" variant="body2">
                {preserved === 0
                  ? 'No answers had been saved at the time of termination.'
                  : `${preserved} of ${questions.length} answers were preserved and are available to the lecturer.`}
              </Typography>
              <Typography component="li" variant="body2">
                Contact the lecturer named on your exam notice. Only the lecturer or the review team
                can reopen or review this attempt.
              </Typography>
              <Typography component="li" variant="body2">
                Do not start a new attempt unless the lecturer tells you to.
              </Typography>
            </Stack>
          </Box>

          {reason ? (
            <Alert severity="info" variant="outlined">
              Recorded reason: {reason}
            </Alert>
          ) : null}
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
          <LockOutlinedIcon fontSize="small" color="disabled" />
          <Typography variant="subtitle1">Preserved answers (read only)</Typography>
        </Stack>
        <Divider sx={{ mb: 1.5 }} />
        <Stack spacing={1.5} divider={<Divider flexItem />}>
          {questions.map((question) => {
            const answer = answers[question.id];
            const text = answerLabel(question, answer);
            return (
              <Box key={question.id}>
                <Typography variant="caption" color="text.secondary">
                  Question {question.orderIndex}
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {question.prompt}
                </Typography>
                <Typography
                  variant="body2"
                  color={text === 'No answer saved' ? 'text.secondary' : 'text.primary'}
                  sx={{ mt: 0.5, whiteSpace: 'pre-wrap' }}
                >
                  {text}
                </Typography>
              </Box>
            );
          })}
        </Stack>
      </Paper>
    </Stack>
  );
}
