import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Checkbox from '@mui/material/Checkbox';
import Paper from '@mui/material/Paper';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TablePagination from '@mui/material/TablePagination';
import TableRow from '@mui/material/TableRow';
import TableSortLabel from '@mui/material/TableSortLabel';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import SearchIcon from '@mui/icons-material/Search';
import ViewColumnOutlinedIcon from '@mui/icons-material/ViewColumnOutlined';
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import type {
  ColumnDef,
  PaginationState,
  SortingState,
  Updater,
  VisibilityState,
} from '@tanstack/react-table';
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { EmptyState } from './EmptyState';

export interface DataTableColumn<T> {
  id: string;
  header: string;
  accessorFn: (row: T) => string | number | null | undefined;
  cell?: (row: T) => ReactNode;
  sortable?: boolean;
  hideable?: boolean;
  align?: 'left' | 'right' | 'center';
  width?: number | string;
}

export interface DataTableState {
  sorting: SortingState;
  globalFilter: string;
  columnVisibility: VisibilityState;
  pageIndex: number;
  pageSize: number;
}

export interface DataTableProps<T> {
  data: T[];
  columns: DataTableColumn<T>[];
  ariaLabel: string;
  isLoading?: boolean;
  emptyTitle?: string;
  emptyBody?: string;
  emptyAction?: ReactNode;
  getRowId?: (row: T) => string;
  onRowClick?: (row: T) => void;
  searchPlaceholder?: string;
  initialState?: Partial<DataTableState>;
  state?: DataTableState;
  onStateChange?: (state: DataTableState) => void;
  stickyHeader?: boolean;
  maxHeight?: number;
  pageSizeOptions?: number[];
}

function resolveUpdater<T>(updater: Updater<T>, previous: T): T {
  return typeof updater === 'function' ? (updater as (old: T) => T)(previous) : updater;
}

const defaultState: DataTableState = {
  sorting: [],
  globalFilter: '',
  columnVisibility: {},
  pageIndex: 0,
  pageSize: 10,
};

