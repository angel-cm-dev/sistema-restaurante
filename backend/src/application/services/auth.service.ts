import type { PublicUser, User } from '../../domain/entities';
import { NotFoundError, UnauthorizedError } from '../../domain/errors';
import type { LoginDto } from '../dtos';
import type { PasswordHasher, TokenService, UnitOfWork } from '../ports';

export const toPublicUser = ({ passwordHash: _omit, ...rest }: User): PublicUser => rest;

export class AuthService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly hasher: PasswordHasher,
    private readonly tokens: TokenService,
  ) {}

  async login(dto: LoginDto): Promise<{ token: string; user: PublicUser }> {
    const user = await this.uow.repos.users.findByEmail(dto.email);
    // Mismo mensaje para "no existe" y "clave incorrecta": no revelamos qué emails existen.
    const valid = user ? await this.hasher.verify(dto.password, user.passwordHash) : false;
    if (!user || !valid) throw new UnauthorizedError('Email o contraseña incorrectos');
    if (!user.active) throw new UnauthorizedError('Usuario desactivado');

    const token = this.tokens.sign({ sub: user.id, name: user.name, email: user.email, role: user.role });
    return { token, user: toPublicUser(user) };
  }

  async me(userId: number): Promise<PublicUser> {
    const user = await this.uow.repos.users.findById(userId);
    if (!user) throw new NotFoundError('Usuario', userId);
    return toPublicUser(user);
  }
}
