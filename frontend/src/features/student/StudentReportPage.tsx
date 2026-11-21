import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link as RouterLink, Navigate, useParams } from 'react-router-dom';
import { downloadAttemptReportPdf, fetchAttemptReport } from '../../api/studentApi';
import { ApiError } from '../../api/client';
import type { AttemptReport, ReportQuestion } from '../../api/types';
import { readAttemptSession, readStudentSession } from '../../auth/storage';
import { CodeBlock } from '../../components/CodeEditor';
import { CodeTestResults } from '../../components/CodeTestResults';
import { LoadingBlock } from '../../components/LoadingBlock';
import { useToast } from '../../components/ToastProvider';
import { integrityTones } from '../../design/tokens';
import { saveBlob } from '../../lib/download';
import { formatDateTime, humanize } from '../../lib/format';
import { StudentShell } from './StudentShell';

function ScoreRing({ report }: { report: AttemptReport }) {
  const possible = report.maxPoints;
  const percent = possible > 0 ? Math.max(0, Math.min(100, (report.scorePoints / possible) * 100)) : 0;
  const color = percent >= 50 ? integrityTones.safe.main : integrityTones.warning.main;
  return (
    <Box
      role="img"
      aria-label={`Score ${Math.round(percent)} percent, ${report.scorePoints} of ${possible} points`}
      sx={{ position: 'relative', width: 180, height: 180 }}
    >
      <Box
        aria-hidden
        sx={{
          width: '100%',
          height: '100%',
          borderRadius: '50%',
          background: `conic-gradient(${color} ${percent}%, #eef2f7 0)`,
        }}
      />
      <Box
        sx={{
          position: 'absolute',
          inset: '12%',
          borderRadius: '50%',
          bgcolor: 'background.paper',
          display: 'grid',
          placeItems: 'center',
        }}
      >
        <Stack alignItems="center">
          <Typography variant="h4" sx={{ fontWeight: 700, lineHeight: 1 }}>
            {Math.round(percent)}%
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {report.scorePoints} / {possible} pts
          </Typography>
        </Stack>
      </Box>
    </Box>
  );
}

function QuestionResult({ question, index }: { question: ReportQuestion; index: number }) {
  const correct = (question.correctKeys ?? []).join('; ');
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={1.25}>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <Typography variant="subtitle2">Question {index + 1}</Typography>
          <Chip size="small" variant="outlined" label={humanize(question.type)} />
          <Box sx={{ flexGrow: 1 }} />
          <Chip
            size="small"
            label={`${question.awardedPoints ?? 0} / ${question.points} pts`}
            color={question.awardedPoints === question.points ? 'success' : 'default'}
            variant="outlined"
          />
        </Stack>
        <Typography variant="body1" sx={{ fontWeight: 600 }}>
          {question.prompt}
        </Typography>
        {question.type === 'CODE' ? (
          question.answerText.trim() ? (
            <CodeBlock code={question.answerText} language={question.codeLanguage} label="Your solution" />
          ) : (
            <Typography variant="body2" color="text.secondary">
              No answer submitted
            </Typography>
          )
        ) : (
          <Box>
            <Typography variant="caption" color="text.secondary">
              Your answer
            </Typography>
            <Typography
              variant="body2"
              sx={{ whiteSpace: 'pre-wrap', color: question.answerText ? 'text.primary' : 'text.secondary' }}
            >
              {question.answerText || 'No answer submitted'}
            </Typography>
          </Box>
        )}
        {question.codeDetail ? (
          <CodeTestResults detail={question.codeDetail} title="Test results" />
        ) : null}
        {correct ? (
          <Box>
            <Typography variant="caption" color="text.secondary">
              Correct key
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {correct}
            </Typography>
          </Box>
        ) : null}
        {question.explanation ? (
          <Alert severity="info" variant="outlined" sx={{ py: 0.5 }}>
            <Typography variant="body2">{question.explanation}</Typography>
          </Alert>
        ) : null}
      </Stack>
    </Paper>
  );
}

function IntegrityTimeline({ report }: { report: AttemptReport }) {
  const { integrity } = report;
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={1.5}>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <Typography variant="subtitle1" component="h5">Integrity timeline</Typography>
          <Chip
            size="small"
            label={`${integrity.strikes} / ${integrity.maxStrikes} strikes`}
            sx={{
              bgcolor: integrityTones.warning.soft,
              color: integrityTones.warning.text,
              border: `1px solid ${integrityTones.warning.border}`,
            }}
          />
          {integrity.terminatedAt ? (
            <Chip
              size="small"
              label={`Terminated ${formatDateTime(integrity.terminatedAt)}`}
              sx={{
                bgcolor: integrityTones.terminated.soft,
                color: integrityTones.terminated.text,
                border: `1px solid ${integrityTones.terminated.border}`,
              }}
            />
          ) : null}
        </Stack>
        {integrity.events.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No focus changes were recorded during this attempt.
          </Typography>
        ) : (
          <Stack spacing={1}>
            {integrity.events.map((event, index) => {
              const left = event.signal === 'FOCUS_LOSS';
              return (
                <Stack key={`${event.occurredAt}-${index}`} direction="row" spacing={1.5} alignItems="flex-start">
                  <Box
                    sx={{
                      width: 10,
                      height: 10,
                      mt: 0.7,
                      borderRadius: '50%',
                      flexShrink: 0,
                      bgcolor: left ? integrityTones.warning.main : integrityTones.safe.main,
                    }}
                  />
                  <Box>
                    <Typography variant="body2">
                      {left ? 'Left the exam window (focus loss recorded)' : 'Returned to the exam window'}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {formatDateTime(event.occurredAt)}
                    </Typography>
                  </Box>
                </Stack>
              );
            })}
          </Stack>
        )}
        <Typography variant="caption" color="text.secondary">
          Focus changes are recorded automatically. An empty timeline is not proof that the candidate
          never left; it only means no signal reached the server.
        </Typography>
      </Stack>
    </Paper>
  );
}

