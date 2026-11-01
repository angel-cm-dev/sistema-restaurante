import { randomUUID } from 'node:crypto';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import swaggerUi from 'swagger-ui-express';
import type { Container } from '../../container';
import { errorHandler, notFoundHandler } from './middlewares/error-handler';
import { openApiDocument } from './openapi';
import { buildApiRouter } from './routes';

export function createApp(c: Container): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // detrás de nginx en docker-compose

  app.use(
    pinoHttp({
      logger: c.logger,
      // Reutiliza el X-Request-Id del proxy si existe: permite seguir una petición entre servicios.
      genReqId: (req, res) => {
        const id = (req.headers['x-request-id'] as string) || randomUUID();
        res.setHeader('X-Request-Id', id);
        return id;
      },
      autoLogging: { ignore: (req) => req.url === '/health' },
    }),
  );
  // Swagger UI usa scripts inline: relajamos CSP solo lo necesario.
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({ origin: c.config.CORS_ORIGIN.split(',').map((o) => o.trim()), credentials: true }));
  app.use(express.json({ limit: '100kb' }));

  app.get('/health', async (_req, res) => {
    let database = 'up';
    try {
      await c.db.query('SELECT 1');
    } catch {
      database = 'down';
    }
    res.status(database === 'up' ? 200 : 503).json({
      status: database === 'up' ? 'ok' : 'degraded',
      database,
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/api/openapi.json', (_req, res) => {
    res.json(openApiDocument);
  });
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openApiDocument, { customSiteTitle: 'API Restaurante' }));

  app.use('/api', buildApiRouter(c));

  app.use(notFoundHandler);
  app.use(errorHandler(c.logger));
  return app;
}
