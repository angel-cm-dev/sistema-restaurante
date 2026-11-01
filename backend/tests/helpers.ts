/**
 * Utilidades de prueba: levantan el sistema COMPLETO (HTTP + Socket.IO) sobre una
 * base PostgreSQL emulada en memoria (pg-mem) y en un puerto efímero. Sin Docker.
 */
import { newDb } from 'pg-mem';
import request from 'supertest';
import { io as ioClient, type Socket } from 'socket.io-client';
import { startServer, type RunningServer } from '../src/bootstrap';
import { loadConfig } from '../src/config';
import { PgDatabase, type Database, type PoolLike } from '../src/infrastructure/db/database';
import { DEMO_PASSWORD } from '../src/infrastructure/db/seed';
import { createLogger } from '../src/infrastructure/logger';

export function createMemoryDatabase(): Database {
  const mem = newDb();
  const { Pool } = mem.adapters.createPg();
  return new PgDatabase(new Pool() as unknown as PoolLike);
}

export const testConfig = loadConfig({
  NODE_ENV: 'test',
  PORT: '0',
  JWT_SECRET: 'clave-de-pruebas-solo-para-tests-0123456789',
  BCRYPT_ROUNDS: '4',
  LOG_LEVEL: 'silent',
  CORS_ORIGIN: 'http://localhost:5173',
});

export async function startTestServer(): Promise<RunningServer & { url: string }> {
  const server = await startServer({
    config: testConfig,
    logger: createLogger('silent'),
    db: createMemoryDatabase(),
    port: 0,
    seed: true,
  });
  return { ...server, url: `http://127.0.0.1:${server.port}` };
}

export async function loginAs(url: string, email: string): Promise<string> {
  const res = await request(url).post('/api/auth/login').send({ email, password: DEMO_PASSWORD });
  if (res.status !== 200) throw new Error(`login falló para ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.token as string;
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

export function connectSocket(url: string, token?: string): Socket {
  return ioClient(url, {
    path: '/socket.io',
    auth: token ? { token } : {},
    transports: ['websocket'],
    reconnection: false,
    forceNew: true,
  });
}

/** Espera un evento con timeout, para que una prueba rota falle rápido y con mensaje claro. */
export function waitFor<T = unknown>(socket: Socket, event: string, timeoutMs = 3000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout esperando "${event}"`)), timeoutMs);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

export function emitWithAck<T = unknown>(socket: Socket, event: string, payload?: unknown): Promise<T> {
  return socket.timeout(3000).emitWithAck(event, payload) as Promise<T>;
}
