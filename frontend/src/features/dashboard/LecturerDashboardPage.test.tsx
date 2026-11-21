import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { writeStaffSession } from '../../auth/storage';
import { renderRoute } from '../../test/render';
import { server } from '../../test/server';
import { LecturerDashboardPage } from './LecturerDashboardPage';

const dashboard = {
  exams: [
    {
      examId: 11,
      code: 'NET-101',
      title: 'Networking Midterm',
      status: 'OPEN',
      attempts: 12,
      submitted: 9,
      ungraded: 3,
      openFindings: 1,
      flaggedCandidates: 1,
      awaitingRelease: 9,
      lastAnalysisAt: '2026-11-06T10:00:00Z',
    },
  ],
  ungradedQueue: [
    {
      attemptId: 31,
      examId: 11,
      examTitle: 'Networking Midterm',
      candidateCode: 'C-0042',
      status: 'SUBMITTED',
      pendingQuestions: 3,
    },
  ],
  flagged: [
    {
      findingId: 77,
      examId: 11,
      examTitle: 'Networking Midterm',
      candidateCode: 'C-0042',
      priorityScore: 61.4,
      band: 'HIGH',
      type: 'CANDIDATE_PAIR',
    },
  ],
  distribution: [
    { label: '0–19', count: 1 },
    { label: '20–39', count: 2 },
    { label: '40–59', count: 3 },
    { label: '60–79', count: 2 },
    { label: '80–100', count: 1 },
  ],
  integrityTrend: [
    { date: '2026-11-04', focusLossSignals: 2 },
    { date: '2026-11-05', focusLossSignals: 0 },
    { date: '2026-11-06', focusLossSignals: 1 },
  ],
  bandMix: [
    { band: 'LOW', count: 0 },
    { band: 'MEDIUM', count: 0 },
    { band: 'HIGH', count: 1 },
    { band: 'CRITICAL', count: 0 },
  ],
  funnel: [
    { stage: 'Attempts', count: 12 },
    { stage: 'Submitted', count: 9 },
    { stage: 'Graded', count: 6 },
    { stage: 'Released', count: 3 },
  ],
  ungradedTotal: 3,
  flaggedTotal: 1,
  awaitingRelease: 9,
};

describe('LecturerDashboardPage', () => {
  it('shows exam health, the marking queue and integrity signals', async () => {
    writeStaffSession({
      token: 'staff-token',
      user: { id: 2, email: 'lee@example.edu', displayName: 'Lee Lecturer', role: 'LECTURER' },
    });
    server.use(http.get('/api/dashboard/lecturer', () => HttpResponse.json(dashboard)));

    renderRoute(<LecturerDashboardPage />, { path: '/dashboard', initialEntry: '/dashboard' });

    expect(await screen.findByRole('heading', { name: 'Lecturer dashboard' })).toBeInTheDocument();
    expect(await screen.findAllByText('Networking Midterm')).not.toHaveLength(0);
    expect(screen.getAllByText('C-0042').length).toBeGreaterThan(0);
    expect(screen.getByText('Review priority, not proof')).toBeInTheDocument();
    expect(screen.getByText(/Ranked by review priority/)).toBeInTheDocument();
    expect(screen.getAllByLabelText('Review priority band HIGH').length).toBeGreaterThan(0);

    expect(screen.getByRole('heading', { name: 'Integrity trend' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Band mix' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Attempt funnel' })).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: 'Focus-loss signals per day over the last 14 days' }),
    ).toBeInTheDocument();
  });

  it('shows empty states for the charts when there is no activity', async () => {
    writeStaffSession({
      token: 'staff-token',
      user: { id: 2, email: 'lee@example.edu', displayName: 'Lee Lecturer', role: 'LECTURER' },
    });
    server.use(
      http.get('/api/dashboard/lecturer', () =>
        HttpResponse.json({
          ...dashboard,
          distribution: dashboard.distribution.map((bucket) => ({ ...bucket, count: 0 })),
          integrityTrend: [],
          bandMix: [],
          funnel: [],
        }),
      ),
    );

    renderRoute(<LecturerDashboardPage />, { path: '/dashboard', initialEntry: '/dashboard' });

    expect(await screen.findByText('No focus-loss signals in the last 14 days.')).toBeInTheDocument();
    expect(screen.getByText('No open integrity findings to review.')).toBeInTheDocument();
    expect(screen.getByText(/No attempts yet/)).toBeInTheDocument();
  });
});
