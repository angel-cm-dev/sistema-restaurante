/**
 * Migraciones versionadas. Se guardan como código (no .sql sueltos) para que viajen
 * dentro del build sin pasos de copia. Cada una se aplica una sola vez y queda
 * registrada en `schema_migrations`.
 *
 * Regla: NUNCA editar una migración ya publicada; crear una nueva.
 */
export interface Migration {
  version: number;
  name: string;
  sql: string;
}

export const migrations: Migration[] = [
  {
    version: 1,
    name: 'esquema_inicial',
    sql: `
CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(120) NOT NULL,
  email         VARCHAR(160) NOT NULL UNIQUE,
  password_hash VARCHAR(200) NOT NULL,
  role          VARCHAR(20)  NOT NULL CHECK (role IN ('admin', 'mozo', 'cocina', 'caja')),
  active        BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE dining_tables (
  id     SERIAL PRIMARY KEY,
  number INTEGER     NOT NULL UNIQUE,
  seats  INTEGER     NOT NULL CHECK (seats > 0),
  zone   VARCHAR(40) NOT NULL DEFAULT 'Salón',
  status VARCHAR(20) NOT NULL DEFAULT 'libre' CHECK (status IN ('libre', 'ocupada', 'por_cobrar')),
  pos_x  INTEGER     NOT NULL DEFAULT 0,
  pos_y  INTEGER     NOT NULL DEFAULT 0
);

CREATE TABLE categories (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(60) NOT NULL UNIQUE,
  sort_order INTEGER     NOT NULL DEFAULT 0
);

CREATE TABLE products (
  id          SERIAL PRIMARY KEY,
  category_id INTEGER      NOT NULL REFERENCES categories(id),
  name        VARCHAR(120) NOT NULL,
  description TEXT         NOT NULL DEFAULT '',
  price_cents INTEGER      NOT NULL CHECK (price_cents >= 0),
  active      BOOLEAN      NOT NULL DEFAULT TRUE
);
CREATE INDEX ix_products_category ON products(category_id);

CREATE TABLE modifiers (
  id          SERIAL PRIMARY KEY,
  product_id  INTEGER     NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name        VARCHAR(60) NOT NULL,
  price_cents INTEGER     NOT NULL DEFAULT 0 CHECK (price_cents >= 0)
);
CREATE INDEX ix_modifiers_product ON modifiers(product_id);

CREATE TABLE orders (
  id         SERIAL PRIMARY KEY,
  table_id   INTEGER     NOT NULL REFERENCES dining_tables(id),
  waiter_id  INTEGER     NOT NULL REFERENCES users(id),
  status     VARCHAR(20) NOT NULL DEFAULT 'abierta' CHECK (status IN ('abierta', 'cerrada', 'cancelada')),
  guests     INTEGER     NOT NULL DEFAULT 1 CHECK (guests > 0),
  tip_cents  INTEGER     NOT NULL DEFAULT 0 CHECK (tip_cents >= 0),
  opened_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at  TIMESTAMPTZ NULL
);
-- Índice completo por mesa (historial). Además evita que el emulador pg-mem de las pruebas
-- use el índice parcial de abajo para los JOIN y "pierda" los pedidos cerrados.
CREATE INDEX ix_orders_table ON orders(table_id);
-- Una mesa solo puede tener UN pedido abierto a la vez (garantía a nivel de BD).
CREATE UNIQUE INDEX ux_orders_open_table ON orders(table_id) WHERE status = 'abierta';
CREATE INDEX ix_orders_closed_at ON orders(closed_at);
CREATE INDEX ix_orders_waiter ON orders(waiter_id);

CREATE TABLE tickets (
  id           SERIAL PRIMARY KEY,
  order_id     INTEGER     NOT NULL REFERENCES orders(id),
  status       VARCHAR(20) NOT NULL DEFAULT 'pendiente' CHECK (status IN ('pendiente', 'preparando', 'listo', 'entregado')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at   TIMESTAMPTZ NULL,
  ready_at     TIMESTAMPTZ NULL,
  delivered_at TIMESTAMPTZ NULL
);
CREATE INDEX ix_tickets_status ON tickets(status);
CREATE INDEX ix_tickets_order ON tickets(order_id);

CREATE TABLE order_items (
  id               SERIAL PRIMARY KEY,
  order_id         INTEGER      NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id       INTEGER      NOT NULL REFERENCES products(id),
  ticket_id        INTEGER      NULL REFERENCES tickets(id),
  product_name     VARCHAR(120) NOT NULL,
  unit_price_cents INTEGER      NOT NULL CHECK (unit_price_cents >= 0),
  quantity         INTEGER      NOT NULL CHECK (quantity > 0),
  modifiers        JSONB        NOT NULL DEFAULT '[]',
  modifiers_cents  INTEGER      NOT NULL DEFAULT 0 CHECK (modifiers_cents >= 0),
  notes            VARCHAR(200) NULL,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX ix_order_items_order ON order_items(order_id);
CREATE INDEX ix_order_items_ticket ON order_items(ticket_id);

CREATE TABLE payments (
  id           SERIAL PRIMARY KEY,
  order_id     INTEGER     NOT NULL REFERENCES orders(id),
  cashier_id   INTEGER     NOT NULL REFERENCES users(id),
  method       VARCHAR(20) NOT NULL CHECK (method IN ('efectivo', 'tarjeta', 'yape_plin')),
  amount_cents INTEGER     NOT NULL CHECK (amount_cents > 0),
  tip_cents    INTEGER     NOT NULL DEFAULT 0 CHECK (tip_cents >= 0),
  payer_label  VARCHAR(40) NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_payments_order ON payments(order_id);
CREATE INDEX ix_payments_created ON payments(created_at);
`,
  },
];
