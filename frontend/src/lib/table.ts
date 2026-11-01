import type { Page } from '../types';

/**
 * Búsqueda, orden y paginación EN EL CLIENTE, para listados pequeños que ya llegaron
 * completos (p.ej. reportes). Los listados grandes (carta, usuarios) se paginan en el servidor.
 */
export function clientPage<T>(
  rows: T[],
  opts: {
    search?: string;
    searchIn?: (row: T) => string;
    sortBy?: (row: T) => string | number;
    order?: 'asc' | 'desc';
    page: number;
    pageSize: number;
  },
): Page<T> {
  const q = opts.search?.trim().toLowerCase() ?? '';
  let result = q && opts.searchIn ? rows.filter((r) => opts.searchIn!(r).toLowerCase().includes(q)) : [...rows];
  if (opts.sortBy) {
    const dir = opts.order === 'desc' ? -1 : 1;
    const key = opts.sortBy;
    result = result.sort((a, b) => {
      const x = key(a);
      const y = key(b);
      return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'es')) * dir;
    });
  }
  const total = result.length;
  const totalPages = Math.max(1, Math.ceil(total / opts.pageSize));
  const page = Math.min(Math.max(1, opts.page), totalPages);
  return {
    data: result.slice((page - 1) * opts.pageSize, page * opts.pageSize),
    meta: { page, pageSize: opts.pageSize, total, totalPages },
  };
}
