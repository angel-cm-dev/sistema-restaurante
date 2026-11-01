import type { TableStatus, TicketStatus } from '../../domain/entities';
import { ticketTimings } from '../../domain/kitchen';
import type { DateRange, UnitOfWork } from '../ports';

const average = (values: number[]) =>
  values.length === 0 ? null : Math.round(values.reduce((a, b) => a + b, 0) / values.length);

export class ReportService {
  constructor(private readonly uow: UnitOfWork) {}

  salesByProduct(range: DateRange) {
    return this.uow.repos.reports.salesByProduct(range);
  }

  salesByWaiter(range: DateRange) {
    return this.uow.repos.reports.salesByWaiter(range);
  }

  /** KPIs del día para el dashboard. "Hoy" se calcula con la zona horaria del servidor. */
  async dashboard(now: Date = new Date()) {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const range = { from: start, to: now };
    const { reports, tables, orders } = this.uow.repos;

    const [summary, byProduct, byMethod, allTables, activeTickets, todaysTickets] = await Promise.all([
      reports.closedOrdersSummary(range),
      reports.salesByProduct(range),
      reports.paymentsByMethod(range),
      tables.list(),
      orders.listKitchenTickets(['pendiente', 'preparando', 'listo']),
      reports.ticketsCreatedBetween(range),
    ]);

    const tablesByStatus: Record<TableStatus, number> = { libre: 0, ocupada: 0, por_cobrar: 0 };
    allTables.forEach((t) => (tablesByStatus[t.status] += 1));
    const ticketsByStatus: Partial<Record<TicketStatus, number>> = { pendiente: 0, preparando: 0, listo: 0 };
    activeTickets.forEach((t) => (ticketsByStatus[t.status] = (ticketsByStatus[t.status] ?? 0) + 1));

    const prepTimes = todaysTickets.map((t) => ticketTimings(t).prepSeconds).filter((s): s is number => s !== null);

    return {
      date: start.toISOString(),
      salesCents: summary.revenueCents,
      tipsCents: summary.tipsCents,
      closedOrders: summary.orders,
      averageTicketCents: summary.orders ? Math.round(summary.revenueCents / summary.orders) : 0,
      occupancy: {
        ...tablesByStatus,
        total: allTables.length,
        percent: allTables.length
          ? Math.round(((tablesByStatus.ocupada + tablesByStatus.por_cobrar) / allTables.length) * 100)
          : 0,
      },
      kitchen: { ...ticketsByStatus, averagePrepSeconds: average(prepTimes) },
      topProducts: byProduct.slice(0, 5),
      paymentsByMethod: byMethod,
    };
  }
}
