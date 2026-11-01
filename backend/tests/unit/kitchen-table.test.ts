import { describe, expect, it } from 'vitest';
import type { Ticket } from '../../src/domain/entities';
import { BusinessRuleError, ForbiddenError } from '../../src/domain/errors';
import { advanceTicket, assertTicketTransition, nextTicketStatus, ticketTimings } from '../../src/domain/kitchen';
import { assertTableTransition, canTransitionTable } from '../../src/domain/table';

const t0 = new Date('2026-05-10T13:00:00Z');
const at = (minutes: number) => new Date(t0.getTime() + minutes * 60_000);
const ticket = (over: Partial<Ticket> = {}): Ticket => ({
  id: 1,
  orderId: 1,
  status: 'pendiente',
  createdAt: t0,
  startedAt: null,
  readyAt: null,
  deliveredAt: null,
  ...over,
});

describe('KDS: máquina de estados de la comanda', () => {
  it('sigue el orden pendiente → preparando → listo → entregado', () => {
    expect(nextTicketStatus('pendiente')).toBe('preparando');
    expect(nextTicketStatus('preparando')).toBe('listo');
    expect(nextTicketStatus('listo')).toBe('entregado');
    expect(nextTicketStatus('entregado')).toBeNull();
  });

  it('registra la marca de tiempo de cada estado', () => {
    let t = advanceTicket(ticket(), 'cocina', at(3));
    expect(t).toMatchObject({ status: 'preparando', startedAt: at(3) });
    t = advanceTicket(t, 'cocina', at(15));
    expect(t).toMatchObject({ status: 'listo', readyAt: at(15) });
    t = advanceTicket(t, 'mozo', at(17));
    expect(t).toMatchObject({ status: 'entregado', deliveredAt: at(17) });
  });

  it('no permite saltarse estados', () => {
    expect(() => assertTicketTransition('pendiente', 'listo', 'cocina')).toThrow(BusinessRuleError);
    expect(() => assertTicketTransition('listo', 'preparando', 'admin')).toThrow(BusinessRuleError);
  });

  it('el mozo no puede marcar "preparando" ni "listo"; cocina sí', () => {
    expect(() => advanceTicket(ticket(), 'mozo')).toThrow(ForbiddenError);
    expect(() => advanceTicket(ticket({ status: 'preparando' }), 'caja')).toThrow(ForbiddenError);
    expect(advanceTicket(ticket({ status: 'listo' }), 'mozo').status).toBe('entregado');
  });

  it('una comanda entregada no avanza más', () => {
    expect(() => advanceTicket(ticket({ status: 'entregado' }), 'admin')).toThrow(/entregada/);
  });

  it('calcula tiempos de espera, preparación y total', () => {
    const done = ticket({ status: 'entregado', startedAt: at(2), readyAt: at(14), deliveredAt: at(16) });
    expect(ticketTimings(done)).toEqual({ waitSeconds: 120, prepSeconds: 720, totalSeconds: 960 });
    expect(ticketTimings(ticket(), at(5))).toEqual({ waitSeconds: null, prepSeconds: null, totalSeconds: 300 });
  });
});

describe('Mesa: transiciones de estado', () => {
  it('permite el ciclo normal', () => {
    expect(canTransitionTable('libre', 'ocupada')).toBe(true);
    expect(canTransitionTable('ocupada', 'por_cobrar')).toBe(true);
    expect(canTransitionTable('por_cobrar', 'libre')).toBe(true);
    expect(canTransitionTable('por_cobrar', 'ocupada')).toBe(true);
  });

  it('no permite cobrar una mesa libre', () => {
    expect(() => assertTableTransition('libre', 'por_cobrar')).toThrow(BusinessRuleError);
  });
});
