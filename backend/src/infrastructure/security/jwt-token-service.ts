import jwt, { type SignOptions } from 'jsonwebtoken';
import { ROLES } from '../../domain/entities';
import { UnauthorizedError } from '../../domain/errors';
import type { AuthPayload, TokenService } from '../../application/ports';

export class JwtTokenService implements TokenService {
  constructor(
    private readonly secret: string,
    private readonly expiresIn: SignOptions['expiresIn'] = '8h',
  ) {}

  sign(payload: AuthPayload): string {
    const { sub, ...claims } = payload;
    // El estándar JWT define `sub` como string.
    return jwt.sign(claims, this.secret, { subject: String(sub), expiresIn: this.expiresIn, algorithm: 'HS256' });
  }

  verify(token: string): AuthPayload {
    try {
      // Fijar el algoritmo evita ataques de "alg confusion" (p.ej. alg: none).
      const decoded = jwt.verify(token, this.secret, { algorithms: ['HS256'] }) as jwt.JwtPayload;
      const role = decoded.role as AuthPayload['role'];
      if (!decoded.sub || !ROLES.includes(role)) throw new Error('payload inválido');
      return { sub: Number(decoded.sub), name: String(decoded.name), email: String(decoded.email), role };
    } catch {
      throw new UnauthorizedError('Token inválido o expirado');
    }
  }
}
