import type { Order, OrderItem, OrderStatus, SelectedModifier, Ticket, TicketStatus } from '../../domain/entities';
import { toPage, type Page, type PageQuery } from '../../application/pagination';
import type { KitchenTicketView, OrderRepository, OrderSummary } from '../../application/ports';
import type { Queryable } from '../db/database';
import { inPlaceholders, orderBy, WhereBuilder } from './sql-helpers';

interface OrderRow {
  id: number;
  table_id: number;
  table_number: number;
  waiter_id: number;
  waiter_name: string;
  status: OrderStatus;
  guests: number;
  tip_cents: number;
  opened_at: Date;
  closed_at: Date | null;
}

interface ItemRow {
  id: number;
  order_id: number;
  product_id: number;
  ticket_id: number | null;
  ticket_status: TicketStatus | null;
  product_name: string;
  unit_price_cents: number;
  quantity: number;
  modifiers: SelectedModifier[] | string;
  modifiers_cents: number;
  notes: string | null;
}

interface TicketRow {
  id: number;
  order_id: number;
  status: TicketStatus;
  created_at: Date;
  started_at: Date | null;
  ready_at: Date | null;
  delivered_at: Date | null;
}

const date = (d: Date | string | null) => (d ? new Date(d) : null);

const toOrder = (r: OrderRow): Order => ({
  id: r.id,
  tableId: r.table_id,
  tableNumber: r.table_number,
  waiterId: r.waiter_id,
  waiterName: r.waiter_name,
  status: r.status,
  guests: r.guests,
  tipCents: r.tip_cents,
  openedAt: new Date(r.opened_at),
  closedAt: date(r.closed_at),
});

const toItem = (r: ItemRow): OrderItem => ({
  id: r.id,
  orderId: r.order_id,
  productId: r.product_id,
  ticketId: r.ticket_id,
  productName: r.product_name,
  unitPriceCents: r.unit_price_cents,
  quantity: r.quantity,
  modifiers: typeof r.modifiers === 'string' ? JSON.parse(r.modifiers) : r.modifiers,
  modifiersCents: r.modifiers_cents,
  notes: r.notes,
  status: r.ticket_status ?? 'borrador',
});

export const toTicket = (r: TicketRow): Ticket => ({
  id: r.id,
  orderId: r.order_id,
  status: r.status,
  createdAt: new Date(r.created_at),
  startedAt: date(r.started_at),
  readyAt: date(r.ready_at),
  deliveredAt: date(r.delivered_at),
});

const SELECT_ORDER = `SELECT o.id, o.table_id, t.number AS table_number, o.waiter_id, u.name AS waiter_name,
    o.status, o.guests, o.tip_cents, o.opened_at, o.closed_at
  FROM orders o
  JOIN dining_tables t ON t.id = o.table_id
  JOIN users u ON u.id = o.waiter_id`;

const LINE_TOTAL = '(oi.unit_price_cents + oi.modifiers_cents) * oi.quantity';
const SORT = { openedAt: 'o.opened_at', closedAt: 'o.closed_at', table: 't.number' };

export class PgOrderRepository implements OrderRepository {
  constructor(private readonly db: Queryable) {}

  async create(data: { tableId: number; waiterId: number; guests: number }): Promise<number> {
    const [row] = await this.db.query<{ id: number }>(
      'INSERT INTO orders (table_id, waiter_id, guests) VALUES ($1, $2, $3) RETURNING id',
      [data.tableId, data.waiterId, data.guests],
    );
    return row.id;
  }

  async findById(id: number): Promise<Order | null> {
    const [row] = await this.db.query<OrderRow>(`${SELECT_ORDER} WHERE o.id = $1`, [id]);
    return row ? toOrder(row) : null;
  }

  async findOpenByTable(tableId: number): Promise<Order | null> {
    const [row] = await this.db.query<OrderRow>(`${SELECT_ORDER} WHERE o.table_id = $1 AND o.status = 'abierta'`, [tableId]);
    return row ? toOrder(row) : null;
  }

  async list(
    q: PageQuery & { status?: OrderStatus; tableId?: number; waiterId?: number; from?: Date; to?: Date },
  ): Promise<Page<OrderSummary>> {
    const where = new WhereBuilder()
      .add('o.status = ?', q.status)
      .add('o.table_id = ?', q.tableId)
      .add('o.waiter_id = ?', q.waiterId)
      .add('o.opened_at >= ?', q.from)
      .add('o.opened_at <= ?', q.to);
    const [{ total }] = await this.db.query<{ total: number }>(
      `SELECT COUNT(*)::int AS total FROM orders o ${where.toSql()}`,
      where.params,
    );
    const limit = where.next(q.pageSize);
    const offset = where.next((q.page - 1) * q.pageSize);
    const rows = await this.db.query<OrderRow>(
      `${SELECT_ORDER} ${where.toSql()}
       ${orderBy(SORT, q.sort, q.sort ? q.order : 'desc', 'o.opened_at', 'o.id')}
       LIMIT ${limit} OFFSET ${offset}`,
      where.params,
    );
    // Totales en una segunda consulta agregada solo para los pedidos de esta página
    // (evita un GROUP BY con muchas columnas sobre la consulta paginada).
    const totals = rows.length
      ? await this.db.query<{ order_id: number; subtotal_cents: number; item_count: number }>(
          `SELECT oi.order_id, SUM(${LINE_TOTAL})::int AS subtotal_cents, COUNT(oi.id)::int AS item_count
           FROM order_items oi WHERE oi.order_id IN (${inPlaceholders(rows.length)}) GROUP BY oi.order_id`,
          rows.map((r) => r.id),
        )
      : [];
    const byOrder = new Map(totals.map((t) => [t.order_id, t]));
    return toPage(
      rows.map((r) => ({
        ...toOrder(r),
        subtotalCents: byOrder.get(r.id)?.subtotal_cents ?? 0,
        itemCount: byOrder.get(r.id)?.item_count ?? 0,
      })),
      total,
      q,
    );
  }

