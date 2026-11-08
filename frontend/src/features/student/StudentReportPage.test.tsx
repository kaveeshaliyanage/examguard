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

    expect(screen.getAllByText('Review aid, not proof').length).toBeGreaterThan(0);
    expect(
      screen.getByText(/Moderate phrase overlap with another candidate/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download PDF' })).toBeInTheDocument();
  });
});
