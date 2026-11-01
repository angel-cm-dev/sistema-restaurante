import type { PublicUser, Role, User } from '../../domain/entities';
import { toPage, type Page, type PageQuery } from '../../application/pagination';
import type { UserRepository } from '../../application/ports';
import type { Queryable } from '../db/database';
import { likePattern, orderBy, WhereBuilder } from './sql-helpers';

interface UserRow {
  id: number;
  name: string;
  email: string;
  password_hash: string;
  role: Role;
  active: boolean;
  created_at: Date;
}

const toUser = (r: UserRow): User => ({
  id: r.id,
  name: r.name,
  email: r.email,
  passwordHash: r.password_hash,
  role: r.role,
  active: r.active,
  createdAt: new Date(r.created_at),
});

const SORT = { name: 'name', email: 'email', role: 'role', createdAt: 'created_at' };

export class PgUserRepository implements UserRepository {
  constructor(private readonly db: Queryable) {}

  async findByEmail(email: string): Promise<User | null> {
    const [row] = await this.db.query<UserRow>('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
    return row ? toUser(row) : null;
  }

  async findById(id: number): Promise<User | null> {
    const [row] = await this.db.query<UserRow>('SELECT * FROM users WHERE id = $1', [id]);
    return row ? toUser(row) : null;
  }

  async list(q: PageQuery & { role?: Role; active?: boolean }): Promise<Page<PublicUser>> {
    const where = new WhereBuilder()
      .add('(name ILIKE ? OR email ILIKE ?)', likePattern(q.search))
      .add('role = ?', q.role)
      .add('active = ?', q.active);
    const [{ total }] = await this.db.query<{ total: number }>(
      `SELECT COUNT(*)::int AS total FROM users ${where.toSql()}`,
      where.params,
    );
    const limit = where.next(q.pageSize);
    const offset = where.next((q.page - 1) * q.pageSize);
    const rows = await this.db.query<UserRow>(
      `SELECT * FROM users ${where.toSql()} ${orderBy(SORT, q.sort, q.order, 'name', 'id')} LIMIT ${limit} OFFSET ${offset}`,
      where.params,
    );
    return toPage(
      rows.map((r) => {
        const { passwordHash: _omit, ...pub } = toUser(r);
        return pub;
      }),
      total,
      q,
    );
  }

  async create(data: { name: string; email: string; passwordHash: string; role: Role }): Promise<User> {
    const [row] = await this.db.query<UserRow>(
      'INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING *',
      [data.name, data.email.toLowerCase(), data.passwordHash, data.role],
    );
    return toUser(row);
  }

  async update(id: number, patch: Partial<Pick<User, 'name' | 'role' | 'active' | 'passwordHash'>>): Promise<User | null> {
    const current = await this.findById(id);
    if (!current) return null;
    const next = { ...current, ...patch };
    const [row] = await this.db.query<UserRow>(
      'UPDATE users SET name = $2, role = $3, active = $4, password_hash = $5 WHERE id = $1 RETURNING *',
      [id, next.name, next.role, next.active, next.passwordHash],
    );
    return toUser(row);
  }
}
