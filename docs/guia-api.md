# Guía de la API con ejemplos `curl`

Recorrido completo de una mesa usando solo la API. Contrato completo en Swagger: `http://localhost:3000/api/docs`.

> Convenciones
> - Base: `http://localhost:3000/api` (con docker-compose también vía `http://localhost:8080/api`).
> - Importes en **céntimos**: S/ 42.50 = `4250`.
> - Errores en formato **Problem Details** (`application/problem+json`) con `code`: `VALIDATION` (400), `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `CONFLICT` (409), `BUSINESS_RULE` (422).
> - Los ejemplos usan `jq` para extraer valores; en Windows puedes usar Git Bash o WSL.

```bash
API=http://localhost:3000/api
```

## 1. Iniciar sesión (un token por rol)

```bash
login() { curl -s -X POST $API/auth/login -H 'Content-Type: application/json' \
  -d "{\"email\":\"$1\",\"password\":\"Demo123!\"}" | jq -r .token; }

MOZO=$(login mozo@demo.pe)
COCINA=$(login cocina@demo.pe)
CAJA=$(login caja@demo.pe)
ADMIN=$(login admin@demo.pe)

curl -s $API/auth/me -H "Authorization: Bearer $MOZO"
# {"id":2,"name":"Mario Mozo","email":"mozo@demo.pe","role":"mozo","active":true,...}
```

## 2. Ver el salón y la carta

```bash
curl -s "$API/tables?status=libre" -H "Authorization: Bearer $MOZO" | jq '.[] | {id, number, seats, status}'

# Carta paginada, filtrada y ordenada (lista blanca de campos de orden: name, priceCents, category)
curl -s "$API/menu/products?search=ceviche&sort=priceCents&order=desc&page=1&pageSize=10" \
  -H "Authorization: Bearer $MOZO" | jq '{meta, data: [.data[] | {id, name, priceCents, modifiers}]}'
```

Respuesta paginada:

```json
{ "data": [ { "id": 4, "name": "Ceviche clásico", "priceCents": 3800, "modifiers": [ { "id": 6, "name": "Extra leche de tigre", "priceCents": 500 } ] } ],
  "meta": { "page": 1, "pageSize": 10, "total": 1, "totalPages": 1 } }
```

## 3. Abrir la mesa y tomar el pedido (mozo)

```bash
ORDER=$(curl -s -X POST $API/orders -H "Authorization: Bearer $MOZO" -H 'Content-Type: application/json' \
  -d '{"tableId":3,"guests":2}' | jq -r .id)

# Ceviche con "Extra leche de tigre" (modificador 6) y una nota para cocina
curl -s -X POST $API/orders/$ORDER/items -H "Authorization: Bearer $MOZO" -H 'Content-Type: application/json' \
  -d '{"productId":4,"quantity":1,"modifierIds":[6],"notes":"Sin ají"}' | jq '.totals'

# Dos lomos saltados
curl -s -X POST $API/orders/$ORDER/items -H "Authorization: Bearer $MOZO" -H 'Content-Type: application/json' \
  -d '{"productId":7,"quantity":2}' | jq '.items[] | {id, productName, status, lineTotalCents}'
```

Los ítems quedan en estado `borrador` hasta enviarlos. Un borrador se puede quitar:

```bash
curl -s -X DELETE $API/orders/$ORDER/items/<itemId> -H "Authorization: Bearer $MOZO"
```

## 4. Enviar la comanda a cocina

```bash
curl -s -X POST $API/orders/$ORDER/send -H "Authorization: Bearer $MOZO" | jq '.tickets'
```

En este momento el KDS recibe el evento `ticket:created` por Socket.IO.

## 5. Cocina avanza la comanda (KDS)

```bash
TICKET=$(curl -s "$API/kitchen/tickets" -H "Authorization: Bearer $COCINA" | jq -r ".[] | select(.orderId==$ORDER) | .id")

