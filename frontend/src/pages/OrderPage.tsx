import { ArrowLeft, Ban, Minus, Plus, Receipt, Search, Send, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Modal } from '../components/Modal';
import { EmptyState, ErrorState, InlineError, LoadingState, Spinner } from '../components/StateViews';
import { TicketStatusBadge } from '../components/StatusBadge';
import { useToast } from '../components/Toast';
import { useSocketEvent } from '../context/SocketContext';
import { api, errorMessage } from '../lib/api';
import { formatMoney, formatTime } from '../lib/format';
import { useAsync } from '../lib/useAsync';
import type { Category, Order, Page, Product } from '../types';

function ProductModal({ product, onClose, onAdd }: { product: Product; onClose(): void; onAdd(body: unknown): Promise<void> }) {
  const [quantity, setQuantity] = useState(1);
  const [selected, setSelected] = useState<number[]>([]);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);

  const unit = product.priceCents + product.modifiers.filter((m) => selected.includes(m.id)).reduce((a, m) => a + m.priceCents, 0);

  const submit = async () => {
    if (notes.length > 200) return setError(new Error('La nota admite máximo 200 caracteres'));
    setSaving(true);
    setError(null);
    try {
      await onAdd({ productId: product.id, quantity, modifierIds: selected, notes: notes.trim() || undefined });
      onClose();
    } catch (e) {
      setError(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      title={product.name}
      onClose={onClose}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn-primary" onClick={submit} disabled={saving}>
            {saving && <Spinner className="h-4 w-4" />} Agregar · {formatMoney(unit * quantity)}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-500 dark:text-slate-400">{product.description}</p>
        {product.modifiers.length > 0 && (
          <fieldset>
            <legend className="label">Modificadores</legend>
            <div className="space-y-2">
              {product.modifiers.map((m) => (
                <label key={m.id} className="flex cursor-pointer items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700">
                  <span className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-brand-600"
                      checked={selected.includes(m.id)}
                      onChange={(e) => setSelected((s) => (e.target.checked ? [...s, m.id] : s.filter((id) => id !== m.id)))}
                    />
                    {m.name}
                  </span>
                  <span className="text-slate-500">{m.priceCents > 0 ? `+${formatMoney(m.priceCents)}` : 'sin costo'}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <div>
          <span className="label">Cantidad</span>
          <div className="flex items-center gap-3">
            <button className="btn-secondary p-2" onClick={() => setQuantity((q) => Math.max(1, q - 1))} aria-label="Menos">
              <Minus className="h-4 w-4" />
            </button>
            <span className="w-8 text-center text-lg font-semibold tabular-nums">{quantity}</span>
            <button className="btn-secondary p-2" onClick={() => setQuantity((q) => Math.min(50, q + 1))} aria-label="Más">
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div>
          <label htmlFor="notes" className="label">
            Nota para cocina (opcional)
          </label>
          <input id="notes" className="input" maxLength={200} placeholder="Ej.: sin ají, alergia al maní" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <InlineError error={error} />
      </div>
    </Modal>
  );
}

export function OrderPage() {
  const { orderId } = useParams();
  const id = Number(orderId);
  const navigate = useNavigate();
  const toast = useToast();
  const order = useAsync(() => api.get<Order>(`/orders/${id}`), [id]);
  const menu = useAsync(
    () =>
      Promise.all([
        api.get<Category[]>('/menu/categories'),
        api.get<Page<Product>>('/menu/products', { active: true, pageSize: 100, sort: 'category' }),
      ]),
    [],
  );
  const [category, setCategory] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<Product | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useSocketEvent<{ orderId: number }>('order:updated', (p) => p.orderId === id && void order.reload({ silent: true }));
  useSocketEvent<{ orderId: number }>('ticket:updated', (p) => p.orderId === id && void order.reload({ silent: true }));

  const products = useMemo(() => {
    const all = menu.data?.[1].data ?? [];
    const q = search.trim().toLowerCase();
    return all.filter((p) => (!category || p.categoryId === category) && (!q || p.name.toLowerCase().includes(q)));
  }, [menu.data, category, search]);

  const run = async (label: string, action: () => Promise<Order>, success: string): Promise<boolean> => {
    setBusy(label);
    try {
      order.setData(await action());
      toast(success, 'success');
      return true;
    } catch (e) {
      toast(errorMessage(e), 'error');
      return false;
    } finally {
      setBusy(null);
    }
  };

  if (order.loading && !order.data) return <LoadingState />;
  if (order.error || !order.data) return <ErrorState error={order.error} onRetry={() => order.reload()} />;

  const o = order.data;
  const editable = o.status === 'abierta';
  const drafts = o.items.filter((i) => i.status === 'borrador');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/salon" className="btn-ghost px-2" aria-label="Volver al salón">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="page-title">Mesa {o.tableNumber}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Pedido #{o.id} · {o.guests} comensales · {o.waiterName} · abierto {formatTime(o.openedAt)}
          </p>
        </div>
      </div>

      {!editable && (
        <div className="rounded-lg border border-slate-200 bg-slate-100 px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-800">
          Este pedido está <strong>{o.status}</strong>; ya no se puede modificar.
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        {/* Carta */}
        <section className="card p-4">
          <div className="mb-3 flex flex-wrap gap-2">
            <div className="relative min-w-[12rem] flex-1">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input className="input pl-9" placeholder="Buscar plato…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Buscar plato" />
            </div>
          </div>
          <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
            <button className={category === null ? 'btn-primary' : 'btn-secondary'} onClick={() => setCategory(null)}>
              Todo
            </button>
            {menu.data?.[0].map((c) => (
              <button key={c.id} className={`${category === c.id ? 'btn-primary' : 'btn-secondary'} whitespace-nowrap`} onClick={() => setCategory(c.id)}>
                {c.name}
              </button>
            ))}
          </div>
          {menu.loading && !menu.data ? (
            <LoadingState label="Cargando carta…" />
          ) : menu.error ? (
            <ErrorState error={menu.error} onRetry={() => menu.reload()} />
          ) : products.length === 0 ? (
            <EmptyState title="No hay platos que coincidan" />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {products.map((p) => (
                <button
                  key={p.id}
                  disabled={!editable}
                  onClick={() => setPicked(p)}
                  className="rounded-xl border border-slate-200 p-3 text-left transition hover:border-brand-400 hover:shadow-sm disabled:opacity-50 dark:border-slate-700"
                >
                  <p className="font-medium">{p.name}</p>
                  <p className="line-clamp-2 text-xs text-slate-500 dark:text-slate-400">{p.description}</p>
                  <p className="mt-2 text-sm font-semibold text-brand-700 dark:text-brand-300">{formatMoney(p.priceCents)}</p>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Cuenta */}
        <aside className="card flex flex-col p-4 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)]">
          <h2 className="mb-3 font-semibold">Pedido</h2>
          <div className="-mx-1 flex-1 space-y-2 overflow-y-auto px-1">
            {o.items.length === 0 && <EmptyState title="Sin ítems" description="Elige platos de la carta para empezar." />}
            {o.items.map((item) => (
              <div key={item.id} className="rounded-lg border border-slate-200 p-2.5 text-sm dark:border-slate-700">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {item.quantity}× {item.productName}
                    </p>
                    {item.modifiers.length > 0 && <p className="text-xs text-slate-500">{item.modifiers.map((m) => m.name).join(', ')}</p>}
                    {item.notes && <p className="text-xs italic text-amber-700 dark:text-amber-400">“{item.notes}”</p>}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="tabular-nums">{formatMoney(item.lineTotalCents)}</span>
                    <TicketStatusBadge status={item.status} />
                  </div>
                </div>
                {item.status === 'borrador' && editable && (
                  <button
                    className="mt-1 inline-flex items-center gap-1 text-xs text-rose-600 hover:underline"
                    onClick={() => run('remove', () => api.delete<Order>(`/orders/${o.id}/items/${item.id}`), 'Ítem eliminado')}
                  >
                    <Trash2 className="h-3 w-3" /> Quitar
                  </button>
                )}
              </div>
            ))}
          </div>

          <dl className="mt-4 space-y-1 border-t border-slate-200 pt-3 text-sm dark:border-slate-700">
            <div className="flex justify-between text-slate-500">
              <dt>Op. gravada</dt>
              <dd className="tabular-nums">{formatMoney(o.totals.baseCents)}</dd>
            </div>
            <div className="flex justify-between text-slate-500">
              <dt>IGV (18%)</dt>
              <dd className="tabular-nums">{formatMoney(o.totals.taxCents)}</dd>
            </div>
            <div className="flex justify-between text-base font-semibold">
              <dt>Total</dt>
              <dd className="tabular-nums">{formatMoney(o.totals.subtotalCents)}</dd>
            </div>
          </dl>

          {editable && (
            <div className="mt-4 grid gap-2">
              <button
                className="btn-primary"
                disabled={drafts.length === 0 || !!busy}
                onClick={() => run('send', () => api.post<Order>(`/orders/${o.id}/send`), 'Comanda enviada a cocina')}
              >
                {busy === 'send' ? <Spinner className="h-4 w-4" /> : <Send className="h-4 w-4" />}
                Enviar a cocina {drafts.length > 0 && `(${drafts.length})`}
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button
                  className="btn-secondary"
                  disabled={o.items.length === 0 || drafts.length > 0 || !!busy}
                  title={drafts.length > 0 ? 'Envía primero los ítems pendientes' : undefined}
                  onClick={() => run('bill', () => api.post<Order>(`/orders/${o.id}/request-bill`), 'Mesa marcada como "por cobrar"')}
                >
                  <Receipt className="h-4 w-4" /> Pedir cuenta
                </button>
                <button
                  className="btn-secondary text-rose-600"
                  disabled={!!busy}
                  onClick={async () => {
                    if (!window.confirm('¿Anular este pedido y liberar la mesa?')) return;
                    if (await run('cancel', () => api.post<Order>(`/orders/${o.id}/cancel`), 'Pedido anulado')) navigate('/salon');
                  }}
                >
                  <Ban className="h-4 w-4" /> Anular
                </button>
              </div>
            </div>
          )}
        </aside>
      </div>

      {picked && (
        <ProductModal
          product={picked}
          onClose={() => setPicked(null)}
          onAdd={async (body) => {
            order.setData(await api.post<Order>(`/orders/${o.id}/items`, body));
            toast(`${picked.name} agregado`, 'success');
          }}
        />
      )}
    </div>
  );
}
