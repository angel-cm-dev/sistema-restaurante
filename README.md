# Sistema Restaurante · salón, comandas y cocina en tiempo real

[![CI](https://github.com/angel-cm-dev/sistema-restaurante/actions/workflows/ci.yml/badge.svg)](https://github.com/angel-cm-dev/sistema-restaurante/actions/workflows/ci.yml)
![Node](https://img.shields.io/badge/Node.js-24-339933?logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-6-3178C6?logo=typescript&logoColor=white)
![Socket.IO](https://img.shields.io/badge/Socket.IO-4-010101?logo=socket.io)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)
![Licencia MIT](https://img.shields.io/badge/licencia-MIT-green)

Sistema full-stack para operar un restaurante de punta a punta: **plano del salón con estados en tiempo real**, **carta con categorías y modificadores**, **toma de pedidos por mozo**, **pantalla de cocina (KDS)** que recibe las comandas al instante, **caja con división de cuenta y propina**, y **reportes de ventas por plato y por mozo**.

El restaurante de la demo, *La Huerta Limeña*, y todos sus datos son **ficticios**.

---

## Tabla de contenidos

- [Características](#características)
- [Arquitectura](#arquitectura)
- [Stack y por qué](#stack-y-por-qué)
- [Inicio rápido con Docker](#inicio-rápido-con-docker-un-comando)
- [Inicio sin Docker](#inicio-sin-docker)
- [Credenciales demo](#credenciales-demo)
- [Endpoints principales](#endpoints-principales)
- [Eventos de Socket.IO](#eventos-de-socketio)
- [Pruebas](#pruebas)
- [Estructura de carpetas](#estructura-de-carpetas)
- [Variables de entorno](#variables-de-entorno)
- [Qué aprenderás con este proyecto](#qué-aprenderás-con-este-proyecto)
- [Roadmap](#roadmap)
- [Licencia y autor](#licencia-y-autor)

---

## Características

| Módulo | Qué hace |
| --- | --- |
| **Salón** | Plano de mesas por zona con estados `libre → ocupada → por_cobrar`. Cualquier cambio se refleja en todas las pantallas sin recargar. |
| **Carta** | Categorías, platos con precio (IGV incluido) y **modificadores** con o sin costo ("Extra leche de tigre +S/ 5", "Sin cebolla"). Listado con búsqueda, filtros, orden y paginación en servidor. |
| **Vista mozo** | Abre mesa, agrega platos con modificadores y notas, los envía a cocina como **comanda**, pide la cuenta. Un mozo solo modifica *sus* mesas. |
| **Cocina (KDS)** | Tablero FIFO con columnas *Pendiente / Preparando / Listo*, cronómetro por comanda y semáforo (amarillo > 10 min, rojo > 20 min). Avanza estados por WebSocket con *ack*. |
| **Caja** | Desglose de IGV, propina (% o monto), **división de cuenta** en partes iguales o **por consumo** (ítems compartidos se reparten), varios medios de pago (efectivo con vuelto, tarjeta, Yape/Plin) y cierre de mesa en una transacción. |
| **Reportes** | Dashboard con KPIs del día (ventas, propinas, ocupación, tiempo medio de preparación) y reportes por plato y por mozo con rango de fechas. |
| **Seguridad** | JWT con 4 roles (admin, mozo, cocina, caja), autorización por endpoint **y** en el handshake de Socket.IO, contraseñas con bcrypt, errores RFC 9457 (Problem Details), logs estructurados con pino. |
| **Calidad** | 120+ pruebas automatizadas (unitarias, integración HTTP y eventos Socket.IO), CI en GitHub Actions, Docker multi-stage con usuario no root. |

---

## Arquitectura

```mermaid
flowchart LR
  subgraph Cliente["Navegador (React + Vite)"]
    UI[Pantallas: Salón · Mozo · KDS · Caja · Reportes]
    APIC[Cliente HTTP con JWT]
    SIOC[socket.io-client]
    UI --> APIC
    UI --> SIOC
  end

  subgraph Nginx["nginx (frontend)"]
    STATIC[SPA estática]
    PROXY[/proxy /api y /socket.io/]
  end

  subgraph Backend["API Node.js + TypeScript"]
    direction TB
    HTTP[Capa API: Express 5 · zod · OpenAPI]
    WS[Capa API: Socket.IO · JWT en handshake]
    APP[Capa Aplicación: servicios y casos de uso]
    DOM[Capa Dominio: reglas puras<br/>facturación · KDS · mesas]
    INFRA[Infraestructura: repos PostgreSQL · bcrypt · JWT · publisher]
    HTTP --> APP
    WS --> APP
    APP --> DOM
    APP -->|puertos| INFRA
    INFRA -->|eventos de dominio| WS
  end

  DB[(PostgreSQL 16)]

  APIC -->|REST| PROXY
  SIOC <-->|WebSocket| PROXY
  PROXY --> HTTP
  PROXY --> WS
  INFRA --> DB
```

Flujo típico: el mozo envía una comanda (`POST /api/orders/:id/send`) → el servicio la guarda en una transacción → **después del COMMIT** publica `ticket.created` → el publisher de Socket.IO la emite a la sala `kitchen` → el KDS la muestra sin recargar.

Más detalle en [docs/arquitectura.md](docs/arquitectura.md) y el modelo de datos en [docs/modelo-datos.md](docs/modelo-datos.md).

---

## Stack y por qué

| Pieza | Elección | Justificación |
| --- | --- | --- |
| Runtime | **Node.js 24 + TypeScript 6** | Un solo lenguaje en front y back; tipos estrictos para un dominio con dinero y estados. |
| HTTP | **Express 5** | Maduro y conocido; la v5 propaga errores de handlers `async` sin envoltorios. |
| Tiempo real | **Socket.IO 4** | Salas por rol, *acks* (respuesta a un evento), reconexión automática y fallback a long-polling. |
| Validación | **zod 4** | Un esquema = validación en runtime + tipo TypeScript inferido (DTOs sin duplicar). |
| Base de datos | **PostgreSQL 16** + `pg` | Transacciones, índices parciales (una mesa = un pedido abierto) y SQL explícito sin ORM. |
| Pruebas sin Docker | **pg-mem** | Emula PostgreSQL en memoria: los **mismos repositorios SQL** se prueban sin levantar una base. |
| Seguridad | **jsonwebtoken + bcryptjs + helmet** | Estándares de la industria; bcryptjs evita compilar binarios nativos. |
| Logs | **pino** | JSON estructurado, rápido, con *redaction* de secretos y `X-Request-Id`. |
| Docs API | **OpenAPI 3.1 + Swagger UI** | Contrato navegable en `/api/docs`. |
| Frontend | **React 18 + Vite + Tailwind CSS 3** | Arranque instantáneo, UI responsive y modo oscuro por clase. |
| Pruebas | **Vitest + supertest + socket.io-client + Testing Library** | Mismo runner en ambos lados; pruebas de eventos con clientes reales. |

---

## Inicio rápido con Docker (un comando)

Requisitos: Docker Desktop (o Docker Engine + Compose v2).

```bash
docker compose up --build
```

| Servicio | URL |
| --- | --- |
| Aplicación web | http://localhost:8080 |
| API + Swagger UI | http://localhost:3000/api/docs |
| Health check | http://localhost:3000/health |

Al arrancar, el backend **aplica las migraciones** y, si la base está vacía, **carga los datos demo** (usuarios, 12 mesas, carta y una semana de ventas para los reportes). Para personalizar secretos copia `.env.example` a `.env` antes de levantar.

---

## Inicio sin Docker

### Opción A — sin instalar PostgreSQL (modo demo en memoria)

Ideal para revisar el proyecto en 1 minuto. Usa pg-mem; los datos se pierden al detener el proceso.

```bash
# Terminal 1 — API en http://localhost:3000
cd backend
npm install
npm run dev:memory

# Terminal 2 — Web en http://localhost:5173 (Vite hace proxy de /api y /socket.io)
cd frontend
npm install
npm run dev
```

### Opción B — con un PostgreSQL local

```bash
cd backend
cp ../.env.example .env        # ajusta DATABASE_URL y JWT_SECRET
npm install
npm run db:seed                # migraciones + datos demo
npm run dev                    # API con recarga en caliente

cd ../frontend
npm install
npm run dev
```

---

## Credenciales demo

Todas usan la contraseña **`Demo123!`** (cuentas ficticias, solo para la demo):

| Rol | Email | Pantalla inicial | Puede |
| --- | --- | --- | --- |
| Administrador | **admin@demo.pe** | Dashboard | Todo: usuarios, carta, mesas, anular pedidos con comandas |
| Mozo | mozo@demo.pe | Salón | Abrir mesas, tomar pedidos, enviar a cocina, marcar "entregado" |
| Mozo 2 | mozo2@demo.pe | Salón | Igual que el anterior (sirve para probar que un mozo no edita mesas ajenas) |
| Cocina | cocina@demo.pe | KDS | Ver comandas, marcar "preparando" y "listo" |
| Caja | caja@demo.pe | Dashboard | Cobrar, dividir cuentas, ver reportes |

> Tip para la demo: abre dos navegadores (o una ventana de incógnito), entra como **mozo** en uno y como **cocina** en el otro, y envía una comanda: aparece al instante en el KDS.

---

## Endpoints principales

Base: `/api` · Autenticación: `Authorization: Bearer <token>` · Importes en **céntimos** (S/ 42.50 = `4250`). Contrato completo en `/api/docs` y ejemplos `curl` en [docs/guia-api.md](docs/guia-api.md).

| Método | Ruta | Roles | Descripción |
| --- | --- | --- | --- |
| POST | `/auth/login` | público | Devuelve JWT + usuario |
| GET | `/auth/me` | todos | Usuario del token |
| GET/POST | `/users` · PATCH `/users/:id` | admin | Usuarios (paginado, filtro por rol/estado, orden) |
| GET | `/tables` · `/tables/:id` | todos | Plano del salón (filtro por estado/zona) |
| POST/PATCH | `/tables` · `/tables/:id` | admin | Crear/editar mesas |
| GET | `/menu/categories` | todos | Categorías con conteo de productos |
| GET | `/menu/products` | todos | Carta paginada (`search`, `categoryId`, `active`, `sort`, `order`) |
| POST/PATCH | `/menu/products` · `/menu/products/:id` | admin | Productos con modificadores |
| POST | `/orders` | mozo, admin | Abre pedido en mesa libre |
| GET | `/orders` · `/orders/:id` | mozo, caja, admin | Listado filtrable · detalle con totales |
| POST | `/orders/:id/items` | mozo, admin | Agrega ítem (queda en *borrador*) |
| DELETE | `/orders/:id/items/:itemId` | mozo, admin | Quita ítem en borrador |
| POST | `/orders/:id/send` | mozo, admin | Envía borradores a cocina como comanda |
| POST | `/orders/:id/request-bill` | mozo, caja, admin | Mesa → `por_cobrar` |
| POST | `/orders/:id/split` | mozo, caja, admin | Vista previa de división + propina |
| POST | `/orders/:id/close` | caja, admin | Cobra (1..n pagos), cierra y libera mesa |
| POST | `/orders/:id/cancel` | mozo, admin | Anula pedido (con comandas: solo admin) |
| GET | `/kitchen/tickets` | cocina, mozo, admin | Tablero KDS (`status=pendiente,preparando,listo`) |
| POST | `/kitchen/tickets/:id/advance` | cocina, mozo, admin | Avanza estado (regla por rol) |
| GET | `/reports/dashboard` | caja, admin | KPIs del día |
| GET | `/reports/sales-by-product` · `/reports/sales-by-waiter` | caja, admin | Ventas por plato / por mozo (`from`, `to`) |
| GET | `/health` | público | Estado de la API y de la base |

Errores: siempre `application/problem+json`, por ejemplo:

```json
{
  "type": "https://httpstatuses.io/422",
  "title": "Regla de negocio incumplida",
  "status": 422,
  "detail": "Los pagos (S/ 100.00) no cuadran con el total a cobrar (S/ 139.70)",
  "instance": "/api/orders/7/close",
  "code": "BUSINESS_RULE",
  "traceId": "4f1c…",
  "extra": { "expectedCents": 13970, "receivedCents": 10000 }
}
```

---

## Eventos de Socket.IO

Conexión: `io(URL, { path: '/socket.io', auth: { token } })`. Sin token válido el servidor rechaza el **handshake** (`connect_error` con `data.code = "UNAUTHORIZED"`).

Cada socket entra a salas según su rol: `admin` → todas · `mozo` → `floor` · `cocina` → `kitchen` · `caja` → `cashier` + `floor`, además de `user:<id>`.

**Servidor → cliente**

| Evento | Salas | Payload | Cuándo |
| --- | --- | --- | --- |
| `session:ready` | el propio socket | `{ user, rooms }` | Al conectar |
| `table:updated` | floor, cashier | Mesa | Se abre, pide cuenta, cobra o anula |
| `ticket:created` | kitchen, floor | Comanda con ítems | El mozo envía a cocina |
| `ticket:updated` | kitchen, floor | Comanda | Cambia de estado |
| `ticket:ready` | `user:<mozo>` | `{ ticketId, tableNumber }` | Comanda lista: aviso **solo** al mozo de la mesa |
| `order:updated` | floor, cashier | `{ orderId, tableId }` | Cambian ítems/estado del pedido |
| `order:closed` | floor, cashier | `{ orderId, tableId, totalCents }` | Se cobra la mesa |

**Cliente → servidor** (responden por *ack* con `{ ok: true, data }` o `{ ok: false, error: { code, message } }`)

| Evento | Roles | Payload | Respuesta |
| --- | --- | --- | --- |
| `ticket:advance` | cocina, mozo*, admin | `{ ticketId }` | Comanda actualizada (*mozo solo `listo → entregado`) |
| `kitchen:board` | cocina, mozo, admin | — | Comandas activas |
| `tables:sync` | todos | — | Plano actual (útil tras reconectar) |

---

## Pruebas

```bash
cd backend  && npm test     # unitarias + integración HTTP + eventos Socket.IO (sin Docker)
cd frontend && npm test     # utilidades y componentes (Vitest + Testing Library)
```

| Suite | Qué cubre |
| --- | --- |
| `backend/tests/unit` | Dinero (reparto sin perder céntimos), totales e IGV, propina, división de cuenta (iguales, por ítems, ítems compartidos), máquina de estados del KDS y de mesas |
| `backend/tests/integration` | Login, 401/403 por rol, validación 400, paginación/filtros/orden, flujo completo abrir → pedir → cocina → cobrar → reportes, reglas de negocio (422) |
| `backend/tests/socket` | Handshake con/sin JWT, salas por rol, `ticket:created/updated/ready`, `order:closed`, acks con errores de permiso y validación |
| `frontend/src/**/*.test.ts(x)` | Cálculo de cuenta en caja, formato de dinero, cliente API (token, 401, Problem Details), DataTable, rutas protegidas, validación de formularios |

Las pruebas de backend levantan el servidor real en un **puerto efímero** con PostgreSQL emulado (**pg-mem**) y se conectan con **socket.io-client**: no requieren Docker ni base de datos instalada.

---

## Estructura de carpetas

```
sistema-restaurante/
├── backend/
│   ├── src/
│   │   ├── domain/            # Reglas puras: dinero, facturación, KDS, mesas, errores (sin dependencias)
│   │   ├── application/       # Casos de uso (services), DTOs zod, puertos (interfaces), paginación
│   │   ├── infrastructure/    # PostgreSQL (migraciones, seed, repositorios), bcrypt, JWT, publisher Socket.IO, logger
│   │   ├── api/
│   │   │   ├── http/          # Express: rutas, middlewares (auth, errores), OpenAPI
│   │   │   └── socket/        # Servidor Socket.IO: auth en handshake, salas, eventos con ack
│   │   ├── container.ts       # Raíz de composición (inyección de dependencias)
│   │   ├── bootstrap.ts       # Arma y levanta HTTP + WS (usado por server.ts y por las pruebas)
│   │   └── server.ts          # Entrada de producción
│   ├── tests/                 # unit / integration / socket + helpers (pg-mem)
│   ├── scripts/dev-memory.ts  # API demo en memoria, sin PostgreSQL
│   └── Dockerfile             # Multi-stage, usuario no root
├── frontend/
│   ├── src/
│   │   ├── pages/             # Login, Dashboard, Salón, Pedido (mozo), Cocina (KDS), Caja, Reportes, Carta, Usuarios
│   │   ├── components/        # Layout con sidebar, DataTable, Modal, estados de carga/vacío/error, toasts
│   │   ├── context/           # Auth (JWT), Socket (una conexión compartida), Tema (oscuro/claro)
│   │   └── lib/               # Cliente API, cálculo de cuenta, formatos, acceso por rol
│   ├── nginx.conf             # SPA + proxy /api y /socket.io (WebSocket)
│   └── Dockerfile             # Build con Node + nginx sin privilegios
├── docs/                      # Arquitectura, modelo de datos, guía de API, ADRs
├── docker-compose.yml         # db + backend + frontend
└── .github/workflows/ci.yml   # CI: backend y frontend (lint, pruebas, build)
```

---

## Variables de entorno

| Variable | Por defecto | Descripción |
| --- | --- | --- |
| `PORT` | `3000` | Puerto de la API |
| `DATABASE_URL` | `postgres://restaurante:restaurante@localhost:5432/restaurante` | Conexión PostgreSQL |
| `JWT_SECRET` | — (obligatoria, ≥ 32 caracteres) | Firma de tokens; la API no arranca sin ella |
| `JWT_EXPIRES_IN` | `8h` | Duración del token (un turno) |
| `BCRYPT_ROUNDS` | `12` | Costo de hash de contraseñas |
| `CORS_ORIGIN` | `http://localhost:5173` | Orígenes permitidos (coma) |
| `LOG_LEVEL` | `info` | `fatal`…`trace`, `silent` |
| `SEED_ON_START` | `false` (`true` en compose) | Carga datos demo si la base está vacía |
| `POSTGRES_DB/USER/PASSWORD` | `restaurante` | Solo para docker-compose |
| `VITE_API_URL`, `VITE_SOCKET_URL` | vacío (rutas relativas) | Solo si el frontend se sirve en otro dominio |
| `VITE_PROXY_TARGET` | `http://localhost:3000` | Destino del proxy de Vite en desarrollo |

Ver [`.env.example`](.env.example).

---

## Qué aprenderás con este proyecto

1. **Arquitectura en capas real** (dominio → aplicación → infraestructura → API) con inyección de dependencias manual y puertos/adaptadores, sin frameworks mágicos.
2. **Tiempo real con Socket.IO bien hecho**: autenticación en el handshake, salas por rol y por usuario, *acks* con errores tipados y por qué publicar eventos **después del COMMIT**.
3. **Dinero sin errores de redondeo**: céntimos enteros y reparto por el método del resto mayor para que la suma de las partes siempre sea el total.
4. **Máquinas de estado** (comanda y mesa) como funciones puras fáciles de probar, con reglas por rol.
5. **Transacciones** para operaciones compuestas (cobrar = pagos + cerrar pedido + liberar mesa) e **índices parciales** como red de seguridad.
6. **API profesional**: validación con zod, Problem Details, paginación/filtros/orden con listas blancas, OpenAPI, logs con `X-Request-Id`.
7. **Probar sin Docker**: repositorios SQL contra PostgreSQL emulado (pg-mem) y pruebas de eventos con clientes socket reales en puertos efímeros.
8. **Frontend de producción**: rutas protegidas por rol, cliente HTTP con manejo de token, estados de carga/vacío/error, tablas reutilizables y modo oscuro.
9. **Entrega**: Docker multi-stage con usuario no root, nginx como proxy de WebSocket y CI en GitHub Actions.

---

## Roadmap

- [ ] Impresión de comanda/precuenta (ESC/POS) y comprobante electrónico (boleta/factura SUNAT).
- [ ] Rate limiting en `/auth/login` y *refresh tokens* con rotación.
- [ ] Re-validar la expiración del JWT en sockets ya conectados (hoy se valida en el handshake).
- [ ] Transferir/unir mesas y mover ítems entre cuentas.
- [ ] Control de stock por insumo (receta por plato) y "86" automático al agotarse.
- [ ] Estaciones de cocina (barra, parrilla, postres) con un KDS por estación.
- [ ] Reservas y lista de espera.
- [ ] Pruebas E2E con Playwright y métricas Prometheus.

---

## Licencia y autor

Distribuido bajo licencia **MIT**. Ver [LICENSE](LICENSE).

Desarrollado por **Angel Castañeda Meza** — Ingeniero de Sistemas · Lima, Perú
GitHub: [@angel-cm-dev](https://github.com/angel-cm-dev)
