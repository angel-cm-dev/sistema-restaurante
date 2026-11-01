import { describe, expect, it } from 'vitest';
import { changeDue, distribute, splitByItems, splitEqual, tipFor } from './billing';

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe('billing (vista previa de caja)', () => {
  it('distribute nunca pierde céntimos', () => {
    expect(distribute(1000, [1, 1, 1])).toEqual([334, 333, 333]);
    expect(sum(distribute(997, [4300, 8400]))).toBe(997);
    expect(distribute(10, [0, 0])).toEqual([5, 5]);
  });

  it('propina por porcentaje y por monto', () => {
    expect(tipFor(12700, { type: 'percent', value: 10 })).toBe(1270);
    expect(tipFor(12700, { type: 'amount', value: 500 })).toBe(500);
    expect(tipFor(12700, null)).toBe(0);
  });

  it('partes iguales con propina', () => {
    const shares = splitEqual(10000, { type: 'percent', value: 10 }, 3);
    expect(shares.map((s) => s.totalCents)).toEqual([3668, 3666, 3666]); // 33.34+3.34 / 33.33+3.33 / 33.33+3.33
    expect(sum(shares.map((s) => s.totalCents))).toBe(11000);
  });

  it('por consumo coincide con el backend (Ana 47.30 / Beto 92.40)', () => {
    const lines = [
      { id: 1, lineTotalCents: 4300 },
      { id: 2, lineTotalCents: 8400 },
    ];
    const { shares, unassigned } = splitByItems(lines, { type: 'percent', value: 10 }, ['Ana', 'Beto'], { 1: [0], 2: [1] });
    expect(unassigned).toEqual([]);
    expect(shares.map((s) => s.totalCents)).toEqual([4730, 9240]);
  });

  it('por consumo: ítems compartidos y sin asignar', () => {
    const lines = [
      { id: 1, lineTotalCents: 1501 },
      { id: 2, lineTotalCents: 1000 },
    ];
    const { shares, unassigned } = splitByItems(lines, null, ['A', 'B'], { 1: [0, 1] });
    expect(shares.map((s) => s.subtotalCents)).toEqual([751, 750]);
    expect(unassigned).toEqual([2]);
  });

  it('vuelto en efectivo', () => {
    expect(changeDue(4730, 5000)).toBe(270);
    expect(changeDue(4730, 4000)).toBe(0);
  });
});
