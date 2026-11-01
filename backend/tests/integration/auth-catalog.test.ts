import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearer, loginAs, startTestServer } from '../helpers';

let server: Awaited<ReturnType<typeof startTestServer>>;
let admin: string;
let mozo: string;
let cocina: string;

beforeAll(async () => {
  server = await startTestServer();
  [admin, mozo, cocina] = await Promise.all([
    loginAs(server.url, 'admin@demo.pe'),
    loginAs(server.url, 'mozo@demo.pe'),
    loginAs(server.url, 'cocina@demo.pe'),
  ]);
});
afterAll(() => server.close());

describe('sistema', () => {
  it('GET /health informa el estado de la base', async () => {
    const res = await request(server.url).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', database: 'up' });
  });

  it('publica la especificación OpenAPI', async () => {
    const res = await request(server.url).get('/api/openapi.json');
    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe('3.1.0');
    expect(res.body.paths['/api/orders/{id}/close']).toBeDefined();
  });

  it('rutas inexistentes devuelven ProblemDetails 404', async () => {
    const res = await request(server.url).get('/api/no-existe');
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
    expect(res.body).toMatchObject({ status: 404, code: 'ROUTE_NOT_FOUND' });
  });
});

describe('autenticación', () => {
  it('login correcto devuelve token y usuario sin hash', async () => {
    const res = await request(server.url).post('/api/auth/login').send({ email: 'ADMIN@demo.pe', password: 'Demo123!' });
    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.user).toMatchObject({ email: 'admin@demo.pe', role: 'admin' });
    expect(res.body.user.passwordHash).toBeUndefined();
  });

  it('credenciales incorrectas → 401 con mensaje genérico', async () => {
    const res = await request(server.url).post('/api/auth/login').send({ email: 'admin@demo.pe', password: 'mala' });
    expect(res.status).toBe(401);
    expect(res.body.detail).toBe('Email o contraseña incorrectos');
  });

  it('entrada inválida → 400 con detalle por campo', async () => {
    const res = await request(server.url).post('/api/auth/login').send({ email: 'no-es-email' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION');
    expect(res.body.errors.map((e: { field: string }) => e.field)).toEqual(expect.arrayContaining(['email', 'password']));
  });

  it('JSON mal formado → 400', async () => {
    const res = await request(server.url)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email":');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('MALFORMED_JSON');
  });

  it('sin token → 401; token alterado → 401', async () => {
    expect((await request(server.url).get('/api/auth/me')).status).toBe(401);
    const res = await request(server.url).get('/api/auth/me').set(bearer(`${admin}x`));
    expect(res.status).toBe(401);
  });

  it('GET /auth/me devuelve el usuario del token', async () => {
    const res = await request(server.url).get('/api/auth/me').set(bearer(mozo));
    expect(res.body).toMatchObject({ email: 'mozo@demo.pe', role: 'mozo' });
  });
});

describe('autorización por rol', () => {
  it('un mozo no puede listar usuarios (403)', async () => {
    const res = await request(server.url).get('/api/users').set(bearer(mozo));
    expect(res.status).toBe(403);
  });

  it('cocina no puede abrir pedidos (403)', async () => {
    const res = await request(server.url).post('/api/orders').set(bearer(cocina)).send({ tableId: 1 });
    expect(res.status).toBe(403);
  });

  it('cocina no ve reportes (403)', async () => {
    expect((await request(server.url).get('/api/reports/dashboard').set(bearer(cocina))).status).toBe(403);
  });
});

describe('usuarios (admin)', () => {
  it('lista paginada con filtro por rol y orden', async () => {
    const res = await request(server.url).get('/api/users?role=mozo&sort=name&order=desc&pageSize=1').set(bearer(admin));
    expect(res.status).toBe(200);
    expect(res.body.meta).toEqual({ page: 1, pageSize: 1, total: 2, totalPages: 2 });
    expect(res.body.data[0].name).toBe('Mario Mozo');
  });

  it('búsqueda por texto', async () => {
    const res = await request(server.url).get('/api/users?search=cocina').set(bearer(admin));
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].role).toBe('cocina');
  });

  it('crea usuario y el nuevo usuario puede iniciar sesión', async () => {
    const res = await request(server.url)
      .post('/api/users')
      .set(bearer(admin))
      .send({ name: 'Pedro Prueba', email: 'pedro@demo.pe', password: 'Clave1234', role: 'mozo' });
    expect(res.status).toBe(201);
    const login = await request(server.url).post('/api/auth/login').send({ email: 'pedro@demo.pe', password: 'Clave1234' });
    expect(login.status).toBe(200);
  });

  it('email duplicado → 409', async () => {
    const res = await request(server.url)
      .post('/api/users')
      .set(bearer(admin))
      .send({ name: 'Otro', email: 'mozo@demo.pe', password: 'Clave1234', role: 'mozo' });
    expect(res.status).toBe(409);
  });

  it('contraseña débil → 400', async () => {
    const res = await request(server.url)
      .post('/api/users')
      .set(bearer(admin))
      .send({ name: 'Débil', email: 'debil@demo.pe', password: 'abc', role: 'caja' });
    expect(res.status).toBe(400);
  });

  it('un usuario desactivado no puede iniciar sesión', async () => {
    const list = await request(server.url).get('/api/users?search=pedro').set(bearer(admin));
    const id = list.body.data[0].id;
    await request(server.url).patch(`/api/users/${id}`).set(bearer(admin)).send({ active: false }).expect(200);
    const login = await request(server.url).post('/api/auth/login').send({ email: 'pedro@demo.pe', password: 'Clave1234' });
    expect(login.status).toBe(401);
  });

  it('el admin no puede desactivarse a sí mismo (422)', async () => {
    const me = await request(server.url).get('/api/auth/me').set(bearer(admin));
    const res = await request(server.url).patch(`/api/users/${me.body.id}`).set(bearer(admin)).send({ active: false });
    expect(res.status).toBe(422);
  });
});

