/**
 * DTOs de entrada validados con zod. El tipo TypeScript se infiere del esquema,
 * así validación y tipado nunca se desincronizan.
 *
 * Importes: siempre en céntimos enteros (S/ 42.50 => 4250).
 */
import { z } from 'zod';
import { ORDER_STATUSES, PAYMENT_METHODS, ROLES, TABLE_STATUSES, TICKET_STATUSES } from '../../domain/entities';
import { MAX_TIP_PERCENT } from '../../domain/billing';
import { pageQuerySchema } from '../pagination';

const id = z.coerce.number().int().positive();
const cents = z.number().int().min(0).max(10_000_000);
const booleanQuery = z
  .enum(['true', 'false'])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === 'true'));

export const idParam = z.object({ id });
export const itemParams = z.object({ id, itemId: id });

// ---------- Auth / usuarios ----------
export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email('Email inválido')),
  password: z.string().min(1, 'La contraseña es obligatoria'),
});
export type LoginDto = z.infer<typeof loginSchema>;

/** Política mínima de contraseñas: 8+ caracteres con letras y números. */
const password = z
  .string()
  .min(8, 'Mínimo 8 caracteres')
  .max(72, 'Máximo 72 caracteres (límite de bcrypt)')
  .regex(/[A-Za-z]/, 'Debe contener letras')
  .regex(/\d/, 'Debe contener números');

export const createUserSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().pipe(z.email('Email inválido')),
  password,
  role: z.enum(ROLES),
});
export type CreateUserDto = z.infer<typeof createUserSchema>;

export const updateUserSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    role: z.enum(ROLES).optional(),
    active: z.boolean().optional(),
    password: password.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Debe enviar al menos un campo');
export type UpdateUserDto = z.infer<typeof updateUserSchema>;

export const listUsersQuery = pageQuerySchema(['name', 'email', 'role', 'createdAt'] as const).extend({
  role: z.enum(ROLES).optional(),
  active: booleanQuery,
});

// ---------- Mesas ----------
export const createTableSchema = z.object({
  number: z.number().int().positive(),
  seats: z.number().int().min(1).max(30),
  zone: z.string().trim().min(1).max(40).default('Salón'),
  posX: z.number().int().min(0).max(20).default(0),
  posY: z.number().int().min(0).max(20).default(0),
});
export type CreateTableDto = z.infer<typeof createTableSchema>;
export const updateTableSchema = createTableSchema.partial();
export type UpdateTableDto = z.infer<typeof updateTableSchema>;
export const listTablesQuery = z.object({
  status: z.enum(TABLE_STATUSES).optional(),
  zone: z.string().trim().max(40).optional(),
});

// ---------- Carta ----------
export const createCategorySchema = z.object({
  name: z.string().trim().min(2).max(60),
  sortOrder: z.number().int().min(0).default(0),
});

const modifierInput = z.object({
  name: z.string().trim().min(1).max(60),
  priceCents: cents.default(0),
});

export const createProductSchema = z.object({
  categoryId: z.number().int().positive(),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).default(''),
  priceCents: cents,
  active: z.boolean().default(true),
  modifiers: z.array(modifierInput).max(20).default([]),
});
export type CreateProductDto = z.infer<typeof createProductSchema>;

export const updateProductSchema = createProductSchema.partial();
export type UpdateProductDto = z.infer<typeof updateProductSchema>;

export const listProductsQuery = pageQuerySchema(['name', 'priceCents', 'category'] as const).extend({
  categoryId: id.optional(),
  active: booleanQuery,
});

// ---------- Pedidos ----------
export const openOrderSchema = z.object({
  tableId: z.number().int().positive(),
  guests: z.number().int().min(1).max(30).default(1),
});
export type OpenOrderDto = z.infer<typeof openOrderSchema>;

export const addItemSchema = z.object({
  productId: z.number().int().positive(),
  quantity: z.number().int().min(1).max(50).default(1),
  modifierIds: z.array(z.number().int().positive()).max(20).default([]),
  notes: z.string().trim().max(200).optional(),
});
export type AddItemDto = z.infer<typeof addItemSchema>;

export const listOrdersQuery = pageQuerySchema(['openedAt', 'closedAt', 'table'] as const).extend({
  status: z.enum(ORDER_STATUSES).optional(),
  tableId: id.optional(),
  waiterId: id.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const tipSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('percent'), value: z.number().min(0).max(MAX_TIP_PERCENT) }),
  z.object({ type: z.literal('amount'), value: cents }),
]);

export const splitSchema = z.object({
  tip: tipSchema.nullish(),
  split: z.discriminatedUnion('mode', [
    z.object({ mode: z.literal('equal'), parts: z.number().int().min(1).max(30) }),
    z.object({
      mode: z.literal('items'),
      assignments: z
        .array(z.object({ label: z.string().trim().min(1).max(40), itemIds: z.array(z.number().int().positive()).min(1) }))
        .min(1)
        .max(30),
    }),
  ]),
});
export type SplitDto = z.infer<typeof splitSchema>;

export const closeOrderSchema = z.object({
  tip: tipSchema.nullish(),
  payments: z
    .array(
      z.object({
        method: z.enum(PAYMENT_METHODS),
        amountCents: cents.refine((v) => v > 0, 'El pago debe ser mayor a 0'),
        payerLabel: z.string().trim().max(40).optional(),
      }),
    )
    .min(1, 'Debe registrar al menos un pago')
    .max(30),
});
export type CloseOrderDto = z.infer<typeof closeOrderSchema>;

// ---------- Cocina ----------
export const kitchenQuery = z.object({
  status: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(',').map((s) => s.trim()) : ['pendiente', 'preparando', 'listo']))
    .pipe(z.array(z.enum(TICKET_STATUSES)).min(1)),
});

// ---------- Reportes ----------
export const reportRangeQuery = z
  .object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  })
  .transform(({ from, to }) => {
    // Por defecto: últimos 30 días hasta ahora.
    const end = to ?? new Date();
    const start = from ?? new Date(end.getTime() - 30 * 24 * 3600 * 1000);
    return { from: start, to: end };
  })
  .refine((r) => r.from <= r.to, '"from" debe ser anterior a "to"');
