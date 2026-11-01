import type { Role } from '../types';

/**
 * Qué roles pueden ver cada sección. Es solo UX (ocultar lo que no aplica):
 * la seguridad real la aplica el backend en cada endpoint y evento de socket.
 */
export const ROUTE_ROLES = {
  dashboard: ['admin', 'caja'],
  salon: ['admin', 'mozo', 'caja'],
  pedido: ['admin', 'mozo'],
  cocina: ['admin', 'cocina', 'mozo'],
  caja: ['admin', 'caja'],
  reportes: ['admin', 'caja'],
  carta: ['admin'],
  usuarios: ['admin'],
} satisfies Record<string, Role[]>;

export type Section = keyof typeof ROUTE_ROLES;

export function canAccess(role: Role | undefined, section: Section): boolean {
  return !!role && (ROUTE_ROLES[section] as Role[]).includes(role);
}

/** Pantalla inicial según el rol: cada persona aterriza donde trabaja. */
export function homeFor(role: Role): string {
  switch (role) {
    case 'admin':
    case 'caja':
      return '/dashboard';
    case 'mozo':
      return '/salon';
    case 'cocina':
      return '/cocina';
  }
}
