import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { canAccess, homeFor, type Section } from '../lib/access';
import { LoadingState } from './StateViews';

/**
 * Protege rutas: sin sesión → /login (recordando a dónde iba);
 * con sesión pero sin rol permitido → su pantalla de inicio.
 */
export function ProtectedRoute({ section }: { section?: Section }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <LoadingState label="Validando sesión…" />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (section && !canAccess(user.role, section)) return <Navigate to={homeFor(user.role)} replace />;
  return <Outlet />;
}
