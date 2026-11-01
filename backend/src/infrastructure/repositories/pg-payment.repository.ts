import type { Payment, PaymentMethod } from '../../domain/entities';
import type { PaymentRepository } from '../../application/ports';
import type { Queryable } from '../db/database';

interface PaymentRow {
  id: number;
  order_id: number;
  cashier_id: number;
  method: PaymentMethod;
  amount_cents: number;
  tip_cents: number;
  payer_label: string | null;
  created_at: Date;
}

const toPayment = (r: PaymentRow): Payment => ({
  id: r.id,
  orderId: r.order_id,
  cashierId: r.cashier_id,
  method: r.method,
  amountCents: r.amount_cents,
  tipCents: r.tip_cents,
  payerLabel: r.payer_label,
  createdAt: new Date(r.created_at),
});

export class PgPaymentRepository implements PaymentRepository {
  constructor(private readonly db: Queryable) {}

  async create(data: Omit<Payment, 'id' | 'createdAt'>): Promise<Payment> {
    const [row] = await this.db.query<PaymentRow>(
      `INSERT INTO payments (order_id, cashier_id, method, amount_cents, tip_cents, payer_label)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [data.orderId, data.cashierId, data.method, data.amountCents, data.tipCents, data.payerLabel],
    );
    return toPayment(row);
  }

  async listByOrder(orderId: number): Promise<Payment[]> {
    const rows = await this.db.query<PaymentRow>('SELECT * FROM payments WHERE order_id = $1 ORDER BY id ASC', [orderId]);
    return rows.map(toPayment);
  }
}
