import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { writeAttemptSession } from '../../auth/storage';
import { attemptReportFixture } from '../../test/fixtures';
import { renderRoute } from '../../test/render';
import { server } from '../../test/server';
import { StudentReportPage } from './StudentReportPage';

describe('StudentReportPage', () => {
  it('renders the score ring, per-question marks, integrity timeline and review-aid labels', async () => {
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

    renderRoute(<StudentReportPage />, {
      path: '/attempt/:attemptId/report',
      initialEntry: '/attempt/1/report',
    });

    expect(await screen.findByRole('heading', { name: 'Demo Examination' })).toBeInTheDocument();
    expect(screen.getAllByText('7 / 10 pts').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('7 of 10 possible points awarded.')).toBeInTheDocument();
    expect(screen.getByText('Explain the concept.')).toBeInTheDocument();
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText(/Clear structure/)).toBeInTheDocument();

    expect(screen.getByText(/Left the exam window/)).toBeInTheDocument();
    expect(screen.getByText(/Returned to the exam window/)).toBeInTheDocument();
    expect(screen.getByText('1 / 3 strikes')).toBeInTheDocument();

    // Overlap and authorship signals are staff review aids; students never see them.
    expect(screen.queryByText('Review signals')).not.toBeInTheDocument();
    expect(screen.queryByText('Review aid, not proof')).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Moderate phrase overlap with another candidate/),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download PDF' })).toBeInTheDocument();
  });

  it('renders a coding answer with its test results', async () => {
    writeAttemptSession({
      attemptId: 1,
      sessionToken: 'attempt-token',
      collectorToken: 'collector-token',
      candidateCode: 'C001',
      examCode: 'DEMO-101',
    });
    server.use(
      http.get('/api/reports/attempts/1', () =>
        HttpResponse.json({
          ...attemptReportFixture,
          questions: [
            {
              prompt: 'Read two integers and print their sum.',
              type: 'CODE',
              points: 10,
              awardedPoints: 7.5,
              answerText: 'a, b = map(int, input().split())\nprint(a + b)',
              selectedOptions: [],
              correctKeys: null,
              explanation: null,
              codeLanguage: 'PYTHON',
              codeDetail: {
                language: 'PYTHON',
                passed: 3,
                total: 4,
                tests: [
                  { name: 'Case 1', passed: true, status: 'PASSED', hidden: false, durationMs: 14 },
                  { name: 'Case 2', passed: true, status: 'PASSED', hidden: false, durationMs: 11 },
                  { name: 'Case 3', passed: true, status: 'PASSED', hidden: false, durationMs: 12 },
                  { name: 'Hidden edge case', passed: false, status: 'FAILED', hidden: true, durationMs: 10 },
                ],
              },
            },
          ],
        }),
      ),
    );

    renderRoute(<StudentReportPage />, {
      path: '/attempt/:attemptId/report',
      initialEntry: '/attempt/1/report',
    });

    expect(await screen.findByText(/Your solution · Python/)).toBeInTheDocument();
    expect(screen.getByText('Test results')).toBeInTheDocument();
    expect(screen.getByText('3 of 4 passed')).toBeInTheDocument();
    expect(screen.getByText('Hidden edge case')).toBeInTheDocument();
    expect(screen.getByText('Wrong output')).toBeInTheDocument();
  });
});
