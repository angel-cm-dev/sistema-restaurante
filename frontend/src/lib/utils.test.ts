import { describe, expect, it } from 'vitest';
import { canAccess, homeFor } from './access';
import { formatDuration, formatMoney, parseMoney, secondsSince } from './format';
import { kitchenAction, urgencyFor } from './kitchen';
import { clientPage } from './table';

describe('format', () => {
  it('formatMoney usa soles con 2 decimales', () => {
    expect(formatMoney(4250)).toBe('S/ 42.50');
    expect(formatMoney(0)).toBe('S/ 0.00');
    expect(formatMoney(-150)).toBe('-S/ 1.50');
  });

  it('parseMoney acepta punto, coma y prefijo S/', () => {
    expect(parseMoney('42.5')).toBe(4250);
    expect(parseMoney('S/ 12,30')).toBe(1230);
    expect(parseMoney('7')).toBe(700);
    expect(parseMoney('abc')).toBeNull();
    expect(parseMoney('1.234')).toBeNull();
    expect(parseMoney('-3')).toBeNull();
  });

  it('formatDuration para el cronómetro del KDS', () => {
    expect(formatDuration(65)).toBe('01:05');
    expect(formatDuration(3725)).toBe('1:02:05');
    expect(formatDuration(-5)).toBe('00:00');
  });

  it('secondsSince calcula segundos transcurridos', () => {
    expect(secondsSince('2026-01-01T10:00:00Z', Date.parse('2026-01-01T10:02:30Z'))).toBe(150);
  });
});

describe('acceso por rol', () => {
  it('cada rol aterriza en su pantalla', () => {
    expect(homeFor('admin')).toBe('/dashboard');
    expect(homeFor('mozo')).toBe('/salon');
    expect(homeFor('cocina')).toBe('/cocina');
    expect(homeFor('caja')).toBe('/dashboard');
  });

  it('restringe secciones', () => {
    expect(canAccess('cocina', 'caja')).toBe(false);
    expect(canAccess('caja', 'caja')).toBe(true);
    expect(canAccess('mozo', 'usuarios')).toBe(false);
    expect(canAccess(undefined, 'salon')).toBe(false);
  });
});

describe('KDS', () => {
  it('acciones según estado y rol (espejo de la regla del backend)', () => {
    expect(kitchenAction('pendiente', 'cocina')).toBe('Empezar');
    expect(kitchenAction('pendiente', 'mozo')).toBeNull();
    expect(kitchenAction('preparando', 'admin')).toBe('Marcar listo');
    expect(kitchenAction('listo', 'mozo')).toBe('Entregado');
    expect(kitchenAction('listo', 'caja')).toBeNull();
  });

  it('semáforo de urgencia', () => {
    expect(urgencyFor(5 * 60)).toBe('ok');
    expect(urgencyFor(10 * 60)).toBe('warning');
    expect(urgencyFor(25 * 60)).toBe('late');
  });
});

describe('clientPage', () => {
  const rows = Array.from({ length: 23 }, (_, i) => ({ name: `Plato ${String(i + 1).padStart(2, '0')}`, total: i * 10 }));

  it('pagina y reporta metadatos', () => {
    const p = clientPage(rows, { page: 3, pageSize: 10 });
    expect(p.data).toHaveLength(3);
    expect(p.meta).toEqual({ page: 3, pageSize: 10, total: 23, totalPages: 3 });
  });

  it('busca y ordena', () => {
    const p = clientPage(rows, { search: 'plato 1', searchIn: (r) => r.name, sortBy: (r) => r.total, order: 'desc', page: 1, pageSize: 5 });
    expect(p.meta.total).toBe(10);
    expect(p.data[0].name).toBe('Plato 19');
  });

  it('corrige páginas fuera de rango', () => {
    expect(clientPage(rows, { page: 99, pageSize: 10 }).meta.page).toBe(3);
  });
});
