import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { DataTableState } from '../components/DataTable';

export interface TableStateKeys {
  sort?: string;
  dir?: string;
  query?: string;
  page?: string;
  size?: string;
}

export interface TableStateOptions {
  keys?: TableStateKeys;
  /** Column ids that may be written to the URL. Unknown ids are ignored. */
  sortable?: ReadonlySet<string> | readonly string[];
  pageSizes?: number[];
  defaultPageSize?: number;
}

const defaultKeys: Required<TableStateKeys> = {
  sort: 'sort',
  dir: 'dir',
  query: 'q',
  page: 'page',
  size: 'size',
};

function resolve(options: TableStateOptions) {
  return {
    keys: { ...defaultKeys, ...options.keys },
    pageSizes: options.pageSizes ?? [10, 25, 50],
    defaultPageSize: options.defaultPageSize ?? 10,
    sortable: options.sortable
      ? new Set(options.sortable as ReadonlySet<string> | readonly string[])
      : null,
  };
}

export function readTableState(
  params: URLSearchParams,
  options: TableStateOptions = {},
): DataTableState {
  const { keys, pageSizes, defaultPageSize, sortable } = resolve(options);
  const sort = params.get(keys.sort);
  const direction = params.get(keys.dir);
  const page = Number(params.get(keys.page) ?? '0');
  const size = Number(params.get(keys.size) ?? String(defaultPageSize));
  const allowed = sort !== null && (!sortable || sortable.has(sort));
  return {
    sorting: allowed ? [{ id: sort as string, desc: direction === 'desc' }] : [],
    globalFilter: params.get(keys.query) ?? '',
    columnVisibility: {},
    pageIndex: Number.isInteger(page) && page >= 0 ? page : 0,
    pageSize: pageSizes.includes(size) ? size : defaultPageSize,
  };
}

export function writeTableState(
  params: URLSearchParams,
  state: DataTableState,
  options: TableStateOptions = {},
): URLSearchParams {
  const { keys, defaultPageSize, sortable } = resolve(options);
  const updated = new URLSearchParams(params);
  const [first] = state.sorting;
  if (first && (!sortable || sortable.has(first.id))) {
    updated.set(keys.sort, first.id);
    updated.set(keys.dir, first.desc ? 'desc' : 'asc');
  } else {
    updated.delete(keys.sort);
    updated.delete(keys.dir);
  }
  if (state.globalFilter) {
    updated.set(keys.query, state.globalFilter);
  } else {
    updated.delete(keys.query);
  }
  if (state.pageIndex > 0) {
    updated.set(keys.page, String(state.pageIndex));
  } else {
    updated.delete(keys.page);
  }
  if (state.pageSize !== defaultPageSize) {
    updated.set(keys.size, String(state.pageSize));
  } else {
    updated.delete(keys.size);
  }
  return updated;
}

export function useTableUrlState(
  options: TableStateOptions = {},
): [DataTableState, (state: DataTableState) => void] {
  const [params, setParams] = useSearchParams();
  const state = useMemo(() => readTableState(params, options), [params, options]);
  const onChange = useCallback(
    (next: DataTableState) => {
      setParams(writeTableState(params, next, options), { replace: true });
    },
    [params, setParams, options],
  );
  return [state, onChange];
}
