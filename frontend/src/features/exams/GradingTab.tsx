import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import LinearProgress from '@mui/material/LinearProgress';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import ReplayIcon from '@mui/icons-material/Replay';
import { useEffect, useMemo, useState } from 'react';
import { ApiError } from '../../api/client';
import { useGradeAnswer, useGradingQueue, useJudgeCode, useReleaseGrades } from '../../api/dashboardApi';
import type { ExamDetail, GradingRow } from '../../api/types';
import { CodeBlock } from '../../components/CodeEditor';
import { CodeTestResults } from '../../components/CodeTestResults';
import { EmptyState } from '../../components/EmptyState';
import { LoadingBlock } from '../../components/LoadingBlock';
import { useToast } from '../../components/ToastProvider';
import { monoFontFamily } from '../../design/tokens';
import { QUESTION_TYPE_LABELS } from './QuestionFields';

interface GradingTabProps {
  exam: ExamDetail;
  canReview: boolean;
}

interface AttemptGroup {
  attemptId: number;
  candidateCode: string;
  pending: number;
  total: number;
  rows: GradingRow[];
}

function groupRows(rows: GradingRow[]): AttemptGroup[] {
  const groups = new Map<number, AttemptGroup>();
  for (const row of rows) {
    const group = groups.get(row.attemptId) ?? {
      attemptId: row.attemptId,
      candidateCode: row.candidateCode,
      pending: 0,
      total: 0,
      rows: [],
    };
    group.rows.push(row);
    group.total += 1;
    if (row.awardedPoints === null) {
      group.pending += 1;
    }
    groups.set(row.attemptId, group);
  }
  return [...groups.values()].sort((left, right) => right.pending - left.pending);
}

function keyText(row: GradingRow): string {
  const key = row.answerKey;
  if (!key) {
    return 'No key required';
  }
  if (key.selectedKeys?.length) {
    return `Correct: ${key.selectedKeys.join(', ')}`;
  }
  if (key.acceptedAnswers?.length) {
    return `Accepted: ${key.acceptedAnswers.join(' · ')}`;
  }
  if (row.type === 'CODE') {
    const tests = key.tests ?? [];
    return tests.length > 0 ? `${tests.length} test case(s)` : 'Manual marking';
  }
  return [key.modelAnswer, key.rubric].filter(Boolean).join('\n\n') || 'Marked by rubric';
}

function CodeTests({ row }: { row: GradingRow }) {
  const tests = row.answerKey?.tests ?? [];
  return (
    <Stack spacing={1}>
      <Typography variant="caption" color="text.secondary">
        {tests.length > 0
          ? 'Test cases the judge runs. Expected output is never shown to the candidate.'
          : 'No test cases were set, so this answer has to be marked by hand.'}
      </Typography>
      {tests.map((test, index) => (
        <Box
          key={`${test.name ?? 'case'}-${index}`}
          sx={{ p: 1, borderRadius: 1, bgcolor: 'action.hover', fontFamily: monoFontFamily, fontSize: 12 }}
        >
          <Typography variant="caption" sx={{ fontWeight: 600 }}>
            {test.name || `Case ${index + 1}`}
            {test.hidden ? ' · hidden' : ''}
          </Typography>
          <Box sx={{ whiteSpace: 'pre-wrap' }}>
            {`in: ${test.input?.trim() ? test.input : '(empty)'}\nout: ${test.expectedOutput}`}
          </Box>
        </Box>
      ))}
    </Stack>
  );
}