export function DataTable<T>({
  data,
  columns,
  ariaLabel,
  isLoading = false,
  emptyTitle = 'Nothing to show',
  emptyBody = 'No rows match the current filters.',
  emptyAction,
  getRowId,
  onRowClick,
  searchPlaceholder = 'Search…',
  initialState,
  state,
  onStateChange,
  stickyHeader = true,
  maxHeight = 640,
  pageSizeOptions = [10, 25, 50],
}: DataTableProps<T>) {
  const [internal, setInternal] = useState<DataTableState>(() => ({
    ...defaultState,
    ...initialState,
  }));
  const current = state ?? internal;
  const update = (patch: Partial<DataTableState>) => {
    const next: DataTableState = { ...current, ...patch };
    if (state && onStateChange) {
      onStateChange(next);
    } else {
      setInternal(next);
    }
  };

  const columnConfig = useMemo(() => new Map(columns.map((column) => [column.id, column])), [columns]);

  const tableColumns = useMemo<ColumnDef<T, unknown>[]>(
    () =>
      columns.map((column) => ({
        id: column.id,
        header: column.header,
        accessorFn: (row: T) => column.accessorFn(row) ?? '',
        enableSorting: column.sortable !== false,
        enableHiding: column.hideable !== false,
        cell: (context) => {
          if (column.cell) {
            return column.cell(context.row.original);
          }
          const value = context.getValue();
          return value === null || value === undefined || value === '' ? '—' : String(value);
        },
      })),
    [columns],
  );

  const pagination: PaginationState = {
    pageIndex: current.pageIndex,
    pageSize: current.pageSize,
  };

  const table = useReactTable({
    data,
    columns: tableColumns,
    state: {
      sorting: current.sorting,
      globalFilter: current.globalFilter,
      columnVisibility: current.columnVisibility,
      pagination,
    },
    onSortingChange: (updater) => update({ sorting: resolveUpdater(updater, current.sorting) }),
    onGlobalFilterChange: (updater) =>
      update({ globalFilter: resolveUpdater(updater, current.globalFilter), pageIndex: 0 }),
    onColumnVisibilityChange: (updater) =>
      update({ columnVisibility: resolveUpdater(updater, current.columnVisibility) }),
    onPaginationChange: (updater) => {
      const next = resolveUpdater(updater, pagination);
      update({ pageIndex: next.pageIndex, pageSize: next.pageSize });
    },
    getRowId: getRowId ? (row) => getRowId(row) : undefined,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const rows = table.getRowModel().rows;
  const filteredCount = table.getFilteredRowModel().rows.length;
  const pageIndex = current.pageIndex;
  const visibleColumnCount = table.getVisibleLeafColumns().length;
  const isEmpty = !isLoading && filteredCount === 0;

  return (
    <Paper variant="outlined">
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1}
        alignItems={{ xs: 'stretch', sm: 'center' }}
        sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider' }}
      >
        <TextField
          value={current.globalFilter}
          onChange={(event) => update({ globalFilter: event.target.value, pageIndex: 0 })}
          placeholder={searchPlaceholder}
          size="small"
          inputProps={{ 'aria-label': `Search ${ariaLabel}` }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
          sx={{ minWidth: { sm: 260 }, maxWidth: 360 }}
        />
        <Box sx={{ flexGrow: 1 }} />
        <Typography variant="caption" color="text.secondary">
          {filteredCount} of {data.length}
        </Typography>
        <Tooltip title="Choose columns">
          <IconButton
            size="small"
            aria-label="Choose columns"
            onClick={(event) => setAnchor(event.currentTarget)}
          >
            <ViewColumnOutlinedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
          {table.getAllLeafColumns().map((column) => {
            const config = columnConfig.get(column.id);
            return (
              <MenuItem
                key={column.id}
                disabled={!column.getCanHide()}
                onClick={() => column.toggleVisibility()}
              >
                <Checkbox
                  edge="start"
                  size="small"
                  checked={column.getIsVisible()}
                  tabIndex={-1}
                  disableRipple
                />
                <Typography variant="body2">{config?.header ?? column.id}</Typography>
              </MenuItem>
            );
          })}
        </Menu>
      </Stack>

      {isLoading ? (
        <Box sx={{ p: 2 }} role="status" aria-label={`Loading ${ariaLabel}`}>
          <Stack spacing={1}>
            {Array.from({ length: 5 }, (_, rowIndex) => (
              <Stack key={rowIndex} direction="row" spacing={2}>
                {Array.from({ length: Math.max(visibleColumnCount, 2) }, (__, cellIndex) => (
                  <Skeleton key={cellIndex} variant="rounded" height={28} sx={{ flex: 1 }} />
                ))}
              </Stack>
            ))}
          </Stack>
        </Box>
      ) : isEmpty ? (
        <Box sx={{ p: 2 }}>
          <EmptyState title={emptyTitle} body={emptyBody} action={emptyAction} />
        </Box>
      ) : (
        <>
          <TableContainer sx={{ maxHeight: stickyHeader ? maxHeight : undefined }}>
            <Table size="small" stickyHeader={stickyHeader} aria-label={ariaLabel}>
              <TableHead>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => {
                      const config = columnConfig.get(header.column.id);
                      const sorted = header.column.getIsSorted();
                      return (
                        <TableCell
                          key={header.id}
                          align={config?.align ?? 'left'}
                          sx={{ width: config?.width }}
                        >
                          {header.column.getCanSort() ? (
                            <TableSortLabel
                              active={Boolean(sorted)}
                              direction={sorted || 'asc'}
                              onClick={header.column.getToggleSortingHandler()}
                            >
                              {flexRender(header.column.columnDef.header, header.getContext())}
                            </TableSortLabel>
                          ) : (
                            flexRender(header.column.columnDef.header, header.getContext())
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableHead>
              <TableBody>
                {rows.map((row) => (
                  <TableRow
                    key={row.id}
                    hover
                    onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                    sx={{ cursor: onRowClick ? 'pointer' : 'default' }}
                  >
                    {row.getVisibleCells().map((cell) => {
                      const config = columnConfig.get(cell.column.id);
                      return (
                        <TableCell key={cell.id} align={config?.align ?? 'left'}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            component="div"
            count={filteredCount}
            page={pageIndex}
            rowsPerPage={current.pageSize}
            rowsPerPageOptions={pageSizeOptions}
            onPageChange={(_, page) => update({ pageIndex: page })}
            onRowsPerPageChange={(event) =>
              update({ pageSize: Number(event.target.value), pageIndex: 0 })
            }
          />
        </>
      )}
    </Paper>
  );
}
