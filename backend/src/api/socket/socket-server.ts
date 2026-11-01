import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import { z } from 'zod';
import type { Container } from '../../container';
import { DomainError, ForbiddenError } from '../../domain/errors';
import type { AuthPayload } from '../../application/ports';
import { ROOMS, roomsForRole } from '../../infrastructure/realtime/socket-event-publisher';

/** Respuesta estándar de los "acks" de Socket.IO: { ok: true, data } | { ok: false, error }. */
type Ack = (response: { ok: true; data: unknown } | { ok: false; error: { code: string; message: string } }) => void;

const advanceSchema = z.object({ ticketId: z.number().int().positive() });

interface SocketData {
  user: AuthPayload;
}

/**
 * Servidor Socket.IO.
 *
 * Seguridad: el JWT se valida en el HANDSHAKE (middleware `io.use`), antes de que el
 * socket pueda escuchar o emitir nada. Un cliente sin token válido nunca llega a conectarse.
 */
export function createSocketServer(httpServer: HttpServer, c: Container): Server {
  const io = new Server<Record<string, never>, Record<string, never>, Record<string, never>, SocketData>(httpServer, {
    path: '/socket.io',
    cors: { origin: c.config.CORS_ORIGIN.split(',').map((o) => o.trim()), credentials: true },
  });

  io.use((socket, next) => {
    const fromAuth = socket.handshake.auth?.token as string | undefined;
    const fromHeader = socket.handshake.headers.authorization?.replace(/^Bearer\s+/i, '');
    const token = fromAuth || fromHeader;
    if (!token) return next(Object.assign(new Error('No autorizado: falta el token'), { data: { code: 'UNAUTHORIZED' } }));
    try {
      socket.data.user = c.tokens.verify(token);
      next();
    } catch {
      next(Object.assign(new Error('No autorizado: token inválido'), { data: { code: 'UNAUTHORIZED' } }));
    }
  });

  io.on('connection', (socket: Socket) => {
    const user = (socket.data as SocketData).user;
    const rooms = [...roomsForRole(user.role), ROOMS.user(user.sub)];
    socket.join(rooms);
    c.logger.debug({ userId: user.sub, role: user.role, rooms }, 'socket conectado');
    socket.emit('session:ready', { user: { id: user.sub, name: user.name, role: user.role }, rooms });

    /** Envuelve un handler para responder siempre por ack y traducir errores de dominio. */
    const handle =
      (allowed: AuthPayload['role'][], fn: (payload: unknown) => Promise<unknown>) =>
      async (payload: unknown, ack?: Ack) => {
        const reply: Ack = typeof ack === 'function' ? ack : () => undefined;
        try {
          if (!allowed.includes(user.role)) throw new ForbiddenError(`El rol ${user.role} no puede realizar esta acción`);
          reply({ ok: true, data: await fn(payload) });
        } catch (error) {
          if (error instanceof DomainError) return reply({ ok: false, error: { code: error.code, message: error.message } });
          if (error instanceof z.ZodError) return reply({ ok: false, error: { code: 'VALIDATION', message: 'Payload inválido' } });
          c.logger.error({ err: error }, 'error en evento de socket');
          reply({ ok: false, error: { code: 'INTERNAL', message: 'Error inesperado' } });
        }
      };

    socket.on(
      'kitchen:board',
      handle(['admin', 'cocina', 'mozo'], () => c.services.kitchen.board(['pendiente', 'preparando', 'listo'])),
    );
    socket.on(
      'ticket:advance',
      handle(['admin', 'cocina', 'mozo'], (payload) =>
        c.services.kitchen.advance(advanceSchema.parse(payload).ticketId, { id: user.sub, name: user.name, role: user.role }),
      ),
    );
    socket.on(
      'tables:sync',
      handle(['admin', 'mozo', 'caja', 'cocina'], () => c.services.tables.list()),
    );
  });

  c.events.attach(io);
  return io;
}
