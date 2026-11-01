import type { Category, Modifier, Product } from '../../domain/entities';
import { toPage, type Page, type PageQuery } from '../../application/pagination';
import type { MenuRepository, NewModifier } from '../../application/ports';
import type { Queryable } from '../db/database';
import { inPlaceholders, likePattern, orderBy, WhereBuilder } from './sql-helpers';

interface ProductRow {
  id: number;
  category_id: number;
  category_name: string;
  name: string;
  description: string;
  price_cents: number;
  active: boolean;
}

interface ModifierRow {
  id: number;
  product_id: number;
  name: string;
  price_cents: number;
}

const toModifier = (r: ModifierRow): Modifier => ({
  id: r.id,
  productId: r.product_id,
  name: r.name,
  priceCents: r.price_cents,
});

const toProduct = (r: ProductRow, modifiers: Modifier[]): Product => ({
  id: r.id,
  categoryId: r.category_id,
  categoryName: r.category_name,
  name: r.name,
  description: r.description,
  priceCents: r.price_cents,
  active: r.active,
  modifiers,
});

const SELECT_PRODUCT = `SELECT p.id, p.category_id, c.name AS category_name, p.name, p.description, p.price_cents, p.active
  FROM products p JOIN categories c ON c.id = p.category_id`;

const SORT = { name: 'p.name', priceCents: 'p.price_cents', category: 'c.sort_order' };

export class PgMenuRepository implements MenuRepository {
  constructor(private readonly db: Queryable) {}

  async listCategories(): Promise<Array<Category & { productCount: number }>> {
    const rows = await this.db.query<{ id: number; name: string; sort_order: number; product_count: number }>(
      `SELECT c.id, c.name, c.sort_order, COUNT(p.id)::int AS product_count
       FROM categories c LEFT JOIN products p ON p.category_id = c.id
       GROUP BY c.id, c.name, c.sort_order
       ORDER BY c.sort_order ASC, c.name ASC`,
    );
    return rows.map((r) => ({ id: r.id, name: r.name, sortOrder: r.sort_order, productCount: r.product_count }));
  }

  async findCategory(id: number): Promise<Category | null> {
    const [r] = await this.db.query<{ id: number; name: string; sort_order: number }>(
      'SELECT * FROM categories WHERE id = $1',
      [id],
    );
    return r ? { id: r.id, name: r.name, sortOrder: r.sort_order } : null;
  }

  async createCategory(data: { name: string; sortOrder: number }): Promise<Category> {
    const [r] = await this.db.query<{ id: number; name: string; sort_order: number }>(
      'INSERT INTO categories (name, sort_order) VALUES ($1, $2) RETURNING *',
      [data.name, data.sortOrder],
    );
    return { id: r.id, name: r.name, sortOrder: r.sort_order };
  }

  async listProducts(q: PageQuery & { categoryId?: number; active?: boolean }): Promise<Page<Product>> {
    const where = new WhereBuilder()
      .add('(p.name ILIKE ? OR p.description ILIKE ?)', likePattern(q.search))
      .add('p.category_id = ?', q.categoryId)
      .add('p.active = ?', q.active);
    const [{ total }] = await this.db.query<{ total: number }>(
      `SELECT COUNT(*)::int AS total FROM products p JOIN categories c ON c.id = p.category_id ${where.toSql()}`,
      where.params,
    );
    const limit = where.next(q.pageSize);
    const offset = where.next((q.page - 1) * q.pageSize);
    const rows = await this.db.query<ProductRow>(
      `${SELECT_PRODUCT} ${where.toSql()} ${orderBy(SORT, q.sort, q.order, 'c.sort_order', 'p.id')} LIMIT ${limit} OFFSET ${offset}`,
      where.params,
    );
    const modifiers = await this.modifiersFor(rows.map((r) => r.id));
    return toPage(
      rows.map((r) => toProduct(r, modifiers.filter((m) => m.productId === r.id))),
      total,
      q,
    );
  }

  async findProduct(id: number): Promise<Product | null> {
    const [row] = await this.db.query<ProductRow>(`${SELECT_PRODUCT} WHERE p.id = $1`, [id]);
    return row ? toProduct(row, await this.modifiersFor([id])) : null;
  }

  async createProduct(data: Omit<Product, 'id' | 'categoryName' | 'modifiers'>, modifiers: NewModifier[]): Promise<Product> {
    const [row] = await this.db.query<{ id: number }>(
      'INSERT INTO products (category_id, name, description, price_cents, active) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [data.categoryId, data.name, data.description, data.priceCents, data.active],
    );
    await this.replaceModifiers(row.id, modifiers);
    return (await this.findProduct(row.id))!;
  }

  async updateProduct(id: number, patch: Partial<Omit<Product, 'id' | 'categoryName' | 'modifiers'>>): Promise<Product | null> {
    const current = await this.findProduct(id);
    if (!current) return null;
    const next = { ...current, ...patch };
    await this.db.query(
      'UPDATE products SET category_id = $2, name = $3, description = $4, price_cents = $5, active = $6 WHERE id = $1',
      [id, next.categoryId, next.name, next.description, next.priceCents, next.active],
    );
    return this.findProduct(id);
  }

  async replaceModifiers(productId: number, modifiers: NewModifier[]): Promise<Modifier[]> {
    await this.db.query('DELETE FROM modifiers WHERE product_id = $1', [productId]);
    for (const m of modifiers) {
      await this.db.query('INSERT INTO modifiers (product_id, name, price_cents) VALUES ($1, $2, $3)', [
        productId,
        m.name,
        m.priceCents,
      ]);
    }
    return this.modifiersFor([productId]);
  }

  private async modifiersFor(productIds: number[]): Promise<Modifier[]> {
    if (productIds.length === 0) return [];
    const rows = await this.db.query<ModifierRow>(
      `SELECT * FROM modifiers WHERE product_id IN (${inPlaceholders(productIds.length)}) ORDER BY product_id ASC, id ASC`,
      productIds,
    );
    return rows.map(toModifier);
  }
}
