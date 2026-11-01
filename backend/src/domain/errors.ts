/**
 * Errores de dominio. No conocen HTTP: la capa API los traduce a códigos de estado
 * (ver api/http/middlewares/error-handler.ts). Así el dominio puede reutilizarse
 * desde HTTP, Socket.IO o un script sin cambiar nada.
 */
export type ErrorCode =
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'BUSINESS_RULE'
  | 'CONFLICT'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN';

export class DomainError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends DomainError {
  constructor(entity: string, id: number | string) {
    super('NOT_FOUND', `${entity} con id ${id} no existe`);
  }
}

/** Datos de entrada mal formados (la forma es incorrecta). */
export class ValidationError extends DomainError {
  constructor(message: string, details?: unknown) {
    super('VALIDATION', message, details);
  }
}

/** Los datos son válidos pero violan una regla del negocio (p.ej. cobrar una mesa libre). */
export class BusinessRuleError extends DomainError {
  constructor(message: string, details?: unknown) {
    super('BUSINESS_RULE', message, details);
  }
}

export class ConflictError extends DomainError {
  constructor(message: string) {
    super('CONFLICT', message);
  }
}

export class UnauthorizedError extends DomainError {
  constructor(message = 'Credenciales inválidas o token ausente') {
    super('UNAUTHORIZED', message);
  }
}

export class ForbiddenError extends DomainError {
  constructor(message = 'No tienes permisos para esta acción') {
    super('FORBIDDEN', message);
  }
}
