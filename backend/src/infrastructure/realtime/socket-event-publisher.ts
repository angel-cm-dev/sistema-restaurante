import type { Server } from 'socket.io';
import type { Role } from '../../domain/entities';
import type { DomainEvent, EventPublisher } from '../../application/ports';

/**
 * Salas (rooms) de Socket.IO. Cada socket entra a las salas de su rol al conectarse;
 * así cada pantalla recibe SOLO lo que necesita (cocina no recibe pagos, etc.).
 */
export const ROOMS = {
  kitchen: 'kitchen',
  floor: 'floor',
  cashier: 'cashier',
  user: (id: number) => `user:${id}`,
} as const;

export function roomsForRole(role: Role): string[] {
  switch (role) {
    case 'admin':
      return [ROOMS.kitchen, ROOMS.floor, ROOMS.cashier];
    case 'mozo':
      return [ROOMS.floor];
    case 'cocina':
      return [ROOMS.kitchen];
    case 'caja':
      return [ROOMS.cashier, ROOMS.floor];
  }
}

/** Nombres de eventos servidor → cliente (contrato documentado en README y docs/guia-api.md). */
export const SERVER_EVENTS = {
  tableUpdated: 'table:updated',
  ticketCreated: 'ticket:created',
  ticketUpdated: 'ticket:updated',
  ticketReady: 'ticket:ready',
  orderUpdated: 'order:updated',
  orderClosed: 'order:closed',
} as const;

/** Traduce eventos de dominio a emisiones de Socket.IO. */
export class SocketEventPublisher implements EventPublisher {
  private io: Server | null = null;

  attach(io: Server): void {
    this.io = io;
  }

  publish(event: DomainEvent): void {
    const io = this.io;
    if (!io) return; // p.ej. scripts de seed: no hay servidor de sockets.
    switch (event.type) {
      case 'table.updated':
        io.to([ROOMS.floor, ROOMS.cashier]).emit(SERVER_EVENTS.tableUpdated, event.table);
        break;
      case 'ticket.created':
        io.to([ROOMS.kitchen, ROOMS.floor]).emit(SERVER_EVENTS.ticketCreated, event.ticket);
        break;
      case 'ticket.updated':
        io.to([ROOMS.kitchen, ROOMS.floor]).emit(SERVER_EVENTS.ticketUpdated, event.ticket);
        if (event.ticket.status === 'listo') {
          // Aviso directo al mozo dueño de la mesa: "tu plato está listo para recoger".
          io.to(ROOMS.user(event.ticket.waiterId)).emit(SERVER_EVENTS.ticketReady, {
            ticketId: event.ticket.id,
            tableNumber: event.ticket.tableNumber,
          });
        }
        break;
      case 'order.updated':
        io.to([ROOMS.floor, ROOMS.cashier]).emit(SERVER_EVENTS.orderUpdated, {
          orderId: event.orderId,
          tableId: event.tableId,
        });
        break;
      case 'order.closed':
        io.to([ROOMS.floor, ROOMS.cashier]).emit(SERVER_EVENTS.orderClosed, {
          orderId: event.orderId,
          tableId: event.tableId,
          totalCents: event.totalCents,
        });
        break;
    }
  }
}
