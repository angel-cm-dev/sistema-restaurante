import { z } from 'zod';

export interface PageQuery {
  page: number;
  pageSize: number;
  sort?: string;
  order: 'asc' | 'desc';
  search?: string;
}

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface Page<T> {
  data: T[];
  meta: PageMeta;
}

export const MAX_PAGE_SIZE = 100;

/**
 * Esquema reutilizable para listados. `sortable` es una lista blanca: el campo de
 * orden llega del cliente y jamás debe concatenarse en SQL sin validarse.
 */
export function pageQuerySchema<const S extends readonly [string, ...string[]]>(sortable: S) {
  return z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(20),
    sort: z.enum(sortable).optional(),
    order: z.enum(['asc', 'desc']).default('asc'),
    search: z
      .string()
      .trim()
      .max(100)
      .optional()
      .transform((v) => (v ? v : undefined)),
  });
}

export function toPage<T>(data: T[], total: number, query: Pick<PageQuery, 'page' | 'pageSize'>): Page<T> {
  return {
    data,
    meta: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    },
  };
}
