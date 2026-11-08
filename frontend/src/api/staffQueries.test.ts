import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { writeStaffSession } from '../auth/storage';
import { server } from '../test/server';
import { downloadAdminOverviewPdf, downloadExamReport } from './staffQueries';

function signIn() {
  writeStaffSession({
    token: 'staff-token',
    user: { id: 1, email: 'ada@example.edu', displayName: 'Ada Admin', role: 'ADMIN' },
  });
}

describe('report downloads', () => {
  it('downloads an exam CSV with the staff bearer token', async () => {
    signIn();
    let authorization: string | null = null;
    server.use(
      http.get('/api/reports/exams/11/csv', ({ request }) => {
        authorization = request.headers.get('Authorization');
        return new HttpResponse('candidate,score\nC001,14\n', {
          headers: { 'Content-Type': 'text/csv' },
        });
      }),
    );

    const blob = await downloadExamReport(11, 'csv');

    expect(authorization).toBe('Bearer staff-token');
    expect(blob.size).toBeGreaterThan(0);
    expect(blob.type).toContain('text/csv');
  });

  it('downloads the administration overview PDF', async () => {
    signIn();
    server.use(
      http.get('/api/reports/admin/overview/pdf', () =>
        new HttpResponse('%PDF-1.4 overview', {
          headers: { 'Content-Type': 'application/pdf' },
        }),
      ),
    );

    const blob = await downloadAdminOverviewPdf();

    expect(blob.size).toBeGreaterThan(0);
    expect(blob.type).toBe('application/pdf');
  });

  it('reports a friendly error when the server refuses the download', async () => {
    signIn();
    server.use(
      http.get('/api/reports/exams/11/pdf', () =>
        HttpResponse.json({ message: 'Forbidden' }, { status: 403 }),
      ),
    );

    await expect(downloadExamReport(11, 'pdf')).rejects.toThrow(
      'The exam report could not be downloaded.',
    );
  });

  it('asks for a sign-in when no staff session is stored', async () => {
    await expect(downloadAdminOverviewPdf()).rejects.toThrow(
      'Sign in again to download the report.',
    );
  });
});
