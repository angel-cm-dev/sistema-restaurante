/**
 * Ayudas para construir SQL dinámico de forma SEGURA:
 *  - los valores siempre van como parámetros ($1, $2...), nunca concatenados;
 *  - las columnas de orden salen de una lista blanca (sortMap).
 */
export class WhereBuilder {
  private readonly clauses: string[] = [];
  readonly params: unknown[] = [];

  /** Agrega una condición si `value` está definido. Usa `?` como marcador del parámetro. */
  add(condition: string, value: unknown): this {
    if (value === undefined || value === null) return this;
    this.params.push(value);
    this.clauses.push(condition.replaceAll('?', `$${this.params.length}`));
    return this;
  }

  /** Siguiente marcador libre ($n), para LIMIT/OFFSET. */
  next(value: unknown): string {
    this.params.push(value);
    return `$${this.params.length}`;
  }

  toSql(): string {
    return this.clauses.length ? `WHERE ${this.clauses.join(' AND ')}` : '';
  }
}

export function orderBy(
  sortMap: Record<string, string>,
  sort: string | undefined,
  order: 'asc' | 'desc',
  fallback: string,
  tieBreaker: string,
): string {
  const column = (sort && sortMap[sort]) || fallback;
  const direction = order === 'desc' ? 'DESC' : 'ASC';
  return `ORDER BY ${column} ${direction}, ${tieBreaker} ASC`;
}

/**
 * Genera "$n, $n+1, ..." para un `IN (...)`. Se prefiere a `= ANY($1::int[])` porque es
 * SQL estándar y lo soporta también el emulador pg-mem usado en las pruebas.
 */
export function inPlaceholders(count: number, startAt = 1): string {
  return Array.from({ length: count }, (_, i) => `$${startAt + i}`).join(', ');
}

export const likePattern = (search?: string) => (search ? `%${search.replace(/[%_\\]/g, '\\$&')}%` : undefined);
