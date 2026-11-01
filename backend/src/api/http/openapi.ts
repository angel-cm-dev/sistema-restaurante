/**
 * Especificación OpenAPI 3.1 (servida en /api/docs y /api/openapi.json).
 * Se escribe a mano con pequeños helpers para mantenerla legible.
 */
type Schema = Record<string, unknown>;

const ref = (name: string): Schema => ({ $ref: `#/components/schemas/${name}` });
const json = (schema: Schema) => ({ 'application/json': { schema } });
const problemResponse = (description: string) => ({
  description,
  content: { 'application/problem+json': { schema: ref('ProblemDetails') } },
});
const ok = (schema: Schema, description = 'OK') => ({ description, content: json(schema) });
const idPath = { name: 'id', in: 'path', required: true, schema: { type: 'integer' } };
const pageParams = [
  { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
  { name: 'pageSize', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
  { name: 'order', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'] } },
  { name: 'search', in: 'query', schema: { type: 'string' } },
];
const rangeParams = [
  { name: 'from', in: 'query', schema: { type: 'string', format: 'date-time' }, description: 'Por defecto: hace 30 días' },
  { name: 'to', in: 'query', schema: { type: 'string', format: 'date-time' }, description: 'Por defecto: ahora' },
];
const errors = {
  400: problemResponse('Entrada inválida'),
  401: problemResponse('Token ausente o inválido'),
  403: problemResponse('Rol sin permiso'),
};
const withErrors = (responses: Record<string, unknown>, extra: number[] = []) => ({
  ...responses,
  ...errors,
  ...Object.fromEntries(
    extra.map((code) => [code, problemResponse(code === 404 ? 'No encontrado' : code === 409 ? 'Conflicto' : 'Regla de negocio incumplida')]),
  ),
});
const paged = (item: string): Schema => ({
  type: 'object',
  properties: { data: { type: 'array', items: ref(item) }, meta: ref('PageMeta') },
});

export const openApiDocument = {
  openapi: '3.1.0',
  info: {
    title: 'Sistema Restaurante API',
    version: '1.0.0',
    description:
      'API para salón, comandas, KDS y caja. Importes en **céntimos** (S/ 42.50 = 4250). ' +
      'Autentícate en POST /api/auth/login y usa el token con el botón "Authorize". ' +
      'Eventos en tiempo real vía Socket.IO: ver README.',
    license: { name: 'MIT' },
  },
  servers: [{ url: '/' }],
  tags: ['Auth', 'Usuarios', 'Mesas', 'Carta', 'Pedidos', 'Caja', 'Cocina', 'Reportes', 'Sistema'].map((name) => ({ name })),
  components: {
    securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
    schemas: {
      ProblemDetails: {
        type: 'object',
        properties: {
          type: { type: 'string' },
          title: { type: 'string' },
          status: { type: 'integer' },
          detail: { type: 'string' },
          instance: { type: 'string' },
          code: { type: 'string', example: 'BUSINESS_RULE' },
          traceId: { type: 'string' },
          errors: {
            type: 'array',
            items: { type: 'object', properties: { field: { type: 'string' }, message: { type: 'string' } } },
          },
        },
      },
      PageMeta: {
        type: 'object',
        properties: {
          page: { type: 'integer' },
          pageSize: { type: 'integer' },
          total: { type: 'integer' },
          totalPages: { type: 'integer' },
        },
      },
      Role: { type: 'string', enum: ['admin', 'mozo', 'cocina', 'caja'] },
      User: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          name: { type: 'string' },
          email: { type: 'string' },
          role: ref('Role'),
          active: { type: 'boolean' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      Table: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          number: { type: 'integer' },
          seats: { type: 'integer' },
          zone: { type: 'string' },
          status: { type: 'string', enum: ['libre', 'ocupada', 'por_cobrar'] },
          posX: { type: 'integer' },
          posY: { type: 'integer' },
          currentOrderId: { type: ['integer', 'null'] },
        },
      },
      Modifier: {
        type: 'object',
        properties: { id: { type: 'integer' }, name: { type: 'string' }, priceCents: { type: 'integer' } },
      },
      Product: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          categoryId: { type: 'integer' },
          categoryName: { type: 'string' },
          name: { type: 'string' },
          description: { type: 'string' },
          priceCents: { type: 'integer', example: 3800 },
          active: { type: 'boolean' },
          modifiers: { type: 'array', items: ref('Modifier') },
        },
      },
      ProductInput: {
        type: 'object',
        required: ['categoryId', 'name', 'priceCents'],
        properties: {
          categoryId: { type: 'integer' },
          name: { type: 'string' },
          description: { type: 'string' },
          priceCents: { type: 'integer' },
          active: { type: 'boolean' },
          modifiers: {
            type: 'array',
            items: { type: 'object', properties: { name: { type: 'string' }, priceCents: { type: 'integer' } } },
          },
        },
      },
      Totals: {
        type: 'object',
        properties: {
          subtotalCents: { type: 'integer' },
          baseCents: { type: 'integer', description: 'Subtotal sin IGV' },
          taxCents: { type: 'integer', description: 'IGV (18%) incluido en el subtotal' },
          tipCents: { type: 'integer' },
          totalCents: { type: 'integer' },
        },
      },
      OrderItem: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          productId: { type: 'integer' },
          productName: { type: 'string' },
          unitPriceCents: { type: 'integer' },
          quantity: { type: 'integer' },
          modifiers: { type: 'array', items: ref('Modifier') },
          modifiersCents: { type: 'integer' },
          notes: { type: ['string', 'null'] },
          ticketId: { type: ['integer', 'null'] },
          status: { type: 'string', enum: ['borrador', 'pendiente', 'preparando', 'listo', 'entregado'] },
          lineTotalCents: { type: 'integer' },
        },
      },
      Order: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          tableId: { type: 'integer' },
          tableNumber: { type: 'integer' },
          waiterId: { type: 'integer' },
          waiterName: { type: 'string' },
          status: { type: 'string', enum: ['abierta', 'cerrada', 'cancelada'] },
          guests: { type: 'integer' },
          openedAt: { type: 'string', format: 'date-time' },
          closedAt: { type: ['string', 'null'], format: 'date-time' },
          items: { type: 'array', items: ref('OrderItem') },
          tickets: { type: 'array', items: ref('Ticket') },
          totals: ref('Totals'),
          payments: { type: 'array', items: ref('Payment') },
          paidCents: { type: 'integer' },
        },
      },
      Ticket: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          orderId: { type: 'integer' },
          tableNumber: { type: 'integer' },
          waiterName: { type: 'string' },
          status: { type: 'string', enum: ['pendiente', 'preparando', 'listo', 'entregado'] },
          createdAt: { type: 'string', format: 'date-time' },
          startedAt: { type: ['string', 'null'], format: 'date-time' },
          readyAt: { type: ['string', 'null'], format: 'date-time' },
          deliveredAt: { type: ['string', 'null'], format: 'date-time' },
          timings: {
            type: 'object',
            properties: {
              waitSeconds: { type: ['integer', 'null'] },
              prepSeconds: { type: ['integer', 'null'] },
              totalSeconds: { type: 'integer' },
            },
          },
        },
      },
      Payment: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          method: { type: 'string', enum: ['efectivo', 'tarjeta', 'yape_plin'] },
          amountCents: { type: 'integer' },
          tipCents: { type: 'integer' },
          payerLabel: { type: ['string', 'null'] },
        },
      },
      Tip: {
        oneOf: [
          { type: 'object', properties: { type: { const: 'percent' }, value: { type: 'number', maximum: 30 } } },
          { type: 'object', properties: { type: { const: 'amount' }, value: { type: 'integer' } } },
        ],
      },
    },
  },
  security: [{ bearerAuth: [] }],
  paths: {
    '/health': {
      get: { tags: ['Sistema'], security: [], summary: 'Estado del servicio y la base de datos', responses: { 200: ok({ type: 'object' }) } },
    },
    '/api/auth/login': {
      post: {
        tags: ['Auth'],
        security: [],
        summary: 'Inicia sesión y devuelve un JWT',
        requestBody: {
          required: true,
          content: json({
            type: 'object',
            properties: { email: { type: 'string', example: 'admin@demo.pe' }, password: { type: 'string', example: 'Demo123!' } },
          }),
        },
        responses: withErrors({ 200: ok({ type: 'object', properties: { token: { type: 'string' }, user: ref('User') } }) }),
      },
    },
    '/api/auth/me': { get: { tags: ['Auth'], summary: 'Usuario autenticado', responses: withErrors({ 200: ok(ref('User')) }) } },
    '/api/users': {
      get: {
        tags: ['Usuarios'],
        summary: 'Lista usuarios (admin)',
        parameters: [
          ...pageParams,
          { name: 'sort', in: 'query', schema: { type: 'string', enum: ['name', 'email', 'role', 'createdAt'] } },
          { name: 'role', in: 'query', schema: ref('Role') },
          { name: 'active', in: 'query', schema: { type: 'boolean' } },
        ],
        responses: withErrors({ 200: ok(paged('User')) }),
      },
      post: {
        tags: ['Usuarios'],
        summary: 'Crea usuario (admin)',
        requestBody: {
          content: json({
            type: 'object',
            required: ['name', 'email', 'password', 'role'],
            properties: { name: { type: 'string' }, email: { type: 'string' }, password: { type: 'string' }, role: ref('Role') },
          }),
        },
        responses: withErrors({ 201: ok(ref('User'), 'Creado') }, [409]),
      },
    },
    '/api/users/{id}': {
      patch: {
        tags: ['Usuarios'],
        summary: 'Actualiza nombre, rol, estado o contraseña (admin)',
        parameters: [idPath],
        requestBody: { content: json({ type: 'object' }) },
        responses: withErrors({ 200: ok(ref('User')) }, [404, 422]),
      },
    },
    '/api/tables': {
      get: {
        tags: ['Mesas'],
        summary: 'Plano del salón',
        parameters: [
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['libre', 'ocupada', 'por_cobrar'] } },
          { name: 'zone', in: 'query', schema: { type: 'string' } },
        ],
        responses: withErrors({ 200: ok({ type: 'array', items: ref('Table') }) }),
      },
      post: { tags: ['Mesas'], summary: 'Crea mesa (admin)', requestBody: { content: json(ref('Table')) }, responses: withErrors({ 201: ok(ref('Table')) }, [409]) },
    },
    '/api/tables/{id}': {
      get: { tags: ['Mesas'], summary: 'Detalle de mesa', parameters: [idPath], responses: withErrors({ 200: ok(ref('Table')) }, [404]) },
      patch: { tags: ['Mesas'], summary: 'Edita mesa (admin)', parameters: [idPath], requestBody: { content: json(ref('Table')) }, responses: withErrors({ 200: ok(ref('Table')) }, [404, 409]) },
    },
    '/api/menu/categories': {
      get: { tags: ['Carta'], summary: 'Categorías con conteo de productos', responses: withErrors({ 200: ok({ type: 'array' }) }) },
      post: { tags: ['Carta'], summary: 'Crea categoría (admin)', requestBody: { content: json({ type: 'object' }) }, responses: withErrors({ 201: ok({ type: 'object' }) }, [409]) },
    },
    '/api/menu/products': {
      get: {
        tags: ['Carta'],
        summary: 'Productos paginados con filtros',
        parameters: [
          ...pageParams,
          { name: 'sort', in: 'query', schema: { type: 'string', enum: ['name', 'priceCents', 'category'] } },
          { name: 'categoryId', in: 'query', schema: { type: 'integer' } },
          { name: 'active', in: 'query', schema: { type: 'boolean' } },
        ],
        responses: withErrors({ 200: ok(paged('Product')) }),
      },
      post: { tags: ['Carta'], summary: 'Crea producto con modificadores (admin)', requestBody: { content: json(ref('ProductInput')) }, responses: withErrors({ 201: ok(ref('Product')) }) },
    },
    '/api/menu/products/{id}': {
      get: { tags: ['Carta'], summary: 'Detalle de producto', parameters: [idPath], responses: withErrors({ 200: ok(ref('Product')) }, [404]) },
      patch: { tags: ['Carta'], summary: 'Edita producto (admin)', parameters: [idPath], requestBody: { content: json(ref('ProductInput')) }, responses: withErrors({ 200: ok(ref('Product')) }, [404]) },
    },
    '/api/orders': {
      get: {
        tags: ['Pedidos'],
        summary: 'Lista pedidos',
        parameters: [
          ...pageParams,
          { name: 'sort', in: 'query', schema: { type: 'string', enum: ['openedAt', 'closedAt', 'table'] } },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['abierta', 'cerrada', 'cancelada'] } },
          { name: 'tableId', in: 'query', schema: { type: 'integer' } },
          { name: 'waiterId', in: 'query', schema: { type: 'integer' } },
          ...rangeParams,
        ],
        responses: withErrors({ 200: ok({ type: 'object' }) }),
      },
      post: {
        tags: ['Pedidos'],
        summary: 'Abre un pedido en una mesa libre (mozo/admin)',
        requestBody: { content: json({ type: 'object', properties: { tableId: { type: 'integer' }, guests: { type: 'integer' } } }) },
        responses: withErrors({ 201: ok(ref('Order')) }, [404, 422]),
      },
    },
    '/api/orders/{id}': { get: { tags: ['Pedidos'], summary: 'Detalle con ítems, comandas, totales y pagos', parameters: [idPath], responses: withErrors({ 200: ok(ref('Order')) }, [404]) } },
    '/api/orders/{id}/items': {
      post: {
        tags: ['Pedidos'],
        summary: 'Agrega un ítem (queda en borrador hasta enviarlo a cocina)',
        parameters: [idPath],
        requestBody: {
          content: json({
            type: 'object',
            properties: {
              productId: { type: 'integer' },
              quantity: { type: 'integer' },
              modifierIds: { type: 'array', items: { type: 'integer' } },
              notes: { type: 'string' },
            },
          }),
        },
        responses: withErrors({ 201: ok(ref('Order')) }, [404, 422]),
      },
    },
    '/api/orders/{id}/items/{itemId}': {
      delete: {
        tags: ['Pedidos'],
        summary: 'Elimina un ítem en borrador',
        parameters: [idPath, { name: 'itemId', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: withErrors({ 200: ok(ref('Order')) }, [404, 422]),
      },
    },
    '/api/orders/{id}/send': { post: { tags: ['Pedidos'], summary: 'Envía los ítems en borrador a cocina como una comanda', parameters: [idPath], responses: withErrors({ 200: ok(ref('Order')) }, [422]) } },
    '/api/orders/{id}/request-bill': { post: { tags: ['Pedidos'], summary: 'Marca la mesa como "por cobrar"', parameters: [idPath], responses: withErrors({ 200: ok(ref('Order')) }, [422]) } },
    '/api/orders/{id}/cancel': { post: { tags: ['Pedidos'], summary: 'Anula el pedido y libera la mesa', parameters: [idPath], responses: withErrors({ 200: ok(ref('Order')) }, [422]) } },
    '/api/orders/{id}/split': {
      post: {
        tags: ['Caja'],
        summary: 'Vista previa de división de cuenta (partes iguales o por ítems) con propina',
        parameters: [idPath],
        requestBody: {
          content: json({
            type: 'object',
            properties: {
              tip: ref('Tip'),
              split: {
                oneOf: [
                  { type: 'object', properties: { mode: { const: 'equal' }, parts: { type: 'integer' } } },
                  {
                    type: 'object',
                    properties: {
                      mode: { const: 'items' },
                      assignments: {
                        type: 'array',
                        items: { type: 'object', properties: { label: { type: 'string' }, itemIds: { type: 'array', items: { type: 'integer' } } } },
                      },
                    },
                  },
                ],
              },
            },
          }),
        },
        responses: withErrors({ 200: ok({ type: 'object' }) }, [422]),
      },
    },
    '/api/orders/{id}/close': {
      post: {
        tags: ['Caja'],
        summary: 'Cobra (uno o varios pagos), registra propina, cierra pedido y libera la mesa',
        parameters: [idPath],
        requestBody: {
          content: json({
            type: 'object',
            properties: {
              tip: ref('Tip'),
              payments: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    method: { type: 'string', enum: ['efectivo', 'tarjeta', 'yape_plin'] },
                    amountCents: { type: 'integer' },
                    payerLabel: { type: 'string' },
                  },
                },
              },
            },
          }),
        },
        responses: withErrors({ 200: ok(ref('Order')) }, [404, 422]),
      },
    },
    '/api/kitchen/tickets': {
      get: {
        tags: ['Cocina'],
        summary: 'Comandas del KDS (FIFO)',
        parameters: [{ name: 'status', in: 'query', schema: { type: 'string', example: 'pendiente,preparando,listo' } }],
        responses: withErrors({ 200: ok({ type: 'array', items: ref('Ticket') }) }),
      },
    },
    '/api/kitchen/tickets/{id}/advance': {
      post: {
        tags: ['Cocina'],
        summary: 'Avanza la comanda: pendiente → preparando → listo (cocina) → entregado (mozo)',
        parameters: [idPath],
        responses: withErrors({ 200: ok(ref('Ticket')) }, [404, 422]),
      },
    },
    '/api/reports/dashboard': { get: { tags: ['Reportes'], summary: 'KPIs del día', responses: withErrors({ 200: ok({ type: 'object' }) }) } },
    '/api/reports/sales-by-product': { get: { tags: ['Reportes'], summary: 'Ventas por plato', parameters: rangeParams, responses: withErrors({ 200: ok({ type: 'object' }) }) } },
    '/api/reports/sales-by-waiter': { get: { tags: ['Reportes'], summary: 'Ventas y propinas por mozo', parameters: rangeParams, responses: withErrors({ 200: ok({ type: 'object' }) }) } },
  },
};
