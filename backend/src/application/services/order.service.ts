import { calculateTotals, lineTotal, splitBill, type BillLine, type BillTotals, type SplitShare } from '../../domain/billing';
import type { Order, OrderItem, OrderStatus, Payment, Ticket } from '../../domain/entities';
import { BusinessRuleError, ForbiddenError, NotFoundError, ValidationError } from '../../domain/errors';
import { ticketTimings, type TicketTimings } from '../../domain/kitchen';
import { assertTableTransition } from '../../domain/table';
import type { AddItemDto, OpenOrderDto, SplitDto } from '../dtos';
import type { Page, PageQuery } from '../pagination';
import type { Actor, EventPublisher, OrderSummary, Repositories, UnitOfWork } from '../ports';

export interface OrderDetail extends Order {
  items: Array<OrderItem & { lineTotalCents: number }>;
  tickets: Array<Ticket & { timings: TicketTimings }>;
  totals: BillTotals;
  payments: Payment[];
  paidCents: number;
}

export const toBillLines = (items: OrderItem[]): BillLine[] =>
  items.map((i) => ({
    itemId: i.id,
    unitPriceCents: i.unitPriceCents,
    modifiersCents: i.modifiersCents,
    quantity: i.quantity,
  }));

/** Arma la vista completa del pedido (ítems, comandas, totales y pagos). */
export async function buildOrderDetail(repos: Repositories, orderId: number): Promise<OrderDetail> {
  const order = await repos.orders.findById(orderId);
  if (!order) throw new NotFoundError('Pedido', orderId);
  const [items, tickets, payments] = await Promise.all([
    repos.orders.listItems(orderId),
    repos.orders.listTickets(orderId),
    repos.payments.listByOrder(orderId),
  ]);
  const totals = calculateTotals(toBillLines(items), { type: 'amount', value: order.tipCents });
  return {
    ...order,
    items: items.map((i) => ({ ...i, lineTotalCents: lineTotal(toBillLines([i])[0]) })),
    tickets: tickets.map((t) => ({ ...t, timings: ticketTimings(t) })),
    totals,
    payments,
    paidCents: payments.reduce((acc, p) => acc + p.amountCents, 0),
  };
}

export async function requireOpenOrder(repos: Repositories, orderId: number): Promise<Order> {
  const order = await repos.orders.findById(orderId);
  if (!order) throw new NotFoundError('Pedido', orderId);
  if (order.status !== 'abierta') throw new BusinessRuleError(`El pedido ${orderId} está ${order.status}`);
  return order;
}

/**
 * Un mozo solo modifica SUS pedidos (responsabilidad sobre la mesa y sus propinas);
 * el admin puede intervenir cualquiera.
 */
function assertCanModify(order: Order, actor: Actor): void {
  if (actor.role === 'admin') return;
  if (actor.role === 'mozo' && order.waiterId === actor.id) return;
  throw new ForbiddenError('Solo el mozo que atiende la mesa (o un admin) puede modificar este pedido');
}

