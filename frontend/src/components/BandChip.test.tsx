import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { PriorityBand } from '../api/types';
import { BandChip } from '../components/BandChip';
import { renderWithProviders } from '../test/render';

const bands: PriorityBand[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

describe('BandChip', () => {
  it.each(bands)('renders the %s band with an accessible label and no percentage', (band) => {
    const { container } = renderWithProviders(<BandChip band={band} />);
    expect(screen.getByText(band)).toBeInTheDocument();
    expect(screen.getByLabelText(`Review priority band ${band}`)).toBeInTheDocument();
    expect(container.textContent ?? '').not.toMatch(/%/);
  });
});