function GradeCard({ row, examId }: { row: GradingRow; examId: number }) {
  const { showToast } = useToast();
  const grade = useGradeAnswer(examId);
  const [score, setScore] = useState(row.awardedPoints === null ? '' : String(row.awardedPoints));
  const [comment, setComment] = useState(row.comment ?? '');
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    const value = Number(score);
    if (!Number.isFinite(value) || value < 0 || value > row.points) {
      setError(`Enter a score between 0 and ${row.points}.`);
      return;
    }
    setError(null);
    grade.mutate(
      { attemptId: row.attemptId, questionId: row.questionId, awardedPoints: value, comment: comment.trim() || undefined },
      {
        onSuccess: () => showToast('Score saved.', { severity: 'success' }),
        onError: (caught) =>
          setError(caught instanceof ApiError ? caught.message : 'Could not save the score.'),
      },
    );
  };

  const answerText =
    row.selectedOptions.length > 0 ? `Selected: ${row.selectedOptions.join(', ')}` : row.text;

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={1.5}>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="center">
          <Chip size="small" variant="outlined" label={QUESTION_TYPE_LABELS[row.type]} />
          <Chip
            size="small"
            variant="outlined"
            color={row.awardedPoints === null ? 'warning' : 'success'}
            label={row.awardedPoints === null ? 'Ungraded' : `${row.awardedPoints} / ${row.points}`}
          />
          <Typography variant="caption" color="text.secondary">
            {row.savedAt ? `Saved ${new Date(row.savedAt).toLocaleString()}` : 'No answer saved'}
          </Typography>
        </Stack>
        <Typography sx={{ fontWeight: 600 }}>{row.prompt}</Typography>
        {row.type === 'CODE' ? (
          row.text.trim() ? (
            <CodeBlock code={row.text} label="Submitted code" />
          ) : (
            <Alert severity="info">The candidate left this blank.</Alert>
          )
        ) : (
          <Box
            sx={{
              p: 1.5,
              borderRadius: 1,
              bgcolor: 'action.hover',
              whiteSpace: 'pre-wrap',
              minHeight: 48,
              color: answerText ? 'text.primary' : 'text.secondary',
            }}
          >
            {answerText || 'The candidate left this blank.'}
          </Box>
        )}
        {row.type === 'CODE' ? (
          <CodeTests row={row} />
        ) : (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: 13 }}
          >
            {keyText(row)}
          </Typography>
        )}
        {row.detail ? <CodeTestResults detail={row.detail} /> : null}
        {error ? <Alert severity="error">{error}</Alert> : null}
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'flex-start' }}>
          <TextField
            label="Score"
            type="number"
            size="small"
            value={score}
            onChange={(event) => setScore(event.target.value)}
            inputProps={{ min: 0, max: row.points, step: 0.25, 'aria-label': `Score for question ${row.questionId}` }}
            sx={{ width: { xs: '100%', sm: 120 } }}
          />
          <TextField
            label="Feedback for the candidate"
            size="small"
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            fullWidth
          />
          <Button variant="contained" onClick={save} disabled={grade.isPending} sx={{ flexShrink: 0 }}>
            {grade.isPending ? 'Saving…' : 'Save score'}
          </Button>
        </Stack>
      </Stack>
    </Paper>
  );
}

