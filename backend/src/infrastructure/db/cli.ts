/**
 * CLI de base de datos:
 *   npm run db:migrate   -> aplica migraciones pendientes
 *   npm run db:seed      -> migra y carga datos demo (si la base está vacía)
 */
import { loadConfig } from '../../config';
import { createLogger } from '../logger';
import { BcryptPasswordHasher } from '../security/bcrypt-password-hasher';
import { createPgDatabase } from './database';
import { runMigrations } from './migrator';
import { seedDemoData } from './seed';

try {
  process.loadEnvFile();
} catch {
  /* sin .env */
}

async function main() {
  const command = process.argv[2] ?? 'migrate';
  const config = loadConfig();
  const logger = createLogger(config.LOG_LEVEL);
  const db = createPgDatabase(config.DATABASE_URL);
  try {
    const applied = await runMigrations(db, logger);
    logger.info({ applied }, 'migraciones al día');
    if (command === 'seed') await seedDemoData(db, new BcryptPasswordHasher(config.BCRYPT_ROUNDS), logger);
  } finally {
    await db.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
