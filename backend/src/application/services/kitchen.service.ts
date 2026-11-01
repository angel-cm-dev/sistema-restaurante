import type { TicketStatus } from '../../domain/entities';
import { NotFoundError } from '../../domain/errors';
import { advanceTicket, ticketTimings, type TicketTimings } from '../../domain/kitchen';
import type { Actor, EventPublisher, KitchenTicketView, UnitOfWork } from '../ports';

export type KitchenTicket = KitchenTicketView & { timings: TicketTimings };

const withTimings = (t: KitchenTicketView): KitchenTicket => ({ ...t, timings: ticketTimings(t) });

export class KitchenService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly events: EventPublisher,
  ) {}

  /** Comandas para el KDS, de la más antigua a la más reciente (FIFO: primero en llegar, primero en salir). */
  async board(statuses: TicketStatus[]): Promise<KitchenTicket[]> {
    const tickets = await this.uow.repos.orders.listKitchenTickets(statuses);
    return tickets.map(withTimings);
  }

  /** Avanza la comanda un estado. Las reglas (orden y rol) viven en el dominio: domain/kitchen.ts. */
  async advance(ticketId: number, actor: Actor): Promise<KitchenTicket> {
    await this.uow.transaction(async (repos) => {
      const ticket = await repos.orders.findTicket(ticketId);
      if (!ticket) throw new NotFoundError('Comanda', ticketId);
      await repos.orders.saveTicket(advanceTicket(ticket, actor.role));
    });
    const view = await this.uow.repos.orders.findKitchenTicket(ticketId);
    if (!view) throw new NotFoundError('Comanda', ticketId);
    this.events.publish({ type: 'ticket.updated', ticket: view });
    return withTimings(view);
  }
}
