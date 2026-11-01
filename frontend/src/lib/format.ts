import type { PaymentMethod, Role, TableStatus, TicketStatus } from '../types';

/** 4250 → "S/ 42.50". Los importes viajan en céntimos para evitar errores de coma flotante. */
export function formatMoney(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const value = (Math.abs(cents) / 100).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${sign}S/ ${value}`;
}

/** "42.5" → 4250. Devuelve null si el texto no es un monto válido. */
export function parseMoney(input: string): number | null {
  const normalized = input.trim().replace(/^S\/\s*/i, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  return Math.round(Number(normalized) * 100);
}

/** Segundos → "mm:ss" o "h:mm:ss" (cronómetro del KDS). */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

export function secondsSince(iso: string, now: number = Date.now()): number {
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' });
}

export function formatTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
}

export const ROLE_LABEL: Record<Role, string> = { admin: 'Administrador', mozo: 'Mozo', cocina: 'Cocina', caja: 'Caja' };

export const TABLE_STATUS_LABEL: Record<TableStatus, string> = {
  libre: 'Libre',
  ocupada: 'Ocupada',
  por_cobrar: 'Por cobrar',
};

export const TICKET_STATUS_LABEL: Record<TicketStatus | 'borrador', string> = {
  borrador: 'Sin enviar',
  pendiente: 'Pendiente',
  preparando: 'Preparando',
  listo: 'Listo',
  entregado: 'Entregado',
};

export const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta',
  yape_plin: 'Yape / Plin',
};

/** Convierte una fecha a "YYYY-MM-DD" local (para inputs type=date). */
export function toDateInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