export function StudentReportPage() {
  const { attemptId } = useParams();
  const id = Number(attemptId);
  const valid = Number.isFinite(id);
  const attemptSession = valid ? readAttemptSession(id) : null;
  const studentSession = readStudentSession();
  const token = attemptSession?.sessionToken ?? studentSession?.token ?? null;
  const { showToast } = useToast();
  const [downloading, setDownloading] = useState(false);

  const reportQuery = useQuery({
    queryKey: ['report', id],
    enabled: valid && Boolean(token),
    retry: false,
    queryFn: () => fetchAttemptReport(id, token!),
  });

  if (!valid || !token) {
    return <Navigate to="/join" replace />;
  }

  const download = async () => {
    setDownloading(true);
    try {
      const blob = await downloadAttemptReportPdf(id, token);
      saveBlob(blob, `examguard-report-${id}.pdf`);
      showToast('PDF report downloaded.', { severity: 'success' });
    } catch (caught) {
      showToast(
        caught instanceof ApiError ? caught.message : 'The PDF report could not be downloaded.',
        { severity: 'error' },
      );
    } finally {
      setDownloading(false);
    }
  };

  if (reportQuery.isLoading) {
    return (
      <StudentShell title="Attempt report" maxWidth="lg">
        <LoadingBlock rows={6} />
      </StudentShell>
    );
  }

  if (reportQuery.isError) {
    return (
      <StudentShell title="Attempt report" maxWidth="lg">
        <Alert severity="error">{reportQuery.error.message}</Alert>
      </StudentShell>
    );
  }

  const report = reportQuery.data;
  if (!report) {
    return (
      <StudentShell title="Attempt report" maxWidth="lg">
        <LoadingBlock rows={4} />
      </StudentShell>
    );
  }

  const released = report.released;
  const homePath = studentSession ? '/student' : `/attempt/${id}/submitted`;

  return (
    <StudentShell title={report.examTitle} maxWidth="lg">
      <Stack spacing={3}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="flex-start" justifyContent="space-between">
          <Box>
            <Typography variant="overline" color="text.secondary">
              Post-exam report
            </Typography>
            <Typography variant="h4" gutterBottom>
              {report.examTitle}
            </Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Chip size="small" variant="outlined" label={`Candidate ${report.candidateCode}`} />
              <Chip size="small" variant="outlined" label={humanize(report.status)} />
              {released ? (
                <Chip size="small" color="success" variant="outlined" label="Results released" />
              ) : (
                <Chip size="small" icon={<LockOutlinedIcon />} variant="outlined" label="Results not released" />
              )}
            </Stack>
          </Box>
          <Stack direction="row" spacing={1}>
            <Button
              variant="outlined"
              startIcon={<DownloadOutlinedIcon />}
              onClick={() => void download()}
              disabled={downloading}
            >
              {downloading ? 'Preparing…' : 'Download PDF'}
            </Button>
            <Button variant="text" onClick={() => window.print()}>
              Print
            </Button>
            <Button component={RouterLink} to={homePath} variant="text">
              Back
            </Button>
          </Stack>
        </Stack>

        {!released ? (
          <Alert severity="info" variant="outlined">
            Your lecturer has not released the marks yet. The report below shows your submitted answers
            and integrity timeline only; scores and correct keys appear after release.
          </Alert>
        ) : null}

        <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={3} alignItems="center">
            {released ? (
              <ScoreRing report={report} />
            ) : (
              <Box
                sx={{
                  width: 180,
                  height: 180,
                  borderRadius: '50%',
                  border: 3,
                  borderColor: 'divider',
                  display: 'grid',
                  placeItems: 'center',
                  color: 'text.secondary',
                }}
              >
                <Stack alignItems="center" spacing={0.5}>
                  <LockOutlinedIcon />
                  <Typography variant="caption">Not released</Typography>
                </Stack>
              </Box>
            )}
            <Box sx={{ flex: 1 }}>
              <Typography variant="subtitle1" component="h5" gutterBottom>
                Summary
              </Typography>
              <Stack spacing={0.5}>
                <Typography variant="body2" color="text.secondary">
                  {released
                    ? `${report.scorePoints} of ${report.maxPoints} possible points awarded.`
                    : `Maximum possible: ${report.maxPoints} points.`}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {report.questions.length} question(s) · {report.integrity.strikes} focus loss
                  {report.integrity.strikes === 1 ? '' : 'es'} recorded
                </Typography>
              </Stack>
            </Box>
          </Stack>
        </Paper>

        <Box>
          <Typography variant="h6" component="h5" gutterBottom>
            Answers and marks
          </Typography>
          <Stack spacing={1.5}>
            {report.questions.map((question, index) => (
              <QuestionResult key={`${index}-${question.prompt}`} question={question} index={index} />
            ))}
          </Stack>
        </Box>

        <IntegrityTimeline report={report} />
      </Stack>
    </StudentShell>
  );
}
