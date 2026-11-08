import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import FormControl from '@mui/material/FormControl';
import IconButton from '@mui/material/IconButton';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Radio from '@mui/material/Radio';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import type { AnswerKey, CreateQuestionInput, QuestionOption, QuestionType } from '../../api/types';

const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  SINGLE_CHOICE: 'Single choice',
  MULTI_CHOICE: 'Multiple choice',
  TRUE_FALSE: 'True / false',
  SHORT_ANSWER: 'Short answer',
  ESSAY: 'Essay',
};

export function isAutoGraded(type: QuestionType): boolean {
  return type === 'SINGLE_CHOICE' || type === 'MULTI_CHOICE' || type === 'TRUE_FALSE';
}

export function emptyQuestion(type: QuestionType = 'ESSAY'): CreateQuestionInput {
  if (type === 'SINGLE_CHOICE' || type === 'MULTI_CHOICE') {
    return {
      prompt: '',
      type,
      points: 1,
      maxWords: 250,
      content: {
        options: [
          { key: 'A', text: '' },
          { key: 'B', text: '' },
        ],
      },
      answerKey: { selectedKeys: [] },
      explanation: '',
    };
  }
  if (type === 'TRUE_FALSE') {
    return {
      prompt: '',
      type,
      points: 1,
      maxWords: 250,
      content: {},
      answerKey: { selectedKeys: ['TRUE'] },
      explanation: '',
    };
  }
  if (type === 'SHORT_ANSWER') {
    return {
      prompt: '',
      type,
      points: 1,
      maxWords: 50,
      content: {},
      answerKey: { acceptedAnswers: [] },
      explanation: '',
    };
  }
  return {
    prompt: '',
    type: 'ESSAY',
    points: 5,
    maxWords: 400,
    content: {},
    answerKey: { modelAnswer: '', rubric: '' },
    explanation: '',
  };
}

export function validateQuestion(question: CreateQuestionInput, index: number): string | null {
  const label = `Question ${index + 1}`;
  if (!question.prompt.trim()) {
    return `${label} needs a prompt.`;
  }
  if (!Number.isFinite(question.points) || question.points <= 0) {
    return `${label} needs points greater than zero.`;
  }
  if (question.type === 'SINGLE_CHOICE' || question.type === 'MULTI_CHOICE') {
    const options = question.content?.options ?? [];
    if (options.length < 2) {
      return `${label} needs at least two options.`;
    }
    if (options.some((option) => !option.text.trim())) {
      return `${label} has an empty option.`;
    }
    const keys = question.answerKey?.selectedKeys ?? [];
    if (keys.length === 0) {
      return `${label} needs at least one correct option.`;
    }
    if (question.type === 'SINGLE_CHOICE' && keys.length !== 1) {
      return `${label} is single choice, so mark exactly one correct option.`;
    }
  }
  if (question.type === 'TRUE_FALSE' && (question.answerKey?.selectedKeys ?? []).length !== 1) {
    return `${label} needs True or False marked as correct.`;
  }
  if (question.type === 'SHORT_ANSWER') {
    const accepted = (question.answerKey?.acceptedAnswers ?? []).filter((value) => value.trim());
    if (accepted.length === 0) {
      return `${label} needs at least one accepted answer for auto-marking.`;
    }
  }
  if (question.type === 'SHORT_ANSWER' || question.type === 'ESSAY') {
    if (!Number.isInteger(question.maxWords) || question.maxWords < 1) {
      return `${label} needs a word limit of at least 1.`;
    }
  }
  return null;
}

interface QuestionFieldsProps {
  questions: CreateQuestionInput[];
  onChange: (questions: CreateQuestionInput[]) => void;
  error: string | null;
  allowAdd?: boolean;
  allowRemove?: boolean;
  autoFocusPrompt?: boolean;
}

function withType(question: CreateQuestionInput, type: QuestionType): CreateQuestionInput {
  const base = emptyQuestion(type);
  return { ...base, prompt: question.prompt, points: question.points, explanation: question.explanation };
}

