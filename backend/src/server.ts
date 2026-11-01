/**
 * Punto de entrada en producción / desarrollo.
 */
import { startServer } from './bootstrap';
import { loadConfig } from './config';
import { createPgDatabase } from './infrastructure/db/database';
import { createLogger } from './infrastructure/logger';

// Carga .env si existe (Node >= 20.12 trae esto de serie, sin dependencia extra).
try {
  process.loadEnvFile();
} catch {
  /* sin .env: se usan las variables del entorno (docker-compose, CI) */
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const config = loadConfig();
  const logger = createLogger(config.LOG_LEVEL, config.NODE_ENV === 'development');

  // PostgreSQL puede tardar unos segundos en aceptar conexiones al levantar docker-compose.
  let attempt = 0;
  for (;;) {
    const db = createPgDatabase(config.DATABASE_URL);
    try {
      await db.query('SELECT 1');
      const server = await startServer({ config, logger, db, seed: config.SEED_ON_START });
      logger.info({ port: server.port, docs: `http://localhost:${server.port}/api/docs` }, 'API lista');

      const shutdown = async (signal: string) => {
        logger.info({ signal }, 'apagando servidor');
        await server.close();
        process.exit(0);
      };
      process.on('SIGTERM', () => void shutdown('SIGTERM'));
      process.on('SIGINT', () => void shutdown('SIGINT'));
      return;
    } catch (error) {
      await db.close().catch(() => undefined);
      attempt += 1;
      if (attempt >= 10) throw error;
      logger.warn({ attempt, err: (error as Error).message }, 'base de datos no disponible, reintentando');
      await sleep(2000);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
