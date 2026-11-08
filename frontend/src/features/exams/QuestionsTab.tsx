import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import { useState } from 'react';
import { ApiError } from '../../api/client';
import {
  useCreateQuestion,
  useDeleteQuestion,
  useReorderQuestions,
  useUpdateQuestion,
} from '../../api/staffQueries';
import type { CreateQuestionInput, ExamDetail, ExamQuestion } from '../../api/types';
import { EmptyState } from '../../components/EmptyState';
import { useToast } from '../../components/ToastProvider';
import { QuestionRenderer } from '../student/QuestionRenderer';
import type { QuestionAnswerValue } from '../student/QuestionRenderer';
import { QuestionFields, QUESTION_TYPE_LABELS, emptyQuestion, isAutoGraded, validateQuestion } from './QuestionFields';

interface QuestionsTabProps {
  exam: ExamDetail;
  canManage: boolean;
}

function toInput(question: ExamQuestion): CreateQuestionInput {
  return {
    prompt: question.prompt,
    type: question.type,
    points: question.points,
    maxWords: question.maxWords,
    content: question.content ?? {},
    answerKey: question.answerKey ?? {},
    explanation: question.explanation ?? '',
  };
}

function keySummary(question: ExamQuestion): string {
  if (question.type === 'TRUE_FALSE') {
    const value = question.answerKey?.selectedKeys?.[0];
    return value === 'FALSE' ? 'False' : 'True';
  }
  if (question.type === 'SINGLE_CHOICE' || question.type === 'MULTI_CHOICE') {
    const keys = question.answerKey?.selectedKeys ?? [];
    return keys.length > 0 ? keys.join(', ') : 'No key set';
  }
  if (question.type === 'SHORT_ANSWER') {
    const accepted = question.answerKey?.acceptedAnswers ?? [];
    return accepted.length > 0 ? accepted.join(', ') : 'No accepted answers';
  }
  return question.answerKey?.rubric ? 'Rubric set' : 'Manual marking';
}

