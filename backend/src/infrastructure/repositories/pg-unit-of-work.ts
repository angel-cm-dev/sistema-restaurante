import type { Repositories, UnitOfWork } from '../../application/ports';
import type { Database, Queryable } from '../db/database';
import { PgMenuRepository } from './pg-menu.repository';
import { PgOrderRepository } from './pg-order.repository';
import { PgPaymentRepository } from './pg-payment.repository';
import { PgReportRepository } from './pg-report.repository';
import { PgTableRepository } from './pg-table.repository';
import { PgUserRepository } from './pg-user.repository';

export function createRepositories(db: Queryable): Repositories {
  return {
    users: new PgUserRepository(db),
    tables: new PgTableRepository(db),
    menu: new PgMenuRepository(db),
    orders: new PgOrderRepository(db),
    payments: new PgPaymentRepository(db),
    reports: new PgReportRepository(db),
  };
}

/**
 * Dentro de `transaction` se crean repositorios ligados a la MISMA conexión
 * (BEGIN ... COMMIT), de modo que todas sus escrituras se confirman o revierten juntas.
 */
export class PgUnitOfWork implements UnitOfWork {
  readonly repos: Repositories;

  constructor(private readonly db: Database) {
    this.repos = createRepositories(db);
  }

  transaction<T>(work: (repos: Repositories) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => work(createRepositories(tx)));
  }
}
