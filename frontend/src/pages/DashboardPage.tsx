import { ChefHat, Clock, CreditCard, HandCoins, Receipt, TrendingUp, UtensilsCrossed } from 'lucide-react';
import type { ReactNode } from 'react';
import { ErrorState, LoadingState } from '../components/StateViews';
import { useSocketEvent } from '../context/SocketContext';
import { api } from '../lib/api';
import { formatDuration, formatMoney, PAYMENT_LABEL } from '../lib/format';
import { useAsync } from '../lib/useAsync';
import type { Dashboard } from '../types';

function Kpi({ icon, label, value, hint }: { icon: ReactNode; label: string; value: string; hint?: string }) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
        <span className="rounded-lg bg-brand-50 p-2 text-brand-600 dark:bg-brand-900/30 dark:text-brand-300">{icon}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</p>}
    </div>
  );
}

/** Barra horizontal simple (sin librería de gráficos: menos peso en el bundle). */
function Bar({ label, value, max, display }: { label: string; value: number; max: number; display: string }) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm">
        <span className="truncate">{label}</span>
        <span className="tabular-nums text-slate-500 dark:text-slate-400">{display}</span>
      </div>
      <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800">
        <div className="h-2 rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function DashboardPage() {
  const { data, error, loading, reload } = useAsync(() => api.get<Dashboard>('/reports/dashboard'), []);

  // Los KPIs se refrescan solos cuando se cobra una mesa o cambia el salón.
  useSocketEvent('order:closed', () => void reload({ silent: true }));
  useSocketEvent('table:updated', () => void reload({ silent: true }));

  if (loading && !data) return <LoadingState />;
  if (error || !data) return <ErrorState error={error} onRetry={() => reload()} />;

  const maxProduct = Math.max(0, ...data.topProducts.map((p) => p.revenueCents));
  const maxMethod = Math.max(0, ...data.paymentsByMethod.map((p) => p.amountCents));
  const activeTickets = (data.kitchen.pendiente ?? 0) + (data.kitchen.preparando ?? 0) + (data.kitchen.listo ?? 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Dashboard</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">Indicadores del día · se actualizan en tiempo real</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icon={<TrendingUp className="h-4 w-4" />} label="Ventas de hoy" value={formatMoney(data.salesCents)} hint="Consumo cobrado (IGV incluido)" />
        <Kpi icon={<HandCoins className="h-4 w-4" />} label="Propinas" value={formatMoney(data.tipsCents)} />
        <Kpi icon={<Receipt className="h-4 w-4" />} label="Mesas cobradas" value={String(data.closedOrders)} hint={`Ticket promedio ${formatMoney(data.averageTicketCents)}`} />
        <Kpi
          icon={<UtensilsCrossed className="h-4 w-4" />}
          label="Ocupación"
          value={`${data.occupancy.percent}%`}
          hint={`${data.occupancy.ocupada} ocupadas · ${data.occupancy.por_cobrar} por cobrar · ${data.occupancy.libre} libres`}
        />
        <Kpi icon={<ChefHat className="h-4 w-4" />} label="Comandas activas" value={String(activeTickets)} hint={`${data.kitchen.pendiente ?? 0} pendientes · ${data.kitchen.preparando ?? 0} preparando · ${data.kitchen.listo ?? 0} listas`} />
        <Kpi
          icon={<Clock className="h-4 w-4" />}
          label="Tiempo medio de preparación"
          value={data.kitchen.averagePrepSeconds !== null ? formatDuration(data.kitchen.averagePrepSeconds) : '—'}
          hint="Desde 'preparando' hasta 'listo'"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="mb-4 font-semibold">Platos más vendidos hoy</h2>
          {data.topProducts.length === 0 ? (
            <p className="text-sm text-slate-500">Aún no hay ventas hoy.</p>
          ) : (
            <div className="space-y-3">
              {data.topProducts.map((p) => (
                <Bar key={p.productId} label={`${p.productName} (${p.quantity})`} value={p.revenueCents} max={maxProduct} display={formatMoney(p.revenueCents)} />
              ))}
            </div>
          )}
        </section>
        <section className="card p-5">
          <h2 className="mb-4 flex items-center gap-2 font-semibold">
            <CreditCard className="h-4 w-4" /> Cobros por medio de pago
          </h2>
          {data.paymentsByMethod.length === 0 ? (
            <p className="text-sm text-slate-500">Sin cobros registrados hoy.</p>
          ) : (
            <div className="space-y-3">
              {data.paymentsByMethod.map((p) => (
                <Bar key={p.method} label={PAYMENT_LABEL[p.method]} value={p.amountCents} max={maxMethod} display={formatMoney(p.amountCents)} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
