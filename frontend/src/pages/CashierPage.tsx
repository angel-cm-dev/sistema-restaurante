import { CheckCircle2, Receipt } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { EmptyState, ErrorState, InlineError, LoadingState, Spinner } from '../components/StateViews';
import { TableStatusBadge, TicketStatusBadge } from '../components/StatusBadge';
import { useToast } from '../components/Toast';
import { useSocketEvent } from '../context/SocketContext';
import { api } from '../lib/api';
import { changeDue, splitByItems, splitEqual, tipFor, type Share, type Tip } from '../lib/billing';
import { formatMoney, formatTime, parseMoney, PAYMENT_LABEL } from '../lib/format';
import { useAsync } from '../lib/useAsync';
import type { DiningTable, Order, OrderSummary, Page, PaymentMethod } from '../types';

type SplitMode = 'single' | 'equal' | 'items';
const TIP_PRESETS = [0, 5, 10, 15];

function BillPanel({ orderId, onClosed }: { orderId: number; onClosed(): void }) {
  const toast = useToast();
  const { data: order, error, loading, reload } = useAsync(() => api.get<Order>(`/orders/${orderId}`), [orderId]);
  const [tipPercent, setTipPercent] = useState<number | null>(10);
  const [tipCustom, setTipCustom] = useState('');
  const [mode, setMode] = useState<SplitMode>('single');
  const [parts, setParts] = useState(2);
  const [people, setPeople] = useState(['Persona 1', 'Persona 2']);
  const [assignment, setAssignment] = useState<Record<number, number[]>>({});
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [received, setReceived] = useState<string[]>([]);
  const [submitError, setSubmitError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);

  useSocketEvent<{ orderId: number }>('order:updated', (p) => p.orderId === orderId && void reload({ silent: true }));
  useSocketEvent<{ orderId: number }>('ticket:updated', (p) => p.orderId === orderId && void reload({ silent: true }));

  const customCents = tipCustom ? parseMoney(tipCustom) : null;
  const tip: Tip = tipPercent !== null ? { type: 'percent', value: tipPercent } : customCents !== null ? { type: 'amount', value: customCents } : null;

  const { shares, unassigned } = useMemo((): { shares: Share[]; unassigned: number[] } => {
    if (!order) return { shares: [], unassigned: [] };
    const subtotal = order.totals.subtotalCents;
    if (mode === 'equal') return { shares: splitEqual(subtotal, tip, parts), unassigned: [] };
    if (mode === 'items') return splitByItems(order.items, tip, people, assignment);
    const t = tipFor(subtotal, tip);
    return { shares: [{ label: 'Cuenta única', subtotalCents: subtotal, tipCents: t, totalCents: subtotal + t }], unassigned: [] };
  }, [order, mode, parts, people, assignment, tip]);

  // Mantiene un medio de pago por cada parte.
  useEffect(() => {
    setMethods((m) => shares.map((_, i) => m[i] ?? 'efectivo'));
    setReceived((r) => shares.map((_, i) => r[i] ?? ''));
    // Solo depende de la cantidad de partes: no queremos resetear lo que ya eligió el cajero.
  }, [shares.length]);

  if (loading && !order) return <LoadingState />;
  if (error || !order) return <ErrorState error={error} onRetry={() => reload()} />;

  const total = order.totals.subtotalCents + tipFor(order.totals.subtotalCents, tip);
  const pendingTickets = order.tickets.filter((t) => t.status !== 'entregado').length;
  const drafts = order.items.filter((i) => i.status === 'borrador').length;
  const invalidTip = tipPercent === null && tipCustom !== '' && customCents === null;

  const toggleAssign = (itemId: number, person: number) =>
    setAssignment((a) => {
      const current = a[itemId] ?? [];
      return { ...a, [itemId]: current.includes(person) ? current.filter((p) => p !== person) : [...current, person] };
    });

  const close = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      await api.post<Order>(`/orders/${order.id}/close`, {
        tip,
        payments: shares
          .map((s, i) => ({ method: methods[i] ?? 'efectivo', amountCents: s.totalCents, payerLabel: s.label }))
          .filter((p) => p.amountCents > 0),
      });
      toast(`Mesa ${order.tableNumber} cobrada: ${formatMoney(total)}`, 'success');
      onClosed();
    } catch (e) {
      setSubmitError(e);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="card space-y-5 p-5">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold">Mesa {order.tableNumber}</h2>
          <p className="text-sm text-slate-500">
            Pedido #{order.id} · {order.waiterName} · {formatTime(order.openedAt)}
          </p>
        </div>
        <p className="text-2xl font-bold tabular-nums">{formatMoney(total)}</p>
      </div>

      <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800">
        {order.items.map((i) => (
          <li key={i.id} className="flex items-center justify-between gap-2 py-2">
            <span>
              {i.quantity}× {i.productName}
              {i.modifiers.length > 0 && <span className="text-xs text-slate-500"> ({i.modifiers.map((m) => m.name).join(', ')})</span>}
            </span>
            <span className="flex items-center gap-2">
              <TicketStatusBadge status={i.status} />
              <span className="tabular-nums">{formatMoney(i.lineTotalCents)}</span>
            </span>
          </li>
        ))}
      </ul>

      <dl className="grid grid-cols-2 gap-1 rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800/50">
        <dt className="text-slate-500">Op. gravada</dt>
        <dd className="text-right tabular-nums">{formatMoney(order.totals.baseCents)}</dd>
        <dt className="text-slate-500">IGV 18% (incluido)</dt>
        <dd className="text-right tabular-nums">{formatMoney(order.totals.taxCents)}</dd>
        <dt className="text-slate-500">Consumo</dt>
        <dd className="text-right tabular-nums">{formatMoney(order.totals.subtotalCents)}</dd>
        <dt className="text-slate-500">Propina</dt>
        <dd className="text-right tabular-nums">{formatMoney(total - order.totals.subtotalCents)}</dd>
      </dl>

      {/* Propina */}
      <fieldset>
        <legend className="label">Propina</legend>
        <div className="flex flex-wrap items-center gap-2">
          {TIP_PRESETS.map((p) => (
            <button
              key={p}
              className={tipPercent === p ? 'btn-primary px-3 py-1.5' : 'btn-secondary px-3 py-1.5'}
              onClick={() => {
                setTipPercent(p);
                setTipCustom('');
              }}
            >
              {p}%
            </button>
          ))}
          <input
            className="input w-32"
            placeholder="Monto S/"
            inputMode="decimal"
            aria-label="Propina en soles"
            value={tipCustom}
            onChange={(e) => {
              setTipCustom(e.target.value);
              setTipPercent(null);
            }}
          />
        </div>
        {invalidTip && <p className="field-error">Monto inválido (ej. 12.50)</p>}
      </fieldset>

      {/* División */}
      <fieldset>
        <legend className="label">División de cuenta</legend>
        <div className="mb-3 flex flex-wrap gap-2">
          {(
            [
              ['single', 'Una cuenta'],
              ['equal', 'Partes iguales'],
              ['items', 'Por consumo'],
            ] as const
          ).map(([m, label]) => (
            <button key={m} className={mode === m ? 'btn-primary px-3 py-1.5' : 'btn-secondary px-3 py-1.5'} onClick={() => setMode(m)}>
              {label}
            </button>
          ))}
        </div>
        {mode === 'equal' && (
          <label className="flex items-center gap-2 text-sm">
            Número de personas
            <input type="number" min={1} max={30} className="input w-20" value={parts} onChange={(e) => setParts(Math.min(30, Math.max(1, Number(e.target.value) || 1)))} />
          </label>
        )}
        {mode === 'items' && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {people.map((p, idx) => (
                <input
                  key={idx}
                  className="input w-32"
                  value={p}
                  aria-label={`Nombre persona ${idx + 1}`}
                  onChange={(e) => setPeople((list) => list.map((x, i) => (i === idx ? e.target.value : x)))}
                />
              ))}
              <button className="btn-secondary px-3 py-1.5" disabled={people.length >= 10} onClick={() => setPeople((l) => [...l, `Persona ${l.length + 1}`])}>
                + Persona
              </button>
              <button
                className="btn-ghost px-3 py-1.5"
                disabled={people.length <= 2}
                onClick={() => {
                  const last = people.length - 1;
                  setPeople((l) => l.slice(0, -1));
                  setAssignment((a) => Object.fromEntries(Object.entries(a).map(([k, v]) => [k, v.filter((p) => p !== last)])));
                }}
              >
                − Persona
              </button>
            </div>
            <p className="text-xs text-slate-500">Toca a quién(es) corresponde cada ítem. Si lo comparten varios, se divide entre ellos.</p>
            {order.items.map((i) => (
              <div key={i.id} className="flex flex-wrap items-center gap-2 text-sm">
                <span className={`min-w-[10rem] flex-1 ${unassigned.includes(i.id) ? 'text-rose-600' : ''}`}>
                  {i.quantity}× {i.productName} · {formatMoney(i.lineTotalCents)}
                </span>
                {people.map((p, idx) => (
                  <button
                    key={idx}
                    className={`badge cursor-pointer border ${
                      assignment[i.id]?.includes(idx) ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 dark:border-slate-600'
                    }`}
                    onClick={() => toggleAssign(i.id, idx)}
                  >
                    {p || `P${idx + 1}`}
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </fieldset>

      {/* Pagos */}
      <div className="space-y-2">
        <h3 className="label">Pagos</h3>
        {shares.map((s, idx) => {
          const cash = parseMoney(received[idx] ?? '');
          return (
            <div key={idx} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 p-2 text-sm dark:border-slate-700">
              <span className="min-w-[7rem] flex-1 font-medium">{s.label}</span>
              <span className="tabular-nums text-slate-500">
                {formatMoney(s.subtotalCents)} + {formatMoney(s.tipCents)}
              </span>
              <strong className="w-24 text-right tabular-nums">{formatMoney(s.totalCents)}</strong>
              <select
                className="input w-36"
                aria-label={`Medio de pago de ${s.label}`}
                value={methods[idx] ?? 'efectivo'}
                onChange={(e) => setMethods((m) => m.map((x, i) => (i === idx ? (e.target.value as PaymentMethod) : x)))}
              >
                {(Object.keys(PAYMENT_LABEL) as PaymentMethod[]).map((m) => (
                  <option key={m} value={m}>
                    {PAYMENT_LABEL[m]}
                  </option>
                ))}
              </select>
              {methods[idx] === 'efectivo' && (
                <span className="flex items-center gap-2">
                  <input
                    className="input w-28"
                    placeholder="Recibido"
                    inputMode="decimal"
                    aria-label={`Efectivo recibido de ${s.label}`}
                    value={received[idx] ?? ''}
                    onChange={(e) => setReceived((r) => r.map((x, i) => (i === idx ? e.target.value : x)))}
                  />
                  {cash !== null && <span className="text-xs text-slate-500">Vuelto: {formatMoney(changeDue(s.totalCents, cash))}</span>}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {(pendingTickets > 0 || drafts > 0) && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          {drafts > 0 ? `${drafts} ítem(s) sin enviar a cocina. ` : ''}
          {pendingTickets > 0 ? `${pendingTickets} comanda(s) aún no entregadas.` : ''} No se puede cobrar todavía.
        </p>
      )}
      {unassigned.length > 0 && <p className="field-error">Hay {unassigned.length} ítem(s) sin asignar a nadie.</p>}
      <InlineError error={submitError} />

      <button
        className="btn-primary w-full py-3 text-base"
        disabled={submitting || invalidTip || unassigned.length > 0 || pendingTickets > 0 || drafts > 0 || order.items.length === 0}
        onClick={close}
      >
        {submitting ? <Spinner className="h-4 w-4" /> : <CheckCircle2 className="h-5 w-5" />} Cobrar {formatMoney(total)} y liberar mesa
      </button>
    </div>
  );
}

export function CashierPage() {
  const [params, setParams] = useSearchParams();
  const selected = params.get('pedido') ? Number(params.get('pedido')) : null;
  const { data, error, loading, reload } = useAsync(
    () => Promise.all([api.get<Page<OrderSummary>>('/orders', { status: 'abierta', pageSize: 100 }), api.get<DiningTable[]>('/tables')]),
    [],
  );

  useSocketEvent('table:updated', () => void reload({ silent: true }));
  useSocketEvent('order:updated', () => void reload({ silent: true }));
  useSocketEvent('order:closed', () => void reload({ silent: true }));

  const rows = useMemo(() => {
    if (!data) return [];
    const statusByTable = new Map(data[1].map((t) => [t.id, t.status]));
    return data[0].data
      .map((o) => ({ ...o, tableStatus: statusByTable.get(o.tableId) ?? 'ocupada' }))
      // Primero las mesas que pidieron la cuenta.
      .sort((a, b) => Number(b.tableStatus === 'por_cobrar') - Number(a.tableStatus === 'por_cobrar') || a.tableNumber - b.tableNumber);
  }, [data]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="page-title">Caja</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">Cobro, propina y división de cuenta.</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <section className="card p-3">
          <h2 className="mb-2 px-1 font-semibold">Mesas abiertas</h2>
          {loading && !data ? (
            <LoadingState />
          ) : error ? (
            <ErrorState error={error} onRetry={() => reload()} />
          ) : rows.length === 0 ? (
            <EmptyState title="No hay mesas abiertas" />
          ) : (
            <ul className="space-y-2">
              {rows.map((o) => (
                <li key={o.id}>
                  <button
                    onClick={() => setParams({ pedido: String(o.id) })}
                    className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition ${
                      selected === o.id ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20' : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'
                    }`}
                  >
                    <span>
                      <span className="font-semibold">Mesa {o.tableNumber}</span>
                      <span className="block text-xs text-slate-500">
                        {o.waiterName} · {o.itemCount} ítems
                      </span>
                    </span>
                    <span className="flex flex-col items-end gap-1">
                      <TableStatusBadge status={o.tableStatus} />
                      <span className="tabular-nums">{formatMoney(o.subtotalCents)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        {selected ? (
          <BillPanel key={selected} orderId={selected} onClosed={() => setParams({})} />
        ) : (
          <div className="card">
            <EmptyState title="Selecciona una mesa" description="Elige una mesa de la lista para ver su cuenta y cobrarla." action={<Receipt className="h-5 w-5 text-slate-400" />} />
          </div>
        )}
      </div>
    </div>
  );
}
