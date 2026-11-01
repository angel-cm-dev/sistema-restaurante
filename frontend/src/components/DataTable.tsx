import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import type { PageMeta } from '../types';
import { EmptyState, ErrorState, LoadingState } from './StateViews';

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  /** Si se define, la columna es ordenable con esta clave (debe existir en la lista blanca del backend). */
  sortKey?: string;
  className?: string;
}

export interface SortState {
  sort?: string;
  order: 'asc' | 'desc';
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[] | undefined;
  rowKey: (row: T) => string | number;
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  emptyTitle?: string;
  emptyDescription?: string;
  sort?: SortState;
  onSortChange?: (sort: SortState) => void;
  meta?: PageMeta;
  onPageChange?: (page: number) => void;
  toolbar?: ReactNode;
}

/** Tabla genérica y presentacional: los datos, filtros y paginación los controla la página. */
export function DataTable<T>(props: DataTableProps<T>) {
  const { columns, rows, rowKey, loading, error, sort, onSortChange, meta, onPageChange, toolbar } = props;

  const toggleSort = (key: string) => {
    if (!onSortChange) return;
    const order = sort?.sort === key && sort.order === 'asc' ? 'desc' : 'asc';
    onSortChange({ sort: key, order });
  };

  let body: ReactNode;
  if (error) body = <ErrorState error={error} onRetry={props.onRetry} />;
  else if (loading && !rows) body = <LoadingState />;
  else if (!rows || rows.length === 0) body = <EmptyState title={props.emptyTitle ?? 'Sin resultados'} description={props.emptyDescription} />;
  else
    body = (
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
            <tr>
              {columns.map((c) => (
                <th key={c.key} scope="col" className={`px-4 py-3 font-medium ${c.className ?? ''}`}>
                  {c.sortKey ? (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 hover:text-slate-800 dark:hover:text-slate-100"
                      onClick={() => toggleSort(c.sortKey!)}
                      aria-label={`Ordenar por ${c.header}`}
                    >
                      {c.header}
                      {sort?.sort === c.sortKey ? (
                        sort.order === 'asc' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />
                      ) : (
                        <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />
                      )}
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className={`divide-y divide-slate-100 dark:divide-slate-800 ${loading ? 'opacity-60' : ''}`}>
            {rows.map((row) => (
              <tr key={rowKey(row)} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                {columns.map((c) => (
                  <td key={c.key} className={`px-4 py-3 ${c.className ?? ''}`}>
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );

  return (
    <div className="card overflow-hidden">
      {toolbar && <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 p-3 dark:border-slate-800">{toolbar}</div>}
      {body}
      {meta && onPageChange && rows && rows.length > 0 && <Pagination meta={meta} onPageChange={onPageChange} />}
    </div>
  );
}

export function Pagination({ meta, onPageChange }: { meta: PageMeta; onPageChange: (page: number) => void }) {
  const from = (meta.page - 1) * meta.pageSize + 1;
  const to = Math.min(meta.page * meta.pageSize, meta.total);
  return (
    <nav aria-label="Paginación" className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm dark:border-slate-800">
      <span className="text-slate-500 dark:text-slate-400">
        {from}–{to} de {meta.total}
      </span>
      <div className="flex items-center gap-2">
        <button className="btn-secondary px-2 py-1" disabled={meta.page <= 1} onClick={() => onPageChange(meta.page - 1)} aria-label="Página anterior">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span>
          Página {meta.page} de {meta.totalPages}
        </span>
        <button
          className="btn-secondary px-2 py-1"
          disabled={meta.page >= meta.totalPages}
          onClick={() => onPageChange(meta.page + 1)}
          aria-label="Página siguiente"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </nav>
  );
}
