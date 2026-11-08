import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { writeStaffSession } from '../../auth/storage';
import type { ExamDetail } from '../../api/types';
import { renderRoute } from '../../test/render';
import { server } from '../../test/server';
import { ExamDetailPage } from './ExamDetailPage';

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
  questions: [],
  resourceRules: [],
  permissions: [
    { userId: 2, email: 'lee@example.edu', displayName: 'Lee Lecturer', level: 'OWNER' },
  ],
};

describe('ExamDetailPage exports', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('downloads the exam CSV with its code in the filename', async () => {
    writeStaffSession({
      token: 'staff-token',
      user: { id: 2, email: 'lee@example.edu', displayName: 'Lee Lecturer', role: 'LECTURER' },
    });
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: vi.fn(() => 'blob:report'),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      writable: true,
      value: vi.fn(),
    });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    let authorization: string | null = null;
    server.use(
      http.get('/api/exams/11', () => HttpResponse.json(exam)),
      http.get('/api/exams/11/analysis-runs', () => HttpResponse.json([])),
      http.get('/api/reports/exams/11/csv', ({ request }) => {
        authorization = request.headers.get('Authorization');
        return new HttpResponse('candidate,score\nC001,14\n', {
          headers: { 'Content-Type': 'text/csv' },
        });
      }),
    );

    const user = userEvent.setup();
    renderRoute(<ExamDetailPage />, { path: '/exams/:examId', initialEntry: '/exams/11' });

    expect(await screen.findByRole('heading', { name: 'Networking Midterm' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Export' }));
    await user.click(await screen.findByRole('menuitem', { name: 'CSV spreadsheet' }));

    expect(await screen.findByText('CSV report downloaded.')).toBeInTheDocument();
    expect(authorization).toBe('Bearer staff-token');
    const anchor = click.mock.instances[0] as unknown as HTMLAnchorElement;
    expect(anchor.download).toBe('NET-101-report.csv');
  });
});
