/**
 * Cálculo de cuenta en el cliente para la VISTA PREVIA instantánea en caja.
 * Replica las reglas del backend (domain/billing.ts); el backend sigue siendo la
 * fuente de verdad y vuelve a validar todo al cobrar.
 */
export type Tip = { type: 'percent'; value: number } | { type: 'amount'; value: number } | null;

export interface Line {
  id: number;
  lineTotalCents: number;
}

export interface Share {
  label: string;
  subtotalCents: number;
  tipCents: number;
  totalCents: number;
}

/** Reparto con método del resto mayor: la suma de las partes es SIEMPRE el total. */
export function distribute(total: number, weights: number[]): number[] {
  if (weights.length === 0) return [];
  const sum = weights.reduce((a, b) => a + b, 0);
  const w = sum === 0 ? weights.map(() => 1) : weights;
  const s = sum === 0 ? weights.length : sum;
  const raw = w.map((x) => (total * x) / s);
  const floors = raw.map(Math.floor);
  let remainder = total - floors.reduce((a, b) => a + b, 0);
  raw
    .map((v, index) => ({ index, fraction: v - Math.floor(v) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index)
    .forEach(({ index }) => {
      if (remainder > 0) {
        floors[index] += 1;
        remainder -= 1;
      }
    });
  return floors;
}

export function tipFor(subtotalCents: number, tip: Tip): number {
  if (!tip) return 0;
  return tip.type === 'percent' ? Math.round((subtotalCents * tip.value) / 100) : tip.value;
}

export function splitEqual(subtotalCents: number, tip: Tip, parts: number): Share[] {
  const n = Math.max(1, Math.floor(parts));
  const subtotals = distribute(subtotalCents, Array(n).fill(1));
  const tips = distribute(tipFor(subtotalCents, tip), Array(n).fill(1));
  return subtotals.map((s, i) => ({ label: `Persona ${i + 1}`, subtotalCents: s, tipCents: tips[i], totalCents: s + tips[i] }));
}

/**
 * División por ítems. `assignment` mapea id de ítem → índices de las personas que lo comparten.
 * Devuelve también los ítems sin asignar para avisar en pantalla.
 */
export function splitByItems(
  lines: Line[],
  tip: Tip,
  people: string[],
  assignment: Record<number, number[]>,
): { shares: Share[]; unassigned: number[] } {
  const subtotals = people.map(() => 0);
  const unassigned: number[] = [];
  for (const line of lines) {
    const sharers = (assignment[line.id] ?? []).filter((p) => p >= 0 && p < people.length);
    if (sharers.length === 0) {
      unassigned.push(line.id);
      continue;
    }
    distribute(line.lineTotalCents, Array(sharers.length).fill(1)).forEach((amount, i) => {
      subtotals[sharers[i]] += amount;
    });
  }
  const subtotal = lines.reduce((a, l) => a + l.lineTotalCents, 0);
  const tips = distribute(tipFor(subtotal, tip), subtotals);
  return {
    shares: people.map((label, i) => ({ label, subtotalCents: subtotals[i], tipCents: tips[i], totalCents: subtotals[i] + tips[i] })),
    unassigned,
  };
}

/** Vuelto para pagos en efectivo. */
export function changeDue(totalCents: number, receivedCents: number): number {
  return Math.max(0, receivedCents - totalCents);
}