function OptionEditor({
  question,
  onChange,
}: {
  question: CreateQuestionInput;
  onChange: (next: CreateQuestionInput) => void;
}) {
  const options = question.content?.options ?? [];
  const multiple = question.type === 'MULTI_CHOICE';
  const selected = question.answerKey?.selectedKeys ?? [];

  const setOptions = (next: QuestionOption[], keys: string[]) => {
    onChange({
      ...question,
      content: { options: next },
      answerKey: { ...(question.answerKey ?? {}), selectedKeys: keys },
    });
  };

  const updateOption = (index: number, text: string) => {
    setOptions(
      options.map((option, i) => (i === index ? { ...option, text } : option)),
      selected,
    );
  };

  const addOption = () => {
    if (options.length >= OPTION_LETTERS.length) {
      return;
    }
    setOptions([...options, { key: OPTION_LETTERS[options.length]!, text: '' }], selected);
  };

  const removeOption = (index: number) => {
    const next = options
      .filter((_, i) => i !== index)
      .map((option, i) => ({ ...option, key: OPTION_LETTERS[i]! }));
    const removedKey = options[index]?.key;
    setOptions(next, selected.filter((key) => key !== removedKey));
  };

  const toggleCorrect = (key: string) => {
    const keys = multiple
      ? selected.includes(key)
        ? selected.filter((item) => item !== key)
        : [...selected, key]
      : [key];
    onChange({ ...question, answerKey: { ...(question.answerKey ?? {}), selectedKeys: keys } });
  };

  return (
    <Stack spacing={1}>
      <Typography variant="caption" color="text.secondary">
        Options — mark the correct answer{multiple ? 's' : ''} on the left.
      </Typography>
      {options.map((option, index) => (
        <Stack key={option.key} direction="row" spacing={1} alignItems="center">
          <Tooltip title={multiple ? 'Correct if ticked' : 'Correct answer'}>
            {multiple ? (
              <Checkbox
                checked={selected.includes(option.key)}
                onChange={() => toggleCorrect(option.key)}
                inputProps={{ 'aria-label': `Mark option ${option.key} correct` }}
              />
            ) : (
              <Radio
                checked={selected.includes(option.key)}
                onChange={() => toggleCorrect(option.key)}
                inputProps={{ 'aria-label': `Mark option ${option.key} correct` }}
              />
            )}
          </Tooltip>
          <Chip size="small" label={option.key} variant="outlined" />
          <TextField
            value={option.text}
            onChange={(event) => updateOption(index, event.target.value)}
            size="small"
            fullWidth
            placeholder={`Option ${option.key}`}
            inputProps={{ 'aria-label': `Option ${option.key} text` }}
          />
          <IconButton
            aria-label={`Remove option ${option.key}`}
            onClick={() => removeOption(index)}
            disabled={options.length <= 2}
            size="small"
          >
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
        </Stack>
      ))}
      <Box>
        <Button size="small" startIcon={<AddIcon />} onClick={addOption} disabled={options.length >= 8}>
          Add option
        </Button>
      </Box>
    </Stack>
  );
}

function AnswerKeyEditor({
  question,
  onChange,
}: {
  question: CreateQuestionInput;
  onChange: (next: CreateQuestionInput) => void;
}) {
  const patchKey = (patch: Partial<AnswerKey>) =>
    onChange({ ...question, answerKey: { ...(question.answerKey ?? {}), ...patch } });

  if (question.type === 'TRUE_FALSE') {
    const selected = question.answerKey?.selectedKeys?.[0] ?? 'TRUE';
    return (
      <FormControl fullWidth size="small">
        <InputLabel id={`tf-${question.prompt.length}-label`}>Correct answer</InputLabel>
        <Select
          labelId={`tf-${question.prompt.length}-label`}
          label="Correct answer"
          value={selected}
          onChange={(event) => patchKey({ selectedKeys: [event.target.value] })}
        >
          <MenuItem value="TRUE">True</MenuItem>
          <MenuItem value="FALSE">False</MenuItem>
        </Select>
      </FormControl>
    );
  }
  if (question.type === 'SHORT_ANSWER') {
    return (
      <TextField
        label="Accepted answers"
        helperText="Comma separated. Matching ignores case and surrounding spaces."
        value={(question.answerKey?.acceptedAnswers ?? []).join(', ')}
        onChange={(event) =>
          patchKey({
            acceptedAnswers: event.target.value
              .split(',')
              .map((value) => value.trim())
              .filter(Boolean),
          })
        }
        fullWidth
        size="small"
      />
    );
  }
  if (question.type === 'ESSAY') {
    return (
      <Stack spacing={1}>
        <TextField
          label="Model answer (marking aid)"
          value={question.answerKey?.modelAnswer ?? ''}
          onChange={(event) => patchKey({ modelAnswer: event.target.value })}
          multiline
          minRows={2}
          fullWidth
          size="small"
        />
        <TextField
          label="Rubric"
          value={question.answerKey?.rubric ?? ''}
          onChange={(event) => patchKey({ rubric: event.target.value })}
          multiline
          minRows={2}
          fullWidth
          size="small"
        />
      </Stack>
    );
  }
  return null;
}

