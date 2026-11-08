import axe from 'axe-core';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import type { ExamDetail, GradingRow } from '../api/types';
import { writeAttemptSession, writeStaffSession, writeStudentSession } from '../auth/storage';
import { LoginPage } from '../features/auth/LoginPage';
import { AdminDashboardPage } from '../features/dashboard/AdminDashboardPage';
import { LecturerDashboardPage } from '../features/dashboard/LecturerDashboardPage';
import { ExamDetailPage } from '../features/exams/ExamDetailPage';
import { GradingTab } from '../features/exams/GradingTab';
import { SettingsTab } from '../features/exams/SettingsTab';
import { IntegrityWarningDialog } from '../features/student/IntegrityWarningDialog';
import { JoinPage } from '../features/student/JoinPage';
import { StudentDashboardPage } from '../features/student/StudentDashboardPage';
import { StudentReportPage } from '../features/student/StudentReportPage';
import { attemptReportFixture, studentAttemptsFixture } from './fixtures';
import { renderRoute, renderWithProviders } from './render';
import { server } from './server';

async function expectNoViolations(container: HTMLElement) {
  const results = await axe.run(container, {
    rules: {
      // jsdom has no layout engine, so contrast cannot be measured here.
      'color-contrast': { enabled: false },
    },
  });
  expect(results.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
}

function signInStaff(role: 'LECTURER' | 'ADMIN') {
  writeStaffSession({
    token: 'staff-token',
    user: { id: 2, email: 'lee@example.edu', displayName: 'Lee Lecturer', role },
  });
}

const exam: ExamDetail = {
  id: 11,
  code: 'NET-101',
  title: 'Networking Midterm',
  description: 'Midterm covering congestion control.',
  status: 'OPEN',
  durationMinutes: 60,
  allowExtension: true,
  maxStrikes: 3,
  instructions: 'No calculators.',
  opensAt: null,
  closesAt: null,
  createdAt: '2026-11-01T09:00:00Z',
  attemptCount: 2,
  submittedCount: 1,
  findingCount: 1,
  openFindingCount: 1,
  lastAnalysisAt: null,
  enrollmentCount: 1,
  releasedCount: 0,
  awaitingReleaseCount: 1,
  questions: [
    {
      id: 101,
      orderIndex: 0,
      prompt: 'Explain slow start.',
      type: 'ESSAY',
      points: 10,
      maxWords: 120,
      content: {},
      answerKey: { modelAnswer: 'Doubling window.', rubric: 'Mentions doubling.' },
      explanation: null,
    },
  ],
  resourceRules: [],
  permissions: [
    { userId: 2, email: 'lee@example.edu', displayName: 'Lee Lecturer', level: 'OWNER' },
  ],
};

const gradingRows: GradingRow[] = [
  {
    attemptId: 31,
    candidateCode: 'C-0042',
    questionId: 101,
    prompt: 'Explain slow start.',
    type: 'ESSAY',
    points: 10,
    text: 'Slow start doubles the congestion window each round trip.',
    selectedOptions: [],
    revisionNo: 3,
    savedAt: '2026-11-06T09:50:00Z',
    answerKey: { modelAnswer: 'Exponential growth until the threshold.', rubric: 'Mentions doubling' },
    explanation: null,
    awardedPoints: null,
    comment: null,
  },
];

const lecturerDashboard = {
  exams: [
    {
      examId: 11,
      code: 'NET-101',
      title: 'Networking Midterm',
      status: 'OPEN',
      attempts: 2,
      submitted: 1,
      ungraded: 1,
      openFindings: 1,
      flaggedCandidates: 1,
      awaitingRelease: 1,
      lastAnalysisAt: null,
    },
  ],
  ungradedQueue: [],
  flagged: [],
  distribution: [{ label: '0–19', count: 0 }],
  integrityTrend: [{ date: '2026-11-07', focusLossSignals: 0 }],
  bandMix: [
    { band: 'LOW', count: 0 },
    { band: 'MEDIUM', count: 0 },
    { band: 'HIGH', count: 0 },
    { band: 'CRITICAL', count: 0 },
  ],
  funnel: [
    { stage: 'Attempts', count: 2 },
    { stage: 'Submitted', count: 1 },
    { stage: 'Graded', count: 0 },
    { stage: 'Released', count: 0 },
  ],
  ungradedTotal: 1,
  flaggedTotal: 0,
  awaitingRelease: 1,
};

describe('accessibility smoke checks', () => {
  it('renders the staff login page without structural violations', async () => {
    const { container } = renderRoute(<LoginPage />, { path: '/login', initialEntry: '/login' });
    await screen.findByRole('heading');
    await expectNoViolations(container);
  });

  it('renders the student join page without structural violations', async () => {
    const { container } = renderRoute(<JoinPage />, { path: '/join', initialEntry: '/join' });
    await screen.findByRole('heading', { name: 'Join an exam' });
    await expectNoViolations(container);
  });

  it('renders the student dashboard without structural violations', async () => {
    writeStudentSession({
      token: 'student-token',
      user: { id: 5, email: 'sam@example.edu', displayName: 'Sam Student' },
    });
    server.use(
      http.get('/api/dashboard/student', () =>
        HttpResponse.json({
          profile: { id: 5, email: 'sam@example.edu', displayName: 'Sam Student' },
          stats: {
            totalAttempts: 1,
            submitted: 1,
            terminated: 0,
            released: 1,
            averagePercentage: 70,
            strikesThisTerm: 1,
          },
          upcoming: [
            {
              examId: 12,
              code: 'NET-101',
              title: 'Networking Midterm',
              opensAt: '2026-12-01T09:00:00Z',
              closesAt: null,
              openNow: false,
            },
          ],
          attempts: studentAttemptsFixture,
        }),
      ),
    );

    const { container } = renderRoute(<StudentDashboardPage />, {
      path: '/student',
      initialEntry: '/student',
    });
    expect(await screen.findByText('Welcome, Sam Student')).toBeInTheDocument();
    await expectNoViolations(container);
  });

  it('renders the lecturer dashboard without structural violations', async () => {
    signInStaff('LECTURER');
    server.use(http.get('/api/dashboard/lecturer', () => HttpResponse.json(lecturerDashboard)));

    const { container } = renderRoute(<LecturerDashboardPage />, {
      path: '/dashboard',
      initialEntry: '/dashboard',
    });
    expect(await screen.findByRole('heading', { name: 'Lecturer dashboard' })).toBeInTheDocument();
    expect(await screen.findByText('Networking Midterm')).toBeInTheDocument();
    await expectNoViolations(container);
  });

  it('renders the admin dashboard without structural violations', async () => {
    signInStaff('ADMIN');
    server.use(
      http.get('/api/findings', () => HttpResponse.json([])),
      http.get('/api/dashboard/admin', () =>
        HttpResponse.json({
          counts: { users: 42, students: 35, lecturers: 6, admins: 1, exams: 4, attempts: 120, findings: 9 },
          aiHealthy: true,
          recentRuns: [],
          recentAudit: [
            {
              id: 5,
              action: 'GRADES_RELEASED',
              entityType: 'EXAM',
              entityId: 11,
              examId: 11,
              actor: 'Ada Admin',
              createdAt: '2026-11-06T10:05:00Z',
            },
          ],
        }),
      ),
    );

    const { container } = renderRoute(<AdminDashboardPage />, {
      path: '/admin',
      initialEntry: '/admin',
    });
    expect(await screen.findByRole('heading', { name: 'Administration' })).toBeInTheDocument();
    expect(await screen.findByText('GRADES_RELEASED')).toBeInTheDocument();
    await expectNoViolations(container);
  });

  it('renders the exam overview without structural violations', async () => {
    signInStaff('LECTURER');
    server.use(
      http.get('/api/exams/11', () => HttpResponse.json(exam)),
      http.get('/api/exams/11/analysis-runs', () => HttpResponse.json([])),
    );

    const { container } = renderRoute(<ExamDetailPage />, {
      path: '/exams/:examId',
      initialEntry: '/exams/11',
    });
    expect(await screen.findByRole('heading', { name: 'Networking Midterm' })).toBeInTheDocument();
    expect(screen.getByText(/Schedule:/)).toBeInTheDocument();
    await expectNoViolations(container);
  });

  it('renders the grading split view without structural violations', async () => {
    signInStaff('LECTURER');
    server.use(http.get('/api/exams/11/grading', () => HttpResponse.json(gradingRows)));

    const { container } = renderRoute(<GradingTab exam={exam} canReview />, {
      path: '/exams/:examId',
      initialEntry: '/exams/11',
    });
    expect(await screen.findByText(/Candidate 1 of 1/)).toBeInTheDocument();
    await expectNoViolations(container);
  });

  it('renders the student report without structural violations', async () => {
    writeAttemptSession({
      attemptId: 1,
      sessionToken: 'attempt-token',
      collectorToken: 'collector-token',
      candidateCode: 'C001',
      examCode: 'DEMO-101',
    });
    server.use(
      http.get('/api/reports/attempts/1', () => HttpResponse.json(attemptReportFixture)),
    );

    const { container } = renderRoute(<StudentReportPage />, {
      path: '/attempt/:attemptId/report',
      initialEntry: '/attempt/1/report',
    });
    expect(await screen.findByRole('heading', { name: 'Demo Examination' })).toBeInTheDocument();
    await expectNoViolations(container);
  });

  it('traps focus in the integrity warning dialog', async () => {
    renderWithProviders(
      <IntegrityWarningDialog open strikeCount={1} maxStrikes={3} onResume={() => undefined} />,
    );
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    expect(
      screen.getByRole('button', { name: 'Resume exam' }).closest('[role="dialog"]'),
    ).toBe(dialog);
  });

  it('traps focus in the question dialog', async () => {
    const user = userEvent.setup();
    signInStaff('LECTURER');
    server.use(
      http.get('/api/exams/11', () => HttpResponse.json(exam)),
      http.get('/api/exams/11/analysis-runs', () => HttpResponse.json([])),
    );

    renderRoute(<ExamDetailPage />, { path: '/exams/:examId', initialEntry: '/exams/11?tab=questions' });

    await user.click(await screen.findByRole('button', { name: 'Edit question 1' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
  });

  it('confirms unsaved changes with a modal dialog before navigating', async () => {
    const user = userEvent.setup();
    signInStaff('LECTURER');
    server.use(http.get('/api/exams/11/roster', () => HttpResponse.json([])));

    renderRoute(<SettingsTab exam={exam} canManage />, {
      path: '/exams/:examId',
      initialEntry: '/exams/11',
    });

    await user.type(await screen.findByRole('textbox', { name: 'Title' }), ' updated');
    await user.click(screen.getByRole('link', { name: 'Open grading' }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('Leave with unsaved changes?')).toBeInTheDocument();
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
  });
});
