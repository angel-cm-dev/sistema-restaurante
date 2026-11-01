import { TABLE_STATUS_LABEL, TICKET_STATUS_LABEL } from '../lib/format';
import type { ItemStatus, TableStatus } from '../types';

export const TABLE_COLORS: Record<TableStatus, string> = {
  libre: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300',
  ocupada: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300',
  por_cobrar: 'bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-300',
};

const TICKET_COLORS: Record<ItemStatus, string> = {
  borrador: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  pendiente: 'bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-300',
  preparando: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300',
  listo: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300',
  entregado: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
};

export function TableStatusBadge({ status }: { status: TableStatus }) {
  return <span className={`badge ${TABLE_COLORS[status]}`}>{TABLE_STATUS_LABEL[status]}</span>;
}

export function TicketStatusBadge({ status }: { status: ItemStatus }) {
  return <span className={`badge ${TICKET_COLORS[status]}`}>{TICKET_STATUS_LABEL[status]}</span>;
}
