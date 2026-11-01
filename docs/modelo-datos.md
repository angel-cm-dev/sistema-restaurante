# Modelo de datos

El esquema se crea con migraciones versionadas (`backend/src/infrastructure/db/migrations.ts`), registradas en la tabla `schema_migrations`. Todos los importes son **enteros en céntimos**.

## Diagrama entidad-relación

```mermaid
erDiagram
  USERS ||--o{ ORDERS : "atiende (mozo)"
  USERS ||--o{ PAYMENTS : "cobra (caja)"
  DINING_TABLES ||--o{ ORDERS : "tiene"
  CATEGORIES ||--o{ PRODUCTS : "agrupa"
  PRODUCTS ||--o{ MODIFIERS : "ofrece"
  PRODUCTS ||--o{ ORDER_ITEMS : "se pide como"
  ORDERS ||--o{ ORDER_ITEMS : "contiene"
  ORDERS ||--o{ TICKETS : "genera comandas"
  TICKETS ||--o{ ORDER_ITEMS : "agrupa"
  ORDERS ||--o{ PAYMENTS : "se paga con"

  USERS {
    serial id PK
    varchar name
    varchar email UK
    varchar password_hash
    varchar role "admin | mozo | cocina | caja"
    boolean active
    timestamptz created_at
  }
  DINING_TABLES {
    serial id PK
    int number UK
    int seats
    varchar zone
    varchar status "libre | ocupada | por_cobrar"
    int pos_x
    int pos_y
  }
  CATEGORIES {
    serial id PK
    varchar name UK
    int sort_order
  }
  PRODUCTS {
    serial id PK
    int category_id FK
    varchar name
    text description
    int price_cents
    boolean active
  }
  MODIFIERS {
    serial id PK
    int product_id FK
    varchar name
    int price_cents
  }
  ORDERS {
    serial id PK
    int table_id FK
    int waiter_id FK
    varchar status "abierta | cerrada | cancelada"
    int guests
    int tip_cents
    timestamptz opened_at
    timestamptz closed_at
  }
  TICKETS {
    serial id PK
    int order_id FK
    varchar status "pendiente | preparando | listo | entregado"
    timestamptz created_at
    timestamptz started_at
    timestamptz ready_at
    timestamptz delivered_at
  }
  ORDER_ITEMS {
    serial id PK
    int order_id FK
    int product_id FK
    int ticket_id FK "NULL = borrador"
    varchar product_name "copia"
    int unit_price_cents "copia"
    int quantity
    jsonb modifiers "copia [{id,name,priceCents}]"
    int modifiers_cents
    varchar notes
  }
  PAYMENTS {
    serial id PK
    int order_id FK
    int cashier_id FK
    varchar method "efectivo | tarjeta | yape_plin"
    int amount_cents
    int tip_cents
    varchar payer_label
    timestamptz created_at
  }
```

## Tablas

### `users`
Personal del restaurante. `role` define permisos; `active = false` impide iniciar sesión sin borrar el historial (sus pedidos y cobros siguen referenciándolo). El email es único y se guarda en minúsculas.

### `dining_tables`
Mesas del salón. `status` es el estado visible en el plano y lo cambian **solo** los casos de uso (abrir, pedir cuenta, cobrar, anular), nunca un `PATCH` directo. `pos_x`/`pos_y` ordenan la mesa en el plano y `zone` agrupa (Salón, Terraza).

### `categories`, `products`, `modifiers`
La carta. `products.active = false` lo marca como agotado (no se puede pedir, pero sigue en reportes). Los modificadores pertenecen a un producto y tienen un costo extra opcional (`price_cents = 0` para "sin cebolla").

### `orders`
Un pedido = una ocupación de mesa. El **índice parcial único** `ux_orders_open_table (table_id) WHERE status = 'abierta'` garantiza en la base que una mesa nunca tenga dos pedidos abiertos, incluso si dos mozos tocan la mesa al mismo tiempo. `tip_cents` se fija al cobrar.

### `order_items`
Cada plato pedido. Guarda una **copia** del nombre, precio y modificadores elegidos: si mañana sube el precio del lomo, la cuenta de hoy y los reportes históricos no cambian. `ticket_id IS NULL` significa *borrador* (aún no enviado a cocina; el mozo puede quitarlo). El total de línea es `(unit_price_cents + modifiers_cents) × quantity`.

### `tickets` (comandas)
Grupo de ítems enviados juntos a cocina. Su `status` sigue la máquina de estados del KDS y cada transición registra su marca de tiempo; con ellas se calculan:

- **espera** = `started_at − created_at`
- **preparación** = `ready_at − started_at` (KPI "tiempo medio de preparación")
- **total** = `delivered_at − created_at`

### `payments`
Uno o varios pagos por pedido (cuenta dividida). La suma de `amount_cents` debe ser exactamente `subtotal + propina`; la propina se reparte entre los pagos de forma proporcional (`tip_cents`) para el reporte por mozo.

## Índices

| Índice | Para qué |
| --- | --- |
| `ux_orders_open_table` (parcial, único) | Regla "un pedido abierto por mesa" |
| `ix_orders_table`, `ix_orders_waiter`, `ix_orders_closed_at` | Historial por mesa, reporte por mozo, reportes por fecha de cobro |
| `ix_tickets_status`, `ix_tickets_order` | Tablero del KDS y detalle de pedido |
| `ix_order_items_order`, `ix_order_items_ticket` | Detalle de pedido y armado de comandas |
| `ix_payments_order`, `ix_payments_created` | Detalle de cobro y KPIs por medio de pago |
| `ix_products_category`, `ix_modifiers_product` | Carta filtrada por categoría |

## Datos de ejemplo

`seed.ts` crea (solo si la base está vacía): 5 usuarios demo, 12 mesas en dos zonas, 5 categorías, 14 platos peruanos con modificadores y ~30 pedidos cerrados de los últimos 7 días (generados con una semilla fija, siempre iguales) para que el dashboard y los reportes muestren datos desde el primer arranque. Todo es ficticio.
