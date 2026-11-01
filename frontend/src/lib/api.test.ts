import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, buildQuery, onUnauthorized, tokenStore } from './api';

function mockFetch(status: number, body: unknown) {
  const fn = vi.fn().mockResolvedValue({ ok: status < 400, status, json: () => Promise.resolve(body) });
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
  onUnauthorized(null);
});

describe('cliente API', () => {
  it('buildQuery omite valores vacíos', () => {
    expect(buildQuery({ page: 2, search: '', role: undefined, active: false })).toBe('?page=2&active=false');
    expect(buildQuery({})).toBe('');
  });

  it('envía el token Bearer guardado', async () => {
    tokenStore.set('abc.def.ghi');
    const fetchMock = mockFetch(200, { ok: true });
    await api.get('/auth/me');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/auth/me');
    expect(init.headers.Authorization).toBe('Bearer abc.def.ghi');
  });

  it('convierte Problem Details en ApiError con errores por campo', async () => {
    mockFetch(400, { status: 400, code: 'VALIDATION', detail: 'Uno o más campos son inválidos', errors: [{ field: 'email', message: 'Email inválido' }] });
    const error = (await api.post('/users', {}).catch((e: unknown) => e)) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 400, code: 'VALIDATION', message: 'Uno o más campos son inválidos' });
    expect(error.fieldErrors).toEqual([{ field: 'email', message: 'Email inválido' }]);
  });

  it('un 401 con sesión activa dispara el cierre de sesión', async () => {
    tokenStore.set('vencido');
    const handler = vi.fn();
    onUnauthorized(handler);
    mockFetch(401, { detail: 'Token inválido o expirado' });
    await expect(api.get('/tables')).rejects.toThrow('Token inválido');
    expect(handler).toHaveBeenCalledOnce();
  });

  it('error de red → ApiError NETWORK', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(api.get('/tables')).rejects.toMatchObject({ code: 'NETWORK', status: 0 });
  });
});
