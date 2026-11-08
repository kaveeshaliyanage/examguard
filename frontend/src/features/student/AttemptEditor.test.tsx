import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';
import { server } from '../../test/server';
import { renderRoute } from '../../test/render';
import { attemptStateFixture } from '../../test/fixtures';
import { writeAttemptSession, type AttemptSession } from '../../auth/storage';
import { AttemptEditor } from './AttemptEditor';

const session: AttemptSession = {
  attemptId: 1,
  sessionToken: 'attempt-token',
  collectorToken: 'collector-token',
  candidateCode: 'C001',
  examCode: 'DEMO-101',
};

const originalVisibility = Object.getOwnPropertyDescriptor(Document.prototype, 'visibilityState');

function setVisibility(state: 'hidden' | 'visible') {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state,
  });
  document.dispatchEvent(new Event('visibilitychange'));
}

afterEach(() => {
  if (originalVisibility) {
    Object.defineProperty(Document.prototype, 'visibilityState', originalVisibility);
  }
});

describe('AttemptEditor integrity monitoring', () => {
  it('opens the blocking warning after a focus loss and terminates on the third strike', async () => {
    const user = userEvent.setup();
    let strikes = 0;
    let posts = 0;

    server.use(
      http.post('/api/attempts/1/integrity/signals', async ({ request }) => {
        posts += 1;
        const body = (await request.json()) as { signal?: string };
        if (body.signal === 'FOCUS_LOSS') {
          strikes += 1;
        }
        return HttpResponse.json({
          strikeCount: strikes,
          maxStrikes: 3,
          terminated: strikes >= 3,
          status: strikes >= 3 ? 'TERMINATED' : 'IN_PROGRESS',
        });
      }),
    );

    writeAttemptSession(session);

    renderRoute(<AttemptEditor state={attemptStateFixture} session={session} />, {
      path: '/attempt/:attemptId',
      initialEntry: '/attempt/1',
    });

    expect(await screen.findByText('Explain the concept.')).toBeInTheDocument();
    // Merely mounting must not record a signal.
    expect(posts).toBe(0);
    expect(screen.queryByText(/You left the exam window/)).not.toBeInTheDocument();

    // Strike 1.
    await act(async () => {
      setVisibility('hidden');
      setVisibility('visible');
    });
    expect(await screen.findByText(/Strike 1 of 3/)).toBeInTheDocument();
    expect(screen.getByText(/This was recorded/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Resume exam' }));
    await waitFor(() => expect(screen.queryByText(/Strike 1 of 3/)).not.toBeInTheDocument());

    // Strike 2.
    await act(async () => {
      setVisibility('hidden');
      setVisibility('visible');
    });
    expect(await screen.findByText(/Strike 2 of 3/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Resume exam' }));
    await waitFor(() => expect(screen.queryByText(/Strike 2 of 3/)).not.toBeInTheDocument());

    // Strike 3 terminates the attempt.
    await act(async () => {
      setVisibility('hidden');
      setVisibility('visible');
    });
    expect(await screen.findByText('Attempt terminated')).toBeInTheDocument();
    expect(screen.getByText('Three focus losses were recorded')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Submit exam/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Resume exam' })).not.toBeInTheDocument();
    expect(strikes).toBe(3);
  }, 30000);
});
