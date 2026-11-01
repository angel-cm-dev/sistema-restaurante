# ADR 0001 · Arquitectura en capas con inyección de dependencias manual

- **Estado:** aceptada
- **Fecha:** 2026-11

## Contexto

El sistema combina dos canales de entrada (HTTP y Socket.IO) que ejecutan las mismas operaciones (por ejemplo, avanzar una comanda). Además, las pruebas deben correr sin Docker, lo que exige poder cambiar la base de datos sin tocar la lógica.

## Decisión

Separar el backend en cuatro capas: **dominio** (reglas puras), **aplicación** (servicios + puertos), **infraestructura** (adaptadores) y **API** (HTTP y WebSocket). Las dependencias apuntan hacia adentro y los servicios solo conocen interfaces (`UnitOfWork`, `EventPublisher`, `PasswordHasher`, `TokenService`).

La composición se hace a mano en `container.ts` en lugar de usar un contenedor de DI con decoradores.

## Consecuencias

- ✅ HTTP y Socket.IO reutilizan `KitchenService.advance()` y comparten las mismas reglas y errores.
- ✅ Las reglas críticas (facturación, KDS) se prueban como funciones puras, sin mocks.
- ✅ Cambiar PostgreSQL por pg-mem en pruebas es pasar otra `Database` a `startServer()`.
- ✅ La DI manual es legible para cualquiera: no hay "magia" ni metadatos de reflexión.
- ⚠️ Más archivos que un enfoque "todo en el controlador"; se acepta por ser un proyecto didáctico y mantenible.
- ⚠️ Si el número de servicios creciera mucho, un contenedor de DI podría reducir el cableado.
