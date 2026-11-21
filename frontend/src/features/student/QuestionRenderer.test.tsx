import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import type { ExamQuestion } from '../../api/types';
import { QuestionRenderer, type QuestionAnswerValue } from './QuestionRenderer';

function question(overrides: Partial<ExamQuestion> & Pick<ExamQuestion, 'type'>): ExamQuestion {
  return {
    id: 1,
    orderIndex: 1,
    prompt: 'Sample prompt',
    points: 5,
    maxWords: 20,
    content: {},
    ...overrides,
  };
}

function Harness({ item }: { item: ExamQuestion }) {
  const [value, setValue] = useStateValue();
  return (
    <div>
      <QuestionRenderer question={item} value={value} onChange={setValue} />
      <output data-testid="value">{JSON.stringify(value)}</output>
    </div>
  );
}

// A tiny controlled value so change events round-trip like they do in AttemptEditor.
function useStateValue(): [QuestionAnswerValue, (next: QuestionAnswerValue) => void] {
  const [value, setValue] = useState<QuestionAnswerValue>({ text: '', selectedOptions: [] });
  return [value, setValue];
}


describe('QuestionRenderer', () => {
  it('renders single choice as radios and reports the selected key', async () => {
    const user = userEvent.setup();
    render(
      <Harness
        item={question({
          type: 'SINGLE_CHOICE',
          content: {
            options: [
              { key: 'A', text: 'Alpha' },
              { key: 'B', text: 'Beta' },
            ],
          },
        })}
      />,
    );

    expect(screen.getAllByRole('radio')).toHaveLength(2);
    await user.click(screen.getByRole('radio', { name: /Beta/ }));
    expect(screen.getByTestId('value')).toHaveTextContent('"selectedOptions":["B"]');
    expect(screen.getByTestId('value')).toHaveTextContent('"text":"Beta"');
  });

  it('renders multi choice as checkboxes and accumulates selections', async () => {
    const user = userEvent.setup();
    render(
      <Harness
        item={question({
          type: 'MULTI_CHOICE',
          content: {
            options: [
              { key: 'A', text: 'Alpha' },
              { key: 'B', text: 'Beta' },
              { key: 'C', text: 'Gamma' },
            ],
          },
        })}
      />,
    );

    await user.click(screen.getByRole('checkbox', { name: /A\. Alpha/ }));
    await user.click(screen.getByRole('checkbox', { name: /C\. Gamma/ }));
    expect(screen.getByRole('checkbox', { name: /A\. Alpha/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /C\. Gamma/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /B\. Beta/ })).not.toBeChecked();
    expect(screen.getByTestId('value')).toHaveTextContent('"selectedOptions":["A","C"]');
  });

  it('renders true/false as two radios', async () => {
    const user = userEvent.setup();
    render(<Harness item={question({ type: 'TRUE_FALSE' })} />);

    expect(screen.getAllByRole('radio')).toHaveLength(2);
    await user.click(screen.getByRole('radio', { name: /False/ }));
    expect(screen.getByTestId('value')).toHaveTextContent('"selectedOptions":["FALSE"]');
    expect(screen.getByTestId('value')).toHaveTextContent('"text":"False"');
  });

  it('renders short answer as a textbox and emits text changes', async () => {
    const user = userEvent.setup();
    render(<Harness item={question({ type: 'SHORT_ANSWER' })} />);

    const input = screen.getByRole('textbox', { name: 'Answer for question 1' });
    await user.type(input, 'Brief note');
    expect(input).toHaveValue('Brief note');
    expect(screen.getByTestId('value')).toHaveTextContent('"text":"Brief note"');
  });

  it('renders an essay with a live word count against the limit', async () => {
    const user = userEvent.setup();
    render(<Harness item={question({ type: 'ESSAY', maxWords: 5 })} />);

    const input = screen.getByRole('textbox', { name: 'Answer for question 1' });
    await user.type(input, 'one two three four five six');
    expect(screen.getByText('6 / 5 words — over the limit')).toBeInTheDocument();
    expect(screen.getByTestId('value')).toHaveTextContent('"text":"one two three four five six"');
  });
});
