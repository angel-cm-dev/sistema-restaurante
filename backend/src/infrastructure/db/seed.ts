/**
 * Datos de ejemplo 100% FICTICIOS para la demo ("La Huerta Limeña", restaurante inventado).
 * Es idempotente: si ya hay usuarios, no hace nada.
 */
import type { Logger } from 'pino';
import type { PasswordHasher } from '../../application/ports';
import type { Database, Queryable } from './database';

export const DEMO_PASSWORD = 'Demo123!';

export const DEMO_USERS = [
  { name: 'Ana Admin', email: 'admin@demo.pe', role: 'admin' },
  { name: 'Mario Mozo', email: 'mozo@demo.pe', role: 'mozo' },
  { name: 'Lucía Mesera', email: 'mozo2@demo.pe', role: 'mozo' },
  { name: 'Carlos Cocina', email: 'cocina@demo.pe', role: 'cocina' },
  { name: 'Rosa Caja', email: 'caja@demo.pe', role: 'caja' },
] as const;

const CATEGORIES = ['Entradas', 'Marinos', 'Fondos', 'Bebidas', 'Postres'];

/** [categoría (índice), nombre, descripción, precio en céntimos, modificadores] */
const PRODUCTS: Array<[number, string, string, number, Array<[string, number]>]> = [
  [0, 'Causa limeña', 'Papa amarilla prensada rellena de pollo y palta', 2200, [['Sin palta', 0], ['Rellena de atún', 300]]],
  [0, 'Papa a la huancaína', 'Papa sancochada con crema de ají amarillo', 1800, [['Extra crema', 300]]],
  [0, 'Anticuchos', 'Brochetas de corazón con papa dorada y choclo', 2600, [['Picante extra', 0], ['Porción doble', 1800]]],
  [1, 'Ceviche clásico', 'Pescado fresco del día en leche de tigre', 3800, [['Extra leche de tigre', 500], ['Picante bajo', 0], ['Sin cebolla', 0]]],
  [1, 'Arroz con mariscos', 'Arroz norteño con mariscos y salsa criolla', 4500, [['Sin calamar', 0]]],
  [1, 'Jalea mixta', 'Mariscos fritos con yuca y zarza criolla', 4800, []],
  [2, 'Lomo saltado', 'Lomo fino salteado al wok con papas fritas', 4200, [['Término medio', 0], ['Bien cocido', 0], ['Con huevo', 300]]],
  [2, 'Ají de gallina', 'Pechuga deshilachada en crema de ají amarillo', 3200, [['Sin aceituna', 0]]],
  [2, 'Seco de res', 'Guiso de res al culantro con frejoles', 3600, [['Con arroz extra', 400]]],
  [3, 'Chicha morada (jarra)', 'Bebida de maíz morado con frutas', 1500, [['Sin azúcar', 0]]],
  [3, 'Limonada frozen', 'Limonada helada con hierbabuena', 1200, [['Sin hielo', 0]]],
  [3, 'Agua mineral', 'Botella 625 ml', 600, [['Con gas', 0], ['Helada', 0]]],
  [4, 'Suspiro limeño', 'Manjar blanco con merengue al oporto', 1400, []],
  [4, 'Picarones', 'Masa de zapallo frita con miel de chancaca', 1600, [['Miel extra', 200]]],
];

/** Generador pseudoaleatorio con semilla: el seed produce SIEMPRE los mismos datos. */
function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

