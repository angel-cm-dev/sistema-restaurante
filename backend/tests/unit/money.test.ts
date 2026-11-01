import { describe, expect, it } from 'vitest';
import { distributeProportionally, formatPEN, splitEqually } from '../../src/domain/money';

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe('money', () => {
  it('splitEqually reparte los céntimos sobrantes entre las primeras partes', () => {
    expect(splitEqually(10000, 3)).toEqual([3334, 3333, 3333]);
    expect(splitEqually(100, 4)).toEqual([25, 25, 25, 25]);
    expect(splitEqually(1, 3)).toEqual([1, 0, 0]);
  });

  it('splitEqually rechaza partes inválidas', () => {
    expect(() => splitEqually(100, 0)).toThrow(/partes/);
    expect(() => splitEqually(100, 1.5)).toThrow();
  });

  it('distributeProportionally conserva el total exacto (método del resto mayor)', () => {
    const result = distributeProportionally(1000, [1, 1, 1]);
    expect(result).toEqual([334, 333, 333]);
    expect(sum(distributeProportionally(997, [3800, 4200, 1500]))).toBe(997);
  });

  it('distributeProportionally reparte en partes iguales si todos los pesos son 0', () => {
    expect(distributeProportionally(10, [0, 0])).toEqual([5, 5]);
  });

  it('distributeProportionally rechaza totales no enteros o negativos', () => {
    expect(() => distributeProportionally(10.5, [1])).toThrow();
    expect(() => distributeProportionally(-1, [1])).toThrow();
    expect(() => distributeProportionally(10, [-1, 2])).toThrow();
  });

  it('propiedad: para cualquier total y pesos, la suma de las partes es el total', () => {
    for (let total = 0; total < 2000; total += 37) {
      const weights = [total % 7, (total * 3) % 11, 5];
      expect(sum(distributeProportionally(total, weights))).toBe(total);
    }
  });

  it('formatPEN formatea soles', () => {
    expect(formatPEN(4250)).toBe('S/ 42.50');
    expect(formatPEN(5)).toBe('S/ 0.05');
    expect(formatPEN(-150)).toBe('-S/ 1.50');
  });
});
