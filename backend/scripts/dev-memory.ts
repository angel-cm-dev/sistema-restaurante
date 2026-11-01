/**
 * Modo demo SIN PostgreSQL ni Docker: levanta la API completa sobre pg-mem (en memoria)
 * con los datos de ejemplo. Los datos se pierden al detener el proceso.
 *
 *   npm run dev:memory
 */
import { newDb } from 'pg-mem';
import { startServer } from '../src/bootstrap';
import { loadConfig } from '../src/config';
import { PgDatabase, type PoolLike } from '../src/infrastructure/db/database';
import { createLogger } from '../src/infrastructure/logger';

try {
  process.loadEnvFile();
} catch {
  /* sin .env */
}

async function main() {
  const config = loadConfig({
    JWT_SECRET: 'solo-para-demo-local-en-memoria-0123456789',
    ...process.env,
    BCRYPT_ROUNDS: process.env.BCRYPT_ROUNDS ?? '8',
  });
  const logger = createLogger(config.LOG_LEVEL, true);
  const { Pool } = newDb().adapters.createPg();
  const server = await startServer({ config, logger, db: new PgDatabase(new Pool() as unknown as PoolLike), seed: true });
  logger.info({ port: server.port, docs: `http://localhost:${server.port}/api/docs` }, 'API en memoria lista (datos demo)');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
