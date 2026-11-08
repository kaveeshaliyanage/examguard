import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import FormControlLabel from '@mui/material/FormControlLabel';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { ApiError } from '../../api/client';
import { useUpdateExam } from '../../api/staffQueries';
import type { CreateRuleInput, ExamDetail, UpdateExamInput } from '../../api/types';
import { useToast } from '../../components/ToastProvider';
import { UnsavedChangesGuard } from '../../components/UnsavedChangesGuard';
import { describeDomainRule } from '../../lib/domains';
import { fromDateTimeLocalValue, toDateTimeLocalValue } from '../../lib/format';
import { RuleFields } from './RuleFields';

interface ExamSettingsFormProps {
  exam: ExamDetail;
  canManage: boolean;
}

interface Draft {
  title: string;
  description: string;
  durationMinutes: number;
  allowExtension: boolean;
  maxStrikes: number;
  instructions: string;
  opensAt: string;
  closesAt: string;
  rules: CreateRuleInput[];
}

function draftFromExam(exam: ExamDetail): Draft {
  return {
    title: exam.title,
    description: exam.description ?? '',
    durationMinutes: exam.durationMinutes,
    allowExtension: exam.allowExtension,
    maxStrikes: exam.maxStrikes ?? 3,
    instructions: exam.instructions ?? '',
    opensAt: toDateTimeLocalValue(exam.opensAt),
    closesAt: toDateTimeLocalValue(exam.closesAt),
    rules: exam.resourceRules.map((rule) => ({
      category: rule.category,
      domainPattern: rule.domainPattern,
      note: rule.note,
    })),
  };
}

function snapshot(draft: Draft): string {
  return JSON.stringify(draft);
}

function toPayload(draft: Draft): UpdateExamInput {
  return {
    title: draft.title.trim(),
    description: draft.description.trim() || null,
    durationMinutes: draft.durationMinutes,
    allowExtension: draft.allowExtension,
    maxStrikes: draft.maxStrikes,
    instructions: draft.instructions.trim() || null,
    opensAt: fromDateTimeLocalValue(draft.opensAt),
    closesAt: fromDateTimeLocalValue(draft.closesAt),
    resourceRules: draft.rules.map((rule) => ({
      category: rule.category,
      domainPattern: rule.domainPattern.trim(),
      note: rule.note?.trim() || null,
    })),
  };
}

