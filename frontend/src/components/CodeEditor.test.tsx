import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { CodeBlock, CodeEditor } from './CodeEditor';

function Harness({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  return <CodeEditor value={value} onChange={setValue} label="Solution" language="PYTHON" />;
}

describe('CodeEditor', () => {
  it('inserts two spaces on Tab and keeps the caret after them', async () => {
    const user = userEvent.setup();
    render(<Harness initial="print(1)" />);
    const area = screen.getByLabelText('Solution') as HTMLTextAreaElement;

    await user.click(area);
    area.setSelectionRange(8, 8);
    await user.keyboard('{Tab}x');

    expect(area.value).toBe('print(1)  x');
    expect(area.selectionStart).toBe(11);
  });

  it('removes one indent on Shift+Tab', async () => {
    const user = userEvent.setup();
    render(<Harness initial="    total = 0" />);
    const area = screen.getByLabelText('Solution') as HTMLTextAreaElement;

    await user.click(area);
    area.setSelectionRange(area.value.length, area.value.length);
    await user.keyboard('{Shift>}{Tab}{/Shift}');

    expect(area.value).toBe('  total = 0');
  });

  it('keeps the current indentation when Enter starts a new line', async () => {
    const user = userEvent.setup();
    render(<Harness initial={'def solve():\n    return 1'} />);
    const area = screen.getByLabelText('Solution') as HTMLTextAreaElement;

    await user.click(area);
    area.setSelectionRange(area.value.length, area.value.length);
    await user.keyboard('{Enter}pass');

    expect(area.value).toBe('def solve():\n    return 1\n    pass');
  });

  it('shows the language next to the label', () => {
    render(<Harness initial="print(1)" />);

    expect(screen.getByText(/Python/)).toBeInTheDocument();
    expect(screen.getByLabelText('Solution')).toHaveAttribute('spellcheck', 'false');
  });
});

describe('CodeBlock', () => {
  it('renders the code verbatim', () => {
    render(<CodeBlock code={'a = 1\nprint(a)'} language="PYTHON" label="Your solution" />);

    expect(screen.getByText(/a = 1/)).toHaveTextContent('a = 1 print(a)');
    expect(screen.getByText(/Python/)).toBeInTheDocument();
  });
});
