import bcrypt from 'bcryptjs';
import type { PasswordHasher } from '../../application/ports';

/**
 * bcrypt con sal aleatoria por contraseña. El "costo" (rounds) se configura por
 * entorno: alto en producción (12) y bajo en pruebas (4) para que sean rápidas.
 * Se usa bcryptjs (JS puro) para evitar compilar binarios nativos en Docker/CI.
 */
export class BcryptPasswordHasher implements PasswordHasher {
  constructor(private readonly rounds = 12) {}

  hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, this.rounds);
  }

  verify(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }
}
