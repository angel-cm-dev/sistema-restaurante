import { ChefHat, Clock } from 'lucide-react';
import { useState } from 'react';
import { EmptyState, ErrorState, LoadingState, Spinner } from '../components/StateViews';
import { useToast } from '../components/Toast';
import { useAuth } from '../context/AuthContext';
import { useSocket, useSocketEvent } from '../context/SocketContext';
import { api, errorMessage } from '../lib/api';
import { formatDuration, secondsSince } from '../lib/format';
import { kitchenAction, urgencyFor } from '../lib/kitchen';
import { useAsync, useNow } from '../lib/useAsync';
import type { KitchenTicket, TicketStatus } from '../types';

const COLUMNS: Array<{ status: TicketStatus; title: string; accent: string }> = [
  { status: 'pendiente', title: 'Pendientes', accent: 'border-t-rose-500' },
  { status: 'preparando', title: 'Preparando', accent: 'border-t-amber-500' },
  { status: 'listo', title: 'Listos para servir', accent: 'border-t-emerald-500' },
];

const URGENCY_STYLE = {
  ok: 'text-slate-500 dark:text-slate-400',
  warning: 'text-amber-600 dark:text-amber-400 font-semibold',
  late: 'text-rose-600 dark:text-rose-400 font-bold animate-pulse',
};

type AdvanceAck = { ok: true; data: KitchenTicket } | { ok: false; error: { message: string } };

export function KitchenPage() {
  const { user } = useAuth();
  const { socket, connected } = useSocket();
  const toast = useToast();
  const now = useNow(1000);
  const [busyId, setBusyId] = useState<number | null>(null);
  const { data: tickets, error, loading, reload, setData } = useAsync(() => api.get<KitchenTicket[]>('/kitchen/tickets'), []);

  const upsert = (t: KitchenTicket) =>
    setData((prev) => {
      const list = prev ?? [];
      // Las comandas entregadas salen del tablero.
      if (t.status === 'entregado') return list.filter((x) => x.id !== t.id);
      return list.some((x) => x.id === t.id) ? list.map((x) => (x.id === t.id ? t : x)) : [...list, t];
    });

  useSocketEvent<KitchenTicket>('ticket:created', (t) => {
    upsert(t);
    toast(`Nueva comanda · mesa ${t.tableNumber}`, 'info');
  });
  useSocketEvent<KitchenTicket>('ticket:updated', upsert);
  // Al reconectar se resincroniza por si se perdieron eventos durante la desconexión.
  useSocketEvent('connect', () => void reload({ silent: true }));

  /** Avanza por socket (ack) si hay conexión; si no, por REST. Ambos aplican las mismas reglas. */
  const advance = async (ticket: KitchenTicket) => {
    setBusyId(ticket.id);
    try {
      if (socket && connected) {
        const res = (await socket.timeout(5000).emitWithAck('ticket:advance', { ticketId: ticket.id })) as AdvanceAck;
        if (!res.ok) throw new Error(res.error.message);
        upsert(res.data);
      } else {
        upsert(await api.post<KitchenTicket>(`/kitchen/tickets/${ticket.id}/advance`));
      }
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusyId(null);
    }
  };

  if (loading && !tickets) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={() => reload()} />;

  const sorted = [...(tickets ?? [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <ChefHat className="h-6 w-6" /> Cocina (KDS)
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Orden de llegada (FIFO). Amarillo &gt; 10 min, rojo &gt; 20 min.</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {COLUMNS.map((col) => {
          const list = sorted.filter((t) => t.status === col.status);
          return (
            <section key={col.status} className={`card border-t-4 ${col.accent} flex min-h-[16rem] flex-col`} aria-label={col.title}>
              <h2 className="flex items-center justify-between border-b border-slate-200 px-4 py-3 font-semibold dark:border-slate-800">
                {col.title}
                <span className="badge bg-slate-100 dark:bg-slate-800">{list.length}</span>
              </h2>
              <div className="flex-1 space-y-3 p-3">
                {list.length === 0 && <EmptyState title="Sin comandas" />}
                {list.map((t) => {
                  const elapsed = secondsSince(t.createdAt, now);
                  const action = user ? kitchenAction(t.status, user.role) : null;
                  return (
                    <article key={t.id} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-800/60">
                      <header className="mb-2 flex items-center justify-between">
                        <div>
                          <p className="text-lg font-bold">Mesa {t.tableNumber}</p>
                          <p className="text-xs text-slate-500">
                            #{t.id} · {t.waiterName}
                          </p>
                        </div>
                        <span className={`flex items-center gap-1 tabular-nums ${URGENCY_STYLE[urgencyFor(elapsed)]}`}>
                          <Clock className="h-4 w-4" /> {formatDuration(elapsed)}
                        </span>
                      </header>
                      <ul className="mb-3 space-y-1 text-sm">
                        {t.items.map((i) => (
                          <li key={i.id}>
                            <span className="font-semibold">{i.quantity}×</span> {i.productName}
                            {i.modifiers.length > 0 && <span className="block pl-5 text-xs text-slate-500">{i.modifiers.join(' · ')}</span>}
                            {i.notes && <span className="block pl-5 text-xs italic text-amber-700 dark:text-amber-400">“{i.notes}”</span>}
                          </li>
                        ))}
                      </ul>
                      {action && (
                        <button className="btn-primary w-full" disabled={busyId === t.id} onClick={() => advance(t)}>
                          {busyId === t.id && <Spinner className="h-4 w-4" />} {action}
                        </button>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
