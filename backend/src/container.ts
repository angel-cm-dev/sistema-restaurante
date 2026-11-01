/**
 * Raíz de composición (inyección de dependencias manual).
 *
 * Es el ÚNICO lugar que conoce las implementaciones concretas. Para las pruebas basta
 * con pasar otra `Database` (pg-mem) y el resto del sistema no se entera.
 * Se eligió DI manual en lugar de un contenedor (tsyringe/inversify) por ser explícita,
 * sin decoradores ni "magia": ver docs/decisiones/0001-arquitectura-en-capas.md.
 */
import type { Logger } from 'pino';
import type { AppConfig } from './config';
import { AuthService } from './application/services/auth.service';
import { KitchenService } from './application/services/kitchen.service';
import { MenuService } from './application/services/menu.service';
import { OrderService } from './application/services/order.service';
import { PaymentService } from './application/services/payment.service';
import { ReportService } from './application/services/report.service';
import { TableService } from './application/services/table.service';
import { UserService } from './application/services/user.service';
import type { Database } from './infrastructure/db/database';
import { SocketEventPublisher } from './infrastructure/realtime/socket-event-publisher';
import { PgUnitOfWork } from './infrastructure/repositories/pg-unit-of-work';
import { BcryptPasswordHasher } from './infrastructure/security/bcrypt-password-hasher';
import { JwtTokenService } from './infrastructure/security/jwt-token-service';

export interface Container {
  config: AppConfig;
  logger: Logger;
  db: Database;
  tokens: JwtTokenService;
  hasher: BcryptPasswordHasher;
  events: SocketEventPublisher;
  services: {
    auth: AuthService;
    users: UserService;
    tables: TableService;
    menu: MenuService;
    orders: OrderService;
    kitchen: KitchenService;
    payments: PaymentService;
    reports: ReportService;
  };
}

export function buildContainer(deps: { config: AppConfig; logger: Logger; db: Database }): Container {
  const { config, logger, db } = deps;
  const uow = new PgUnitOfWork(db);
  const hasher = new BcryptPasswordHasher(config.BCRYPT_ROUNDS);
  const tokens = new JwtTokenService(config.JWT_SECRET, config.JWT_EXPIRES_IN as `${number}h`);
  const events = new SocketEventPublisher();

  return {
    config,
    logger,
    db,
    tokens,
    hasher,
    events,
    services: {
      auth: new AuthService(uow, hasher, tokens),
      users: new UserService(uow, hasher),
      tables: new TableService(uow, events),
      menu: new MenuService(uow),
      orders: new OrderService(uow, events),
      kitchen: new KitchenService(uow, events),
      payments: new PaymentService(uow, events),
      reports: new ReportService(uow),
    },
  };
}
