import type { PaymentMethod, Ticket } from '../../domain/entities';
import type { DateRange, ProductSalesRow, ReportRepository, WaiterSalesRow } from '../../application/ports';
import type { Queryable } from '../db/database';
import { toTicket } from './pg-order.repository';

/**
 * Reportes de ventas. Solo cuentan pedidos CERRADOS (cobrados) y se filtran por la
 * fecha de cierre: una venta "ocurre" cuando se cobra, no cuando se abre la mesa.
 * "Ventas" = consumo (subtotal con IGV); la propina se reporta aparte porque es del personal.
 */
const LINE_TOTAL = '(oi.unit_price_cents + oi.modifiers_cents) * oi.quantity';
const CLOSED_IN_RANGE = "o.status = 'cerrada' AND o.closed_at >= $1 AND o.closed_at <= $2";

export class PgReportRepository implements ReportRepository {
  constructor(private readonly db: Queryable) {}

  async salesByProduct(range: DateRange): Promise<ProductSalesRow[]> {
    const rows = await this.db.query<{
      product_id: number;
      product_name: string;
      category_name: string;
      quantity: number;
      revenue_cents: number;
    }>(
      // Se usa el nombre "congelado" del ítem (oi.product_name): el reporte refleja lo que se vendió.
      `SELECT oi.product_id, oi.product_name, c.name AS category_name,
              SUM(oi.quantity)::int AS quantity, SUM(${LINE_TOTAL})::int AS revenue_cents
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       JOIN products p ON p.id = oi.product_id
       JOIN categories c ON c.id = p.category_id
       WHERE ${CLOSED_IN_RANGE}
       GROUP BY oi.product_id, oi.product_name, c.name`,
      [range.from, range.to],
    );
    return rows
      .map((r) => ({
        productId: r.product_id,
        productName: r.product_name,
        categoryName: r.category_name,
        quantity: r.quantity,
        revenueCents: r.revenue_cents,
      }))
      .sort((a, b) => b.revenueCents - a.revenueCents || a.productName.localeCompare(b.productName));
  }

  async salesByWaiter(range: DateRange): Promise<WaiterSalesRow[]> {
    // Dos consultas separadas a propósito: unir ítems y propinas en una sola multiplicaría
    // la propina por cada ítem del pedido (error clásico de JOIN + SUM).
    const orders = await this.db.query<{ waiter_id: number; waiter_name: string; orders: number; tips_cents: number }>(
      `SELECT o.waiter_id, u.name AS waiter_name, COUNT(o.id)::int AS orders, SUM(o.tip_cents)::int AS tips_cents
       FROM orders o JOIN users u ON u.id = o.waiter_id
       WHERE ${CLOSED_IN_RANGE}
       GROUP BY o.waiter_id, u.name`,
      [range.from, range.to],
    );
    const revenue = await this.db.query<{ waiter_id: number; revenue_cents: number }>(
      `SELECT o.waiter_id, SUM(${LINE_TOTAL})::int AS revenue_cents
       FROM order_items oi JOIN orders o ON o.id = oi.order_id
       WHERE ${CLOSED_IN_RANGE}
       GROUP BY o.waiter_id`,
      [range.from, range.to],
    );
    const revenueByWaiter = new Map(revenue.map((r) => [r.waiter_id, r.revenue_cents]));
    return orders
      .map((r) => ({
        waiterId: r.waiter_id,
        waiterName: r.waiter_name,
        orders: r.orders,
        tipsCents: r.tips_cents ?? 0,
        revenueCents: revenueByWaiter.get(r.waiter_id) ?? 0,
      }))
      .sort((a, b) => b.revenueCents - a.revenueCents);
  }

  async closedOrdersSummary(range: DateRange) {
    const [orders] = await this.db.query<{ orders: number; tips_cents: number }>(
      `SELECT COUNT(o.id)::int AS orders, COALESCE(SUM(o.tip_cents), 0)::int AS tips_cents FROM orders o WHERE ${CLOSED_IN_RANGE}`,
      [range.from, range.to],
    );
    const [revenue] = await this.db.query<{ revenue_cents: number }>(
      `SELECT COALESCE(SUM(${LINE_TOTAL}), 0)::int AS revenue_cents
       FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE ${CLOSED_IN_RANGE}`,
      [range.from, range.to],
    );
    return { orders: orders?.orders ?? 0, tipsCents: orders?.tips_cents ?? 0, revenueCents: revenue?.revenue_cents ?? 0 };
  }

  async paymentsByMethod(range: DateRange): Promise<Array<{ method: PaymentMethod; amountCents: number }>> {
    const rows = await this.db.query<{ method: PaymentMethod; amount_cents: number }>(
      `SELECT method, SUM(amount_cents)::int AS amount_cents FROM payments
       WHERE created_at >= $1 AND created_at <= $2 GROUP BY method`,
      [range.from, range.to],
    );
    return rows.map((r) => ({ method: r.method, amountCents: r.amount_cents })).sort((a, b) => b.amountCents - a.amountCents);
  }

  async ticketsCreatedBetween(range: DateRange): Promise<Ticket[]> {
    const rows = await this.db.query<Parameters<typeof toTicket>[0]>(
      'SELECT * FROM tickets WHERE created_at >= $1 AND created_at <= $2',
      [range.from, range.to],
    );
    return rows.map(toTicket);
  }
}
