import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import type { ExamDetail, RosterEntry } from '../../api/types';
import { writeStaffSession } from '../../auth/storage';
import { renderRoute } from '../../test/render';
import { server } from '../../test/server';
import { SettingsTab } from './SettingsTab';

const exam = {
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
  attemptCount: 4,
  submittedCount: 3,
  findingCount: 1,
  openFindingCount: 1,
  lastAnalysisAt: null,
  enrollmentCount: 1,
  releasedCount: 1,
  awaitingReleaseCount: 2,
  requiresPin: false,
  pinConfigured: false,
  pinIssuedAt: null,
  pinSentAt: null,
  requiresPreflight: false,
  questions: [],
  resourceRules: [],
  permissions: [
    { userId: 2, email: 'lee@example.edu', displayName: 'Lee Lecturer', level: 'OWNER' },
  ],
} satisfies ExamDetail;

function signIn() {
  writeStaffSession({
    token: 'staff-token',
    user: { id: 2, email: 'lee@example.edu', displayName: 'Lee Lecturer', role: 'LECTURER' },
  });
}

describe('SettingsTab', () => {
  it('saves editable exam settings and shows the results counts', async () => {
    const user = userEvent.setup();
    const patches: unknown[] = [];
    signIn();
    server.use(
      http.get('/api/exams/11/roster', () => HttpResponse.json<RosterEntry[]>([])),
      http.patch('/api/exams/11', async ({ request }) => {
        patches.push(await request.json());
        return HttpResponse.json({ ...exam, title: 'Networking Midterm (revised)' });
      }),
    );

    renderRoute(<SettingsTab exam={exam} canManage />, {
      path: '/exams/:examId',
      initialEntry: '/exams/11',
    });

    expect(await screen.findByRole('heading', { name: 'Exam settings' })).toBeInTheDocument();
    expect(screen.getByText('Awaiting release')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open grading' })).toHaveAttribute(
      'href',
      '/exams/11?tab=grading',
    );

    const title = screen.getByRole('textbox', { name: 'Title' });
    await user.clear(title);
    await user.type(title, 'Networking Midterm (revised)');
    await user.click(screen.getByRole('button', { name: 'Save settings' }));

    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0]).toMatchObject({
      title: 'Networking Midterm (revised)',
      durationMinutes: 60,
      maxStrikes: 3,
      instructions: 'No calculators.',
    });
  });

  it('surfaces a validation error without sending the update', async () => {
    const user = userEvent.setup();
    let patched = false;
    signIn();
    server.use(
      http.get('/api/exams/11/roster', () => HttpResponse.json<RosterEntry[]>([])),
      http.patch('/api/exams/11', () => {
        patched = true;
        return HttpResponse.json(exam);
      }),
    );

    renderRoute(<SettingsTab exam={exam} canManage />, {
      path: '/exams/:examId',
      initialEntry: '/exams/11',
    });

    const duration = await screen.findByRole('spinbutton', { name: 'Duration (minutes)' });
    await user.clear(duration);
    await user.type(duration, '3');
    await user.click(screen.getByRole('button', { name: 'Save settings' }));

    expect(screen.getByText('Duration must be between 5 and 600 minutes.')).toBeInTheDocument();
    expect(patched).toBe(false);
  });

  it('adds and removes roster entries', async () => {
    const user = userEvent.setup();
    let roster: RosterEntry[] = [
      { id: 1, email: 'sam@example.edu', createdAt: '2026-11-02T09:00:00Z' },
    ];
    const posts: unknown[] = [];
    const deletes: string[] = [];
    signIn();
    server.use(
      http.get('/api/exams/11/roster', () => HttpResponse.json(roster)),
      http.post('/api/exams/11/roster', async ({ request }) => {
        posts.push(await request.json());
        const entry = { id: 2, email: 'ada@example.edu', createdAt: '2026-11-07T09:00:00Z' };
        roster = [...roster, entry];
        return HttpResponse.json(entry, { status: 201 });
      }),
      http.delete('/api/exams/11/roster/:entryId', ({ params }) => {
        deletes.push(String(params.entryId));
        roster = roster.filter((entry) => String(entry.id) !== String(params.entryId));
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderRoute(<SettingsTab exam={exam} canManage />, {
      path: '/exams/:examId',
      initialEntry: '/exams/11',
    });

    expect(await screen.findByText('sam@example.edu')).toBeInTheDocument();
    expect(screen.getByText(/Joins are restricted to these email addresses/)).toBeInTheDocument();

    await user.type(screen.getByRole('textbox', { name: 'Student email' }), 'ada@example.edu');
    await user.click(screen.getByRole('button', { name: 'Add to roster' }));

    expect(await screen.findByText('ada@example.edu')).toBeInTheDocument();
    expect(posts[0]).toEqual({ email: 'ada@example.edu' });

    await user.click(
      screen.getByRole('button', { name: 'Remove ada@example.edu from the roster' }),
    );
    await waitFor(() => expect(deletes).toEqual(['2']));
    await waitFor(() => expect(screen.queryByText('ada@example.edu')).not.toBeInTheDocument());
    expect(screen.getByText('sam@example.edu')).toBeInTheDocument();
  });
});
