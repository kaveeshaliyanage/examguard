import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import FormControlLabel from '@mui/material/FormControlLabel';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '../../api/client';
import { useCreateExam } from '../../api/staffQueries';
import type { CreateExamInput, CreateQuestionInput, CreateRuleInput } from '../../api/types';
import { AppShell } from '../../components/AppShell';
import { describeDomainRule } from '../../lib/domains';
import { QuestionFields } from './QuestionFields';
import { RuleFields } from './RuleFields';

interface HeaderState {
  code: string;
  title: string;
  description: string;
  durationMinutes: number;
  allowExtension: boolean;
}

function validate(
  header: HeaderState,
  questions: CreateQuestionInput[],
  rules: CreateRuleInput[],
): string | null {
  if (!header.code.trim()) {
    return 'Exam code is required.';
  }
  if (!header.title.trim()) {
    return 'Title is required.';
  }
  if (!Number.isInteger(header.durationMinutes) || header.durationMinutes < 5 || header.durationMinutes > 480) {
    return 'Duration must be between 5 and 480 minutes.';
  }
  if (questions.length === 0) {
    return 'Add at least one question.';
  }
  for (const [index, question] of questions.entries()) {
    if (!question.prompt.trim()) {
      return `Question ${index + 1} needs a prompt.`;
    }
    if (!Number.isInteger(question.maxWords) || question.maxWords < 1 || question.maxWords > 5000) {
      return `Question ${index + 1} needs a word limit between 1 and 5000.`;
    }
  }
  for (const [index, rule] of rules.entries()) {
    const kind = describeDomainRule(rule.domainPattern);
    if (kind === 'empty') {
      return `Rule ${index + 1} needs a domain pattern.`;
    }
    if (kind === 'invalid') {
      return `Rule ${index + 1} has an invalid regular expression.`;
    }
  }
  return null;
}

export function CreateExamPage() {
  const navigate = useNavigate();
  const create = useCreateExam();
  const [header, setHeader] = useState<HeaderState>({
    code: '',
    title: '',
    description: '',
    durationMinutes: 60,
    allowExtension: true,
  });
  const [questions, setQuestions] = useState<CreateQuestionInput[]>([{ prompt: '', maxWords: 250 }]);
  const [rules, setRules] = useState<CreateRuleInput[]>([]);
  const [error, setError] = useState<string | null>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const problem = validate(header, questions, rules);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    const input: CreateExamInput = {
      code: header.code.trim().toUpperCase(),
      title: header.title.trim(),
      description: header.description.trim() || null,
      durationMinutes: header.durationMinutes,
      allowExtension: header.allowExtension,
      questions: questions.map((question) => ({
        prompt: question.prompt.trim(),
        maxWords: question.maxWords,
      })),
      resourceRules: rules.map((rule) => ({
        category: rule.category,
        domainPattern: rule.domainPattern.trim(),
        note: rule.note?.trim() || null,
      })),
    };
    create.mutate(input, {
      onSuccess: (exam) => navigate(`/exams/${exam.id}`, { replace: true }),
      onError: (caught) =>
        setError(caught instanceof ApiError ? caught.message : 'Could not create the exam.'),
    });
  };

  return (
    <AppShell breadcrumb={<Typography color="text.secondary">New exam</Typography>}>
      <Stack spacing={3} component="form" onSubmit={submit} noValidate>
        <div>
          <Typography variant="h4">Create exam</Typography>
          <Typography color="text.secondary">
            The exam is saved as a draft. Opening it for candidates is a separate step.
          </Typography>
        </div>

        {error ? <Alert severity="error">{error}</Alert> : null}

        <Paper variant="outlined" sx={{ p: 3 }}>
          <Stack spacing={2}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                label="Exam code"
                value={header.code}
                onChange={(event) => setHeader({ ...header, code: event.target.value })}
                required
                fullWidth
                inputProps={{ maxLength: 64 }}
              />
              <TextField
                label="Duration (minutes)"
                type="number"
                value={header.durationMinutes}
                onChange={(event) =>
                  setHeader({ ...header, durationMinutes: Number(event.target.value) })
                }
                required
                sx={{ width: { xs: '100%', sm: 180 } }}
                inputProps={{ min: 5, max: 480 }}
              />
            </Stack>
            <TextField
              label="Title"
              value={header.title}
              onChange={(event) => setHeader({ ...header, title: event.target.value })}
              required
              fullWidth
              inputProps={{ maxLength: 255 }}
            />
            <TextField
              label="Description"
              value={header.description}
              onChange={(event) => setHeader({ ...header, description: event.target.value })}
              multiline
              minRows={2}
              fullWidth
              inputProps={{ maxLength: 4000 }}
            />
            <FormControlLabel
              control={
                <Switch
                  checked={header.allowExtension}
                  onChange={(event) =>
                    setHeader({ ...header, allowExtension: event.target.checked })
                  }
                />
              }
              label="Allow the monitoring extension (domain-only observations)"
            />
          </Stack>
        </Paper>

        <Paper variant="outlined" sx={{ p: 3 }}>
          <QuestionFields questions={questions} onChange={setQuestions} error={null} />
        </Paper>

        <Paper variant="outlined" sx={{ p: 3 }}>
          <RuleFields rules={rules} onChange={setRules} error={null} />
        </Paper>

        <Stack direction="row" spacing={2} justifyContent="flex-end">
          <Button onClick={() => navigate('/exams')}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={create.isPending}>
            {create.isPending ? 'Creating…' : 'Create exam'}
          </Button>
        </Stack>
      </Stack>
    </AppShell>
  );
}
