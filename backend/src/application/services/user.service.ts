import type { PublicUser, Role } from '../../domain/entities';
import { BusinessRuleError, ConflictError, NotFoundError } from '../../domain/errors';
import type { CreateUserDto, UpdateUserDto } from '../dtos';
import type { Page, PageQuery } from '../pagination';
import type { Actor, PasswordHasher, UnitOfWork } from '../ports';
import { toPublicUser } from './auth.service';

export class UserService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly hasher: PasswordHasher,
  ) {}

  list(query: PageQuery & { role?: Role; active?: boolean }): Promise<Page<PublicUser>> {
    return this.uow.repos.users.list(query);
  }

  async create(dto: CreateUserDto): Promise<PublicUser> {
    if (await this.uow.repos.users.findByEmail(dto.email)) {
      throw new ConflictError(`Ya existe un usuario con el email ${dto.email}`);
    }
    const passwordHash = await this.hasher.hash(dto.password);
    const user = await this.uow.repos.users.create({ name: dto.name, email: dto.email, role: dto.role, passwordHash });
    return toPublicUser(user);
  }

  async update(id: number, dto: UpdateUserDto, actor: Actor): Promise<PublicUser> {
    // Evita que un admin se bloquee a sí mismo y deje el sistema sin administrador.
    if (id === actor.id && (dto.active === false || (dto.role && dto.role !== 'admin'))) {
      throw new BusinessRuleError('No puedes desactivarte ni quitarte el rol de administrador');
    }
    const { password, ...rest } = dto;
    const patch = { ...rest, ...(password ? { passwordHash: await this.hasher.hash(password) } : {}) };
    const user = await this.uow.repos.users.update(id, patch);
    if (!user) throw new NotFoundError('Usuario', id);
    return toPublicUser(user);
  }
}
