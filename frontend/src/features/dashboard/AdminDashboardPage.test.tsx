import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { writeStaffSession } from '../../auth/storage';
import { renderRoute } from '../../test/render';
import { server } from '../../test/server';
import { AdminDashboardPage } from './AdminDashboardPage';

describe('AdminDashboardPage', () => {
  it('shows counts, AI health and the audit trail', async () => {
    writeStaffSession({
      token: 'admin-token',
      user: { id: 1, email: 'ada@example.edu', displayName: 'Ada Admin', role: 'ADMIN' },
    });
    server.use(
      http.get('/api/findings', () => HttpResponse.json([])),
      http.get('/api/dashboard/admin', () =>
        HttpResponse.json({
          counts: { users: 42, students: 35, lecturers: 6, admins: 1, exams: 4, attempts: 120, findings: 9 },
          aiHealthy: true,
          recentRuns: [
            {
              id: 3,
              examId: 11,
              examTitle: 'Networking Midterm',
              status: 'COMPLETED',
              modelVersion: 'rules-1.4',
              startedAt: '2026-11-06T10:00:00Z',
              finishedAt: '2026-11-06T10:01:00Z',
            },
          ],
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

    renderRoute(<AdminDashboardPage />, { path: '/admin', initialEntry: '/admin' });

    expect(await screen.findByRole('heading', { name: 'Administration' })).toBeInTheDocument();
    expect(await screen.findByText('42')).toBeInTheDocument();
    expect(screen.getByText('Healthy')).toBeInTheDocument();
    expect(screen.getByText('GRADES_RELEASED')).toBeInTheDocument();
    expect(screen.getByText('rules-1.4')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download overview PDF' })).toBeInTheDocument();
    expect(
      await screen.findByRole('heading', { name: 'Review findings across exams' }),
    ).toBeInTheDocument();
  });

  it('lists findings across exams and passes the band filter to the API', async () => {
    writeStaffSession({
      token: 'admin-token',
      user: { id: 1, email: 'ada@example.edu', displayName: 'Ada Admin', role: 'ADMIN' },
    });
    const requested: URL[] = [];
    server.use(
      http.get('/api/dashboard/admin', () =>
        HttpResponse.json({
          counts: { users: 2, students: 1, lecturers: 1, admins: 0, exams: 1, attempts: 1, findings: 1 },
          aiHealthy: true,
          recentRuns: [],
          recentAudit: [],
        }),
      ),
      http.get('/api/findings', ({ request }) => {
        requested.push(new URL(request.url));
        return HttpResponse.json([
          {
            id: 7,
            type: 'CANDIDATE_PAIR',
            priorityScore: 62.4,
            priorityBand: 'HIGH',
            status: 'OPEN',
            candidateA: 'C001',
            candidateB: 'C002',
            summary: 'Strong phrase overlap between two candidates.',
            coverageWarning: false,
            evidenceCount: 4,
            createdAt: '2026-11-06T10:00:00Z',
            exam: { id: 11, code: 'NET-101', title: 'Networking Midterm' },
          },
        ]);
      }),
    );

    renderRoute(<AdminDashboardPage />, { path: '/admin', initialEntry: '/admin' });

    expect(await screen.findByText('Networking Midterm')).toBeInTheDocument();
    expect(screen.getByText('C001 / C002')).toBeInTheDocument();
    expect(screen.getByText('Pair')).toBeInTheDocument();
    expect(screen.getByText('62')).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('combobox', { name: 'Band' }));
    await user.click(await screen.findByRole('option', { name: 'High' }));

    expect(await screen.findByText('C001 / C002')).toBeInTheDocument();
    expect(requested.some((url) => url.searchParams.get('band') === 'HIGH')).toBe(true);
  });
});
