/**
 * Puertos (interfaces) que la capa de aplicación necesita del exterior.
 *
 * Los servicios dependen SOLO de estas interfaces; la infraestructura (PostgreSQL,
 * bcrypt, JWT, Socket.IO) las implementa. Gracias a esto las pruebas pueden
 * inyectar una base en memoria (pg-mem) sin tocar una línea de los servicios.
 */
import type {
  Category,
  DiningTable,
  Modifier,
  Order,
  OrderItem,
  OrderStatus,
  Payment,
  PaymentMethod,
  Product,
  PublicUser,
  Role,
  SelectedModifier,
  TableStatus,
  Ticket,
  TicketStatus,
  User,
} from '../domain/entities';
import type { Page, PageQuery } from './pagination';

export interface UserRepository {
  findByEmail(email: string): Promise<User | null>;
  findById(id: number): Promise<User | null>;
  list(query: PageQuery & { role?: Role; active?: boolean }): Promise<Page<PublicUser>>;
  create(data: { name: string; email: string; passwordHash: string; role: Role }): Promise<User>;
  update(id: number, patch: Partial<Pick<User, 'name' | 'role' | 'active' | 'passwordHash'>>): Promise<User | null>;
}

export interface TableRepository {
  list(filter?: { status?: TableStatus; zone?: string }): Promise<DiningTable[]>;
  findById(id: number): Promise<DiningTable | null>;
  create(data: Omit<DiningTable, 'id' | 'status' | 'currentOrderId'>): Promise<DiningTable>;
  update(id: number, patch: Partial<Omit<DiningTable, 'id' | 'status' | 'currentOrderId'>>): Promise<DiningTable | null>;
  setStatus(id: number, status: TableStatus): Promise<void>;
}

export interface NewModifier {
  name: string;
  priceCents: number;
}

export interface MenuRepository {
  listCategories(): Promise<Array<Category & { productCount: number }>>;
  findCategory(id: number): Promise<Category | null>;
  createCategory(data: { name: string; sortOrder: number }): Promise<Category>;
  listProducts(query: PageQuery & { categoryId?: number; active?: boolean }): Promise<Page<Product>>;
  findProduct(id: number): Promise<Product | null>;
  createProduct(data: Omit<Product, 'id' | 'categoryName' | 'modifiers'>, modifiers: NewModifier[]): Promise<Product>;
  updateProduct(id: number, patch: Partial<Omit<Product, 'id' | 'categoryName' | 'modifiers'>>): Promise<Product | null>;
  replaceModifiers(productId: number, modifiers: NewModifier[]): Promise<Modifier[]>;
}

export interface KitchenTicketView extends Ticket {
  tableNumber: number;
  waiterId: number;
  waiterName: string;
  items: Array<{ id: number; productName: string; quantity: number; modifiers: string[]; notes: string | null }>;
}

export interface OrderSummary extends Order {
  subtotalCents: number;
  itemCount: number;
}

export interface OrderRepository {
  create(data: { tableId: number; waiterId: number; guests: number }): Promise<number>;
  findById(id: number): Promise<Order | null>;
  findOpenByTable(tableId: number): Promise<Order | null>;
  list(
    query: PageQuery & { status?: OrderStatus; tableId?: number; waiterId?: number; from?: Date; to?: Date },
  ): Promise<Page<OrderSummary>>;
  update(id: number, patch: Partial<Pick<Order, 'status' | 'tipCents' | 'closedAt'>>): Promise<void>;

  listItems(orderId: number): Promise<OrderItem[]>;
  addItem(data: {
    orderId: number;
    productId: number;
    productName: string;
    unitPriceCents: number;
    quantity: number;
    modifiers: SelectedModifier[];
    notes: string | null;
  }): Promise<OrderItem>;
  deleteItem(itemId: number): Promise<void>;

  createTicket(orderId: number, itemIds: number[]): Promise<Ticket>;
  listTickets(orderId: number): Promise<Ticket[]>;
  findTicket(id: number): Promise<Ticket | null>;
  saveTicket(ticket: Ticket): Promise<void>;
  findKitchenTicket(id: number): Promise<KitchenTicketView | null>;
  listKitchenTickets(statuses: TicketStatus[]): Promise<KitchenTicketView[]>;
}

export interface PaymentRepository {
  create(data: Omit<Payment, 'id' | 'createdAt'>): Promise<Payment>;
  listByOrder(orderId: number): Promise<Payment[]>;
}

export interface DateRange {
  from: Date;
  to: Date;
}

export interface ProductSalesRow {
  productId: number;
  productName: string;
  categoryName: string;
  quantity: number;
  revenueCents: number;
}

export interface WaiterSalesRow {
  waiterId: number;
  waiterName: string;
  orders: number;
  revenueCents: number;
  tipsCents: number;
}

export interface ReportRepository {
  salesByProduct(range: DateRange): Promise<ProductSalesRow[]>;
  salesByWaiter(range: DateRange): Promise<WaiterSalesRow[]>;
  closedOrdersSummary(range: DateRange): Promise<{ orders: number; revenueCents: number; tipsCents: number }>;
  paymentsByMethod(range: DateRange): Promise<Array<{ method: PaymentMethod; amountCents: number }>>;
  ticketsCreatedBetween(range: DateRange): Promise<Ticket[]>;
}

export interface Repositories {
  users: UserRepository;
  tables: TableRepository;
  menu: MenuRepository;
  orders: OrderRepository;
  payments: PaymentRepository;
  reports: ReportRepository;
}

/**
 * Unidad de trabajo: `repos` para lecturas simples y `transaction` cuando varias
 * escrituras deben confirmarse o revertirse juntas (p.ej. cobrar = pagos + cerrar
 * pedido + liberar mesa).
 */
export interface UnitOfWork {
  readonly repos: Repositories;
  transaction<T>(work: (repos: Repositories) => Promise<T>): Promise<T>;
}

export interface PasswordHasher {
  hash(plain: string): Promise<string>;
  verify(plain: string, hash: string): Promise<boolean>;
}

export interface AuthPayload {
  sub: number;
  name: string;
  email: string;
  role: Role;
}

export interface TokenService {
  sign(payload: AuthPayload): string;
  verify(token: string): AuthPayload;
}

/** Usuario autenticado que ejecuta una acción. */
export interface Actor {
  id: number;
  name: string;
  role: Role;
}

/**
 * Eventos de dominio que interesan en tiempo real. Los servicios los publican
 * DESPUÉS de confirmar la transacción, para no notificar cambios que luego se revierten.
 */
export type DomainEvent =
  | { type: 'table.updated'; table: DiningTable }
  | { type: 'ticket.created'; ticket: KitchenTicketView }
  | { type: 'ticket.updated'; ticket: KitchenTicketView }
  | { type: 'order.updated'; orderId: number; tableId: number }
  | { type: 'order.closed'; orderId: number; tableId: number; totalCents: number };

export interface EventPublisher {
  publish(event: DomainEvent): void;
}