export async function seedDemoData(db: Database, hasher: PasswordHasher, logger?: Logger): Promise<boolean> {
  const [{ count }] = await db.query<{ count: number }>('SELECT COUNT(*)::int AS count FROM users');
  if (count > 0) {
    logger?.info('seed omitido: la base ya tiene datos');
    return false;
  }

  await db.transaction(async (tx) => {
    const passwordHash = await hasher.hash(DEMO_PASSWORD);
    const userIds: Record<string, number> = {};
    for (const u of DEMO_USERS) {
      const [row] = await tx.query<{ id: number }>(
        'INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id',
        [u.name, u.email, passwordHash, u.role],
      );
      userIds[u.email] = row.id;
    }

    // Plano: 12 mesas en una grilla de 4 columnas (Salón) + 2 en Terraza.
    const tableIds: number[] = [];
    for (let n = 1; n <= 12; n++) {
      const zone = n <= 10 ? 'Salón' : 'Terraza';
      const [row] = await tx.query<{ id: number }>(
        'INSERT INTO dining_tables (number, seats, zone, pos_x, pos_y) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [n, n % 3 === 0 ? 6 : n % 2 === 0 ? 4 : 2, zone, (n - 1) % 4, Math.floor((n - 1) / 4)],
      );
      tableIds.push(row.id);
    }

    const categoryIds: number[] = [];
    for (const [i, name] of CATEGORIES.entries()) {
      const [row] = await tx.query<{ id: number }>('INSERT INTO categories (name, sort_order) VALUES ($1, $2) RETURNING id', [name, i]);
      categoryIds.push(row.id);
    }

    const products: Array<{ id: number; name: string; price: number }> = [];
    for (const [cat, name, description, price, mods] of PRODUCTS) {
      const [row] = await tx.query<{ id: number }>(
        'INSERT INTO products (category_id, name, description, price_cents) VALUES ($1, $2, $3, $4) RETURNING id',
        [categoryIds[cat], name, description, price],
      );
      for (const [modName, modPrice] of mods) {
        await tx.query('INSERT INTO modifiers (product_id, name, price_cents) VALUES ($1, $2, $3)', [row.id, modName, modPrice]);
      }
      products.push({ id: row.id, name, price });
    }

    await seedHistory(tx, {
      tableIds,
      products,
      waiterIds: [userIds['mozo@demo.pe'], userIds['mozo2@demo.pe']],
      cashierId: userIds['caja@demo.pe'],
    });
  });
  logger?.info('seed de datos demo aplicado');
  return true;
}

/** Pedidos cerrados de los últimos 7 días para que el dashboard y los reportes tengan datos. */
async function seedHistory(
  tx: Queryable,
  ctx: { tableIds: number[]; products: Array<{ id: number; name: string; price: number }>; waiterIds: number[]; cashierId: number },
) {
  const rand = seededRandom(2026);
  const methods = ['efectivo', 'tarjeta', 'yape_plin'];
  const now = Date.now();
  for (let day = 6; day >= 0; day--) {
    const ordersToday = 3 + Math.floor(rand() * 4);
    for (let k = 0; k < ordersToday; k++) {
      // Hoy: pedidos de las últimas horas; días anteriores: entre 12:00 y 22:00.
      const openedAt = new Date(
        day === 0 ? now - (k + 1) * 50 * 60 * 1000 : now - day * 86400000 - Math.floor(rand() * 10) * 3600 * 1000,
      );
      const closedAt = new Date(openedAt.getTime() + 55 * 60 * 1000);
      const waiterId = ctx.waiterIds[Math.floor(rand() * ctx.waiterIds.length)];
      const tableId = ctx.tableIds[Math.floor(rand() * ctx.tableIds.length)];
      const [order] = await tx.query<{ id: number }>(
        `INSERT INTO orders (table_id, waiter_id, status, guests, opened_at, closed_at)
         VALUES ($1, $2, 'cerrada', $3, $4, $5) RETURNING id`,
        [tableId, waiterId, 1 + Math.floor(rand() * 4), openedAt, closedAt],
      );
      const createdAt = new Date(openedAt.getTime() + 5 * 60 * 1000);
      const startedAt = new Date(createdAt.getTime() + (2 + Math.floor(rand() * 5)) * 60 * 1000);
      const readyAt = new Date(startedAt.getTime() + (8 + Math.floor(rand() * 12)) * 60 * 1000);
      const deliveredAt = new Date(readyAt.getTime() + 2 * 60 * 1000);
      const [ticket] = await tx.query<{ id: number }>(
        `INSERT INTO tickets (order_id, status, created_at, started_at, ready_at, delivered_at)
         VALUES ($1, 'entregado', $2, $3, $4, $5) RETURNING id`,
        [order.id, createdAt, startedAt, readyAt, deliveredAt],
      );
      let subtotal = 0;
      const lines = 2 + Math.floor(rand() * 3);
      for (let l = 0; l < lines; l++) {
        const p = ctx.products[Math.floor(rand() * ctx.products.length)];
        const qty = 1 + Math.floor(rand() * 2);
        subtotal += p.price * qty;
        await tx.query(
          `INSERT INTO order_items (order_id, product_id, ticket_id, product_name, unit_price_cents, quantity, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [order.id, p.id, ticket.id, p.name, p.price, qty, openedAt],
        );
      }
      const tip = Math.round(subtotal * 0.1);
      await tx.query('UPDATE orders SET tip_cents = $2 WHERE id = $1', [order.id, tip]);
      await tx.query(
        `INSERT INTO payments (order_id, cashier_id, method, amount_cents, tip_cents, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [order.id, ctx.cashierId, methods[Math.floor(rand() * methods.length)], subtotal + tip, tip, closedAt],
      );
    }
  }
}
