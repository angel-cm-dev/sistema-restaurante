import { Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { z } from 'zod';
import { DataTable, type Column, type SortState } from '../components/DataTable';
import { Modal } from '../components/Modal';
import { InlineError, Spinner } from '../components/StateViews';
import { useToast } from '../components/Toast';
import { useAuth } from '../context/AuthContext';
import { api, errorMessage } from '../lib/api';
import { formatDateTime, ROLE_LABEL } from '../lib/format';
import { fieldErrors, serverFieldErrors } from '../lib/forms';
import { useAsync, useDebounced } from '../lib/useAsync';
import type { Page, Role, User } from '../types';

const ROLES: Role[] = ['admin', 'mozo', 'cocina', 'caja'];

/** Misma política de contraseñas que el backend (8+ caracteres, letras y números). */
export const userFormSchema = z.object({
  name: z.string().trim().min(2, 'Mínimo 2 caracteres').max(120),
  email: z.email('Email inválido'),
  password: z
    .string()
    .min(8, 'Mínimo 8 caracteres')
    .regex(/[A-Za-z]/, 'Debe contener letras')
    .regex(/\d/, 'Debe contener números'),
  role: z.enum(['admin', 'mozo', 'cocina', 'caja'], 'Elige un rol'),
});

function CreateUserModal({ onClose, onSaved }: { onClose(): void; onSaved(): void }) {
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'mozo' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const parsed = userFormSchema.safeParse(form);
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setSaving(true);
    try {
      await api.post('/users', parsed.data);
      onSaved();
    } catch (e) {
      setErrors(serverFieldErrors(e));
      setSubmitError(e);
    } finally {
      setSaving(false);
    }
  };

  const field = (key: 'name' | 'email' | 'password', label: string, type = 'text') => (
    <div>
      <label htmlFor={`u-${key}`} className="label">
        {label}
      </label>
      <input id={`u-${key}`} type={type} className="input" value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
      {errors[key] && <p className="field-error">{errors[key]}</p>}
    </div>
  );

  return (
    <Modal
      open
      title="Nuevo usuario"
      onClose={onClose}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving && <Spinner className="h-4 w-4" />} Crear
          </button>
        </>
      }
    >
      <div className="space-y-3">
        {field('name', 'Nombre')}
        {field('email', 'Email', 'email')}
        {field('password', 'Contraseña', 'password')}
        <div>
          <label htmlFor="u-role" className="label">
            Rol
          </label>
          <select id="u-role" className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </div>
        <InlineError error={submitError} />
      </div>
    </Modal>
  );
}

export function UsersPage() {
  const { user: me } = useAuth();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search);
  const [role, setRole] = useState('');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SortState>({ sort: 'name', order: 'asc' });
  const [creating, setCreating] = useState(false);

  const users = useAsync(
    () => api.get<Page<User>>('/users', { search: debounced, role, page, pageSize: 10, sort: sort.sort, order: sort.order }),
    [debounced, role, page, sort],
  );

  const toggleActive = async (u: User) => {
    try {
      await api.patch(`/users/${u.id}`, { active: !u.active });
      toast(`${u.name} ${u.active ? 'desactivado' : 'activado'}`, 'success');
      void users.reload({ silent: true });
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };

  const columns: Column<User>[] = [
    { key: 'name', header: 'Nombre', sortKey: 'name', render: (u) => <span className="font-medium">{u.name}</span> },
    { key: 'email', header: 'Email', sortKey: 'email', render: (u) => u.email },
    { key: 'role', header: 'Rol', sortKey: 'role', render: (u) => ROLE_LABEL[u.role] },
    { key: 'created', header: 'Alta', sortKey: 'createdAt', render: (u) => formatDateTime(u.createdAt) },
    {
      key: 'active',
      header: 'Estado',
      render: (u) => (
        <button
          className={`badge ${u.active ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}`}
          disabled={u.id === me?.id}
          title={u.id === me?.id ? 'No puedes desactivarte a ti mismo' : 'Cambiar estado'}
          onClick={() => toggleActive(u)}
        >
          {u.active ? 'Activo' : 'Inactivo'}
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Usuarios</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Personal y roles de acceso.</p>
        </div>
        <button className="btn-primary" onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> Nuevo usuario
        </button>
      </div>
      <DataTable
        columns={columns}
        rows={users.data?.data}
        rowKey={(u) => u.id}
        loading={users.loading}
        error={users.error}
        onRetry={() => users.reload()}
        sort={sort}
        onSortChange={(s) => {
          setSort(s);
          setPage(1);
        }}
        meta={users.data?.meta}
        onPageChange={setPage}
        emptyTitle="No hay usuarios con esos filtros"
        toolbar={
          <>
            <div className="relative min-w-[12rem] flex-1">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                className="input pl-9"
                placeholder="Buscar por nombre o email…"
                aria-label="Buscar usuarios"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <select
              className="input w-40"
              aria-label="Filtrar por rol"
              value={role}
              onChange={(e) => {
                setRole(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Todos los roles</option>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
          </>
        }
      />
      {creating && (
        <CreateUserModal
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            toast('Usuario creado', 'success');
            void users.reload({ silent: true });
          }}
        />
      )}
    </div>
  );
}
