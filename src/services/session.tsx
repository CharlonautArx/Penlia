import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { AppState } from 'react-native';
import {
  createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState,
} from 'react';

import { demoUser } from '../demo/data';
import { isUiDemo } from '../demo/mode';
import { DemoProvider, useDemo } from '../demo/state';
import { api, ApiError, errorMessage, type Session, type User } from './api';

const key = 'penlia.session.v1';
type ApiOptions = { method?: string; body?: Record<string, unknown> };

const SessionContext = createContext<{
  session: Session | null;
  enterDemo?: () => void;
  completeDemoProfile?: (profile: { name: string; username: string; avatarKey: string; avatarPhoto?: string }) => Promise<void>;
  localAvatar?: string;
  avatarNotice: string;
  changeLocalAvatar: (photo: string | null) => Promise<void>;
  demoAvatarKey?: string;
  loading: boolean;
  restoreError: string;
  restore: () => Promise<void>;
  authenticate: (register: boolean, fields: Record<string, string>, avatarPhoto?: string) => Promise<void>;
  request: <T>(path: string, options?: ApiOptions) => Promise<T>;
  updateProfile: (name: string, bio: string) => Promise<void>;
  logout: () => Promise<void>;
} | null>(null);

const avatarKey = (account: string) => 'penlia.avatar-local.v1.' + account;

function useAccountAvatar(account?: string) {
  const [value, setValue] = useState<{ account: string; photo: string | null }>();
  const [avatarNotice, setAvatarNotice] = useState('');
  useEffect(() => {
    if (!account) return;
    let active = true;
    void AsyncStorage.getItem(avatarKey(account)).then((photo) => {
      if (active) setValue({ account, photo });
    }).catch(() => { if (active) setAvatarNotice('暂时无法读取本机头像。'); });
    return () => { active = false; };
  }, [account]);
  const persist = async (id: string, photo: string | null) => {
    if (photo) await AsyncStorage.setItem(avatarKey(id), photo);
    else await AsyncStorage.removeItem(avatarKey(id));
    setValue({ account: id, photo });
    setAvatarNotice('');
  };
  async function changeLocalAvatar(photo: string | null) {
    if (!account) throw new Error('请登录后再保存头像。');
    try { await persist(account, photo); }
    catch { throw new Error('资料头像未能保存到此设备，请重试。'); }
  }
  async function saveOnSignup(id: string, photo?: string) {
    if (!photo) return;
    try { await persist(id, photo); }
    catch { setAvatarNotice('账号已创建，头像未能保存。可以在个人资料中重试。'); }
  }
  return { localAvatar: value?.account === account ? value?.photo ?? undefined : undefined, avatarNotice, changeLocalAvatar, saveOnSignup };
}

export function SessionProvider({ children }: { children: ReactNode }) {
  return isUiDemo
    ? <DemoProvider><DemoSessionProvider>{children}</DemoSessionProvider></DemoProvider>
    : <RealSessionProvider>{children}</RealSessionProvider>;
}

function DemoSessionProvider({ children }: { children: ReactNode }) {
  const demo = useDemo();
  if (!demo) throw new Error('DemoProvider is required');

  const [session, setSession] = useState<Session | null>(null);
  const [demoAvatarKey, setDemoAvatarKey] = useState<string>();
  const avatar = useAccountAvatar(session?.user.id);
  const enterDemo = () => {
    setDemoAvatarKey(undefined);
    setSession({ user: demoUser, token: 'demo-only' });
  };
  async function completeDemoProfile({ avatarKey, avatarPhoto, ...profile }: {
    name: string; username: string; avatarKey: string; avatarPhoto?: string;
  }) {
    await avatar.saveOnSignup(demoUser.id, avatarPhoto);
    setDemoAvatarKey(avatarKey);
    setSession({ user: { ...demoUser, ...profile }, token: 'demo-only' });
  }
  const updateProfile = async (name: string, bio: string) => {
    setSession((current) => current && { ...current, user: { ...current.user, name, bio } });
  };

  return (
    <SessionContext.Provider value={{
      ...avatar, session, enterDemo, completeDemoProfile, demoAvatarKey, request: demo.request, updateProfile, loading: false, restoreError: '',
      restore: async () => {}, authenticate: async () => enterDemo(), logout: async () => setSession(null),
    }}>
      {children}
    </SessionContext.Provider>
  );
}

function RealSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const avatar = useAccountAvatar(session?.user.id);
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

  const authenticate = async (register: boolean, fields: Record<string, string>, avatarPhoto?: string) => {
    const next = await api<Session>(register ? '/register' : '/login', { method: 'POST', body: fields });
    await SecureStore.setItemAsync(key, next.token);
    if (register) await avatar.saveOnSignup(next.user.id, avatarPhoto);
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

  useEffect(() => {
    if (!session?.token) return;
    let pending = false;
    async function verify() {
      if (pending || AppState.currentState === 'background') return;
      pending = true;
      try { await request('/me'); } catch { /* Request handles session revocation. */ }
      finally { pending = false; }
    }
    const timer = setInterval(() => void verify(), 45_000);
    const lifecycle = AppState.addEventListener('change', (status) => { if (status === 'active') void verify(); });
    return () => { clearInterval(timer); lifecycle.remove(); };
  }, [request, session?.token]);

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
    <SessionContext.Provider value={{ ...avatar, session, loading, restoreError, restore, authenticate, request, updateProfile, logout }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) throw new Error('SessionProvider is required');
  return context;
}

export function useAccountPhoto(userId?: string) {
  const state = useContext(SessionContext);
  return userId && state?.session?.user.id === userId ? state.localAvatar : undefined;
}
