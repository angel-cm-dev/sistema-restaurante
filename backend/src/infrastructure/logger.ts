import pino, { type Logger } from 'pino';

/**
 * Logging estructurado (JSON) con pino. En producción cada línea es un JSON listo
 * para Loki/ELK/CloudWatch; nunca se registran contraseñas ni tokens (redact).
 */
export function createLogger(level: string, pretty = false): Logger {
  return pino({
    level,
    base: { service: 'restaurante-api' },
    redact: {
      paths: ['req.headers.authorization', 'password', '*.password', 'passwordHash', '*.passwordHash', 'token'],
      censor: '[oculto]',
    },
    ...(pretty ? { transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss' } } } : {}),
  });
}
