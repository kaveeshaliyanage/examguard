import Checkbox from '@mui/material/Checkbox';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormGroup from '@mui/material/FormGroup';
import FormHelperText from '@mui/material/FormHelperText';
import FormLabel from '@mui/material/FormLabel';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import type { ExamQuestion, QuestionOption } from '../../api/types';
import { CodeEditor } from '../../components/CodeEditor';

export interface QuestionAnswerValue {
  text: string;
  selectedOptions: string[];
}

export interface QuestionRendererProps {
  question: ExamQuestion;
  value: QuestionAnswerValue;
  disabled?: boolean;
  onChange: (value: QuestionAnswerValue) => void;
}

export function countWords(text: string): number {
  return text.trim().length === 0 ? 0 : text.trim().split(/\s+/).length;
}

function optionsFor(question: ExamQuestion): QuestionOption[] {
  return question.content?.options ?? [];
}

function optionLabel(question: ExamQuestion, key: string): string {
  return optionsFor(question).find((option) => option.key === key)?.text ?? key;
}

const trueFalseOptions: QuestionOption[] = [
  { key: 'TRUE', text: 'True' },
  { key: 'FALSE', text: 'False' },
];

function ChoiceField({
  question,
  options,
  value,
  disabled,
  multiple,
  onChange,
}: {
  question: ExamQuestion;
  options: QuestionOption[];
  value: QuestionAnswerValue;
  disabled: boolean;
  multiple: boolean;
  onChange: (value: QuestionAnswerValue) => void;
}) {
  const groupName = `question-${question.id}`;
  const selected = value.selectedOptions;

  if (multiple) {
    const toggle = (key: string) => {
      const next = selected.includes(key)
        ? selected.filter((item) => item !== key)
        : [...selected, key];
      onChange({
        text: next.map((item) => optionLabel(question, item)).join('; '),
        selectedOptions: next,
      });
    };
    return (
      <FormControl component="fieldset" disabled={disabled} fullWidth>
        <FormLabel component="legend" sx={{ mb: 1, fontWeight: 600 }}>
          Select all that apply
        </FormLabel>
        <FormGroup>
          {options.map((option) => (
            <FormControlLabel
              key={option.key}
              control={
                <Checkbox checked={selected.includes(option.key)} onChange={() => toggle(option.key)} />
              }
              label={`${option.key}. ${option.text}`}
            />
          ))}
        </FormGroup>
        <FormHelperText>{selected.length} selected</FormHelperText>
      </FormControl>
    );
  }

  const current = selected[0] ?? (value.text ? options.find((option) => option.text === value.text)?.key : undefined);
  return (
    <FormControl component="fieldset" disabled={disabled} fullWidth>
      <FormLabel component="legend" sx={{ mb: 1, fontWeight: 600 }}>
        Select one answer
      </FormLabel>
      <RadioGroup
        name={groupName}
        value={current ?? ''}
        onChange={(event) => {
          const option = options.find((item) => item.key === event.target.value);
          onChange({
            text: option?.text ?? event.target.value,
            selectedOptions: [event.target.value],
          });
        }}
      >
        {options.map((option) => (
          <FormControlLabel
            key={option.key}
            value={option.key}
            control={<Radio />}
            label={`${option.key}. ${option.text}`}
          />
        ))}
      </RadioGroup>
    </FormControl>
  );
}

export function QuestionRenderer({ question, value, disabled = false, onChange }: QuestionRendererProps) {
  switch (question.type) {
    case 'SINGLE_CHOICE':
      return (
        <ChoiceField
          question={question}
          options={optionsFor(question)}
          value={value}
          disabled={disabled}
          multiple={false}
          onChange={onChange}
        />
      );
    case 'MULTI_CHOICE':
      return (
        <ChoiceField
          question={question}
          options={optionsFor(question)}
          value={value}
          disabled={disabled}
          multiple
          onChange={onChange}
        />
      );
    case 'TRUE_FALSE':
      return (
        <ChoiceField
          question={question}
          options={trueFalseOptions}
          value={value}
          disabled={disabled}
          multiple={false}
          onChange={onChange}
        />
      );
    case 'SHORT_ANSWER':
      return (
        <TextField
          value={value.text}
          onChange={(event) => onChange({ text: event.target.value, selectedOptions: [] })}
          disabled={disabled}
          fullWidth
          multiline
          minRows={1}
          maxRows={3}
          placeholder="Type a short answer. It saves automatically."
          inputProps={{ 'aria-label': `Answer for question ${question.orderIndex}` }}
        />
      );
    case 'CODE':
      return (
        <Stack spacing={0.75}>
          <CodeEditor
            value={value.text}
            language={question.content?.language}
            disabled={disabled}
            label={`Your solution for question ${question.orderIndex}`}
            onChange={(text) => onChange({ text, selectedOptions: [] })}
          />
          <Typography variant="caption" color="text.secondary">
            Your code is stored exactly as typed and autosaves. It runs against the question&apos;s
            test cases when you submit.
          </Typography>
        </Stack>
      );
    case 'ESSAY':
    default: {
      const words = countWords(value.text);
      const over = words > question.maxWords;
      return (
        <Stack spacing={0.5}>
          <TextField
            value={value.text}
            onChange={(event) => onChange({ text: event.target.value, selectedOptions: [] })}
            disabled={disabled}
            multiline
            minRows={6}
            maxRows={18}
            fullWidth
            placeholder="Type your answer here. It saves automatically."
            error={over}
            inputProps={{ 'aria-label': `Answer for question ${question.orderIndex}` }}
          />
          <Typography
            variant="caption"
            color={over ? 'error.main' : 'text.secondary'}
            aria-live="polite"
            sx={{ alignSelf: 'flex-end' }}
          >
            {words} / {question.maxWords} words{over ? ' — over the limit' : ''}
          </Typography>
        </Stack>
      );
    }
  }
}
