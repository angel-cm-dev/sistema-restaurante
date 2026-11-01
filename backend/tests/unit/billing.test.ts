import { describe, expect, it } from 'vitest';
import { calculateTip, calculateTotals, lineTotal, splitBill, type BillLine } from '../../src/domain/billing';
import { BusinessRuleError } from '../../src/domain/errors';

// Ceviche S/ 38 + extra leche de tigre S/ 5; 2 lomos S/ 42; 1 chicha S/ 15
const lines: BillLine[] = [
  { itemId: 1, unitPriceCents: 3800, modifiersCents: 500, quantity: 1 },
  { itemId: 2, unitPriceCents: 4200, modifiersCents: 0, quantity: 2 },
  { itemId: 3, unitPriceCents: 1500, modifiersCents: 0, quantity: 1 },
];
const SUBTOTAL = 4300 + 8400 + 1500; // 14200

const sumBy = <T>(xs: T[], f: (x: T) => number) => xs.reduce((a, x) => a + f(x), 0);

describe('totales', () => {
  it('lineTotal cobra los modificadores por cada unidad', () => {
    expect(lineTotal({ itemId: 1, unitPriceCents: 1000, modifiersCents: 300, quantity: 3 })).toBe(3900);
  });

  it('lineTotal rechaza cantidades inválidas', () => {
    expect(() => lineTotal({ itemId: 1, unitPriceCents: 1000, modifiersCents: 0, quantity: 0 })).toThrow(BusinessRuleError);
  });

  it('desglosa el IGV incluido sin sumarlo al total', () => {
    const t = calculateTotals(lines);
    expect(t.subtotalCents).toBe(SUBTOTAL);
    expect(t.baseCents).toBe(Math.round(SUBTOTAL / 1.18)); // 12034
    expect(t.baseCents + t.taxCents).toBe(SUBTOTAL);
    expect(t.totalCents).toBe(SUBTOTAL);
  });

  it('suma la propina al total', () => {
    const t = calculateTotals(lines, { type: 'percent', value: 10 });
    expect(t.tipCents).toBe(1420);
    expect(t.totalCents).toBe(SUBTOTAL + 1420);
  });
});

describe('propina', () => {
  it('porcentaje redondeado al céntimo', () => {
    expect(calculateTip(3333, { type: 'percent', value: 10 })).toBe(333);
    expect(calculateTip(3335, { type: 'percent', value: 10 })).toBe(334);
  });
  it('monto fijo', () => {
    expect(calculateTip(5000, { type: 'amount', value: 700 })).toBe(700);
  });
  it('sin propina = 0', () => {
    expect(calculateTip(5000, null)).toBe(0);
  });
  it('rechaza porcentajes fuera de rango y montos no enteros', () => {
    expect(() => calculateTip(5000, { type: 'percent', value: 31 })).toThrow(/propina/);
    expect(() => calculateTip(5000, { type: 'percent', value: -1 })).toThrow();
    expect(() => calculateTip(5000, { type: 'amount', value: 1.5 })).toThrow();
  });
});

describe('división de cuenta', () => {
  it('partes iguales: la suma de las partes es el total exacto', () => {
    const shares = splitBill(lines, { type: 'percent', value: 10 }, { mode: 'equal', parts: 3 });
    expect(shares).toHaveLength(3);
    expect(sumBy(shares, (s) => s.totalCents)).toBe(SUBTOTAL + 1420);
    expect(shares.map((s) => s.subtotalCents)).toEqual([4734, 4733, 4733]);
    expect(shares[0].label).toBe('Persona 1');
  });

  it('por ítems: cada quien paga lo suyo y la propina es proporcional', () => {
    const shares = splitBill(lines, { type: 'percent', value: 10 }, {
      mode: 'items',
      assignments: [
        { label: 'Ana', itemIds: [1] },
        { label: 'Beto', itemIds: [2, 3] },
      ],
    });
    expect(shares[0]).toMatchObject({ label: 'Ana', subtotalCents: 4300 });
    expect(shares[1]).toMatchObject({ label: 'Beto', subtotalCents: 9900 });
    expect(shares[0].tipCents).toBe(430);
    expect(shares[1].tipCents).toBe(990);
    expect(sumBy(shares, (s) => s.totalCents)).toBe(SUBTOTAL + 1420);
  });

  it('por ítems: un ítem compartido se reparte entre quienes lo comparten', () => {
    const shares = splitBill(lines, null, {
      mode: 'items',
      assignments: [
        { label: 'Ana', itemIds: [1, 3] },
        { label: 'Beto', itemIds: [2, 3] },
      ],
    });
    // La chicha (1500) se divide 750 / 750.
    expect(shares[0].subtotalCents).toBe(4300 + 750);
    expect(shares[1].subtotalCents).toBe(8400 + 750);
  });

  it('por ítems: compartir un monto impar no pierde céntimos', () => {
    const odd: BillLine[] = [{ itemId: 9, unitPriceCents: 1001, modifiersCents: 0, quantity: 1 }];
    const shares = splitBill(odd, null, {
      mode: 'items',
      assignments: [
        { label: 'A', itemIds: [9] },
        { label: 'B', itemIds: [9] },
      ],
    });
    expect(shares.map((s) => s.subtotalCents)).toEqual([501, 500]);
  });

  it('por ítems: exige asignar todos los ítems', () => {
    expect(() =>
      splitBill(lines, null, { mode: 'items', assignments: [{ label: 'Ana', itemIds: [1] }] }),
    ).toThrow(/Todos los ítems/);
  });

  it('por ítems: rechaza ítems ajenos a la cuenta', () => {
    expect(() =>
      splitBill(lines, null, { mode: 'items', assignments: [{ label: 'Ana', itemIds: [1, 2, 3, 99] }] }),
    ).toThrow(/99/);
  });
});
