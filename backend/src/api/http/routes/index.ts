/**
 * Rutas HTTP. Cada handler hace solo tres cosas: validar la entrada (zod), llamar a un
 * servicio de aplicación y serializar la respuesta. Ninguna regla de negocio vive aquí.
 * Express 5 propaga automáticamente los errores de handlers async al error handler.
 */
import { Router } from 'express';
import type { Container } from '../../../container';
import {
  addItemSchema,
  closeOrderSchema,
  createCategorySchema,
  createProductSchema,
  createTableSchema,
  createUserSchema,
  idParam,
  itemParams,
  kitchenQuery,
  listOrdersQuery,
  listProductsQuery,
  listTablesQuery,
  listUsersQuery,
  loginSchema,
  openOrderSchema,
  reportRangeQuery,
  splitSchema,
  updateProductSchema,
  updateTableSchema,
  updateUserSchema,
} from '../../../application/dtos';
import { actorOf, authenticate, authorize } from '../middlewares/auth';

export function buildApiRouter(c: Container): Router {
  const { services } = c;
  const api = Router();
  const auth = authenticate(c.tokens);
  const staff = authorize('admin', 'mozo', 'cocina', 'caja');

  // ---------- Auth ----------
  api.post('/auth/login', async (req, res) => {
    res.json(await services.auth.login(loginSchema.parse(req.body)));
  });
  api.get('/auth/me', auth, async (req, res) => {
    res.json(await services.auth.me(actorOf(req).id));
  });

  // ---------- Usuarios (solo admin) ----------
  api.get('/users', auth, authorize('admin'), async (req, res) => {
    res.json(await services.users.list(listUsersQuery.parse(req.query)));
  });
  api.post('/users', auth, authorize('admin'), async (req, res) => {
    res.status(201).json(await services.users.create(createUserSchema.parse(req.body)));
  });
  api.patch('/users/:id', auth, authorize('admin'), async (req, res) => {
    const { id } = idParam.parse(req.params);
    res.json(await services.users.update(id, updateUserSchema.parse(req.body), actorOf(req)));
  });

  // ---------- Mesas ----------
  api.get('/tables', auth, staff, async (req, res) => {
    res.json(await services.tables.list(listTablesQuery.parse(req.query)));
  });
  api.get('/tables/:id', auth, staff, async (req, res) => {
    res.json(await services.tables.get(idParam.parse(req.params).id));
  });
  api.post('/tables', auth, authorize('admin'), async (req, res) => {
    res.status(201).json(await services.tables.create(createTableSchema.parse(req.body)));
  });
  api.patch('/tables/:id', auth, authorize('admin'), async (req, res) => {
    res.json(await services.tables.update(idParam.parse(req.params).id, updateTableSchema.parse(req.body)));
  });

  // ---------- Carta ----------
  api.get('/menu/categories', auth, staff, async (_req, res) => {
    res.json(await services.menu.listCategories());
  });
  api.post('/menu/categories', auth, authorize('admin'), async (req, res) => {
    res.status(201).json(await services.menu.createCategory(createCategorySchema.parse(req.body)));
  });
  api.get('/menu/products', auth, staff, async (req, res) => {
    res.json(await services.menu.listProducts(listProductsQuery.parse(req.query)));
  });
  api.get('/menu/products/:id', auth, staff, async (req, res) => {
    res.json(await services.menu.getProduct(idParam.parse(req.params).id));
  });
  api.post('/menu/products', auth, authorize('admin'), async (req, res) => {
    res.status(201).json(await services.menu.createProduct(createProductSchema.parse(req.body)));
  });
  api.patch('/menu/products/:id', auth, authorize('admin'), async (req, res) => {
    res.json(await services.menu.updateProduct(idParam.parse(req.params).id, updateProductSchema.parse(req.body)));
  });

  // ---------- Pedidos ----------
  const waiters = authorize('admin', 'mozo');
  api.get('/orders', auth, authorize('admin', 'mozo', 'caja'), async (req, res) => {
    res.json(await services.orders.list(listOrdersQuery.parse(req.query)));
  });
  api.post('/orders', auth, waiters, async (req, res) => {
    res.status(201).json(await services.orders.open(openOrderSchema.parse(req.body), actorOf(req)));
  });
  api.get('/orders/:id', auth, authorize('admin', 'mozo', 'caja'), async (req, res) => {
    res.json(await services.orders.get(idParam.parse(req.params).id));
  });
  api.post('/orders/:id/items', auth, waiters, async (req, res) => {
    const { id } = idParam.parse(req.params);
    res.status(201).json(await services.orders.addItem(id, addItemSchema.parse(req.body), actorOf(req)));
  });
  api.delete('/orders/:id/items/:itemId', auth, waiters, async (req, res) => {
    const { id, itemId } = itemParams.parse(req.params);
    res.json(await services.orders.removeItem(id, itemId, actorOf(req)));
  });
  api.post('/orders/:id/send', auth, waiters, async (req, res) => {
    res.json(await services.orders.sendToKitchen(idParam.parse(req.params).id, actorOf(req)));
  });
  api.post('/orders/:id/request-bill', auth, authorize('admin', 'mozo', 'caja'), async (req, res) => {
    res.json(await services.orders.requestBill(idParam.parse(req.params).id, actorOf(req)));
  });
  api.post('/orders/:id/cancel', auth, waiters, async (req, res) => {
    res.json(await services.orders.cancel(idParam.parse(req.params).id, actorOf(req)));
  });
  api.post('/orders/:id/split', auth, authorize('admin', 'mozo', 'caja'), async (req, res) => {
    res.json(await services.orders.splitPreview(idParam.parse(req.params).id, splitSchema.parse(req.body)));
  });
  api.post('/orders/:id/close', auth, authorize('admin', 'caja'), async (req, res) => {
    const { id } = idParam.parse(req.params);
    res.json(await services.payments.closeOrder(id, closeOrderSchema.parse(req.body), actorOf(req)));
  });

  // ---------- Cocina (KDS) ----------
  api.get('/kitchen/tickets', auth, authorize('admin', 'cocina', 'mozo'), async (req, res) => {
    res.json(await services.kitchen.board(kitchenQuery.parse(req.query).status));
  });
  api.post('/kitchen/tickets/:id/advance', auth, authorize('admin', 'cocina', 'mozo'), async (req, res) => {
    res.json(await services.kitchen.advance(idParam.parse(req.params).id, actorOf(req)));
  });

  // ---------- Reportes ----------
  const managers = authorize('admin', 'caja');
  api.get('/reports/dashboard', auth, managers, async (_req, res) => {
    res.json(await services.reports.dashboard());
  });
  api.get('/reports/sales-by-product', auth, managers, async (req, res) => {
    const range = reportRangeQuery.parse(req.query);
    res.json({ range, data: await services.reports.salesByProduct(range) });
  });
  api.get('/reports/sales-by-waiter', auth, managers, async (req, res) => {
    const range = reportRangeQuery.parse(req.query);
    res.json({ range, data: await services.reports.salesByWaiter(range) });
  });

  return api;
}
