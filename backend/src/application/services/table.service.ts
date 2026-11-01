import type { DiningTable, TableStatus } from '../../domain/entities';
import { ConflictError, NotFoundError } from '../../domain/errors';
import type { CreateTableDto, UpdateTableDto } from '../dtos';
import type { EventPublisher, UnitOfWork } from '../ports';

export class TableService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly events: EventPublisher,
  ) {}

  list(filter?: { status?: TableStatus; zone?: string }): Promise<DiningTable[]> {
    return this.uow.repos.tables.list(filter);
  }

  async get(id: number): Promise<DiningTable> {
    const table = await this.uow.repos.tables.findById(id);
    if (!table) throw new NotFoundError('Mesa', id);
    return table;
  }

  async create(dto: CreateTableDto): Promise<DiningTable> {
    const existing = await this.uow.repos.tables.list();
    if (existing.some((t) => t.number === dto.number)) throw new ConflictError(`La mesa ${dto.number} ya existe`);
    const table = await this.uow.repos.tables.create(dto);
    this.events.publish({ type: 'table.updated', table });
    return table;
  }

  async update(id: number, dto: UpdateTableDto): Promise<DiningTable> {
    if (dto.number !== undefined) {
      const clash = (await this.uow.repos.tables.list()).find((t) => t.number === dto.number && t.id !== id);
      if (clash) throw new ConflictError(`La mesa ${dto.number} ya existe`);
    }
    const table = await this.uow.repos.tables.update(id, dto);
    if (!table) throw new NotFoundError('Mesa', id);
    this.events.publish({ type: 'table.updated', table });
    return table;
  }
}
