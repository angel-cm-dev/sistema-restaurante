import {
  BarChart3,
  BookOpen,
  ChefHat,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Receipt,
  Sun,
  Users,
  UtensilsCrossed,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket, useSocketEvent } from '../context/SocketContext';
import { useTheme } from '../context/ThemeContext';
import { canAccess, type Section } from '../lib/access';
import { ROLE_LABEL } from '../lib/format';
import { useToast } from './Toast';

const NAV: Array<{ to: string; label: string; section: Section; icon: typeof Menu }> = [
  { to: '/dashboard', label: 'Dashboard', section: 'dashboard', icon: LayoutDashboard },
  { to: '/salon', label: 'Salón', section: 'salon', icon: UtensilsCrossed },
  { to: '/cocina', label: 'Cocina (KDS)', section: 'cocina', icon: ChefHat },
  { to: '/caja', label: 'Caja', section: 'caja', icon: Receipt },
  { to: '/reportes', label: 'Reportes', section: 'reportes', icon: BarChart3 },
  { to: '/carta', label: 'Carta', section: 'carta', icon: BookOpen },
  { to: '/usuarios', label: 'Usuarios', section: 'usuarios', icon: Users },
];

export function Layout() {
  const { user, logout } = useAuth();
  const { connected } = useSocket();
  const { theme, toggle } = useTheme();
  const toast = useToast();
  const [open, setOpen] = useState(false);

  // Aviso global al mozo: el servidor solo le envía "ticket:ready" de SUS mesas.
  useSocketEvent<{ ticketId: number; tableNumber: number }>('ticket:ready', (p) =>
    toast(`Comanda #${p.ticketId} lista para la mesa ${p.tableNumber}`, 'success'),
  );

  const items = NAV.filter((n) => canAccess(user?.role, n.section));

  const sidebar = (
    <nav className="flex h-full flex-col gap-1 p-3" aria-label="Navegación principal">
      <div className="mb-4 flex items-center gap-2 px-2 py-1">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white">
          <UtensilsCrossed className="h-5 w-5" />
        </span>
        <div>
          <p className="text-sm font-semibold leading-tight">La Huerta Limeña</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Sistema restaurante</p>
        </div>
      </div>
      {items.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          onClick={() => setOpen(false)}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
              isActive
                ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300'
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
            }`
          }
        >
          <Icon className="h-4 w-4" />
          {label}
        </NavLink>
      ))}
      <div className="mt-auto rounded-lg bg-slate-50 p-3 text-xs dark:bg-slate-800/60">
        <p className="font-medium text-slate-700 dark:text-slate-200">{user?.name}</p>
        <p className="text-slate-500 dark:text-slate-400">{user && ROLE_LABEL[user.role]}</p>
      </div>
    </nav>
  );

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 lg:block">
        <div className="sticky top-0 h-screen">{sidebar}</div>
      </aside>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-slate-900/50" />
          <aside className="absolute inset-y-0 left-0 w-64 bg-white dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
            <button className="btn-ghost absolute right-2 top-2 p-1.5" onClick={() => setOpen(false)} aria-label="Cerrar menú">
              <X className="h-5 w-5" />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-slate-200 bg-white/80 px-4 backdrop-blur dark:border-slate-800 dark:bg-slate-900/80">
          <button className="btn-ghost p-1.5 lg:hidden" onClick={() => setOpen(true)} aria-label="Abrir menú">
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex-1" />
          <span
            className={`badge ${connected ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}`}
            title="Conexión en tiempo real (Socket.IO)"
          >
            <span className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-500' : 'bg-slate-400'}`} />
            {connected ? 'En vivo' : 'Sin conexión'}
          </span>
          <button className="btn-ghost p-2" onClick={toggle} aria-label="Cambiar tema">
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <button className="btn-ghost" onClick={logout}>
            <LogOut className="h-4 w-4" /> <span className="hidden sm:inline">Salir</span>
          </button>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
