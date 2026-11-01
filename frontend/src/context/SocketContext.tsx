import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';

interface SocketState {
  socket: Socket | null;
  connected: boolean;
}

const SocketContext = createContext<SocketState>({ socket: null, connected: false });

const SOCKET_URL = (import.meta.env.VITE_SOCKET_URL as string | undefined) ?? undefined;

/**
 * Una sola conexión Socket.IO por sesión, compartida por todas las pantallas.
 * El token viaja en el handshake (`auth.token`); el servidor lo valida antes de aceptar.
 */
export function SocketProvider({ children }: { children: ReactNode }) {
  const { token, logout } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!token) return;
    const s = io(SOCKET_URL, { path: '/socket.io', auth: { token }, transports: ['websocket', 'polling'] });
    s.on('connect', () => setConnected(true));
    s.on('disconnect', () => setConnected(false));
    s.on('connect_error', (err: Error & { data?: { code?: string } }) => {
      setConnected(false);
      if (err.data?.code === 'UNAUTHORIZED') logout();
    });
    setSocket(s);
    return () => {
      s.disconnect();
      setSocket(null);
      setConnected(false);
    };
  }, [token, logout]);

  return <SocketContext.Provider value={{ socket, connected }}>{children}</SocketContext.Provider>;
}

export const useSocket = () => useContext(SocketContext);

/** Suscribe un handler a un evento del servidor mientras el componente esté montado. */
export function useSocketEvent<T>(event: string, handler: (payload: T) => void) {
  const { socket } = useSocket();
  // Guardamos el handler en una ref para no re-suscribirnos en cada render.
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!socket) return;
    const listener = (payload: T) => ref.current(payload);
    socket.on(event, listener);
    return () => {
      socket.off(event, listener);
    };
  }, [socket, event]);
}