export function GradingTab({ exam, canReview }: GradingTabProps) {
  const { showToast } = useToast();
  const queue = useGradingQueue(exam.id);
  const release = useReleaseGrades(exam.id);
  const judge = useJudgeCode(exam.id);
  const [selected, setSelected] = useState<number | null>(null);

  const hasCode = useMemo(
    () => (queue.data ?? []).some((row) => row.type === 'CODE'),
    [queue.data],
  );

  const groups = useMemo(() => groupRows(queue.data ?? []), [queue.data]);
  const pendingTotal = groups.reduce((sum, group) => sum + group.pending, 0);
  const manualRows = useMemo(
    () => (queue.data ?? []).filter((row) => row.awardedPoints === null),
    [queue.data],
  );
  const active = groups.find((group) => group.attemptId === selected) ?? groups[0];
  const activeIndex = Math.max(
    0,
    groups.findIndex((group) => group.attemptId === active?.attemptId),
  );
  const canMoveBack = activeIndex > 0;
  const canMoveForward = activeIndex < groups.length - 1;
  const goTo = (index: number) => {
    const target = groups[index];
    if (target) {
      setSelected(target.attemptId);
    }
  };

  useEffect(() => {
    if (groups.length < 2) {
      return undefined;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      if (key === 'ArrowUp' || key === 'ArrowLeft' || key === 'j') {
        const previous = groups[activeIndex - 1];
        if (previous) {
          event.preventDefault();
          setSelected(previous.attemptId);
        }
      } else if (key === 'ArrowDown' || key === 'ArrowRight' || key === 'k') {
        const next = groups[activeIndex + 1];
        if (next) {
          event.preventDefault();
          setSelected(next.attemptId);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [groups, activeIndex]);

  if (queue.isLoading) {
    return <LoadingBlock rows={4} />;
  }

  if (groups.length === 0) {
    return <EmptyState title="No answers yet" body="Candidate answers appear here as they are submitted." />;
  }

  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }}>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h6" component="h5">Grading queue</Typography>
          <Typography variant="body2" color="text.secondary">
            {pendingTotal === 0
              ? 'Every answer has a score. You can release results when you are ready.'
              : `${pendingTotal} answer${pendingTotal === 1 ? '' : 's'} still need a score.`}
          </Typography>
        </Box>
        <Chip label={`${manualRows.length} of ${queue.data?.length ?? 0} ungraded`} />
        {canReview && hasCode ? (
          <Button
            variant="outlined"
            startIcon={<ReplayIcon />}
            disabled={judge.isPending}
            title="Re-runs the hidden tests for every coding answer. Hand-marked scores are kept."
            onClick={() =>
              judge.mutate(undefined, {
                onSuccess: (result) =>
                  showToast(
                    `Re-ran code judging: ${result.questionsJudged} answer(s) in ${result.attemptsJudged} attempt(s).`,
                    { severity: 'success' },
                  ),
                onError: (caught) =>
                  showToast(
                    caught instanceof ApiError ? caught.message : 'Code judging could not be re-run.',
                    { severity: 'error' },
                  ),
              })
            }
          >
            {judge.isPending ? 'Judging…' : 'Re-run code judging'}
          </Button>
        ) : null}
        {canReview ? (
          <Button
            variant="contained"
            disabled={release.isPending || pendingTotal > 0}
            onClick={() =>
              release.mutate(undefined, {
                onSuccess: (result) =>
                  showToast(`Released results to ${result.releasedAttempts} attempt(s).`, {
                    severity: 'success',
                  }),
                onError: (caught) =>
                  showToast(caught instanceof ApiError ? caught.message : 'Could not release results.', {
                    severity: 'error',
                  }),
              })
            }
          >
            {release.isPending ? 'Releasing…' : 'Release results'}
          </Button>
        ) : null}
      </Stack>
      {release.isPending ? <LinearProgress /> : null}

      <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
        <Typography variant="body2" color="text.secondary" aria-live="polite">
          Candidate {activeIndex + 1} of {groups.length} · use ↑/↓ or j/k to move
        </Typography>
        <Stack direction="row" spacing={1}>
          <Button
            size="small"
            variant="outlined"
            startIcon={<ArrowBackIcon />}
            disabled={!canMoveBack}
            onClick={() => goTo(activeIndex - 1)}
          >
            Previous candidate
          </Button>
          <Button
            size="small"
            variant="outlined"
            endIcon={<ArrowForwardIcon />}
            disabled={!canMoveForward}
            onClick={() => goTo(activeIndex + 1)}
          >
            Next candidate
          </Button>
        </Stack>
      </Stack>

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="flex-start">
        <Paper variant="outlined" sx={{ width: { xs: '100%', md: 280 }, flexShrink: 0 }}>
          <Typography variant="subtitle2" sx={{ px: 2, pt: 1.5, pb: 0.5 }}>
            Candidates
          </Typography>
          <Divider />
          <List dense sx={{ maxHeight: 520, overflowY: 'auto' }}>
            {groups.map((group) => (
              <ListItem key={group.attemptId} disablePadding>
                <ListItemButton
                  selected={active?.attemptId === group.attemptId}
                  onClick={() => setSelected(group.attemptId)}
                >
                  <ListItemText primary={group.candidateCode} secondary={`${group.pending} pending`} />
                  {group.pending === 0 ? <Chip size="small" color="success" label="Done" /> : null}
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        </Paper>

        <Stack spacing={2} sx={{ flexGrow: 1, minWidth: 0, width: '100%' }}>
          {active ? (
            <>
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                {active.candidateCode} · {active.total - active.pending} of {active.total} marked
              </Typography>
              {active.rows.map((row) => (
                <GradeCard key={`${row.attemptId}-${row.questionId}`} row={row} examId={exam.id} />
              ))}
            </>
          ) : null}
        </Stack>
      </Stack>
    </Stack>
  );
}