export class OrderService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly events: EventPublisher,
  ) {}

  list(
    query: PageQuery & { status?: OrderStatus; tableId?: number; waiterId?: number; from?: Date; to?: Date },
  ): Promise<Page<OrderSummary>> {
    return this.uow.repos.orders.list(query);
  }

  get(orderId: number): Promise<OrderDetail> {
    return buildOrderDetail(this.uow.repos, orderId);
  }

  async open(dto: OpenOrderDto, actor: Actor): Promise<OrderDetail> {
    const detail = await this.uow.transaction(async (repos) => {
      const table = await repos.tables.findById(dto.tableId);
      if (!table) throw new NotFoundError('Mesa', dto.tableId);
      if (table.status !== 'libre' || (await repos.orders.findOpenByTable(table.id))) {
        throw new BusinessRuleError(`La mesa ${table.number} no está libre`);
      }
      if (dto.guests > table.seats + 4) {
        // Se tolera juntar sillas, pero no exceder demasiado la capacidad de la mesa.
        throw new BusinessRuleError(`La mesa ${table.number} admite como máximo ${table.seats + 4} comensales`);
      }
      assertTableTransition(table.status, 'ocupada');
      const orderId = await repos.orders.create({ tableId: table.id, waiterId: actor.id, guests: dto.guests });
      await repos.tables.setStatus(table.id, 'ocupada');
      return buildOrderDetail(repos, orderId);
    });
    await this.publishTable(detail.tableId);
    this.events.publish({ type: 'order.updated', orderId: detail.id, tableId: detail.tableId });
    return detail;
  }

  async addItem(orderId: number, dto: AddItemDto, actor: Actor): Promise<OrderDetail> {
    const { detail, tableChanged } = await this.uow.transaction(async (repos) => {
      const order = await requireOpenOrder(repos, orderId);
      assertCanModify(order, actor);
      const product = await repos.menu.findProduct(dto.productId);
      if (!product) throw new NotFoundError('Producto', dto.productId);
      if (!product.active) throw new BusinessRuleError(`"${product.name}" no está disponible hoy`);

      const available = new Map((product.modifiers ?? []).map((m) => [m.id, m]));
      const chosen = [...new Set(dto.modifierIds)].map((modId) => {
        const mod = available.get(modId);
        if (!mod) throw new ValidationError(`El modificador ${modId} no pertenece a "${product.name}"`);
        return { id: mod.id, name: mod.name, priceCents: mod.priceCents };
      });

      // Se guarda una "foto" del nombre y precio: si mañana cambia la carta,
      // la cuenta de hoy no debe cambiar.
      await repos.orders.addItem({
        orderId,
        productId: product.id,
        productName: product.name,
        unitPriceCents: product.priceCents,
        quantity: dto.quantity,
        modifiers: chosen,
        notes: dto.notes || null,
      });

      // Si la mesa ya había pedido la cuenta y piden algo más, vuelve a "ocupada".
      const table = await repos.tables.findById(order.tableId);
      let tableChanged = false;
      if (table?.status === 'por_cobrar') {
        assertTableTransition(table.status, 'ocupada');
        await repos.tables.setStatus(table.id, 'ocupada');
        tableChanged = true;
      }
      return { detail: await buildOrderDetail(repos, orderId), tableChanged };
    });
    if (tableChanged) await this.publishTable(detail.tableId);
    this.events.publish({ type: 'order.updated', orderId, tableId: detail.tableId });
    return detail;
  }

  async removeItem(orderId: number, itemId: number, actor: Actor): Promise<OrderDetail> {
    const detail = await this.uow.transaction(async (repos) => {
      const order = await requireOpenOrder(repos, orderId);
      assertCanModify(order, actor);
      const item = (await repos.orders.listItems(orderId)).find((i) => i.id === itemId);
      if (!item) throw new NotFoundError('Ítem', itemId);
      if (item.ticketId !== null) {
        // Lo que ya se envió a cocina se está preparando: borrarlo descuadraría el KDS e inventario.
        throw new BusinessRuleError('No se puede eliminar un ítem ya enviado a cocina');
      }
      await repos.orders.deleteItem(itemId);
      return buildOrderDetail(repos, orderId);
    });
    this.events.publish({ type: 'order.updated', orderId, tableId: detail.tableId });
    return detail;
  }

  /** Agrupa todos los ítems en borrador en una nueva comanda y la envía a cocina. */
  async sendToKitchen(orderId: number, actor: Actor): Promise<OrderDetail> {
    const { detail, ticketId } = await this.uow.transaction(async (repos) => {
      const order = await requireOpenOrder(repos, orderId);
      assertCanModify(order, actor);
      const drafts = (await repos.orders.listItems(orderId)).filter((i) => i.ticketId === null);
      if (drafts.length === 0) throw new BusinessRuleError('No hay ítems nuevos para enviar a cocina');
      const ticket = await repos.orders.createTicket(
        orderId,
        drafts.map((d) => d.id),
      );
      return { detail: await buildOrderDetail(repos, orderId), ticketId: ticket.id };
    });
    const view = await this.uow.repos.orders.findKitchenTicket(ticketId);
    if (view) this.events.publish({ type: 'ticket.created', ticket: view });
    this.events.publish({ type: 'order.updated', orderId, tableId: detail.tableId });
    return detail;
  }

  async requestBill(orderId: number, actor: Actor): Promise<OrderDetail> {
    const detail = await this.uow.transaction(async (repos) => {
      const order = await requireOpenOrder(repos, orderId);
      if (actor.role === 'mozo') assertCanModify(order, actor);
      const items = await repos.orders.listItems(orderId);
      if (items.length === 0) throw new BusinessRuleError('El pedido no tiene consumos');
      if (items.some((i) => i.ticketId === null)) {
        throw new BusinessRuleError('Hay ítems sin enviar a cocina: envíalos o elimínalos antes de pedir la cuenta');
      }
      const table = await repos.tables.findById(order.tableId);
      if (table && table.status !== 'por_cobrar') {
        assertTableTransition(table.status, 'por_cobrar');
        await repos.tables.setStatus(table.id, 'por_cobrar');
      }
      return buildOrderDetail(repos, orderId);
    });
    await this.publishTable(detail.tableId);
    this.events.publish({ type: 'order.updated', orderId, tableId: detail.tableId });
    return detail;
  }

  async cancel(orderId: number, actor: Actor): Promise<OrderDetail> {
    const detail = await this.uow.transaction(async (repos) => {
      const order = await requireOpenOrder(repos, orderId);
      assertCanModify(order, actor);
      const tickets = await repos.orders.listTickets(orderId);
      // Si cocina ya recibió comandas, anular implica merma: solo el admin lo autoriza.
      if (tickets.length > 0 && actor.role !== 'admin') {
        throw new ForbiddenError('El pedido ya tiene comandas en cocina: solo un admin puede anularlo');
      }
      await repos.orders.update(orderId, { status: 'cancelada', closedAt: new Date() });
      await repos.tables.setStatus(order.tableId, 'libre');
      return buildOrderDetail(repos, orderId);
    });
    await this.publishTable(detail.tableId);
    this.events.publish({ type: 'order.updated', orderId, tableId: detail.tableId });
    return detail;
  }

  /** Vista previa de división de cuenta (no guarda nada): la usa caja antes de cobrar. */
  async splitPreview(orderId: number, dto: SplitDto): Promise<{ totals: BillTotals; shares: SplitShare[] }> {
    const order = await this.uow.repos.orders.findById(orderId);
    if (!order) throw new NotFoundError('Pedido', orderId);
    const lines = toBillLines(await this.uow.repos.orders.listItems(orderId));
    if (lines.length === 0) throw new BusinessRuleError('El pedido no tiene consumos');
    return { totals: calculateTotals(lines, dto.tip), shares: splitBill(lines, dto.tip, dto.split) };
  }

  private async publishTable(tableId: number) {
    const table = await this.uow.repos.tables.findById(tableId);
    if (table) this.events.publish({ type: 'table.updated', table });
  }
}