  async update(id: number, patch: Partial<Pick<Order, 'status' | 'tipCents' | 'closedAt'>>): Promise<void> {
    const current = await this.findById(id);
    if (!current) return;
    const next = { ...current, ...patch };
    await this.db.query('UPDATE orders SET status = $2, tip_cents = $3, closed_at = $4 WHERE id = $1', [
      id,
      next.status,
      next.tipCents,
      next.closedAt,
    ]);
  }

  async listItems(orderId: number): Promise<OrderItem[]> {
    const rows = await this.db.query<ItemRow>(
      `SELECT oi.*, tk.status AS ticket_status
       FROM order_items oi LEFT JOIN tickets tk ON tk.id = oi.ticket_id
       WHERE oi.order_id = $1 ORDER BY oi.id ASC`,
      [orderId],
    );
    return rows.map(toItem);
  }

  async addItem(data: {
    orderId: number;
    productId: number;
    productName: string;
    unitPriceCents: number;
    quantity: number;
    modifiers: SelectedModifier[];
    notes: string | null;
  }): Promise<OrderItem> {
    const modifiersCents = data.modifiers.reduce((acc, m) => acc + m.priceCents, 0);
    const [row] = await this.db.query<{ id: number }>(
      `INSERT INTO order_items (order_id, product_id, product_name, unit_price_cents, quantity, modifiers, modifiers_cents, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [
        data.orderId,
        data.productId,
        data.productName,
        data.unitPriceCents,
        data.quantity,
        // `pg` serializa los arrays JS como arrays de Postgres, por eso se envía JSON explícito.
        JSON.stringify(data.modifiers),
        modifiersCents,
        data.notes,
      ],
    );
    return (await this.listItems(data.orderId)).find((i) => i.id === row.id)!;
  }

  async deleteItem(itemId: number): Promise<void> {
    await this.db.query('DELETE FROM order_items WHERE id = $1', [itemId]);
  }

  async createTicket(orderId: number, itemIds: number[]): Promise<Ticket> {
    const [row] = await this.db.query<TicketRow>('INSERT INTO tickets (order_id) VALUES ($1) RETURNING *', [orderId]);
    await this.db.query(
      `UPDATE order_items SET ticket_id = $1 WHERE order_id = $2 AND id IN (${inPlaceholders(itemIds.length, 3)})`,
      [row.id, orderId, ...itemIds],
    );
    return toTicket(row);
  }

  async listTickets(orderId: number): Promise<Ticket[]> {
    const rows = await this.db.query<TicketRow>('SELECT * FROM tickets WHERE order_id = $1 ORDER BY id ASC', [orderId]);
    return rows.map(toTicket);
  }

  async findTicket(id: number): Promise<Ticket | null> {
    const [row] = await this.db.query<TicketRow>('SELECT * FROM tickets WHERE id = $1', [id]);
    return row ? toTicket(row) : null;
  }

  async saveTicket(ticket: Ticket): Promise<void> {
    await this.db.query(
      'UPDATE tickets SET status = $2, started_at = $3, ready_at = $4, delivered_at = $5 WHERE id = $1',
      [ticket.id, ticket.status, ticket.startedAt, ticket.readyAt, ticket.deliveredAt],
    );
  }

  async findKitchenTicket(id: number): Promise<KitchenTicketView | null> {
    const [view] = await this.kitchenViews('tk.id = $1', [id]);
    return view ?? null;
  }

  listKitchenTickets(statuses: TicketStatus[]): Promise<KitchenTicketView[]> {
    if (statuses.length === 0) return Promise.resolve([]);
    return this.kitchenViews(`tk.status IN (${inPlaceholders(statuses.length)})`, statuses);
  }

  private async kitchenViews(condition: string, params: unknown[]): Promise<KitchenTicketView[]> {
    const rows = await this.db.query<TicketRow & { table_number: number; waiter_id: number; waiter_name: string }>(
      `SELECT tk.*, t.number AS table_number, o.waiter_id, u.name AS waiter_name
       FROM tickets tk
       JOIN orders o ON o.id = tk.order_id
       JOIN dining_tables t ON t.id = o.table_id
       JOIN users u ON u.id = o.waiter_id
       WHERE ${condition}
       ORDER BY tk.created_at ASC, tk.id ASC`,
      params,
    );
    if (rows.length === 0) return [];
    const items = await this.db.query<ItemRow>(
      `SELECT * FROM order_items WHERE ticket_id IN (${inPlaceholders(rows.length)}) ORDER BY id ASC`,
      rows.map((r) => r.id),
    );
    return rows.map((r) => ({
      ...toTicket(r),
      tableNumber: r.table_number,
      waiterId: r.waiter_id,
      waiterName: r.waiter_name,
      items: items
        .filter((i) => i.ticket_id === r.id)
        .map((i) => {
          const item = toItem({ ...i, ticket_status: r.status });
          return {
            id: item.id,
            productName: item.productName,
            quantity: item.quantity,
            modifiers: item.modifiers.map((m) => m.name),
            notes: item.notes,
          };
        }),
    }));
  }
}