export function QuestionsTab({ exam, canManage }: QuestionsTabProps) {
  const { showToast } = useToast();
  const create = useCreateQuestion(exam.id);
  const update = useUpdateQuestion(exam.id);
  const remove = useDeleteQuestion(exam.id);
  const reorder = useReorderQuestions(exam.id);
  const [editing, setEditing] = useState<ExamQuestion | 'new' | null>(null);
  const [draft, setDraft] = useState<CreateQuestionInput>(emptyQuestion());
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [previewAnswer, setPreviewAnswer] = useState<QuestionAnswerValue>({
    text: '',
    selectedOptions: [],
  });

  const openNew = () => {
    setDraft(emptyQuestion());
    setPreview(false);
    setPreviewAnswer({ text: '', selectedOptions: [] });
    setError(null);
    setEditing('new');
  };

  const openEdit = (question: ExamQuestion) => {
    setDraft(toInput(question));
    setPreview(false);
    setPreviewAnswer({ text: '', selectedOptions: [] });
    setError(null);
    setEditing(question);
  };

  const closeDialog = () => {
    setEditing(null);
    setPreview(false);
  };

  const save = () => {
    const problem = validateQuestion(draft, 0);
    if (problem) {
      setError(problem);
      return;
    }
    const payload: CreateQuestionInput = {
      ...draft,
      prompt: draft.prompt.trim(),
      explanation: draft.explanation?.trim() || null,
    };
    const onError = (caught: unknown) =>
      setError(caught instanceof ApiError ? caught.message : 'Could not save the question.');
    if (editing === 'new') {
      create.mutate(payload, {
        onSuccess: () => {
          showToast('Question added.', { severity: 'success' });
          setEditing(null);
        },
        onError,
      });
    } else if (editing) {
      update.mutate(
        { questionId: editing.id, payload },
        {
          onSuccess: () => {
            showToast('Question updated.', { severity: 'success' });
            setEditing(null);
          },
          onError,
        },
      );
    }
  };

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    const ids = exam.questions.map((question) => question.id);
    if (target < 0 || target >= ids.length) {
      return;
    }
    const [item] = ids.splice(index, 1);
    if (item) {
      ids.splice(target, 0, item);
    }
    reorder.mutate(ids, {
      onError: (caught) =>
        showToast(caught instanceof ApiError ? caught.message : 'Could not reorder questions.', {
          severity: 'error',
        }),
    });
  };

  if (exam.questions.length === 0) {
    return (
      <Stack spacing={2}>
        <EmptyState
          title="No questions yet"
          body="Add single choice, multiple choice, true/false, short answer or essay questions."
        />
        {canManage ? (
          <Stack direction="row" justifyContent="center">
            <Button variant="contained" onClick={openNew}>
              Add the first question
            </Button>
          </Stack>
        ) : null}
        {renderDialog()}
      </Stack>
    );
  }

  function renderDialog() {
    const previewQuestion: ExamQuestion = {
      id: 0,
      orderIndex: 1,
      prompt: draft.prompt,
      type: draft.type,
      points: draft.points,
      maxWords: draft.maxWords,
      content: draft.content ?? {},
      answerKey: draft.answerKey ?? null,
      explanation: draft.explanation ?? null,
    };
    return (
      <Dialog
        open={editing !== null}
        onClose={closeDialog}
        fullWidth
        maxWidth="md"
        PaperProps={{ 'aria-modal': 'true' }}
      >
        <DialogTitle>{editing === 'new' ? 'Add question' : 'Edit question'}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            {error ? <Alert severity="error">{error}</Alert> : null}
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="subtitle2">Authoring and preview</Typography>
              <ToggleButtonGroup
                size="small"
                exclusive
                value={preview ? 'preview' : 'edit'}
                onChange={(_, value: 'edit' | 'preview' | null) => {
                  if (value) {
                    setPreview(value === 'preview');
                  }
                }}
                aria-label="Question preview"
              >
                <ToggleButton value="edit">Edit</ToggleButton>
                <ToggleButton value="preview">Preview</ToggleButton>
              </ToggleButtonGroup>
            </Stack>
            {preview ? (
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1, whiteSpace: 'pre-wrap' }}>
                  {draft.prompt || 'Question prompt'}
                </Typography>
                <QuestionRenderer
                  question={previewQuestion}
                  value={previewAnswer}
                  onChange={setPreviewAnswer}
                />
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
                  Preview only. Answers typed here are never saved.
                </Typography>
              </Paper>
            ) : (
              <QuestionFields
                questions={[draft]}
                onChange={(next) => setDraft(next[0] ?? draft)}
                error={null}
                allowAdd={false}
                allowRemove={false}
                autoFocusPrompt
              />
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDialog}>Cancel</Button>
          <Button
            variant="contained"
            onClick={save}
            disabled={create.isPending || update.isPending}
          >
            {create.isPending || update.isPending ? 'Saving…' : 'Save question'}
          </Button>
        </DialogActions>
      </Dialog>
    );
  }

  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="h6">Questions ({exam.questions.length})</Typography>
        {canManage ? (
          <Button variant="contained" size="small" onClick={openNew}>
            Add question
          </Button>
        ) : null}
      </Stack>

      {exam.questions.map((question, index) => (
        <Paper key={question.id} variant="outlined" sx={{ p: { xs: 1.5, sm: 2 } }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'flex-start' }}>
            <Chip size="small" color="primary" label={`Q${index + 1}`} />
            <Stack spacing={0.75} sx={{ flexGrow: 1, minWidth: 0 }}>
              <Typography sx={{ whiteSpace: 'pre-wrap' }}>{question.prompt}</Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Chip size="small" variant="outlined" label={QUESTION_TYPE_LABELS[question.type]} />
                <Chip size="small" variant="outlined" label={`${question.points} pts`} />
                <Chip
                  size="small"
                  variant="outlined"
                  color={isAutoGraded(question.type) ? 'success' : 'default'}
                  label={isAutoGraded(question.type) ? 'Auto-marked' : 'Manual marking'}
                />
                <Chip size="small" variant="outlined" label={`Key: ${keySummary(question)}`} />
              </Stack>
              {question.content?.options?.length ? (
                <Typography variant="body2" color="text.secondary">
                  {question.content.options.map((option) => `${option.key}. ${option.text}`).join(' · ')}
                </Typography>
              ) : null}
            </Stack>
            {canManage ? (
              <Stack direction="row" spacing={0.25}>
                <IconButton
                  aria-label={`Move question ${index + 1} up`}
                  size="small"
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  <ArrowUpwardIcon fontSize="small" />
                </IconButton>
                <IconButton
                  aria-label={`Move question ${index + 1} down`}
                  size="small"
                  disabled={index === exam.questions.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDownwardIcon fontSize="small" />
                </IconButton>
                <IconButton
                  aria-label={`Edit question ${index + 1}`}
                  size="small"
                  onClick={() => openEdit(question)}
                >
                  <EditOutlinedIcon fontSize="small" />
                </IconButton>
                <IconButton
                  aria-label={`Delete question ${index + 1}`}
                  size="small"
                  disabled={remove.isPending || exam.questions.length === 1}
                  onClick={() =>
                    remove.mutate(question.id, {
                      onSuccess: () => showToast('Question deleted.', { severity: 'success' }),
                      onError: (caught) =>
                        showToast(
                          caught instanceof ApiError ? caught.message : 'Could not delete the question.',
                          { severity: 'error' },
                        ),
                    })
                  }
                >
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </Stack>
            ) : null}
          </Stack>
        </Paper>
      ))}
      {renderDialog()}
    </Stack>
  );
}
