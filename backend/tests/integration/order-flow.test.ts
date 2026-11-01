/**
 * Flujo completo de una mesa: abrir → pedir → cocina → entregar → cuenta → dividir → cobrar → reportes.
 */
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearer, loginAs, startTestServer } from '../helpers';

let server: Awaited<ReturnType<typeof startTestServer>>;
let admin: string;
let mozo: string;
let mozo2: string;
let cocina: string;
let caja: string;
let ceviche: { id: number; priceCents: number; modifiers: Array<{ id: number; name: string; priceCents: number }> };
let lomo: { id: number; priceCents: number };

const api = () => request(server.url);

async function findProduct(name: string) {
  const res = await api().get(`/api/menu/products?search=${encodeURIComponent(name)}`).set(bearer(mozo));
  return res.body.data[0];
}

beforeAll(async () => {
  server = await startTestServer();
  [admin, mozo, mozo2, cocina, caja] = await Promise.all(
    ['admin', 'mozo', 'mozo2', 'cocina', 'caja'].map((u) => loginAs(server.url, `${u}@demo.pe`)),
  );
  ceviche = await findProduct('Ceviche');
  lomo = await findProduct('Lomo saltado');
});
afterAll(() => server.close());

describe('flujo de pedido completo', () => {
  let orderId: number;
  const extraLeche = () => ceviche.modifiers.find((m) => m.name === 'Extra leche de tigre')!;

  it('el mozo abre la mesa 3 y queda ocupada', async () => {
    const res = await api().post('/api/orders').set(bearer(mozo)).send({ tableId: 3, guests: 2 });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ tableNumber: 3, status: 'abierta', guests: 2, items: [] });
    orderId = res.body.id;
    const table = await api().get('/api/tables/3').set(bearer(mozo));
    expect(table.body).toMatchObject({ status: 'ocupada', currentOrderId: orderId });
  });

  it('no se puede abrir otro pedido en una mesa ocupada (422)', async () => {
    const res = await api().post('/api/orders').set(bearer(mozo2)).send({ tableId: 3 });
    expect(res.status).toBe(422);
  });

  it('agrega ítems con modificadores (se guarda copia de precio)', async () => {
    let res = await api()
      .post(`/api/orders/${orderId}/items`)
      .set(bearer(mozo))
      .send({ productId: ceviche.id, quantity: 1, modifierIds: [extraLeche().id], notes: 'Sin ají' });
    expect(res.status).toBe(201);
    res = await api().post(`/api/orders/${orderId}/items`).set(bearer(mozo)).send({ productId: lomo.id, quantity: 2 });
    expect(res.body.items).toHaveLength(2);
    expect(res.body.items[0]).toMatchObject({ status: 'borrador', modifiersCents: 500, lineTotalCents: 4300, notes: 'Sin ají' });
    expect(res.body.totals.subtotalCents).toBe(4300 + 8400);
  });

  it('rechaza un modificador que no pertenece al producto', async () => {
    const res = await api()
      .post(`/api/orders/${orderId}/items`)
      .set(bearer(mozo))
      .send({ productId: lomo.id, modifierIds: [extraLeche().id] });
    expect(res.status).toBe(400);
  });

  it('otro mozo no puede modificar un pedido ajeno (403)', async () => {
    const res = await api().post(`/api/orders/${orderId}/items`).set(bearer(mozo2)).send({ productId: lomo.id });
    expect(res.status).toBe(403);
  });

  it('no se puede pedir la cuenta con ítems sin enviar', async () => {
    const res = await api().post(`/api/orders/${orderId}/request-bill`).set(bearer(mozo));
    expect(res.status).toBe(422);
  });

  it('envía la comanda a cocina y aparece en el KDS', async () => {
    const res = await api().post(`/api/orders/${orderId}/send`).set(bearer(mozo));
    expect(res.status).toBe(200);
    expect(res.body.tickets).toHaveLength(1);
    expect(res.body.items.every((i: { status: string }) => i.status === 'pendiente')).toBe(true);

    const board = await api().get('/api/kitchen/tickets').set(bearer(cocina));
    const ticket = board.body.find((t: { orderId: number }) => t.orderId === orderId);
    expect(ticket).toMatchObject({ tableNumber: 3, status: 'pendiente', waiterName: 'Mario Mozo' });
    expect(ticket.items[0]).toMatchObject({ productName: 'Ceviche clásico', modifiers: ['Extra leche de tigre'] });
  });

  it('enviar sin ítems nuevos → 422', async () => {
    expect((await api().post(`/api/orders/${orderId}/send`).set(bearer(mozo))).status).toBe(422);
  });

  it('no se puede eliminar un ítem ya enviado', async () => {
    const order = await api().get(`/api/orders/${orderId}`).set(bearer(mozo));
    const res = await api().delete(`/api/orders/${orderId}/items/${order.body.items[0].id}`).set(bearer(mozo));
    expect(res.status).toBe(422);
  });

  it('cocina avanza la comanda y registra tiempos; el mozo la entrega', async () => {
    const order = await api().get(`/api/orders/${orderId}`).set(bearer(mozo));
    const ticketId = order.body.tickets[0].id;

    // el mozo no puede marcar "preparando"
    expect((await api().post(`/api/kitchen/tickets/${ticketId}/advance`).set(bearer(mozo))).status).toBe(403);

    let res = await api().post(`/api/kitchen/tickets/${ticketId}/advance`).set(bearer(cocina));
    expect(res.body.status).toBe('preparando');
    expect(res.body.startedAt).not.toBeNull();
    res = await api().post(`/api/kitchen/tickets/${ticketId}/advance`).set(bearer(cocina));
    expect(res.body.status).toBe('listo');
    expect(res.body.timings.prepSeconds).toEqual(expect.any(Number));
    res = await api().post(`/api/kitchen/tickets/${ticketId}/advance`).set(bearer(mozo));
    expect(res.body.status).toBe('entregado');
    res = await api().post(`/api/kitchen/tickets/${ticketId}/advance`).set(bearer(cocina));
    expect(res.status).toBe(422);
  });

  it('el mozo pide la cuenta: mesa por cobrar', async () => {
    const res = await api().post(`/api/orders/${orderId}/request-bill`).set(bearer(mozo));
    expect(res.status).toBe(200);
    expect((await api().get('/api/tables/3').set(bearer(caja))).body.status).toBe('por_cobrar');
  });

  it('caja previsualiza la división por ítems con 10% de propina', async () => {
    const order = await api().get(`/api/orders/${orderId}`).set(bearer(caja));
    const [cevicheItem, lomoItem] = order.body.items;
    const res = await api()
      .post(`/api/orders/${orderId}/split`)
      .set(bearer(caja))
      .send({
        tip: { type: 'percent', value: 10 },
        split: {
          mode: 'items',
          assignments: [
            { label: 'Ana', itemIds: [cevicheItem.id] },
            { label: 'Beto', itemIds: [lomoItem.id] },
          ],
        },
      });
    expect(res.status).toBe(200);
    expect(res.body.totals).toMatchObject({ subtotalCents: 12700, tipCents: 1270, totalCents: 13970 });
    expect(res.body.shares.map((s: { totalCents: number }) => s.totalCents)).toEqual([4730, 9240]);
  });

  it('un mozo no puede cobrar (403)', async () => {
    const res = await api()
      .post(`/api/orders/${orderId}/close`)
      .set(bearer(mozo))
      .send({ payments: [{ method: 'efectivo', amountCents: 12700 }] });
    expect(res.status).toBe(403);
  });

  it('pagos que no cuadran con el total → 422 con montos esperados', async () => {
    const res = await api()
      .post(`/api/orders/${orderId}/close`)
      .set(bearer(caja))
      .send({ tip: { type: 'percent', value: 10 }, payments: [{ method: 'efectivo', amountCents: 10000 }] });
    expect(res.status).toBe(422);
    expect(res.body.extra).toEqual({ expectedCents: 13970, receivedCents: 10000 });
  });

  it('cobra con pagos divididos, cierra el pedido y libera la mesa', async () => {
    const res = await api()
      .post(`/api/orders/${orderId}/close`)
      .set(bearer(caja))
      .send({
        tip: { type: 'percent', value: 10 },
        payments: [
          { method: 'tarjeta', amountCents: 4730, payerLabel: 'Ana' },
          { method: 'yape_plin', amountCents: 9240, payerLabel: 'Beto' },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'cerrada', tipCents: 1270, paidCents: 13970 });
    expect(res.body.payments.map((p: { tipCents: number }) => p.tipCents)).toEqual([430, 840]);
    const table = await api().get('/api/tables/3').set(bearer(caja));
    expect(table.body).toMatchObject({ status: 'libre', currentOrderId: null });
  });

  it('no se puede cobrar dos veces', async () => {
    const res = await api()
      .post(`/api/orders/${orderId}/close`)
      .set(bearer(caja))
      .send({ payments: [{ method: 'efectivo', amountCents: 100 }] });
    expect(res.status).toBe(422);
  });

  it('las ventas aparecen en reportes por plato y por mozo', async () => {
    const byProduct = await api().get('/api/reports/sales-by-product').set(bearer(admin));
    expect(byProduct.status).toBe(200);
    const row = byProduct.body.data.find((r: { productName: string }) => r.productName === 'Lomo saltado');
    expect(row.quantity).toBeGreaterThanOrEqual(2);

    const byWaiter = await api().get('/api/reports/sales-by-waiter').set(bearer(caja));
    const mario = byWaiter.body.data.find((r: { waiterName: string }) => r.waiterName === 'Mario Mozo');
    expect(mario.orders).toBeGreaterThanOrEqual(1);
    expect(mario.tipsCents).toBeGreaterThanOrEqual(1270);

    const dash = await api().get('/api/reports/dashboard').set(bearer(admin));
    expect(dash.body.closedOrders).toBeGreaterThanOrEqual(1);
    expect(dash.body.occupancy.total).toBe(12);
  });

  it('reporte con rango inválido → 400', async () => {
    const res = await api().get('/api/reports/sales-by-product?from=2026-02-01&to=2026-01-01').set(bearer(admin));
    expect(res.status).toBe(400);
  });

  it('listado de pedidos filtrable por estado', async () => {
    const res = await api().get(`/api/orders?status=cerrada&tableId=3`).set(bearer(caja));
    expect(res.body.data.some((o: { id: number; subtotalCents: number }) => o.id === orderId && o.subtotalCents === 12700)).toBe(true);
  });
});

