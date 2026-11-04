import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { server } from '../../test/server';
import { pairFinding } from '../../test/fixtures';
import { renderRoute } from '../../test/render';
import { FindingDetailPage } from './FindingDetailPage';

function renderFinding(id: number) {
  return renderRoute(<FindingDetailPage />, {
    path: '/findings/:findingId',
    initialEntry: `/findings/${id}`,
  });
}

describe('FindingDetailPage', () => {
  it('shows the coverage warning when coverage is incomplete', async () => {
    renderFinding(1);
    expect(await screen.findByText('Monitoring data is incomplete')).toBeInTheDocument();
    expect(screen.getByText(/Missing observations are unknown, not clean/i)).toBeInTheDocument();
  });

  it('hides the coverage warning when coverage is complete', async () => {
    server.use(
      http.get('/api/findings/1', () =>
        HttpResponse.json({ ...pairFinding, coverageWarning: false }),
      ),
    );
    renderFinding(1);
    await screen.findByText(/Strong lexical and rare-phrase overlap/i);
    expect(screen.queryByText('Monitoring data is incomplete')).not.toBeInTheDocument();
  });

  it('never renders activity evidence or activity data in a pair finding', async () => {
    renderFinding(1);
    await screen.findByText(/Strong lexical and rare-phrase overlap/i);
    expect(
      screen.getByText(/No activity data is used in pair findings/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/PROHIBITED-ACTIVITY-SENTINEL/)).not.toBeInTheDocument();
    expect(screen.queryByText('chegg.com')).not.toBeInTheDocument();
  });

  it('renders an incident with one candidate and collapses heartbeats', async () => {
    renderFinding(2);
    await screen.findByText(/Two visits to a prohibited domain/i);
    expect(screen.queryByText('C002')).not.toBeInTheDocument();
    expect(screen.queryByText(/No activity data is used in pair findings/i)).not.toBeInTheDocument();
    expect(screen.getAllByText('chegg.com').length).toBeGreaterThan(0);
    expect(screen.getByText(/1 heartbeat collapsed/i)).toBeInTheDocument();
    expect(screen.getAllByText('C004').length).toBeGreaterThan(0);
  });
});
