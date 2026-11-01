import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { useAuth } from './context/AuthContext';
import { homeFor } from './lib/access';
import { CashierPage } from './pages/CashierPage';
import { DashboardPage } from './pages/DashboardPage';
import { FloorPage } from './pages/FloorPage';
import { KitchenPage } from './pages/KitchenPage';
import { LoginPage } from './pages/LoginPage';
import { MenuAdminPage } from './pages/MenuAdminPage';
import { OrderPage } from './pages/OrderPage';
import { ReportsPage } from './pages/ReportsPage';
import { UsersPage } from './pages/UsersPage';

function Home() {
  const { user } = useAuth();
  return <Navigate to={user ? homeFor(user.role) : '/login'} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route element={<ProtectedRoute section="dashboard" />}>
            <Route path="/dashboard" element={<DashboardPage />} />
          </Route>
          <Route element={<ProtectedRoute section="salon" />}>
            <Route path="/salon" element={<FloorPage />} />
          </Route>
          <Route element={<ProtectedRoute section="pedido" />}>
            <Route path="/pedidos/:orderId" element={<OrderPage />} />
          </Route>
          <Route element={<ProtectedRoute section="cocina" />}>
            <Route path="/cocina" element={<KitchenPage />} />
          </Route>
          <Route element={<ProtectedRoute section="caja" />}>
            <Route path="/caja" element={<CashierPage />} />
          </Route>
          <Route element={<ProtectedRoute section="reportes" />}>
            <Route path="/reportes" element={<ReportsPage />} />
          </Route>
          <Route element={<ProtectedRoute section="carta" />}>
            <Route path="/carta" element={<MenuAdminPage />} />
          </Route>
          <Route element={<ProtectedRoute section="usuarios" />}>
            <Route path="/usuarios" element={<UsersPage />} />
          </Route>
          <Route path="*" element={<Home />} />
        </Route>
      </Route>
    </Routes>
  );
}
