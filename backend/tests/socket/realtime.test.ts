/**
 * Pruebas de tiempo real: clientes socket.io-client reales contra el servidor
 * levantado en un puerto efímero.
 */
import request from 'supertest';
import type { Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearer, connectSocket, emitWithAck, loginAs, startTestServer, waitFor } from '../helpers';

let server: Awaited<ReturnType<typeof startTestServer>>;
let tokens: Record<'mozo' | 'mozo2' | 'cocina' | 'caja', string>;
const sockets: Socket[] = [];

async function connected(token: string): Promise<Socket> {
  const socket = connectSocket(server.url, token);
  sockets.push(socket);
  await waitFor(socket, 'session:ready');
  return socket;
}

beforeAll(async () => {
  server = await startTestServer();
  const [mozo, mozo2, cocina, caja] = await Promise.all(
    ['mozo', 'mozo2', 'cocina', 'caja'].map((u) => loginAs(server.url, `${u}@demo.pe`)),
  );
  tokens = { mozo, mozo2, cocina, caja };
});

afterAll(async () => {
  sockets.forEach((s) => s.disconnect());
  await server.close();
});

describe('handshake con JWT', () => {
  it('rechaza conexiones sin token', async () => {
    const socket = connectSocket(server.url);
    sockets.push(socket);
    const error = await waitFor<Error & { data?: { code: string } }>(socket, 'connect_error');
    expect(error.message).toMatch(/No autorizado/);
    expect(error.data?.code).toBe('UNAUTHORIZED');
  });

  it('rechaza tokens inválidos', async () => {
    const socket = connectSocket(server.url, 'token-falso');
    sockets.push(socket);
    const error = await waitFor<Error>(socket, 'connect_error');
    expect(error.message).toMatch(/token inválido/);
  });

  it('con token válido entra a las salas de su rol', async () => {
    const socket = connectSocket(server.url, tokens.caja);
    sockets.push(socket);
    const ready = await waitFor<{ user: { role: string }; rooms: string[] }>(socket, 'session:ready');
    expect(ready.user.role).toBe('caja');
    expect(ready.rooms).toEqual(expect.arrayContaining(['cashier', 'floor']));
    expect(ready.rooms).not.toContain('kitchen');
  });
});

describe('flujo en tiempo real salón ↔ cocina', () => {
  let kitchen: Socket;
  let waiter: Socket;
  let otherWaiter: Socket;
  let orderId: number;
  let ticketId: number;

  beforeAll(async () => {
    [kitchen, waiter, otherWaiter] = await Promise.all([
      connected(tokens.cocina),
      connected(tokens.mozo),
      connected(tokens.mozo2),
    ]);
  });

  it('abrir mesa emite table:updated al salón', async () => {
    const tableEvent = waitFor<{ number: number; status: string }>(otherWaiter, 'table:updated');
    const res = await request(server.url).post('/api/orders').set(bearer(tokens.mozo)).send({ tableId: 2, guests: 2 });
    orderId = res.body.id;
    expect(await tableEvent).toMatchObject({ number: 2, status: 'ocupada' });
  });

  it('enviar a cocina emite ticket:created a la pantalla KDS', async () => {
    const products = await request(server.url).get('/api/menu/products?search=Causa').set(bearer(tokens.mozo));
    await request(server.url)
      .post(`/api/orders/${orderId}/items`)
      .set(bearer(tokens.mozo))
      .send({ productId: products.body.data[0].id, quantity: 2 })
      .expect(201);

    const created = waitFor<{ id: number; tableNumber: number; status: string; items: unknown[] }>(kitchen, 'ticket:created');
    await request(server.url).post(`/api/orders/${orderId}/send`).set(bearer(tokens.mozo)).expect(200);
    const ticket = await created;
    expect(ticket).toMatchObject({ tableNumber: 2, status: 'pendiente' });
    expect(ticket.items).toHaveLength(1);
    ticketId = ticket.id;
  });

  it('kitchen:board devuelve las comandas activas por ack', async () => {
    const res = await emitWithAck<{ ok: boolean; data: Array<{ id: number }> }>(kitchen, 'kitchen:board');
    expect(res.ok).toBe(true);
    expect(res.data.map((t) => t.id)).toContain(ticketId);
  });

  it('el mozo NO puede marcar "preparando" por socket (ack con FORBIDDEN)', async () => {
    const res = await emitWithAck<{ ok: boolean; error: { code: string } }>(waiter, 'ticket:advance', { ticketId });
    expect(res).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
  });

  it('payload inválido responde VALIDATION', async () => {
    const res = await emitWithAck<{ ok: boolean; error: { code: string } }>(kitchen, 'ticket:advance', { ticketId: 'x' });
    expect(res).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
  });

  it('cocina avanza por socket y el salón recibe ticket:updated', async () => {
    const updated = waitFor<{ id: number; status: string }>(waiter, 'ticket:updated');
    const res = await emitWithAck<{ ok: boolean; data: { status: string } }>(kitchen, 'ticket:advance', { ticketId });
    expect(res).toMatchObject({ ok: true, data: { status: 'preparando' } });
    expect(await updated).toMatchObject({ id: ticketId, status: 'preparando' });
  });

  it('al quedar "listo" solo el mozo dueño recibe ticket:ready', async () => {
    let otherGotReady = false;
    otherWaiter.once('ticket:ready', () => (otherGotReady = true));
    const ready = waitFor<{ ticketId: number; tableNumber: number }>(waiter, 'ticket:ready');
    await emitWithAck(kitchen, 'ticket:advance', { ticketId });
    expect(await ready).toEqual({ ticketId, tableNumber: 2 });
    // margen para que un evento indebido llegue si existiera
    await new Promise((r) => setTimeout(r, 150));
    expect(otherGotReady).toBe(false);
  });

  it('el mozo entrega por socket y cocina recibe el cambio', async () => {
    const updated = waitFor<{ status: string }>(kitchen, 'ticket:updated');
    const res = await emitWithAck<{ ok: boolean }>(waiter, 'ticket:advance', { ticketId });
    expect(res.ok).toBe(true);
    expect((await updated).status).toBe('entregado');
  });

  it('cobrar emite order:closed a caja y salón, pero no a cocina', async () => {
    const cashier = await connected(tokens.caja);
    let kitchenGotClosed = false;
    kitchen.once('order:closed', () => (kitchenGotClosed = true));
    const closed = waitFor<{ orderId: number; totalCents: number }>(cashier, 'order:closed');
    const order = await request(server.url).get(`/api/orders/${orderId}`).set(bearer(tokens.caja));
    await request(server.url)
      .post(`/api/orders/${orderId}/close`)
      .set(bearer(tokens.caja))
      .send({ payments: [{ method: 'efectivo', amountCents: order.body.totals.totalCents }] })
      .expect(200);
    expect(await closed).toMatchObject({ orderId, totalCents: order.body.totals.totalCents });
    await new Promise((r) => setTimeout(r, 150));
    expect(kitchenGotClosed).toBe(false);
  });

  it('tables:sync devuelve el plano actualizado', async () => {
    const res = await emitWithAck<{ ok: boolean; data: Array<{ number: number; status: string }> }>(waiter, 'tables:sync');
    expect(res.data.find((t) => t.number === 2)?.status).toBe('libre');
  });
});
