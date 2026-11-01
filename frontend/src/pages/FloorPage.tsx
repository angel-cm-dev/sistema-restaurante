import { Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal } from '../components/Modal';
import { EmptyState, ErrorState, InlineError, LoadingState, Spinner } from '../components/StateViews';
import { TableStatusBadge } from '../components/StatusBadge';
import { useToast } from '../components/Toast';
import { useAuth } from '../context/AuthContext';
import { useSocketEvent } from '../context/SocketContext';
import { api } from '../lib/api';
import { TABLE_STATUS_LABEL } from '../lib/format';
import { useAsync } from '../lib/useAsync';
import type { DiningTable, Order, TableStatus } from '../types';

const CARD_STYLE: Record<TableStatus, string> = {
  libre: 'border-emerald-300 bg-emerald-50 hover:border-emerald-500 dark:border-emerald-800 dark:bg-emerald-950/30',
  ocupada: 'border-amber-300 bg-amber-50 hover:border-amber-500 dark:border-amber-800 dark:bg-amber-950/30',
  por_cobrar: 'border-sky-300 bg-sky-50 hover:border-sky-500 dark:border-sky-800 dark:bg-sky-950/30',
};

export function FloorPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const { data: tables, error, loading, reload, setData } = useAsync(() => api.get<DiningTable[]>('/tables'), []);
  const [statusFilter, setStatusFilter] = useState<TableStatus | ''>('');
  const [opening, setOpening] = useState<DiningTable | null>(null);
  const [guests, setGuests] = useState('2');
  const [openError, setOpenError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);

  // Tiempo real: otra persona abrió/cobró una mesa → actualizamos solo esa tarjeta.
  useSocketEvent<DiningTable>('table:updated', (updated) =>
    setData((prev) => prev?.map((t) => (t.id === updated.id ? updated : t)) ?? prev),
  );

  const zones = useMemo(() => {
    const visible = (tables ?? []).filter((t) => !statusFilter || t.status === statusFilter);
    const byZone = new Map<string, DiningTable[]>();
    [...visible]
      .sort((a, b) => a.posY - b.posY || a.posX - b.posX || a.number - b.number)
      .forEach((t) => byZone.set(t.zone, [...(byZone.get(t.zone) ?? []), t]));
    return [...byZone.entries()];
  }, [tables, statusFilter]);

  const counts = useMemo(() => {
    const c: Record<TableStatus, number> = { libre: 0, ocupada: 0, por_cobrar: 0 };
    tables?.forEach((t) => (c[t.status] += 1));
    return c;
  }, [tables]);

  const canTakeOrders = user?.role === 'admin' || user?.role === 'mozo';

  const onTableClick = (t: DiningTable) => {
    if (t.status === 'libre') {
      if (!canTakeOrders) return toast('Solo un mozo puede abrir mesas', 'info');
      setGuests(String(Math.min(2, t.seats)));
      setOpenError(null);
      setOpening(t);
    } else if (t.currentOrderId) {
      navigate(canTakeOrders ? `/pedidos/${t.currentOrderId}` : `/caja?pedido=${t.currentOrderId}`);
    }
  };

  const guestsNumber = Number(guests);
  const guestsInvalid = !Number.isInteger(guestsNumber) || guestsNumber < 1 || (opening ? guestsNumber > opening.seats + 4 : false);

  const openTable = async () => {
    if (!opening || guestsInvalid) return;
    setSubmitting(true);
    setOpenError(null);
    try {
      const order = await api.post<Order>('/orders', { tableId: opening.id, guests: guestsNumber });
      setOpening(null);
      navigate(`/pedidos/${order.id}`);
    } catch (e) {
      setOpenError(e);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading && !tables) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={() => reload()} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Salón</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {canTakeOrders ? 'Toca una mesa libre para abrirla o una ocupada para ver su pedido.' : 'Estado de las mesas en tiempo real.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por estado">
          <button className={statusFilter === '' ? 'btn-primary' : 'btn-secondary'} onClick={() => setStatusFilter('')}>
            Todas ({tables?.length ?? 0})
          </button>
          {(Object.keys(counts) as TableStatus[]).map((s) => (
            <button key={s} className={statusFilter === s ? 'btn-primary' : 'btn-secondary'} onClick={() => setStatusFilter(s)}>
              {TABLE_STATUS_LABEL[s]} ({counts[s]})
            </button>
          ))}
        </div>
      </div>

      {zones.length === 0 && <EmptyState title="No hay mesas con ese estado" />}

      {zones.map(([zone, list]) => (
        <section key={zone}>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{zone}</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {list.map((t) => (
              <button
                key={t.id}
                onClick={() => onTableClick(t)}
                className={`flex aspect-[4/3] flex-col justify-between rounded-xl border-2 p-3 text-left transition ${CARD_STYLE[t.status]}`}
                aria-label={`Mesa ${t.number}, ${TABLE_STATUS_LABEL[t.status]}`}
              >
                <div className="flex items-start justify-between">
                  <span className="text-2xl font-bold">{t.number}</span>
                  <TableStatusBadge status={t.status} />
                </div>
                <span className="flex items-center gap-1 text-xs text-slate-600 dark:text-slate-300">
                  <Users className="h-3.5 w-3.5" /> {t.seats} personas
                </span>
              </button>
            ))}
          </div>
        </section>
      ))}

      <Modal
        open={!!opening}
        title={`Abrir mesa ${opening?.number ?? ''}`}
        onClose={() => setOpening(null)}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setOpening(null)}>
              Cancelar
            </button>
            <button className="btn-primary" onClick={openTable} disabled={guestsInvalid || submitting}>
              {submitting && <Spinner className="h-4 w-4" />} Abrir y tomar pedido
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <label htmlFor="guests" className="label">
            Comensales
          </label>
          <input id="guests" type="number" min={1} className="input" value={guests} onChange={(e) => setGuests(e.target.value)} />
          {guestsInvalid && <p className="field-error">Entre 1 y {(opening?.seats ?? 0) + 4} comensales.</p>}
          <InlineError error={openError} />
        </div>
      </Modal>
    </div>
  );
}
