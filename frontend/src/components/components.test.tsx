import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { productFormSchema } from '../pages/MenuAdminPage';
import { userFormSchema } from '../pages/UsersPage';
import { DataTable, type Column } from './DataTable';
import { ProtectedRoute } from './ProtectedRoute';
import { TableStatusBadge, TicketStatusBadge } from './StatusBadge';
import type { User } from '../types';

// Estado de sesión simulado: cada prueba decide quién está "logueado".
const authState = vi.hoisted(() => ({ user: null as User | null }));
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: authState.user, token: authState.user ? 't' : null, loading: false, login: vi.fn(), logout: vi.fn() }),
}));

interface Row {
  id: number;
  name: string;
}
const columns: Column<Row>[] = [
  { key: 'name', header: 'Nombre', sortKey: 'name', render: (r) => r.name },
  { key: 'id', header: 'ID', render: (r) => r.id },
];

describe('DataTable', () => {
  it('muestra filas, paginación y permite ordenar', async () => {
    const onSort = vi.fn();
    const onPage = vi.fn();
    render(
      <DataTable
        columns={columns}
        rows={[
          { id: 1, name: 'Ceviche' },
          { id: 2, name: 'Lomo' },
        ]}
        rowKey={(r) => r.id}
        sort={{ sort: 'name', order: 'asc' }}
        onSortChange={onSort}
        meta={{ page: 1, pageSize: 2, total: 5, totalPages: 3 }}
        onPageChange={onPage}
      />,
    );
    expect(screen.getByText('Ceviche')).toBeInTheDocument();
    expect(screen.getByText('1–2 de 5')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Ordenar por Nombre' }));
    expect(onSort).toHaveBeenCalledWith({ sort: 'name', order: 'desc' });

    expect(screen.getByRole('button', { name: 'Página anterior' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Página siguiente' }));
    expect(onPage).toHaveBeenCalledWith(2);
  });

  it('estado vacío', () => {
    render(<DataTable columns={columns} rows={[]} rowKey={(r) => r.id} emptyTitle="No hay productos" />);
    expect(screen.getByText('No hay productos')).toBeInTheDocument();
  });

  it('estado de carga', () => {
    render(<DataTable columns={columns} rows={undefined} rowKey={(r) => r.id} loading />);
    expect(screen.getByRole('status')).toHaveTextContent('Cargando');
  });

  it('estado de error con reintento', async () => {
    const retry = vi.fn();
    render(<DataTable columns={columns} rows={undefined} rowKey={(r) => r.id} error={new Error('Servidor caído')} onRetry={retry} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Servidor caído');
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(retry).toHaveBeenCalled();
  });
});

describe('badges de estado', () => {
  it('muestran etiquetas legibles', () => {
    render(
      <>
        <TableStatusBadge status="por_cobrar" />
        <TicketStatusBadge status="borrador" />
      </>,
    );
    expect(screen.getByText('Por cobrar')).toBeInTheDocument();
    expect(screen.getByText('Sin enviar')).toBeInTheDocument();
  });
});

describe('validación de formularios', () => {
  it('producto: precio y modificadores', () => {
    const bad = productFormSchema.safeParse({ name: 'X', description: '', categoryId: '', price: 'abc', active: true, modifiers: [{ name: '', price: '1' }] });
    expect(bad.success).toBe(false);
    const fields = bad.error!.issues.map((i) => i.path.join('.'));
    expect(fields).toEqual(expect.arrayContaining(['name', 'categoryId', 'price', 'modifiers.0.name']));

    const ok = productFormSchema.safeParse({ name: 'Tequeños', description: '', categoryId: '1', price: '19.90', active: true, modifiers: [] });
    expect(ok.success).toBe(true);
  });

  it('usuario: política de contraseña', () => {
    expect(userFormSchema.safeParse({ name: 'Ana', email: 'ana@demo.pe', password: 'solotexto', role: 'mozo' }).success).toBe(false);
    expect(userFormSchema.safeParse({ name: 'Ana', email: 'ana@demo.pe', password: 'Clave1234', role: 'mozo' }).success).toBe(true);
  });
});

describe('ProtectedRoute', () => {
  it('redirige a /login sin sesión', () => {
    authState.user = null;
    render(
      <MemoryRouter initialEntries={['/caja']}>
        <Routes>
          <Route path="/login" element={<p>Pantalla login</p>} />
          <Route element={<ProtectedRoute section="caja" />}>
            <Route path="/caja" element={<p>Caja</p>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText('Pantalla login')).toBeInTheDocument();
  });

  it('un cocinero que entra a /caja va a su KDS', () => {
    authState.user = { id: 4, name: 'Carlos', email: 'cocina@demo.pe', role: 'cocina', active: true, createdAt: '' };
    render(
      <MemoryRouter initialEntries={['/caja']}>
        <Routes>
          <Route path="/cocina" element={<p>KDS</p>} />
          <Route element={<ProtectedRoute section="caja" />}>
            <Route path="/caja" element={<p>Caja</p>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText('KDS')).toBeInTheDocument();
  });

  it('cajero entra a /caja', () => {
    authState.user = { id: 5, name: 'Rosa', email: 'caja@demo.pe', role: 'caja', active: true, createdAt: '' };
    render(
      <MemoryRouter initialEntries={['/caja']}>
        <Routes>
          <Route element={<ProtectedRoute section="caja" />}>
            <Route path="/caja" element={<p>Caja</p>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText('Caja')).toBeInTheDocument();
  });
});
