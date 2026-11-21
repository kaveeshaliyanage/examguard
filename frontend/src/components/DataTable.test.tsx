import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DataTable } from './DataTable';
import type { DataTableColumn } from './DataTable';

interface Row {
  id: number;
  name: string;
}

const columns: DataTableColumn<Row>[] = [
  { id: 'name', header: 'Name', accessorFn: (row) => row.name },
];

const rows: Row[] = [
  { id: 1, name: 'First row' },
  { id: 2, name: 'Second row' },
];

describe('DataTable rows', () => {
  it('opens a clickable row with the keyboard', async () => {
    const user = userEvent.setup();
    const onRowClick = vi.fn();
    render(
      <DataTable
        data={rows}
        columns={columns}
        ariaLabel="Rows"
        getRowId={(row) => String(row.id)}
        onRowClick={onRowClick}
      />,
    );

    const row = screen.getByRole('row', { name: /First row/ });
    expect(row).toHaveAttribute('tabindex', '0');
    row.focus();
    expect(row).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onRowClick).toHaveBeenCalledWith(rows[0]);

    await user.keyboard(' ');
    expect(onRowClick).toHaveBeenCalledTimes(2);
  });

  it('leaves non-clickable rows out of the tab order', () => {
    render(
      <DataTable
        data={rows}
        columns={columns}
        ariaLabel="Rows"
        getRowId={(row) => String(row.id)}
      />,
    );

    expect(screen.getByRole('row', { name: /First row/ })).not.toHaveAttribute('tabindex');
  });
});