describe('carta', () => {
  it('categorías con conteo de productos', async () => {
    const res = await request(server.url).get('/api/menu/categories').set(bearer(mozo));
    expect(res.status).toBe(200);
    expect(res.body[0]).toMatchObject({ name: 'Entradas', productCount: 3 });
  });

  it('productos paginados, filtrados por categoría y ordenados por precio', async () => {
    const cats = await request(server.url).get('/api/menu/categories').set(bearer(mozo));
    const marinos = cats.body.find((c: { name: string }) => c.name === 'Marinos');
    const res = await request(server.url)
      .get(`/api/menu/products?categoryId=${marinos.id}&sort=priceCents&order=desc`)
      .set(bearer(mozo));
    expect(res.body.data.map((p: { name: string }) => p.name)).toEqual(['Jalea mixta', 'Arroz con mariscos', 'Ceviche clásico']);
    expect(res.body.data[2].modifiers.length).toBe(3);
  });

  it('búsqueda de productos', async () => {
    const res = await request(server.url).get('/api/menu/products?search=lomo').set(bearer(mozo));
    expect(res.body.meta.total).toBe(1);
  });

  it('sort fuera de la lista blanca → 400', async () => {
    const res = await request(server.url).get('/api/menu/products?sort=password_hash').set(bearer(mozo));
    expect(res.status).toBe(400);
  });

  it('admin crea y edita un producto con modificadores', async () => {
    const created = await request(server.url)
      .post('/api/menu/products')
      .set(bearer(admin))
      .send({ categoryId: 1, name: 'Tequeños', priceCents: 1900, modifiers: [{ name: 'Guacamole', priceCents: 400 }] });
    expect(created.status).toBe(201);
    expect(created.body.modifiers).toHaveLength(1);
    const updated = await request(server.url)
      .patch(`/api/menu/products/${created.body.id}`)
      .set(bearer(admin))
      .send({ priceCents: 2100, active: false, modifiers: [] });
    expect(updated.body).toMatchObject({ priceCents: 2100, active: false, modifiers: [] });
  });

  it('producto con categoría inexistente → 400', async () => {
    const res = await request(server.url)
      .post('/api/menu/products')
      .set(bearer(admin))
      .send({ categoryId: 999, name: 'X', priceCents: 100 });
    expect(res.status).toBe(400);
  });

  it('mesas: listado y filtro por estado', async () => {
    const res = await request(server.url).get('/api/tables?status=libre').set(bearer(mozo));
    expect(res.body).toHaveLength(12);
  });
});
