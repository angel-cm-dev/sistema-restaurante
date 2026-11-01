/**
 * Ciclo de vida de una mesa en el salón.
 *
 *   libre ──abrir pedido──► ocupada ──pedir cuenta──► por_cobrar ──pago──► libre
 *                              ▲                          │
 *                              └──── reabrir (piden más) ─┘
 *   ocupada ──anular pedido vacío──► libre
 */
import type { TableStatus } from './entities';
import { BusinessRuleError } from './errors';

const TRANSITIONS: Record<TableStatus, TableStatus[]> = {
  libre: ['ocupada'],
  ocupada: ['por_cobrar', 'libre'],
  por_cobrar: ['libre', 'ocupada'],
};

export function canTransitionTable(from: TableStatus, to: TableStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTableTransition(from: TableStatus, to: TableStatus): void {
  if (!canTransitionTable(from, to)) {
    throw new BusinessRuleError(`La mesa no puede pasar de "${from}" a "${to}"`, { from, to });
  }
}