describe('reglas adicionales', () => {
  it('cobrar con comandas sin entregar → 422', async () => {
    const open = await api().post('/api/orders').set(bearer(mozo2)).send({ tableId: 5 });
    const id = open.body.id;
    await api().post(`/api/orders/${id}/items`).set(bearer(mozo2)).send({ productId: lomo.id }).expect(201);
    await api().post(`/api/orders/${id}/send`).set(bearer(mozo2)).expect(200);
    const res = await api()
      .post(`/api/orders/${id}/close`)
      .set(bearer(caja))
      .send({ payments: [{ method: 'efectivo', amountCents: lomo.priceCents }] });
    expect(res.status).toBe(422);
    expect(res.body.detail).toMatch(/comandas/);
  });

  it('un mozo no puede anular un pedido con comandas; el admin sí y la mesa se libera', async () => {
    const order = (await api().get('/api/orders?status=abierta&tableId=5').set(bearer(admin))).body.data[0];
    expect((await api().post(`/api/orders/${order.id}/cancel`).set(bearer(mozo2))).status).toBe(403);
    const res = await api().post(`/api/orders/${order.id}/cancel`).set(bearer(admin));
    expect(res.body.status).toBe('cancelada');
    expect((await api().get('/api/tables/5').set(bearer(admin))).body.status).toBe('libre');
  });

  it('pedir más tras pedir la cuenta devuelve la mesa a "ocupada"', async () => {
    const open = await api().post('/api/orders').set(bearer(mozo)).send({ tableId: 7 });
    const id = open.body.id;
    await api().post(`/api/orders/${id}/items`).set(bearer(mozo)).send({ productId: lomo.id }).expect(201);
    await api().post(`/api/orders/${id}/send`).set(bearer(mozo)).expect(200);
    await api().post(`/api/orders/${id}/request-bill`).set(bearer(mozo)).expect(200);
    expect((await api().get('/api/tables/7').set(bearer(mozo))).body.status).toBe('por_cobrar');
    await api().post(`/api/orders/${id}/items`).set(bearer(mozo)).send({ productId: ceviche.id }).expect(201);
    expect((await api().get('/api/tables/7').set(bearer(mozo))).body.status).toBe('ocupada');
  });

  it('eliminar un ítem en borrador recalcula el total', async () => {
    const order = (await api().get('/api/orders?status=abierta&tableId=7').set(bearer(mozo))).body.data[0];
    const detail = await api().get(`/api/orders/${order.id}`).set(bearer(mozo));
    const draft = detail.body.items.find((i: { status: string }) => i.status === 'borrador');
    const res = await api().delete(`/api/orders/${order.id}/items/${draft.id}`).set(bearer(mozo));
    expect(res.status).toBe(200);
    expect(res.body.totals.subtotalCents).toBe(lomo.priceCents);
  });

  it('producto desactivado no se puede pedir', async () => {
    const created = await api()
      .post('/api/menu/products')
      .set(bearer(admin))
      .send({ categoryId: 1, name: 'Plato agotado', priceCents: 1000, active: false });
    const order = (await api().get('/api/orders?status=abierta&tableId=7').set(bearer(mozo))).body.data[0];
    const res = await api().post(`/api/orders/${order.id}/items`).set(bearer(mozo)).send({ productId: created.body.id });
    expect(res.status).toBe(422);
  });

  it('comensales muy por encima de la capacidad → 422', async () => {
    const res = await api().post('/api/orders').set(bearer(mozo)).send({ tableId: 1, guests: 20 });
    expect(res.status).toBe(422);
  });

  it('pedido inexistente → 404', async () => {
    expect((await api().get('/api/orders/99999').set(bearer(admin))).status).toBe(404);
  });
});
