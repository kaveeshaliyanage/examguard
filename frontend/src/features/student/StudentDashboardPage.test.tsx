import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { writeStudentSession } from '../../auth/storage';
import { studentAttemptsFixture } from '../../test/fixtures';
import { renderRoute } from '../../test/render';
import { server } from '../../test/server';
import { StudentDashboardPage } from './StudentDashboardPage';

describe('StudentDashboardPage', () => {
  it('shows in-progress exams, released results and the join-by-code card', async () => {
    writeStudentSession({
      token: 'student-token',
      user: { id: 5, email: 'sam@example.edu', displayName: 'Sam Student' },
    });
    server.use(
      http.get('/api/dashboard/student', () =>
        HttpResponse.json({
          profile: { id: 5, email: 'sam@example.edu', displayName: 'Sam Student' },
          stats: {
            totalAttempts: studentAttemptsFixture.length,
            submitted: 1,
            terminated: 0,
            released: 1,
            averagePercentage: 70,
            strikesThisTerm: 1,
          },
          upcoming: [],
          attempts: studentAttemptsFixture,
        }),
      ),
    );

    renderRoute(<StudentDashboardPage />, { path: '/student', initialEntry: '/student' });

    expect(await screen.findByText('Welcome, Sam Student')).toBeInTheDocument();

    // Join by code.
    expect(screen.getByRole('heading', { name: 'Join an exam' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Exam code' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Join' })).toBeInTheDocument();

    // In-progress attempt.
    expect(await screen.findByText('Demo Examination')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resume exam' })).toBeInTheDocument();

    // Results table.
    expect(await screen.findByText('Algorithms Midterm')).toBeInTheDocument();
    expect(screen.getByText('14 / 20')).toBeInTheDocument();
    expect(screen.getAllByText('Submitted').length).toBeGreaterThan(0);
    expect(screen.getByText('70%')).toBeInTheDocument();
    expect(screen.getByText(/1 focus-loss signal/)).toBeInTheDocument();
  });

  it('lists enrolled exams as scheduled or available', async () => {
    const user = userEvent.setup();
    writeStudentSession({
      token: 'student-token',
      user: { id: 5, email: 'sam@example.edu', displayName: 'Sam Student' },
    });
    server.use(
      http.get('/api/dashboard/student', () =>
        HttpResponse.json({
          profile: { id: 5, email: 'sam@example.edu', displayName: 'Sam Student' },
          stats: {
            totalAttempts: 0,
            submitted: 0,
            terminated: 0,
            released: 0,
            averagePercentage: null,
            strikesThisTerm: 0,
          },
          upcoming: [
            {
              examId: 12,
              code: 'NET-101',
              title: 'Networking Midterm',
              opensAt: '2026-12-01T09:00:00Z',
              closesAt: '2026-12-01T11:00:00Z',
              openNow: false,
            },
            {
              examId: 13,
              code: 'DB-201',
              title: 'Databases Final',
              opensAt: null,
              closesAt: null,
              openNow: true,
            },
          ],
          attempts: [],
        }),
      ),
    );

    renderRoute(<StudentDashboardPage />, { path: '/student', initialEntry: '/student' });

    expect(
      screen.getByRole('heading', { name: 'Upcoming and available exams' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('Networking Midterm')).toBeInTheDocument();
    expect(screen.getByText(/^Opens /)).toBeInTheDocument();
    expect(screen.getByText('Open now')).toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: 'Join' })[1]!);
    expect(screen.getByRole('textbox', { name: 'Exam code' })).toHaveValue('DB-201');
  });

  it('asks for a student sign-in when no session is stored', async () => {
    renderRoute(<StudentDashboardPage />, { path: '/student', initialEntry: '/student' });
    expect(await screen.findByRole('heading', { name: 'Student portal' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });
});
