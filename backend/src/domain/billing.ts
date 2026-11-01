/**
 * Reglas de facturación: totales, IGV, propina y división de cuenta.
 *
 * Todo es puro (sin E/S) para poder probarlo a fondo con pruebas unitarias.
 */
import { BusinessRuleError } from './errors';
import { assertCents, distributeProportionally, splitEqually } from './money';

/**
 * En Perú los precios de carta al público deben incluir el IGV (18%).
 * Por eso NO sumamos impuesto: lo "desglosamos" del subtotal para mostrarlo en la cuenta.
 */
export const IGV_RATE = 0.18;

/** Tope de propina en porcentaje: evita errores de digitación (p.ej. 100 en lugar de 10). */
export const MAX_TIP_PERCENT = 30;

export interface BillLine {
  itemId: number;
  unitPriceCents: number;
  modifiersCents: number;
  quantity: number;
}

export type TipInput = { type: 'percent'; value: number } | { type: 'amount'; value: number };

export interface BillTotals {
  subtotalCents: number;
  /** Base imponible (subtotal sin IGV). */
  baseCents: number;
  /** IGV incluido en el subtotal. */
  taxCents: number;
  tipCents: number;
  totalCents: number;
}

export function lineTotal(line: BillLine): number {
  if (!Number.isInteger(line.quantity) || line.quantity < 1) {
    throw new BusinessRuleError('La cantidad debe ser un entero mayor o igual a 1');
  }
  assertCents(line.unitPriceCents, 'precio unitario');
  assertCents(line.modifiersCents, 'precio de modificadores');
  // Los modificadores (p.ej. "extra queso +S/ 3") se cobran por cada unidad pedida.
  return (line.unitPriceCents + line.modifiersCents) * line.quantity;
}

export function calculateSubtotal(lines: BillLine[]): number {
  return lines.reduce((acc, line) => acc + lineTotal(line), 0);
}

/**
 * La propina se calcula sobre el subtotal (consumo), nunca sobre otra propina.
 * El porcentaje se redondea al céntimo más cercano.
 */
export function calculateTip(subtotalCents: number, tip?: TipInput | null): number {
  if (!tip) return 0;
  if (tip.type === 'percent') {
    if (tip.value < 0 || tip.value > MAX_TIP_PERCENT) {
      throw new BusinessRuleError(`La propina debe estar entre 0% y ${MAX_TIP_PERCENT}%`);
    }
    return Math.round((subtotalCents * tip.value) / 100);
  }
  assertCents(tip.value, 'monto de propina');
  return tip.value;
}

export function calculateTotals(lines: BillLine[], tip?: TipInput | null): BillTotals {
  const subtotalCents = calculateSubtotal(lines);
  const baseCents = Math.round(subtotalCents / (1 + IGV_RATE));
  const tipCents = calculateTip(subtotalCents, tip);
  return {
    subtotalCents,
    baseCents,
    taxCents: subtotalCents - baseCents,
    tipCents,
    totalCents: subtotalCents + tipCents,
  };
}

export interface SplitShare {
  label: string;
  subtotalCents: number;
  tipCents: number;
  totalCents: number;
  itemIds?: number[];
}

export type SplitRequest =
  | { mode: 'equal'; parts: number }
  | { mode: 'items'; assignments: Array<{ label: string; itemIds: number[] }> };

/**
 * Divide la cuenta.
 *  - "equal": partes iguales (subtotal y propina se reparten por separado).
 *  - "items": cada comensal paga lo que consumió. Un ítem asignado a varias personas
 *    (p.ej. una jarra de chicha compartida) se reparte en partes iguales entre ellas.
 *    La propina se reparte proporcional al consumo de cada uno: quien consumió más,
 *    deja más propina.
 * Invariante: la suma de todas las partes es exactamente el total de la cuenta.
 */
export function splitBill(lines: BillLine[], tip: TipInput | null | undefined, request: SplitRequest): SplitShare[] {
  const totals = calculateTotals(lines, tip);

  if (request.mode === 'equal') {
    const subtotals = splitEqually(totals.subtotalCents, request.parts);
    const tips = splitEqually(totals.tipCents, request.parts);
    return subtotals.map((subtotalCents, i) => ({
      label: `Persona ${i + 1}`,
      subtotalCents,
      tipCents: tips[i],
      totalCents: subtotalCents + tips[i],
    }));
  }

  const { assignments } = request;
  if (assignments.length === 0) throw new BusinessRuleError('Debe haber al menos una persona en la división');

  const lineById = new Map(lines.map((l) => [l.itemId, l]));
  const sharersByItem = new Map<number, number[]>();
  assignments.forEach((a, personIndex) => {
    for (const itemId of new Set(a.itemIds)) {
      if (!lineById.has(itemId)) {
        throw new BusinessRuleError(`El ítem ${itemId} no pertenece a esta cuenta`);
      }
      sharersByItem.set(itemId, [...(sharersByItem.get(itemId) ?? []), personIndex]);
    }
  });

  const unassigned = lines.filter((l) => !sharersByItem.has(l.itemId)).map((l) => l.itemId);
  if (unassigned.length > 0) {
    // Si quedara un ítem sin dueño, la suma de las partes no cuadraría con el total.
    throw new BusinessRuleError('Todos los ítems deben asignarse al menos a una persona', { unassigned });
  }

  const subtotals = assignments.map(() => 0);
  for (const [itemId, sharers] of sharersByItem) {
    const shares = splitEqually(lineTotal(lineById.get(itemId)!), sharers.length);
    sharers.forEach((personIndex, i) => {
      subtotals[personIndex] += shares[i];
    });
  }
  const tips = distributeProportionally(totals.tipCents, subtotals);

  return assignments.map((a, i) => ({
    label: a.label,
    itemIds: [...new Set(a.itemIds)],
    subtotalCents: subtotals[i],
    tipCents: tips[i],
    totalCents: subtotals[i] + tips[i],
  }));
}
