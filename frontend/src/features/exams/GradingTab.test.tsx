import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import type { ExamDetail, GradingRow } from '../../api/types';
import { writeStaffSession } from '../../auth/storage';
import { renderRoute } from '../../test/render';
import { server } from '../../test/server';
import { GradingTab } from './GradingTab';

const exam = {
  id: 11,
  code: 'NET-101',
  title: 'Networking Midterm',
  description: null,
  status: 'OPEN',
  durationMinutes: 60,
  allowExtension: true,
  createdAt: '2026-11-01T09:00:00Z',
  attemptCount: 1,
  submittedCount: 1,
  findingCount: 0,
  openFindingCount: 0,
  lastAnalysisAt: null,
  opensAt: null,
  closesAt: null,
  enrollmentCount: 0,
  releasedCount: 0,
  awaitingReleaseCount: 0,
  questions: [],
  resourceRules: [],
  permissions: [],
} satisfies ExamDetail;

const rows: GradingRow[] = [
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
  {
    attemptId: 31,
    candidateCode: 'C-0042',
    questionId: 102,
    prompt: 'Which protocol is connection oriented?',
    type: 'SINGLE_CHOICE',
    points: 5,
    text: 'TCP',
    selectedOptions: ['A'],
    revisionNo: 1,
    savedAt: '2026-11-06T09:51:00Z',
    answerKey: { selectedKeys: ['A'] },
    explanation: 'TCP performs a handshake.',
    awardedPoints: 5,
    comment: null,
  },
];

describe('GradingTab', () => {
  it('saves a manual score for an essay answer', async () => {
    const user = userEvent.setup();
    const gradeBodies: unknown[] = [];
    writeStaffSession({
      token: 'staff-token',
      user: { id: 2, email: 'lee@example.edu', displayName: 'Lee Lecturer', role: 'LECTURER' },
    });
    server.use(
      http.get('/api/exams/11/grading', () => HttpResponse.json(rows)),
      http.put('/api/attempts/31/answers/101/grade', async ({ request }) => {
        gradeBodies.push(await request.json());
        return HttpResponse.json({
          questionId: 101,
          awardedPoints: 8,
          maxPoints: 10,
          gradedAt: '2026-11-06T10:00:00Z',
        });
      }),
    );

    renderRoute(<GradingTab exam={exam} canReview />, { path: '/exams/:examId', initialEntry: '/exams/11' });

    expect(await screen.findByText(/1 answer still need a score/)).toBeInTheDocument();
    expect(screen.getByText(/Mentions doubling/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Release results' })).toBeDisabled();

    await user.type(screen.getByLabelText('Score for question 101'), '8');
    await user.click(screen.getAllByRole('button', { name: 'Save score' })[0]!);

    await waitFor(() => expect(gradeBodies).toHaveLength(1));
    expect(gradeBodies[0]).toMatchObject({ awardedPoints: 8 });
  });

  it('moves between candidates with the keyboard and the buttons', async () => {
    const user = userEvent.setup();
    const secondCandidate: GradingRow = {
      ...rows[0]!,
      attemptId: 32,
      candidateCode: 'C-0043',
      questionId: 201,
      prompt: 'Describe congestion avoidance.',
    };
    writeStaffSession({
      token: 'staff-token',
      user: { id: 2, email: 'lee@example.edu', displayName: 'Lee Lecturer', role: 'LECTURER' },
    });
    server.use(
      http.get('/api/exams/11/grading', () =>
        HttpResponse.json([{ ...rows[0]!, awardedPoints: null }, secondCandidate]),
      ),
    );

    renderRoute(<GradingTab exam={exam} canReview />, { path: '/exams/:examId', initialEntry: '/exams/11' });

    expect(await screen.findByText(/Candidate 1 of 2/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous candidate' })).toBeDisabled();

    await user.keyboard('{ArrowDown}');
    expect(await screen.findByText(/Candidate 2 of 2/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next candidate' })).toBeDisabled();
    expect(screen.getByLabelText('Score for question 201')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Previous candidate' }));
    expect(await screen.findByText(/Candidate 1 of 2/)).toBeInTheDocument();

    screen.getByLabelText('Score for question 101').focus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByText(/Candidate 1 of 2/)).toBeInTheDocument();
  });

  it('shows coding results and re-runs the hidden tests', async () => {
    const user = userEvent.setup();
    let judgeCalls = 0;
    const codeRow: GradingRow = {
      attemptId: 33,
      candidateCode: 'C-CODE',
      questionId: 301,
      prompt: 'Read two integers and print their sum.',
      type: 'CODE',
      points: 10,
      text: 'a, b = map(int, input().split())\nprint(a + b)',
      selectedOptions: [],
      revisionNo: 1,
      savedAt: '2026-11-06T09:55:00Z',
      answerKey: {
        tests: [
          { name: 'Basic', input: '1 2', expectedOutput: '3', hidden: false },
          { name: 'Big', input: '999 1', expectedOutput: '1000', hidden: true },
        ],
      },
      explanation: null,
      awardedPoints: 5,
      comment: 'Auto-judged: 1 of 2 test cases passed.',
      detail: {
        language: 'PYTHON',
        passed: 1,
        total: 2,
        tests: [
          { name: 'Basic', passed: true, status: 'PASSED', hidden: false, durationMs: 12 },
          { name: 'Big', passed: false, status: 'FAILED', hidden: true, durationMs: 9 },
        ],
      },
    };
    writeStaffSession({
      token: 'staff-token',
      user: { id: 2, email: 'lee@example.edu', displayName: 'Lee Lecturer', role: 'LECTURER' },
    });
    server.use(
      http.get('/api/exams/11/grading', () => HttpResponse.json([codeRow])),
      http.post('/api/exams/11/code-judge', () => {
        judgeCalls += 1;
        return HttpResponse.json({ attemptsJudged: 1, questionsJudged: 1 });
      }),
    );

    renderRoute(<GradingTab exam={exam} canReview />, { path: '/exams/:examId', initialEntry: '/exams/11' });

    expect(await screen.findByText('Submitted code')).toBeInTheDocument();
    expect(screen.getByText(/1 of 2 passed/)).toBeInTheDocument();
    expect(screen.getByText(/Big · hidden/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Re-run code judging' }));

    await waitFor(() => expect(judgeCalls).toBe(1));
    expect(await screen.findByText(/Re-ran code judging: 1 answer/)).toBeInTheDocument();
  });
});
