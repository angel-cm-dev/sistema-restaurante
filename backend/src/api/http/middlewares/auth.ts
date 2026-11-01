import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { Role } from '../../../domain/entities';
import { ForbiddenError, UnauthorizedError } from '../../../domain/errors';
import type { Actor, AuthPayload, TokenService } from '../../../application/ports';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

/** Valida el header `Authorization: Bearer <jwt>` y deja el usuario en `req.user`. */
export function authenticate(tokens: TokenService): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const header = req.headers.authorization ?? '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) return next(new UnauthorizedError('Falta el token Bearer'));
    req.user = tokens.verify(token);
    next();
  };
}

/** Autorización por rol a nivel de endpoint. Debe ir después de `authenticate`. */
export function authorize(...roles: Role[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new UnauthorizedError());
    if (!roles.includes(req.user.role)) {
      return next(new ForbiddenError(`Esta acción requiere uno de los roles: ${roles.join(', ')}`));
    }
    next();
  };
}

export function actorOf(req: Request): Actor {
  if (!req.user) throw new UnauthorizedError();
  return { id: req.user.sub, name: req.user.name, role: req.user.role };
}
