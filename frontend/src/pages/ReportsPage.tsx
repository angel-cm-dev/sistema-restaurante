import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { DataTable, type Column, type SortState } from '../components/DataTable';
import { api } from '../lib/api';
import { formatMoney, toDateInput } from '../lib/format';
import { clientPage } from '../lib/table';
import { useAsync } from '../lib/useAsync';
import type { ProductSales, WaiterSales } from '../types';

type Tab = 'product' | 'waiter';

/** Convierte el rango de fechas locales (inputs date) en instantes ISO para la API. */
function toRange(from: string, to: string) {
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T23:59:59.999`);
  return { from: start.toISOString(), to: end.toISOString() };
}

export function ReportsPage() {
  const today = new Date();
  const [from, setFrom] = useState(toDateInput(new Date(today.getTime() - 6 * 86400000)));
  const [to, setTo] = useState(toDateInput(today));
  const [tab, setTab] = useState<Tab>('product');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SortState>({ sort: 'revenue', order: 'desc' });

  const invalidRange = from > to;
  const { data, error, loading, reload } = useAsync(async () => {
    if (invalidRange) return null;
    const range = toRange(from, to);
    const [products, waiters] = await Promise.all([
      api.get<{ data: ProductSales[] }>('/reports/sales-by-product', range),
      api.get<{ data: WaiterSales[] }>('/reports/sales-by-waiter', range),
    ]);
    return { products: products.data, waiters: waiters.data };
  }, [from, to, invalidRange]);

  const productPage = useMemo(
    () =>
      clientPage(data?.products ?? [], {
        search,
        searchIn: (r) => `${r.productName} ${r.categoryName}`,
        sortBy: (r) => (sort.sort === 'name' ? r.productName : sort.sort === 'quantity' ? r.quantity : r.revenueCents),
        order: sort.order,
        page,
        pageSize: 10,
      }),
    [data, search, sort, page],
  );
  const waiterPage = useMemo(
    () =>
      clientPage(data?.waiters ?? [], {
        search,
        searchIn: (r) => r.waiterName,
        sortBy: (r) => (sort.sort === 'name' ? r.waiterName : sort.sort === 'orders' ? r.orders : sort.sort === 'tips' ? r.tipsCents : r.revenueCents),
        order: sort.order,
        page,
        pageSize: 10,
      }),
    [data, search, sort, page],
  );

  const totals = useMemo(
    () => ({
      revenue: (data?.products ?? []).reduce((a, r) => a + r.revenueCents, 0),
      units: (data?.products ?? []).reduce((a, r) => a + r.quantity, 0),
      tips: (data?.waiters ?? []).reduce((a, r) => a + r.tipsCents, 0),
    }),
    [data],
  );

  const productColumns: Column<ProductSales>[] = [
    { key: 'name', header: 'Plato', sortKey: 'name', render: (r) => <span className="font-medium">{r.productName}</span> },
    { key: 'cat', header: 'Categoría', render: (r) => r.categoryName },
    { key: 'qty', header: 'Unidades', sortKey: 'quantity', className: 'text-right', render: (r) => r.quantity },
    { key: 'rev', header: 'Ventas', sortKey: 'revenue', className: 'text-right tabular-nums', render: (r) => formatMoney(r.revenueCents) },
    {
      key: 'share',
      header: '% del total',
      className: 'text-right',
      render: (r) => (totals.revenue ? `${((r.revenueCents / totals.revenue) * 100).toFixed(1)}%` : '—'),
    },
  ];
  const waiterColumns: Column<WaiterSales>[] = [
    { key: 'name', header: 'Mozo', sortKey: 'name', render: (r) => <span className="font-medium">{r.waiterName}</span> },
    { key: 'orders', header: 'Mesas atendidas', sortKey: 'orders', className: 'text-right', render: (r) => r.orders },
    { key: 'rev', header: 'Ventas', sortKey: 'revenue', className: 'text-right tabular-nums', render: (r) => formatMoney(r.revenueCents) },
    { key: 'tips', header: 'Propinas', sortKey: 'tips', className: 'text-right tabular-nums', render: (r) => formatMoney(r.tipsCents) },
    { key: 'avg', header: 'Ticket promedio', className: 'text-right tabular-nums', render: (r) => formatMoney(r.orders ? Math.round(r.revenueCents / r.orders) : 0) },
  ];

  const toolbar = (
    <>
      <div className="relative min-w-[12rem] flex-1">
        <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
        <input
          className="input pl-9"
          placeholder={tab === 'product' ? 'Buscar plato o categoría…' : 'Buscar mozo…'}
          aria-label="Buscar"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        Desde
        <input type="date" className="input w-40" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
      </label>
      <label className="flex items-center gap-2 text-sm">
        Hasta
        <input type="date" className="input w-40" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
      </label>
    </>
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="page-title">Reportes de ventas</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">Solo cuentan mesas cobradas, por fecha de cobro.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card p-4">
          <p className="text-sm text-slate-500">Ventas del periodo</p>
          <p className="text-xl font-semibold tabular-nums">{formatMoney(totals.revenue)}</p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-slate-500">Platos vendidos</p>
          <p className="text-xl font-semibold tabular-nums">{totals.units}</p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-slate-500">Propinas</p>
          <p className="text-xl font-semibold tabular-nums">{formatMoney(totals.tips)}</p>
        </div>
      </div>

      <div className="flex gap-2" role="tablist">
        {(
          [
            ['product', 'Por plato'],
            ['waiter', 'Por mozo'],
          ] as const
        ).map(([t, label]) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            className={tab === t ? 'btn-primary' : 'btn-secondary'}
            onClick={() => {
              setTab(t);
              setPage(1);
              setSearch('');
              setSort({ sort: 'revenue', order: 'desc' });
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {invalidRange && <p className="field-error">La fecha "desde" debe ser anterior a "hasta".</p>}

      {tab === 'product' ? (
        <DataTable
          columns={productColumns}
          rows={data ? productPage.data : undefined}
          rowKey={(r) => r.productId}
          loading={loading}
          error={error}
          onRetry={() => reload()}
          emptyTitle="Sin ventas en el periodo"
          sort={sort}
          onSortChange={setSort}
          meta={productPage.meta}
          onPageChange={setPage}
          toolbar={toolbar}
        />
      ) : (
        <DataTable
          columns={waiterColumns}
          rows={data ? waiterPage.data : undefined}
          rowKey={(r) => r.waiterId}
          loading={loading}
          error={error}
          onRetry={() => reload()}
          emptyTitle="Sin ventas en el periodo"
          sort={sort}
          onSortChange={setSort}
          meta={waiterPage.meta}
          onPageChange={setPage}
          toolbar={toolbar}
        />
      )}
    </div>
  );
}
