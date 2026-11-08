import { describe, expect, it } from 'vitest';
import type { DataTableState } from '../components/DataTable';
import { readTableState, writeTableState } from './tableState';

const empty: DataTableState = {
  sorting: [],
  globalFilter: '',
  columnVisibility: {},
  pageIndex: 0,
  pageSize: 10,
};

describe('table state URL helpers', () => {
  it('reads defaults from an empty query string', () => {
    expect(readTableState(new URLSearchParams())).toEqual(empty);
  });

  it('round-trips sorting, query, page and size', () => {
    const state: DataTableState = {
      ...empty,
      sorting: [{ id: 'submitted', desc: true }],
      globalFilter: 'midterm',
      pageIndex: 2,
      pageSize: 25,
    };
    const params = writeTableState(new URLSearchParams('tab=attempts'), state);
    expect(params.get('sort')).toBe('submitted');
    expect(params.get('dir')).toBe('desc');
    expect(params.get('q')).toBe('midterm');
    expect(params.get('page')).toBe('2');
    expect(params.get('size')).toBe('25');
    expect(params.get('tab')).toBe('attempts');
    expect(readTableState(params)).toEqual(state);
  });

  it('uses custom keys and ignores columns outside the allowlist', () => {
    const options = {
      keys: { sort: 'fsort', dir: 'fdir', query: 'fq', page: 'fpage', size: 'fsize' },
      sortable: ['band', 'priority'],
    } as const;
    const state: DataTableState = {
      ...empty,
      sorting: [{ id: 'created', desc: false }],
      globalFilter: 'pair',
      pageIndex: 1,
    };
    const params = writeTableState(new URLSearchParams('status=OPEN'), state, options);

    expect(params.get('fsort')).toBeNull();
    expect(params.get('fq')).toBe('pair');
    expect(params.get('fpage')).toBe('1');
    expect(params.get('status')).toBe('OPEN');
    expect(readTableState(params, options).sorting).toEqual([]);

    const allowed = writeTableState(
      new URLSearchParams(),
      { ...state, sorting: [{ id: 'band', desc: true }] },
      options,
    );
    expect(readTableState(allowed, options).sorting).toEqual([{ id: 'band', desc: true }]);
  });

  it('clears params that return to their defaults and rejects bad page sizes', () => {
    const params = new URLSearchParams('sort=code&dir=asc&q=x&page=4&size=99');
    const cleared = writeTableState(params, empty);
    expect([...cleared.keys()]).toEqual([]);

    expect(readTableState(new URLSearchParams('page=-2&size=99'))).toMatchObject({
      pageIndex: 0,
      pageSize: 10,
    });
  });
});