function validate(draft: Draft): string | null {
  if (!draft.title.trim()) {
    return 'A title is required.';
  }
  if (!Number.isInteger(draft.durationMinutes) || draft.durationMinutes < 5 || draft.durationMinutes > 600) {
    return 'Duration must be between 5 and 600 minutes.';
  }
  if (!Number.isInteger(draft.maxStrikes) || draft.maxStrikes < 1 || draft.maxStrikes > 10) {
    return 'Focus-loss limit must be between 1 and 10.';
  }
  if (draft.opensAt && draft.closesAt) {
    const opens = fromDateTimeLocalValue(draft.opensAt);
    const closes = fromDateTimeLocalValue(draft.closesAt);
    if (opens && closes && new Date(closes) <= new Date(opens)) {
      return 'The exam must close after it opens.';
    }
  }
  for (const [index, rule] of draft.rules.entries()) {
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

export function ExamSettingsForm({ exam, canManage }: ExamSettingsFormProps) {
  const { showToast } = useToast();
  const update = useUpdateExam(exam.id);
  const [draft, setDraft] = useState<Draft>(() => draftFromExam(exam));
  const [baseline, setBaseline] = useState(() => snapshot(draftFromExam(exam)));
  const [error, setError] = useState<string | null>(null);
  const dirty = snapshot(draft) !== baseline;

  const patch = (next: Partial<Draft>) => setDraft((current) => ({ ...current, ...next }));

  const save = () => {
    const problem = validate(draft);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    const payload = toPayload(draft);
    update.mutate(payload, {
      onSuccess: () => {
        setBaseline(snapshot(draft));
        showToast('Exam settings saved.', { severity: 'success' });
      },
      onError: (caught) =>
        setError(caught instanceof ApiError ? caught.message : 'Could not save the exam settings.'),
    });
  };

  return (
    <Paper variant="outlined" sx={{ p: 3 }}>
      <Stack spacing={2}>
        <Typography variant="h6">Exam settings</Typography>
        <Typography variant="body2" color="text.secondary">
          The exam code is the join key and stays fixed. Changes are audited and apply to new
          submissions; an attempt already under way keeps running.
        </Typography>
        {error ? <Alert severity="error">{error}</Alert> : null}

        <TextField
          label="Title"
          value={draft.title}
          onChange={(event) => patch({ title: event.target.value })}
          disabled={!canManage}
          required
          fullWidth
          inputProps={{ maxLength: 255 }}
        />
        <TextField
          label="Description"
          value={draft.description}
          onChange={(event) => patch({ description: event.target.value })}
          disabled={!canManage}
          multiline
          minRows={2}
          fullWidth
          inputProps={{ maxLength: 4000 }}
        />
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField
            label="Duration (minutes)"
            type="number"
            value={draft.durationMinutes}
            onChange={(event) => patch({ durationMinutes: Number(event.target.value) })}
            disabled={!canManage}
            sx={{ width: { xs: '100%', sm: 200 } }}
            inputProps={{ min: 5, max: 600 }}
            helperText="Lateness is judged against this duration when a candidate submits."
          />
          <TextField
            label="Focus-loss limit (strikes)"
            type="number"
            value={draft.maxStrikes}
            onChange={(event) => patch({ maxStrikes: Number(event.target.value) })}
            disabled={!canManage}
            sx={{ width: { xs: '100%', sm: 220 } }}
            inputProps={{ min: 1, max: 10 }}
            helperText="Applies to attempts started after the change."
          />
        </Stack>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField
            label="Opens at"
            type="datetime-local"
            value={draft.opensAt}
            onChange={(event) => patch({ opensAt: event.target.value })}
            disabled={!canManage}
            InputLabelProps={{ shrink: true }}
            fullWidth
            helperText="Leave blank to allow joins immediately."
          />
          <TextField
            label="Closes at"
            type="datetime-local"
            value={draft.closesAt}
            onChange={(event) => patch({ closesAt: event.target.value })}
            disabled={!canManage}
            InputLabelProps={{ shrink: true }}
            fullWidth
            helperText="New joins stop; attempts in progress can still finish."
          />
        </Stack>
        <TextField
          label="Instructions shown before the exam"
          value={draft.instructions}
          onChange={(event) => patch({ instructions: event.target.value })}
          disabled={!canManage}
          multiline
          minRows={3}
          fullWidth
          inputProps={{ maxLength: 8000 }}
        />
        <FormControlLabel
          control={
            <Switch
              checked={draft.allowExtension}
              onChange={(event) => patch({ allowExtension: event.target.checked })}
              disabled={!canManage}
            />
          }
          label="Allow the monitoring extension (domain-only observations)"
        />

        <RuleFields
          rules={draft.rules}
          onChange={(rules) => patch({ rules })}
          error={null}
        />

        {canManage ? (
          <Stack direction="row" spacing={2} justifyContent="flex-end">
            <Button
              onClick={() => {
                setDraft(draftFromExam(exam));
                setBaseline(snapshot(draftFromExam(exam)));
                setError(null);
              }}
              disabled={!dirty || update.isPending}
            >
              Discard changes
            </Button>
            <Button variant="contained" onClick={save} disabled={!dirty || update.isPending}>
              {update.isPending ? 'Saving…' : 'Save settings'}
            </Button>
          </Stack>
        ) : (
          <Typography variant="body2" color="text.secondary">
            Only an exam owner can change these settings.
          </Typography>
        )}
        <UnsavedChangesGuard when={canManage && dirty} />
      </Stack>
    </Paper>
  );
}
