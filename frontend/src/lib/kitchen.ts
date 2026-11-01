import type { Role, TicketStatus } from '../types';

/**
 * Texto del botón de acción de una comanda según su estado y el rol del usuario.
 * Refleja la regla del backend: cocina prepara y marca "listo"; el mozo marca "entregado".
 * Devuelve null si ese rol no tiene acción disponible (el botón no se muestra).
 */
export function kitchenAction(status: TicketStatus, role: Role): string | null {
  const isKitchen = role === 'cocina' || role === 'admin';
  switch (status) {
    case 'pendiente':
      return isKitchen ? 'Empezar' : null;
    case 'preparando':
      return isKitchen ? 'Marcar listo' : null;
    case 'listo':
      return role === 'caja' ? null : 'Entregado';
    default:
      return null;
  }
}

export type Urgency = 'ok' | 'warning' | 'late';

/** Semáforo de tiempo: amarillo desde 10 min, rojo desde 20 min. */
export function urgencyFor(elapsedSeconds: number): Urgency {
  if (elapsedSeconds >= 20 * 60) return 'late';
  if (elapsedSeconds >= 10 * 60) return 'warning';
  return 'ok';
}
