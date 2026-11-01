import type { Logger } from 'pino';
import type { Database } from './database';
import { migrations } from './migrations';

/** Aplica, en orden, las migraciones pendientes. Es idempotente: puede ejecutarse en cada arranque. */
export async function runMigrations(db: Database, logger?: Logger): Promise<number[]> {
  await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  const applied = new Set(
    (await db.query<{ version: number }>('SELECT version FROM schema_migrations')).map((r) => r.version),
  );
  const done: number[] = [];
  for (const m of [...migrations].sort((a, b) => a.version - b.version)) {
    if (applied.has(m.version)) continue;
    await db.transaction(async (tx) => {
      await tx.query(m.sql);
      await tx.query('INSERT INTO schema_migrations (version, name) VALUES ($1, $2)', [m.version, m.name]);
    });
    logger?.info({ version: m.version, name: m.name }, 'migración aplicada');
    done.push(m.version);
  }
  return done;
}
