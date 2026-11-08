import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import FlagOutlinedIcon from '@mui/icons-material/FlagOutlined';
import SendIcon from '@mui/icons-material/Send';
import type { ExamQuestion } from '../../api/types';
import { integrityTones, radii, surfaces } from '../../design/tokens';

type QuestionState = 'answered' | 'unanswered' | 'flagged';

export interface QuestionNavigatorProps {
  questions: ExamQuestion[];
  answers: Record<number, { text: string; selectedOptions: string[] }>;
  flagged: ReadonlySet<number>;
  activeQuestionId: number;
  onJump: (questionId: number) => void;
  onSubmit: () => void;
  submitting?: boolean;
  disabled?: boolean;
}

function isAnswered(
  question: ExamQuestion,
  answers: Record<number, { text: string; selectedOptions: string[] }>,
): boolean {
  const answer = answers[question.id];
  const hasText = (answer?.text ?? '').trim().length > 0;
  const hasOptions = (answer?.selectedOptions ?? []).length > 0;
  return hasText || hasOptions;
}

const stateColors: Record<QuestionState, { bg: string; border: string; color: string }> = {
  answered: { bg: integrityTones.safe.soft, border: integrityTones.safe.border, color: integrityTones.safe.text },
  unanswered: { bg: surfaces.raised, border: surfaces.borderStrong, color: surfaces.textSecondary },
  flagged: { bg: integrityTones.warning.soft, border: integrityTones.warning.border, color: integrityTones.warning.text },
};

function LegendDot({ color, border, label }: { color: string; border: string; label: string }) {
  return (
    <Stack direction="row" spacing={0.75} alignItems="center">
      <Box sx={{ width: 12, height: 12, borderRadius: '3px', bgcolor: color, border: `1px solid ${border}` }} />
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
    </Stack>
  );
}

export function QuestionNavigator({
  questions,
  answers,
  flagged,
  activeQuestionId,
  onJump,
  onSubmit,
  submitting = false,
  disabled = false,
}: QuestionNavigatorProps) {
  const states = questions.map((question) => {
    const answered = isAnswered(question, answers);
    const state: QuestionState = flagged.has(question.id) ? 'flagged' : answered ? 'answered' : 'unanswered';
    return { question, answered, state };
  });
  const answered = states.filter((item) => item.answered).length;
  const flaggedCount = states.filter((item) => item.state === 'flagged').length;
  const unanswered = questions.length - answered;

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={2}>
        <Box>
          <Typography variant="overline" color="text.secondary">
            Questions
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {answered} answered · {unanswered} unanswered
            {flaggedCount > 0 ? ` · ${flaggedCount} flagged` : ''}
          </Typography>
        </Box>

        <Box
          component="nav"
          aria-label="Question navigator"
          sx={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 1 }}
        >
          {states.map(({ question, state }) => {
            const active = question.id === activeQuestionId;
            const palette = stateColors[state];
            return (
              <Tooltip
                key={question.id}
                title={`Question ${question.orderIndex} — ${state}`}
                placement="top"
              >
                <Button
                  size="small"
                  onClick={() => onJump(question.id)}
                  aria-label={`Question ${question.orderIndex} ${state}${active ? ' current' : ''}`}
                  aria-current={active ? 'true' : undefined}
                  sx={{
                    minWidth: 0,
                    height: 40,
                    p: 0,
                    position: 'relative',
                    fontWeight: 600,
                    bgcolor: palette.bg,
                    border: `1px solid ${active ? integrityTones.info.main : palette.border}`,
                    color: palette.color,
                    boxShadow: active ? `inset 0 0 0 1px ${integrityTones.info.main}` : 'none',
                    borderRadius: `${radii.sm}px`,
                    '&:hover': { bgcolor: palette.bg, borderColor: integrityTones.info.main },
                  }}
                >
                  {question.orderIndex}
                  {state === 'flagged' ? (
                    <FlagOutlinedIcon sx={{ fontSize: 11, position: 'absolute', top: 2, right: 2 }} />
                  ) : null}
                </Button>
              </Tooltip>
            );
          })}
        </Box>

        <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
          <LegendDot color={stateColors.answered.bg} border={stateColors.answered.border} label="Answered" />
          <LegendDot color={stateColors.unanswered.bg} border={stateColors.unanswered.border} label="Unanswered" />
          <LegendDot color={stateColors.flagged.bg} border={stateColors.flagged.border} label="Flagged" />
        </Stack>

        <Divider />
        <Button
          variant="contained"
          fullWidth
          startIcon={<SendIcon />}
          onClick={onSubmit}
          disabled={submitting || disabled}
        >
          {submitting ? 'Submitting…' : 'Review and submit'}
        </Button>
        <Typography variant="caption" color="text.secondary">
          Answers autosave. Submitting more than once is safe.
        </Typography>
      </Stack>
    </Paper>
  );
}
