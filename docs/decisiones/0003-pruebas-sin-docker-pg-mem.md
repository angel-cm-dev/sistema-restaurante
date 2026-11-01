# ADR 0003 · Pruebas de integración sin Docker con pg-mem

- **Estado:** aceptada
- **Fecha:** 2026-11

## Contexto

Producción usa PostgreSQL vía docker-compose, pero las pruebas deben ejecutarse en cualquier máquina (y en CI) **sin Docker** ni una base instalada. Queremos además probar el SQL real de los repositorios, no solo la lógica.

## Opciones consideradas

| Opción | Problema |
| --- | --- |
| Repositorios "en memoria" escritos a mano | No prueban el SQL; duplican la lógica de consulta |
| SQLite en memoria | Otro dialecto (sin `TIMESTAMPTZ`, `JSONB`, índices parciales, `ILIKE`…): habría que mantener dos SQL |
| Testcontainers | Requiere Docker |
| **pg-mem** | Emulador de PostgreSQL en memoria con adaptador compatible con `pg.Pool` |

## Decisión

Usar **pg-mem**. La capa de datos depende de una interfaz mínima `Queryable`/`Database` que cumplen tanto `pg.Pool` como el Pool de pg-mem. Las pruebas levantan el servidor completo (`startServer`) con una base pg-mem nueva por archivo, en un puerto efímero (`0`), y se conectan con supertest y socket.io-client.

## Consecuencias

- ✅ Los mismos repositorios y migraciones se ejecutan en pruebas y en producción.
- ✅ Pruebas rápidas (~10 s) y aisladas; CI no necesita servicios.
- ✅ Bonus: `npm run dev:memory` levanta una demo completa sin instalar PostgreSQL.
- ⚠️ pg-mem no es PostgreSQL. Limitaciones encontradas y cómo se resolvieron:
  - No soporta `= ANY($1::int[])` con parámetros → se usa `IN ($1, $2, …)` generado con `inPlaceholders()` (SQL estándar, válido en ambos).
  - Con un JOIN, puede elegir el índice **parcial** `ux_orders_open_table` y omitir filas cerradas → se añadió el índice completo `ix_orders_table` (útil también en PostgreSQL real para el historial por mesa).
  - `ROLLBACK` no revierte de forma fiable → los servicios validan las reglas **antes** de escribir, así una regla incumplida nunca deja escrituras parciales en ninguna de las dos bases.
  - Ciertos `GROUP BY` con columnas homónimas en tablas unidas dan resultados incorrectos → los totales por pedido se calculan en una consulta agregada aparte.
- ⚠️ Para validar comportamiento específico de PostgreSQL (concurrencia real, planes de consulta) conviene añadir en el futuro una suite opcional con Testcontainers.
