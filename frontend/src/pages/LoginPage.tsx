import { UtensilsCrossed } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { Spinner } from '../components/StateViews';
import { useAuth } from '../context/AuthContext';
import { homeFor } from '../lib/access';
import { errorMessage } from '../lib/api';
import { fieldErrors } from '../lib/forms';

const schema = z.object({
  email: z.email('Ingresa un email válido'),
  password: z.string().min(1, 'Ingresa tu contraseña'),
});

/** Cuentas demo ficticias (ver README). Solo para facilitar la prueba del portafolio. */
const DEMO = [
  { label: 'Admin', email: 'admin@demo.pe' },
  { label: 'Mozo', email: 'mozo@demo.pe' },
  { label: 'Cocina', email: 'cocina@demo.pe' },
  { label: 'Caja', email: 'caja@demo.pe' },
];

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to={homeFor(user.role)} replace />;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    const parsed = schema.safeParse(form);
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setSubmitting(true);
    try {
      const logged = await login(parsed.data.email, parsed.data.password);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from && from !== '/login' ? from : homeFor(logged.role), { replace: true });
    } catch (err) {
      setSubmitError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 via-white to-slate-100 p-4 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <div className="card w-full max-w-sm p-6 sm:p-8">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-white">
            <UtensilsCrossed className="h-6 w-6" />
          </span>
          <h1 className="text-xl font-semibold">La Huerta Limeña</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Ingresa para gestionar el salón</p>
        </div>

        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <div>
            <label htmlFor="email" className="label">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              className="input"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              aria-invalid={!!errors.email}
            />
            {errors.email && <p className="field-error">{errors.email}</p>}
          </div>
          <div>
            <label htmlFor="password" className="label">
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              className="input"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              aria-invalid={!!errors.password}
            />
            {errors.password && <p className="field-error">{errors.password}</p>}
          </div>
          {submitError && (
            <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">
              {submitError}
            </p>
          )}
          <button type="submit" className="btn-primary w-full" disabled={submitting}>
            {submitting && <Spinner className="h-4 w-4" />} Ingresar
          </button>
        </form>

        <div className="mt-6 border-t border-slate-200 pt-4 dark:border-slate-800">
          <p className="mb-2 text-center text-xs text-slate-500 dark:text-slate-400">
            Cuentas demo (contraseña <code className="font-mono">Demo123!</code>)
          </p>
          <div className="grid grid-cols-4 gap-2">
            {DEMO.map((d) => (
              <button key={d.email} type="button" className="btn-secondary px-2 py-1 text-xs" onClick={() => setForm({ email: d.email, password: 'Demo123!' })}>
                {d.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
