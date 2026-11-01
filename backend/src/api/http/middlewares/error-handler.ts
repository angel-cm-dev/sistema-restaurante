import type { ErrorRequestHandler, RequestHandler } from 'express';
import type { Logger } from 'pino';
import { ZodError } from 'zod';
import { DomainError, type ErrorCode } from '../../../domain/errors';

/**
 * Formato de error único para toda la API: Problem Details (RFC 9457, antes 7807).
 * El frontend solo necesita entender UNA forma de error.
 */
export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  code: string;
  traceId?: string;
  errors?: Array<{ field: string; message: string }>;
  extra?: unknown;
}

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  VALIDATION: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  BUSINESS_RULE: 422,
};

const TITLES: Record<number, string> = {
  400: 'Solicitud inválida',
  401: 'No autenticado',
  403: 'Prohibido',
  404: 'No encontrado',
  409: 'Conflicto',
  422: 'Regla de negocio incumplida',
  500: 'Error interno',
};

function problem(status: number, code: string, detail: string, instance: string, traceId?: string): ProblemDetails {
  return {
    type: `https://httpstatuses.io/${status}`,
    title: TITLES[status] ?? 'Error',
    status,
    detail,
    instance,
    code,
    traceId,
  };
}

export const notFoundHandler: RequestHandler = (req, res) => {
  res
    .status(404)
    .type('application/problem+json')
    .json(problem(404, 'ROUTE_NOT_FOUND', `Ruta ${req.method} ${req.path} no existe`, req.originalUrl, String(req.id ?? '')));
};

export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (err, req, res, _next) => {
    const traceId = String(req.id ?? '');
    let body: ProblemDetails;

    if (err instanceof ZodError) {
      body = problem(400, 'VALIDATION', 'Uno o más campos son inválidos', req.originalUrl, traceId);
      body.errors = err.issues.map((i) => ({ field: i.path.join('.') || '(raíz)', message: i.message }));
    } else if (err instanceof DomainError) {
      body = problem(STATUS_BY_CODE[err.code], err.code, err.message, req.originalUrl, traceId);
      if (err.details !== undefined) body.extra = err.details;
    } else if (err?.type === 'entity.parse.failed') {
      body = problem(400, 'MALFORMED_JSON', 'El cuerpo no es JSON válido', req.originalUrl, traceId);
    } else if (err?.code === '23505') {
      // Violación de UNIQUE en PostgreSQL (p.ej. dos pedidos abiertos para la misma mesa a la vez).
      body = problem(409, 'CONFLICT', 'El recurso ya existe o fue modificado por otro usuario', req.originalUrl, traceId);
    } else {
      logger.error({ err, traceId }, 'error no controlado');
      // Nunca filtramos detalles internos (stack, SQL) al cliente.
      body = problem(500, 'INTERNAL', 'Ocurrió un error inesperado', req.originalUrl, traceId);
    }

    if (body.status >= 400 && body.status < 500) logger.debug({ problem: body }, 'error de cliente');
    res.status(body.status).type('application/problem+json').json(body);
  };
}
