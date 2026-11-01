import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react';

/**
 * Carga datos asíncronos con estados de carga/error y `reload`.
 * Ignora respuestas de peticiones viejas (si cambian filtros rápido, gana la última).
 */
export function useAsync<T>(fn: () => Promise<T>, deps: DependencyList) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const requestId = useRef(0);

  // `deps` decide cuándo recargar (igual que en useEffect).
  const run = useCallback(fn, deps);

  const reload = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      const id = ++requestId.current;
      if (!opts.silent) setLoading(true);
      setError(null);
      try {
        const result = await run();
        if (id === requestId.current) setData(result);
      } catch (e) {
        if (id === requestId.current) setError(e);
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [run],
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, error, loading, reload, setData };
}

/** Devuelve `value` con retraso: evita llamar a la API en cada tecla de un buscador. */
export function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

/** Re-renderiza cada `ms` (cronómetros del KDS). */
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}
