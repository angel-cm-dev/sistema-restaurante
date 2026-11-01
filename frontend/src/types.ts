/** Tipos del contrato con la API (reflejan las respuestas del backend). Importes en céntimos. */
export type Role = 'admin' | 'mozo' | 'cocina' | 'caja';
export type TableStatus = 'libre' | 'ocupada' | 'por_cobrar';
export type TicketStatus = 'pendiente' | 'preparando' | 'listo' | 'entregado';
export type ItemStatus = 'borrador' | TicketStatus;
export type OrderStatus = 'abierta' | 'cerrada' | 'cancelada';
export type PaymentMethod = 'efectivo' | 'tarjeta' | 'yape_plin';

export interface User {
  id: number;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  createdAt: string;
}

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface Page<T> {
  data: T[];
  meta: PageMeta;
}

export interface DiningTable {
  id: number;
  number: number;
  seats: number;
  zone: string;
  status: TableStatus;
  posX: number;
  posY: number;
  currentOrderId: number | null;
}

export interface Category {
  id: number;
  name: string;
  sortOrder: number;
  productCount: number;
}

export interface Modifier {
  id: number;
  name: string;
  priceCents: number;
}

export interface Product {
  id: number;
  categoryId: number;
  categoryName: string;
  name: string;
  description: string;
  priceCents: number;
  active: boolean;
  modifiers: Modifier[];
}

export interface Timings {
  waitSeconds: number | null;
  prepSeconds: number | null;
  totalSeconds: number;
}

export interface OrderItem {
  id: number;
  productId: number;
  productName: string;
  unitPriceCents: number;
  quantity: number;
  modifiers: Modifier[];
  modifiersCents: number;
  notes: string | null;
  ticketId: number | null;
  status: ItemStatus;
  lineTotalCents: number;
}

export interface Ticket {
  id: number;
  orderId: number;
  status: TicketStatus;
  createdAt: string;
  startedAt: string | null;
  readyAt: string | null;
  deliveredAt: string | null;
  timings?: Timings;
}

export interface KitchenTicket extends Ticket {
  tableNumber: number;
  waiterId: number;
  waiterName: string;
  items: Array<{ id: number; productName: string; quantity: number; modifiers: string[]; notes: string | null }>;
}

export interface Totals {
  subtotalCents: number;
  baseCents: number;
  taxCents: number;
  tipCents: number;
  totalCents: number;
}

export interface Payment {
  id: number;
  method: PaymentMethod;
  amountCents: number;
  tipCents: number;
  payerLabel: string | null;
  createdAt: string;
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
  openedAt: string;
  closedAt: string | null;
  items: OrderItem[];
  tickets: Ticket[];
  totals: Totals;
  payments: Payment[];
  paidCents: number;
}

export interface OrderSummary extends Omit<Order, 'items' | 'tickets' | 'totals' | 'payments' | 'paidCents'> {
  subtotalCents: number;
  itemCount: number;
}

export interface Dashboard {
  date: string;
  salesCents: number;
  tipsCents: number;
  closedOrders: number;
  averageTicketCents: number;
  occupancy: { libre: number; ocupada: number; por_cobrar: number; total: number; percent: number };
  kitchen: { pendiente?: number; preparando?: number; listo?: number; averagePrepSeconds: number | null };
  topProducts: ProductSales[];
  paymentsByMethod: Array<{ method: PaymentMethod; amountCents: number }>;
}

export interface ProductSales {
  productId: number;
  productName: string;
  categoryName: string;
  quantity: number;
  revenueCents: number;
}

export interface WaiterSales {
  waiterId: number;
  waiterName: string;
  orders: number;
  revenueCents: number;
  tipsCents: number;
}
