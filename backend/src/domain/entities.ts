/**
 * Entidades del dominio. Son tipos planos (sin ORM) para que la lógica de negocio
 * sea fácil de probar sin base de datos.
 *
 * Convención de dinero: TODOS los importes se guardan en céntimos (enteros).
 * Ver docs/decisiones/0002-dinero-en-centimos.md.
 */
export const ROLES = ['admin', 'mozo', 'cocina', 'caja'] as const;
export type Role = (typeof ROLES)[number];

export interface User {
  id: number;
  name: string;
  email: string;
  passwordHash: string;
  role: Role;
  active: boolean;
  createdAt: Date;
}

export type PublicUser = Omit<User, 'passwordHash'>;

export const TABLE_STATUSES = ['libre', 'ocupada', 'por_cobrar'] as const;
export type TableStatus = (typeof TABLE_STATUSES)[number];

export interface DiningTable {
  id: number;
  number: number;
  seats: number;
  zone: string;
  status: TableStatus;
  posX: number;
  posY: number;
  /** Pedido abierto actual (si lo hay). Lo completa el repositorio para el plano del salón. */
  currentOrderId?: number | null;
}

export interface Category {
  id: number;
  name: string;
  sortOrder: number;
}

export interface Modifier {
  id: number;
  productId: number;
  name: string;
  priceCents: number;
}

export interface Product {
  id: number;
  categoryId: number;
  categoryName?: string;
  name: string;
  description: string;
  priceCents: number;
  active: boolean;
  modifiers?: Modifier[];
}

export const ORDER_STATUSES = ['abierta', 'cerrada', 'cancelada'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const TICKET_STATUSES = ['pendiente', 'preparando', 'listo', 'entregado'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

/** Estado de un ítem: "borrador" mientras no se envía a cocina; luego hereda el de su comanda. */
export type ItemStatus = 'borrador' | TicketStatus;

export interface SelectedModifier {
  id: number;
  name: string;
  priceCents: number;
}

export interface OrderItem {
  id: number;
  orderId: number;
  productId: number;
  ticketId: number | null;
  productName: string;
  unitPriceCents: number;
  quantity: number;
  modifiers: SelectedModifier[];
  modifiersCents: number;
  notes: string | null;
  status: ItemStatus;
}

export interface Ticket {
  id: number;
  orderId: number;
  status: TicketStatus;
  createdAt: Date;
  startedAt: Date | null;
  readyAt: Date | null;
  deliveredAt: Date | null;
}

export interface Order {
  id: number;
  tableId: number;
  tableNumber: number;
  waiterId: number;
  waiterName: string;
  status: OrderStatus;
  guests: number;
  tipCents: number;
  openedAt: Date;
  closedAt: Date | null;
}

export const PAYMENT_METHODS = ['efectivo', 'tarjeta', 'yape_plin'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export interface Payment {
  id: number;
  orderId: number;
  cashierId: number;
  method: PaymentMethod;
  amountCents: number;
  tipCents: number;
  payerLabel: string | null;
  createdAt: Date;
}
