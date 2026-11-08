import { screen } from '@testing-library/react';
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
  });
});