curl -s -X POST $API/kitchen/tickets/$TICKET/advance -H "Authorization: Bearer $COCINA" | jq '{status, startedAt}'  # preparando
curl -s -X POST $API/kitchen/tickets/$TICKET/advance -H "Authorization: Bearer $COCINA" | jq '{status, timings}'    # listo
curl -s -X POST $API/kitchen/tickets/$TICKET/advance -H "Authorization: Bearer $MOZO"   | jq '.status'              # entregado
```

Regla por rol: un mozo que intenta marcar "preparando" recibe `403 FORBIDDEN`; saltarse un estado da `422 BUSINESS_RULE`.

## 6. Pedir la cuenta y previsualizar la división (caja)

```bash
curl -s -X POST $API/orders/$ORDER/request-bill -H "Authorization: Bearer $MOZO" > /dev/null

# Partes iguales entre 3 con 10% de propina
curl -s -X POST $API/orders/$ORDER/split -H "Authorization: Bearer $CAJA" -H 'Content-Type: application/json' \
  -d '{"tip":{"type":"percent","value":10},"split":{"mode":"equal","parts":3}}' | jq

# Por consumo: cada quien paga lo suyo (un ítem en varias listas se reparte entre esas personas)
curl -s -X POST $API/orders/$ORDER/split -H "Authorization: Bearer $CAJA" -H 'Content-Type: application/json' \
  -d '{"tip":{"type":"percent","value":10},"split":{"mode":"items","assignments":[
        {"label":"Ana","itemIds":[<idCeviche>]},
        {"label":"Beto","itemIds":[<idLomo>]}]}}' | jq '.shares'
```

```json
[ { "label": "Ana",  "itemIds": [1], "subtotalCents": 4300, "tipCents": 430, "totalCents": 4730 },
  { "label": "Beto", "itemIds": [2], "subtotalCents": 8400, "tipCents": 840, "totalCents": 9240 } ]
```

## 7. Cobrar y liberar la mesa

```bash
curl -s -X POST $API/orders/$ORDER/close -H "Authorization: Bearer $CAJA" -H 'Content-Type: application/json' -d '{
  "tip": { "type": "percent", "value": 10 },
  "payments": [
    { "method": "tarjeta",   "amountCents": 4730, "payerLabel": "Ana"  },
    { "method": "yape_plin", "amountCents": 9240, "payerLabel": "Beto" }
  ]}' | jq '{status, tipCents, paidCents, totals}'
```

Si los pagos no suman exactamente el total:

```json
{ "status": 422, "code": "BUSINESS_RULE",
  "detail": "Los pagos (S/ 100.00) no cuadran con el total a cobrar (S/ 139.70)",
  "extra": { "expectedCents": 13970, "receivedCents": 10000 } }
```

## 8. Reportes

```bash
curl -s "$API/reports/dashboard" -H "Authorization: Bearer $ADMIN" | jq
curl -s "$API/reports/sales-by-product?from=2026-11-01T00:00:00Z&to=2026-11-30T23:59:59Z" -H "Authorization: Bearer $ADMIN" | jq '.data[:5]'
curl -s "$API/reports/sales-by-waiter" -H "Authorization: Bearer $CAJA" | jq '.data'
```

## 9. Administración

```bash
# Usuarios: paginado + filtro por rol + orden
curl -s "$API/users?role=mozo&sort=name&order=asc" -H "Authorization: Bearer $ADMIN" | jq

# Crear un usuario (contraseña: 8+ caracteres con letras y números)
curl -s -X POST $API/users -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' \
  -d '{"name":"Nuevo Mozo","email":"nuevo@demo.pe","password":"Clave1234","role":"mozo"}'

# Crear un producto con modificadores
curl -s -X POST $API/menu/products -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' \
  -d '{"categoryId":1,"name":"Tequeños","priceCents":1900,"modifiers":[{"name":"Guacamole","priceCents":400}]}'
```

## 10. Tiempo real desde la terminal (Node)

```js
// npm i socket.io-client  ·  node escuchar.mjs <token>
import { io } from 'socket.io-client';
const socket = io('http://localhost:3000', { path: '/socket.io', auth: { token: process.argv[2] } });
socket.on('session:ready', (s) => console.log('conectado en salas', s.rooms));
socket.on('connect_error', (e) => console.error('rechazado:', e.message));
socket.onAny((event, payload) => console.log(event, JSON.stringify(payload)));

// Avanzar una comanda por WebSocket (respuesta por ack)
// const res = await socket.emitWithAck('ticket:advance', { ticketId: 12 });
```
