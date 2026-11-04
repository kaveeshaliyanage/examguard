import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../test/render';
import { DecisionPanel } from './DecisionPanel';

describe('DecisionPanel', () => {
  it('requires an outcome and a rationale of at least ten characters before submitting', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DecisionPanel findingId={1} decisions={[]} />);

    const submit = screen.getByRole('button', { name: 'Submit decision' });
    expect(submit).toBeDisabled();

    const rationale = screen.getByRole('textbox', { name: /Rationale/ });
    await user.type(rationale, 'Too short');
    expect(submit).toBeDisabled();

    fireEvent.mouseDown(screen.getByRole('combobox', { name: /Outcome/i }));
    await user.click(await screen.findByRole('option', { name: 'Confirmed' }));
    expect(submit).toBeDisabled();

    await user.type(rationale, ' and now long enough');
    expect(submit).toBeEnabled();
  });

  it('states that a human decision is required', () => {
    renderWithProviders(<DecisionPanel findingId={1} decisions={[]} />);
    expect(screen.getByText(/A human decision is required/i)).toBeInTheDocument();
  });
});
