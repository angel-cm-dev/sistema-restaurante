/**
 * Utilidades de dinero. Trabajamos en céntimos enteros para evitar errores de coma
 * flotante (0.1 + 0.2 !== 0.3). La regla de oro: la suma de las partes SIEMPRE
 * debe ser igual al total; ningún céntimo se crea ni se pierde al repartir.
 */
import { BusinessRuleError } from './errors';

export function assertCents(value: number, label = 'importe'): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new BusinessRuleError(`El ${label} debe ser un entero no negativo en céntimos`);
  }
}

/**
 * Reparte `total` en partes proporcionales a `weights` usando el método del
 * resto mayor (Hamilton): primero se asigna la parte entera de cada cuota y los
 * céntimos sobrantes van a quienes tuvieron la mayor fracción descartada.
 * Garantiza sum(resultado) === total.
 */
export function distributeProportionally(total: number, weights: number[]): number[] {
  assertCents(total, 'total a repartir');
  if (weights.length === 0) return [];
  if (weights.some((w) => w < 0)) throw new BusinessRuleError('Los pesos no pueden ser negativos');
  const sum = weights.reduce((a, b) => a + b, 0);
  // Si todos los pesos son 0 (p.ej. todos consumieron S/ 0) se reparte en partes iguales.
  const effective = sum === 0 ? weights.map(() => 1) : weights;
  const effectiveSum = sum === 0 ? weights.length : sum;

  const raw = effective.map((w) => (total * w) / effectiveSum);
  const floors = raw.map(Math.floor);
  let remainder = total - floors.reduce((a, b) => a + b, 0);
  const order = raw
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    // Empate de fracciones: gana el índice menor, para que el resultado sea determinista.
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (const { index } of order) {
    if (remainder === 0) break;
    floors[index] += 1;
    remainder -= 1;
  }
  return floors;
}

/** Divide en `parts` partes iguales; los céntimos sobrantes los asumen las primeras partes. */
export function splitEqually(total: number, parts: number): number[] {
  if (!Number.isInteger(parts) || parts < 1) {
    throw new BusinessRuleError('El número de partes debe ser un entero mayor o igual a 1');
  }
  return distributeProportionally(total, Array.from({ length: parts }, () => 1));
}

/** Formatea céntimos como soles peruanos: 4250 -> "S/ 42.50". */
export function formatPEN(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  return `${sign}S/ ${(Math.abs(cents) / 100).toFixed(2)}`;
}
