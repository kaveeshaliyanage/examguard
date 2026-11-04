import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import type { CreateQuestionInput } from '../../api/types';

interface QuestionFieldsProps {
  questions: CreateQuestionInput[];
  onChange: (questions: CreateQuestionInput[]) => void;
  error: string | null;
}

export function QuestionFields({ questions, onChange, error }: QuestionFieldsProps) {
  const update = (index: number, patch: Partial<CreateQuestionInput>) => {
    onChange(questions.map((question, i) => (i === index ? { ...question, ...patch } : question)));
  };

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= questions.length) {
      return;
    }
    const next = [...questions];
    const [item] = next.splice(index, 1);
    if (item) {
      next.splice(target, 0, item);
    }
    onChange(next);
  };

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
        <Typography variant="h6">Questions</Typography>
        <Button
          size="small"
          startIcon={<AddIcon />}
          onClick={() => onChange([...questions, { prompt: '', maxWords: 250 }])}
        >
          Add question
        </Button>
      </Stack>
      {error ? (
        <Typography color="error" variant="body2" sx={{ mb: 1 }}>
          {error}
        </Typography>
      ) : null}
      <Stack spacing={2}>
        {questions.map((question, index) => (
          <Stack key={index} direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems="flex-start">
            <TextField
              label={`Question ${index + 1}`}
              value={question.prompt}
              onChange={(event) => update(index, { prompt: event.target.value })}
              multiline
              minRows={2}
              fullWidth
              required
            />
            <TextField
              label="Max words"
              type="number"
              value={question.maxWords}
              onChange={(event) => update(index, { maxWords: Number(event.target.value) })}
              inputProps={{ min: 1, max: 5000 }}
              sx={{ width: { xs: '100%', sm: 130 } }}
            />
            <Stack direction="row">
              <IconButton
                aria-label={`Move question ${index + 1} up`}
                onClick={() => move(index, -1)}
                disabled={index === 0}
              >
                <ArrowUpwardIcon />
              </IconButton>
              <IconButton
                aria-label={`Move question ${index + 1} down`}
                onClick={() => move(index, 1)}
                disabled={index === questions.length - 1}
              >
                <ArrowDownwardIcon />
              </IconButton>
              <IconButton
                aria-label={`Remove question ${index + 1}`}
                onClick={() => onChange(questions.filter((_, i) => i !== index))}
                disabled={questions.length === 1}
              >
                <DeleteOutlineIcon />
              </IconButton>
            </Stack>
          </Stack>
        ))}
      </Stack>
    </Box>
  );
}