export function QuestionFields({
  questions,
  onChange,
  error,
  allowAdd = true,
  allowRemove = true,
  autoFocusPrompt = false,
}: QuestionFieldsProps) {
  const update = (index: number, next: CreateQuestionInput) => {
    onChange(questions.map((question, i) => (i === index ? next : question)));
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
        <Box>
          <Typography variant="h6">Questions</Typography>
          <Typography variant="body2" color="text.secondary">
            Choice and true/false questions are marked automatically. Short answers are matched against
            the accepted list; essays go to the manual queue.
          </Typography>
        </Box>
        {allowAdd ? (
          <Button size="small" startIcon={<AddIcon />} onClick={() => onChange([...questions, emptyQuestion()])}>
            Add question
          </Button>
        ) : null}
      </Stack>      {error ? (
        <Typography color="error" variant="body2" sx={{ mb: 1 }}>
          {error}
        </Typography>
      ) : null}
      <Stack spacing={2}>
        {questions.map((question, index) => (
          <Box
            key={index}
            sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: { xs: 1.5, sm: 2 } }}
          >
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
              <Chip size="small" label={`Q${index + 1}`} color="primary" />
              <Box sx={{ flexGrow: 1 }} />
              <IconButton
                aria-label={`Move question ${index + 1} up`}
                onClick={() => move(index, -1)}
                disabled={index === 0}
                size="small"
              >
                <ArrowUpwardIcon fontSize="small" />
              </IconButton>
              <IconButton
                aria-label={`Move question ${index + 1} down`}
                onClick={() => move(index, 1)}
                disabled={index === questions.length - 1}
                size="small"
              >
                <ArrowDownwardIcon fontSize="small" />
              </IconButton>
              {allowRemove ? (
                <IconButton
                  aria-label={`Remove question ${index + 1}`}
                  onClick={() => onChange(questions.filter((_, i) => i !== index))}
                  disabled={questions.length === 1}
                  size="small"
                >
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              ) : null}
            </Stack>

            <Stack spacing={1.5}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <FormControl size="small" sx={{ minWidth: 180 }}>
                  <InputLabel id={`type-${index}-label`}>Question type</InputLabel>
                  <Select
                    labelId={`type-${index}-label`}
                    label="Question type"
                    value={question.type}
                    onChange={(event) =>
                      update(index, withType(question, event.target.value as QuestionType))
                    }
                  >
                    {(Object.keys(QUESTION_TYPE_LABELS) as QuestionType[]).map((type) => (
                      <MenuItem key={type} value={type}>
                        {QUESTION_TYPE_LABELS[type]}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <TextField
                  label="Points"
                  type="number"
                  size="small"
                  value={question.points}
                  onChange={(event) => update(index, { ...question, points: Number(event.target.value) })}
                  inputProps={{ min: 0.25, step: 0.25 }}
                  sx={{ width: { xs: '100%', sm: 120 } }}
                />
                {question.type === 'SHORT_ANSWER' || question.type === 'ESSAY' ? (
                  <TextField
                    label="Word limit"
                    type="number"
                    size="small"
                    value={question.maxWords}
                    onChange={(event) =>
                      update(index, { ...question, maxWords: Number(event.target.value) })
                    }
                    inputProps={{ min: 1, max: 5000 }}
                    sx={{ width: { xs: '100%', sm: 130 } }}
                  />
                ) : null}
                <Box sx={{ flexGrow: 1 }} />
                <Chip
                  size="small"
                  variant="outlined"
                  color={isAutoGraded(question.type) ? 'success' : 'default'}
                  label={isAutoGraded(question.type) ? 'Auto-marked' : 'Manual marking'}
                />
              </Stack>

              <TextField
                label="Prompt"
                value={question.prompt}
                onChange={(event) => update(index, { ...question, prompt: event.target.value })}
                multiline
                minRows={2}
                fullWidth
                size="small"
                required
                autoFocus={autoFocusPrompt && index === 0}
              />

              {question.type === 'SINGLE_CHOICE' || question.type === 'MULTI_CHOICE' ? (
                <OptionEditor question={question} onChange={(next) => update(index, next)} />
              ) : null}

              <AnswerKeyEditor question={question} onChange={(next) => update(index, next)} />

              <TextField
                label="Explanation (shown after results are released)"
                value={question.explanation ?? ''}
                onChange={(event) => update(index, { ...question, explanation: event.target.value })}
                size="small"
                fullWidth
              />
            </Stack>
          </Box>
        ))}
      </Stack>
      <Divider sx={{ mt: 2 }} />
    </Box>
  );
}
