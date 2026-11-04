import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { server } from '../../test/server';
import { renderRoute } from '../../test/render';
import { JoinPage } from './JoinPage';

async function attemptJoin() {
  const user = userEvent.setup();
  renderRoute(<JoinPage />, { path: '/join', initialEntry: '/join' });
  await user.clear(screen.getByRole('textbox', { name: /Exam code/ }));
  await user.type(screen.getByRole('textbox', { name: /Exam code/ }), 'DEMO-101');
  await user.type(screen.getByRole('textbox', { name: /Candidate code/ }), 'C001');
  await user.click(screen.getByRole('button', { name: 'Join exam' }));
}

describe('JoinPage', () => {
  it('shows the already-submitted screen on 409', async () => {
    server.use(
      http.post('/api/public/join', () =>
        HttpResponse.json({ message: 'This attempt has already been submitted' }, { status: 409 }),
      ),
    );

    await attemptJoin();
    expect(await screen.findByText('Already submitted')).toBeInTheDocument();
    expect(screen.getByText(/already been submitted/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back to join' })).toBeInTheDocument();
  });

  it('shows the codes-not-accepted screen on 401', async () => {
    server.use(
      http.post('/api/public/join', () =>
        HttpResponse.json({ message: 'Candidate credentials were not accepted' }, { status: 401 }),
      ),
    );

    await attemptJoin();
    expect(await screen.findByText('Codes not accepted')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try different codes' })).toBeInTheDocument();
  });
});
