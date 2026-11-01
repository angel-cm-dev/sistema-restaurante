import type { DiningTable, TableStatus } from '../../domain/entities';
import type { TableRepository } from '../../application/ports';
import type { Queryable } from '../db/database';
import { WhereBuilder } from './sql-helpers';

interface TableRow {
  id: number;
  number: number;
  seats: number;
  zone: string;
  status: TableStatus;
  pos_x: number;
  pos_y: number;
  current_order_id: number | null;
}

const toTable = (r: TableRow): DiningTable => ({
  id: r.id,
  number: r.number,
  seats: r.seats,
  zone: r.zone,
  status: r.status,
  posX: r.pos_x,
  posY: r.pos_y,
  currentOrderId: r.current_order_id ?? null,
});

const SELECT = `SELECT t.id, t.number, t.seats, t.zone, t.status, t.pos_x, t.pos_y, o.id AS current_order_id
  FROM dining_tables t
  LEFT JOIN orders o ON o.table_id = t.id AND o.status = 'abierta'`;

export class PgTableRepository implements TableRepository {
  constructor(private readonly db: Queryable) {}

  async list(filter: { status?: TableStatus; zone?: string } = {}): Promise<DiningTable[]> {
    const where = new WhereBuilder().add('t.status = ?', filter.status).add('t.zone = ?', filter.zone);
    const rows = await this.db.query<TableRow>(`${SELECT} ${where.toSql()} ORDER BY t.number ASC`, where.params);
    return rows.map(toTable);
  }

  async findById(id: number): Promise<DiningTable | null> {
    const [row] = await this.db.query<TableRow>(`${SELECT} WHERE t.id = $1`, [id]);
    return row ? toTable(row) : null;
  }

  async create(data: Omit<DiningTable, 'id' | 'status' | 'currentOrderId'>): Promise<DiningTable> {
    const [row] = await this.db.query<{ id: number }>(
      'INSERT INTO dining_tables (number, seats, zone, pos_x, pos_y) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [data.number, data.seats, data.zone, data.posX, data.posY],
    );
    return (await this.findById(row.id))!;
  }

  async update(id: number, patch: Partial<Omit<DiningTable, 'id' | 'status' | 'currentOrderId'>>): Promise<DiningTable | null> {
    const current = await this.findById(id);
    if (!current) return null;
    const next = { ...current, ...patch };
    await this.db.query('UPDATE dining_tables SET number = $2, seats = $3, zone = $4, pos_x = $5, pos_y = $6 WHERE id = $1', [
      id,
      next.number,
      next.seats,
      next.zone,
      next.posX,
      next.posY,
    ]);
    return this.findById(id);
  }

  async setStatus(id: number, status: TableStatus): Promise<void> {
    await this.db.query('UPDATE dining_tables SET status = $2 WHERE id = $1', [id, status]);
  }
}
