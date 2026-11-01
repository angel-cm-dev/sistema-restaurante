/**
 * Abstracción mínima sobre PostgreSQL. Los repositorios solo conocen `Queryable`,
 * por eso funcionan igual con:
 *   - un Pool real de `pg` (producción / docker-compose), o
 *   - el Pool compatible de pg-mem (pruebas en memoria, sin Docker).
 */
import { Pool } from 'pg';

export interface Queryable {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
}

export interface Database extends Queryable {
  transaction<T>(work: (tx: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

interface ClientLike {
  query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }>;
  release(): void;
}

/** Contrato que cumplen tanto `pg.Pool` como el Pool de pg-mem. */
export interface PoolLike {
  query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }>;
  connect(): Promise<ClientLike>;
  end(): Promise<void>;
}

export class PgDatabase implements Database {
  constructor(private readonly pool: PoolLike) {}

  async query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    const result = await this.pool.query(sql, params);
    return result.rows as T[];
  }

  async transaction<T>(work: (tx: Queryable) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    const tx: Queryable = {
      query: async <R>(sql: string, params: unknown[] = []) => (await client.query(sql, params)).rows as R[],
    };
    try {
      await client.query('BEGIN');
      const result = await work(tx);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  close(): Promise<void> {
    return this.pool.end();
  }
}

export function createPgDatabase(connectionString: string): Database {
  return new PgDatabase(new Pool({ connectionString, max: 10 }) as unknown as PoolLike);
}
