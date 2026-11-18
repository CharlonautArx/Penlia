import * as SecureStore from 'expo-secure-store';
import {
  createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState,
} from 'react';

import { api, ApiError, errorMessage, type Session, type User } from './api';

const key = 'penlia.session.v1';
type ApiOptions = { method?: string; body?: Record<string, string> };

const SessionContext = createContext<{
  session: Session | null;
  loading: boolean;
  restoreError: string;
  restore: () => Promise<void>;
  authenticate: (register: boolean, fields: Record<string, string>) => Promise<void>;
  request: <T>(path: string, options?: ApiOptions) => Promise<T>;
  updateProfile: (name: string, bio: string) => Promise<void>;
  logout: () => Promise<void>;
} | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const activeToken = useRef<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [restoreError, setRestoreError] = useState('');

  const restore = useCallback(async () => {
    setLoading(true);
    setRestoreError('');
    try {
      const token = await SecureStore.getItemAsync(key);
      if (!token) return;
      const { user } = await api<{ user: User }>('/me', { token });
      activeToken.current = token;
      setSession({ token, user });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await SecureStore.deleteItemAsync(key).catch(() => {});
      } else {
        setRestoreError(errorMessage(error));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void restore(); }, [restore]);

  const authenticate = async (register: boolean, fields: Record<string, string>) => {
    const next = await api<Session>(register ? '/register' : '/login', { method: 'POST', body: fields });
    await SecureStore.setItemAsync(key, next.token);
    activeToken.current = next.token;
    setSession(next);
  };

  const request = useCallback(async <T,>(path: string, options?: ApiOptions) => {
    const token = session?.token;
    try {
      return await api<T>(path, { ...options, token });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401 && token && activeToken.current === token) {
        activeToken.current = undefined;
        // Queue secure-store removal before allowing a subsequent login.
        const removal = SecureStore.deleteItemAsync(key).catch(() => {});
        await removal;
        setSession((current) => current?.token === token ? null : current);
      }
      throw error;
    }
  }, [session?.token]);

  const updateProfile = async (name: string, bio: string) => {
    const { user } = await request<{ user: User }>('/me', { method: 'PATCH', body: { name, bio } });
    setSession((current) => current?.token === session?.token && current ? { ...current, user } : current);
  };

  const logout = async () => {
    await request('/logout', { method: 'POST' });
    await SecureStore.deleteItemAsync(key);
    activeToken.current = undefined;
    setSession(null);
  };

  return (
    <SessionContext.Provider value={{ session, loading, restoreError, restore, authenticate, request, updateProfile, logout }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) throw new Error('SessionProvider is required');
  return context;
}
