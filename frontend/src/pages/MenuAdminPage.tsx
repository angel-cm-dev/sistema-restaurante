import { Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { z } from 'zod';
import { DataTable, type Column, type SortState } from '../components/DataTable';
import { Modal } from '../components/Modal';
import { InlineError, Spinner } from '../components/StateViews';
import { useToast } from '../components/Toast';
import { api } from '../lib/api';
import { formatMoney, parseMoney } from '../lib/format';
import { fieldErrors, serverFieldErrors } from '../lib/forms';
import { useAsync, useDebounced } from '../lib/useAsync';
import type { Category, Page, Product } from '../types';

interface FormState {
  name: string;
  description: string;
  categoryId: string;
  price: string;
  active: boolean;
  modifiers: Array<{ name: string; price: string }>;
}

const money = z.string().refine((v) => parseMoney(v) !== null, 'Monto inválido (ej. 38.50)');

export const productFormSchema = z.object({
  name: z.string().trim().min(2, 'Mínimo 2 caracteres').max(120),
  description: z.string().trim().max(500, 'Máximo 500 caracteres'),
  categoryId: z.string().min(1, 'Elige una categoría'),
  price: money.refine((v) => (parseMoney(v) ?? 0) > 0, 'El precio debe ser mayor a 0'),
  active: z.boolean(),
  modifiers: z.array(z.object({ name: z.string().trim().min(1, 'Nombre requerido').max(60), price: money })).max(20),
});

const emptyForm: FormState = { name: '', description: '', categoryId: '', price: '', active: true, modifiers: [] };

function ProductForm({ product, categories, onClose, onSaved }: { product: Product | null; categories: Category[]; onClose(): void; onSaved(): void }) {
  const [form, setForm] = useState<FormState>(
    product
      ? {
          name: product.name,
          description: product.description,
          categoryId: String(product.categoryId),
          price: (product.priceCents / 100).toFixed(2),
          active: product.active,
          modifiers: product.modifiers.map((m) => ({ name: m.name, price: (m.priceCents / 100).toFixed(2) })),
        }
      : emptyForm,
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const save = async () => {
    const parsed = productFormSchema.safeParse(form);
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setSaving(true);
    setSubmitError(null);
    const body = {
      name: parsed.data.name,
      description: parsed.data.description,
      categoryId: Number(parsed.data.categoryId),
      priceCents: parseMoney(parsed.data.price)!,
      active: parsed.data.active,
      modifiers: parsed.data.modifiers.map((m) => ({ name: m.name, priceCents: parseMoney(m.price)! })),
    };
    try {
      if (product) await api.patch(`/menu/products/${product.id}`, body);
      else await api.post('/menu/products', body);
      toast(product ? 'Producto actualizado' : 'Producto creado', 'success');
      onSaved();
    } catch (e) {
      setErrors(serverFieldErrors(e));
      setSubmitError(e);
    } finally {
      setSaving(false);
    }
  };

  const setModifier = (idx: number, patch: Partial<{ name: string; price: string }>) =>
    setForm((f) => ({ ...f, modifiers: f.modifiers.map((m, i) => (i === idx ? { ...m, ...patch } : m)) }));

  return (
    <Modal
      open
      size="lg"
      title={product ? `Editar: ${product.name}` : 'Nuevo producto'}
      onClose={onClose}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving && <Spinner className="h-4 w-4" />} Guardar
          </button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="p-name" className="label">
            Nombre
          </label>
          <input id="p-name" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          {errors.name && <p className="field-error">{errors.name}</p>}
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="p-desc" className="label">
            Descripción
          </label>
          <textarea id="p-desc" rows={2} className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          {errors.description && <p className="field-error">{errors.description}</p>}
        </div>
        <div>
          <label htmlFor="p-cat" className="label">
            Categoría
          </label>
          <select id="p-cat" className="input" value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
            <option value="">Selecciona…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {errors.categoryId && <p className="field-error">{errors.categoryId}</p>}
        </div>
        <div>
          <label htmlFor="p-price" className="label">
            Precio (S/, IGV incluido)
          </label>
          <input id="p-price" className="input" inputMode="decimal" placeholder="38.00" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
          {errors.price && <p className="field-error">{errors.price}</p>}
        </div>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
          Disponible en carta
        </label>

        <div className="sm:col-span-2">
          <div className="mb-2 flex items-center justify-between">
            <span className="label mb-0">Modificadores</span>
            <button className="btn-secondary px-2 py-1 text-xs" onClick={() => setForm((f) => ({ ...f, modifiers: [...f.modifiers, { name: '', price: '0' }] }))}>
              <Plus className="h-3 w-3" /> Agregar
            </button>
          </div>
          {form.modifiers.length === 0 && <p className="text-xs text-slate-500">Sin modificadores (p.ej. "Sin cebolla", "Extra queso +S/ 3").</p>}
          <div className="space-y-2">
            {form.modifiers.map((m, idx) => (
              <div key={idx} className="flex items-start gap-2">
                <div className="flex-1">
                  <input className="input" placeholder="Nombre" aria-label={`Nombre modificador ${idx + 1}`} value={m.name} onChange={(e) => setModifier(idx, { name: e.target.value })} />
                  {errors[`modifiers.${idx}.name`] && <p className="field-error">{errors[`modifiers.${idx}.name`]}</p>}
                </div>
                <div className="w-28">
                  <input className="input" inputMode="decimal" aria-label={`Precio modificador ${idx + 1}`} value={m.price} onChange={(e) => setModifier(idx, { price: e.target.value })} />
                  {errors[`modifiers.${idx}.price`] && <p className="field-error">{errors[`modifiers.${idx}.price`]}</p>}
                </div>
                <button
                  className="btn-ghost p-2 text-rose-600"
                  aria-label="Quitar modificador"
                  onClick={() => setForm((f) => ({ ...f, modifiers: f.modifiers.filter((_, i) => i !== idx) }))}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
        <div className="sm:col-span-2">
          <InlineError error={submitError} />
        </div>
      </div>
    </Modal>
  );
}

export function MenuAdminPage() {
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search);
  const [categoryId, setCategoryId] = useState('');
  const [active, setActive] = useState('');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SortState>({ sort: 'category', order: 'asc' });
  const [editing, setEditing] = useState<Product | null | 'new'>(null);

  const categories = useAsync(() => api.get<Category[]>('/menu/categories'), []);
  const products = useAsync(
    () => api.get<Page<Product>>('/menu/products', { search: debounced, categoryId, active, page, pageSize: 10, sort: sort.sort, order: sort.order }),
    [debounced, categoryId, active, page, sort],
  );

  const columns: Column<Product>[] = [
    {
      key: 'name',
      header: 'Producto',
      sortKey: 'name',
      render: (p) => (
        <div>
          <p className="font-medium">{p.name}</p>
          <p className="line-clamp-1 text-xs text-slate-500">{p.description}</p>
        </div>
      ),
    },
    { key: 'cat', header: 'Categoría', sortKey: 'category', render: (p) => p.categoryName },
    { key: 'price', header: 'Precio', sortKey: 'priceCents', className: 'text-right tabular-nums', render: (p) => formatMoney(p.priceCents) },
    { key: 'mods', header: 'Modificadores', className: 'text-center', render: (p) => p.modifiers.length },
    {
      key: 'active',
      header: 'Estado',
      render: (p) => (
        <span className={`badge ${p.active ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}`}>
          {p.active ? 'Disponible' : 'Agotado'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (p) => (
        <button className="btn-ghost px-2 py-1" onClick={() => setEditing(p)} aria-label={`Editar ${p.name}`}>
          <Pencil className="h-4 w-4" />
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Carta</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Platos, precios y modificadores.</p>
        </div>
        <button className="btn-primary" onClick={() => setEditing('new')}>
          <Plus className="h-4 w-4" /> Nuevo producto
        </button>
      </div>

      <DataTable
        columns={columns}
        rows={products.data?.data}
        rowKey={(p) => p.id}
        loading={products.loading}
        error={products.error}
        onRetry={() => products.reload()}
        emptyTitle="No hay productos"
        emptyDescription="Prueba con otros filtros o crea un producto nuevo."
        sort={sort}
        onSortChange={(s) => {
          setSort(s);
          setPage(1);
        }}
        meta={products.data?.meta}
        onPageChange={setPage}
        toolbar={
          <>
            <div className="relative min-w-[12rem] flex-1">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                className="input pl-9"
                placeholder="Buscar por nombre o descripción…"
                aria-label="Buscar productos"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <select
              className="input w-44"
              aria-label="Filtrar por categoría"
              value={categoryId}
              onChange={(e) => {
                setCategoryId(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Todas las categorías</option>
              {categories.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.productCount})
                </option>
              ))}
            </select>
            <select
              className="input w-36"
              aria-label="Filtrar por estado"
              value={active}
              onChange={(e) => {
                setActive(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Todos</option>
              <option value="true">Disponibles</option>
              <option value="false">Agotados</option>
            </select>
          </>
        }
      />

      {editing && (
        <ProductForm
          product={editing === 'new' ? null : editing}
          categories={categories.data ?? []}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void products.reload({ silent: true });
            void categories.reload({ silent: true });
          }}
        />
      )}
    </div>
  );
}
