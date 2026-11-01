import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Logger } from 'pino';
import type { Server as IoServer } from 'socket.io';
import { createApp } from './api/http/app';
import { createSocketServer } from './api/socket/socket-server';
import type { AppConfig } from './config';
import { buildContainer, type Container } from './container';
import type { Database } from './infrastructure/db/database';
import { runMigrations } from './infrastructure/db/migrator';
import { seedDemoData } from './infrastructure/db/seed';

export interface RunningServer {
  container: Container;
  httpServer: HttpServer;
  io: IoServer;
  port: number;
  close(): Promise<void>;
}

/**
 * Arma y levanta todo el sistema (HTTP + Socket.IO) sobre la `Database` recibida.
 * Lo usan tanto `server.ts` (PostgreSQL real) como las pruebas (pg-mem, puerto efímero 0).
 */
export async function startServer(opts: {
  config: AppConfig;
  logger: Logger;
  db: Database;
  port?: number;
  seed?: boolean;
}): Promise<RunningServer> {
  const { config, logger, db } = opts;
  await runMigrations(db, logger);
  const container = buildContainer({ config, logger, db });
  if (opts.seed) await seedDemoData(db, container.hasher, logger);

  const app = createApp(container);
  const httpServer = createServer(app);
  const io = createSocketServer(httpServer, container);

  await new Promise<void>((resolve) => httpServer.listen(opts.port ?? config.PORT, resolve));
  const port = (httpServer.address() as AddressInfo).port;

  return {
    container,
    httpServer,
    io,
    port,
    close: async () => {
      // io.close() también cierra el servidor HTTP asociado.
      await new Promise<void>((resolve) => io.close(() => resolve()));
      await db.close();
    },
  };
}
