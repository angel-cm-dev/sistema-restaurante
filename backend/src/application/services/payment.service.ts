import { calculateTotals } from '../../domain/billing';
import { BusinessRuleError } from '../../domain/errors';
import { distributeProportionally, formatPEN } from '../../domain/money';
import type { CloseOrderDto } from '../dtos';
import type { Actor, EventPublisher, UnitOfWork } from '../ports';
import { buildOrderDetail, requireOpenOrder, toBillLines, type OrderDetail } from './order.service';

export class PaymentService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly events: EventPublisher,
  ) {}

  /**
   * Cobra y cierra la mesa en UNA transacción: registrar pagos, cerrar el pedido y
   * liberar la mesa deben ocurrir juntos; si algo falla no puede quedar una mesa
   * "pagada a medias".
   */
  async closeOrder(orderId: number, dto: CloseOrderDto, actor: Actor): Promise<OrderDetail> {
    const detail = await this.uow.transaction(async (repos) => {
      const order = await requireOpenOrder(repos, orderId);
      const items = await repos.orders.listItems(orderId);
      if (items.length === 0) throw new BusinessRuleError('No se puede cobrar un pedido sin consumos');
      if (items.some((i) => i.ticketId === null)) {
        throw new BusinessRuleError('Hay ítems sin enviar a cocina: envíalos o elimínalos antes de cobrar');
      }
      const tickets = await repos.orders.listTickets(orderId);
      if (tickets.some((t) => t.status !== 'entregado')) {
        // Evita cobrar platos que el cliente aún no recibió y comandas "huérfanas" en el KDS.
        throw new BusinessRuleError('Hay comandas que aún no se entregan a la mesa');
      }

      const totals = calculateTotals(toBillLines(items), dto.tip);
      const paid = dto.payments.reduce((acc, p) => acc + p.amountCents, 0);
      if (paid !== totals.totalCents) {
        throw new BusinessRuleError(
          `Los pagos (${formatPEN(paid)}) no cuadran con el total a cobrar (${formatPEN(totals.totalCents)})`,
          { expectedCents: totals.totalCents, receivedCents: paid },
        );
      }

      // Cada pago lleva su parte de propina (proporcional a lo que pagó) para el reporte por mozo.
      const tips = distributeProportionally(
        totals.tipCents,
        dto.payments.map((p) => p.amountCents),
      );
      for (const [i, p] of dto.payments.entries()) {
        await repos.payments.create({
          orderId,
          cashierId: actor.id,
          method: p.method,
          amountCents: p.amountCents,
          tipCents: tips[i],
          payerLabel: p.payerLabel ?? null,
        });
      }
      await repos.orders.update(orderId, { status: 'cerrada', tipCents: totals.tipCents, closedAt: new Date() });
      await repos.tables.setStatus(order.tableId, 'libre');
      return buildOrderDetail(repos, orderId);
    });

    const table = await this.uow.repos.tables.findById(detail.tableId);
    if (table) this.events.publish({ type: 'table.updated', table });
    this.events.publish({
      type: 'order.closed',
      orderId,
      tableId: detail.tableId,
      totalCents: detail.totals.totalCents,
    });
    return detail;
  }
}
