/**
 * Máquina de estados de la comanda en la pantalla de cocina (KDS).
 *
 *   pendiente ──► preparando ──► listo ──► entregado
 *
 * Solo se avanza un paso a la vez: saltarse "preparando" haría que los tiempos de
 * preparación que alimentan los reportes no tengan sentido.
 */
import type { Role, Ticket, TicketStatus } from './entities';
import { BusinessRuleError, ForbiddenError } from './errors';

const NEXT: Record<TicketStatus, TicketStatus | null> = {
  pendiente: 'preparando',
  preparando: 'listo',
  listo: 'entregado',
  entregado: null,
};

/**
 * Quién puede mover la comanda a cada estado.
 * Cocina prepara y marca "listo"; quien lleva el plato a la mesa (mozo) marca "entregado".
 * Admin puede todo para resolver incidencias.
 */
const ALLOWED_ROLES: Record<TicketStatus, Role[]> = {
  pendiente: [],
  preparando: ['cocina', 'admin'],
  listo: ['cocina', 'admin'],
  entregado: ['mozo', 'cocina', 'admin'],
};

export function nextTicketStatus(current: TicketStatus): TicketStatus | null {
  return NEXT[current];
}

export function assertTicketTransition(from: TicketStatus, to: TicketStatus, role: Role): void {
  if (NEXT[from] !== to) {
    throw new BusinessRuleError(`Transición inválida de comanda: ${from} → ${to}`, { from, to });
  }
  if (!ALLOWED_ROLES[to].includes(role)) {
    throw new ForbiddenError(`El rol ${role} no puede marcar una comanda como "${to}"`);
  }
}

/** Devuelve qué marca de tiempo se debe registrar al entrar a cada estado. */
export function timestampFieldFor(status: TicketStatus): 'startedAt' | 'readyAt' | 'deliveredAt' | null {
  switch (status) {
    case 'preparando':
      return 'startedAt';
    case 'listo':
      return 'readyAt';
    case 'entregado':
      return 'deliveredAt';
    default:
      return null;
  }
}

/** Aplica la transición y devuelve una NUEVA comanda (inmutabilidad = fácil de probar). */
export function advanceTicket(ticket: Ticket, role: Role, now: Date = new Date()): Ticket {
  const to = nextTicketStatus(ticket.status);
  if (!to) throw new BusinessRuleError('La comanda ya fue entregada');
  assertTicketTransition(ticket.status, to, role);
  const field = timestampFieldFor(to);
  return { ...ticket, status: to, ...(field ? { [field]: now } : {}) };
}

export interface TicketTimings {
  /** Segundos esperando antes de que cocina la tome. */
  waitSeconds: number | null;
  /** Segundos de preparación (preparando → listo). */
  prepSeconds: number | null;
  /** Segundos totales desde el envío hasta la entrega (o hasta ahora si sigue en curso). */
  totalSeconds: number;
}

const secondsBetween = (a: Date, b: Date) => Math.max(0, Math.round((b.getTime() - a.getTime()) / 1000));

export function ticketTimings(ticket: Ticket, now: Date = new Date()): TicketTimings {
  return {
    waitSeconds: ticket.startedAt ? secondsBetween(ticket.createdAt, ticket.startedAt) : null,
    prepSeconds: ticket.startedAt && ticket.readyAt ? secondsBetween(ticket.startedAt, ticket.readyAt) : null,
    totalSeconds: secondsBetween(ticket.createdAt, ticket.deliveredAt ?? now),
  };
}
