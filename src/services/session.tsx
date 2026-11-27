import AsyncStorage from '@react-native-async-storage/async-storage';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { nativePhotoUri } from '../features/space/media';
import * as SecureStore from 'expo-secure-store';
import { AppState } from 'react-native';
import {
  createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState,
} from 'react';

import { useLocalDocument } from '../features/local/document';
import { demoPeople, demoUser } from '../demo/data';
import { isDesignPilot } from '../features/design-pilot/model';
import { isUiDemo } from '../demo/mode';
import { DemoProvider, useDemo } from '../demo/state';
import { handlePattern, normalizeHandle, nextHandleChange, presentLocalIdentity, type ProfilePatch } from './profile-model';
import { api, ApiError, errorMessage, type Session, type User } from './api';

const key = 'penlia.session.v1';
type ApiOptions = { method?: string; body?: Record<string, unknown> };

const SessionContext = createContext<{
  session: Session | null;
  enterDemo?: () => void;
  completeDemoProfile?: (profile: { name: string; username: string; avatarKey: string; avatarPhoto?: string }) => Promise<void>;
  localAvatar?: string;
  avatarNotice: string;
  changeLocalAvatar: (photo: string | null, jpeg?: string) => Promise<void>;
  demoAvatarKey?: string;
  loading: boolean;
  restoreError: string;
  restore: () => Promise<void>;
  authenticate: (register: boolean, fields: Record<string, string>, avatarPhoto?: string) => Promise<void>;
  request: <T>(path: string, options?: ApiOptions) => Promise<T>;
  saveProfile: (patch: ProfilePatch) => Promise<void>;
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

  const key = 'penlia.demo.session.v1';
  const profileDoc = useLocalDocument<{ user: User; avatarKey?: string; active: boolean }>(key, async () => {
    const record = await AsyncStorage.getItem(key);
    return record ? JSON.parse(record) : { user: demoUser, active: isDesignPilot };
  });
  const profile = profileDoc.value;
  const session = profile?.active && !demo.loading ? { user: profile.user, token: 'demo-only' } : null;
  const avatar = useAccountAvatar(session?.user.id);
  const enterDemo = () => {
    profileDoc.update((stored) => ({ ...stored, active: true }));
  };
  async function completeDemoProfile({ avatarKey, avatarPhoto, ...profile }: {
    name: string; username: string; avatarKey: string; avatarPhoto?: string;
  }) {
    await avatar.saveOnSignup(demoUser.id, avatarPhoto);
    profileDoc.update(() => ({ user: { ...demoUser, ...profile }, avatarKey, active: true }));
  }
  const saveProfile = useCallback(async (patch: ProfilePatch) => {
    await profileDoc.save((stored) => {
      const { username, name, bio, region, importRegion } = patch;
      const user = { ...stored.user };
      if (name !== undefined) user.name = name.trim();
      if (bio !== undefined) user.bio = bio.trim();
      if (region !== undefined && (!importRegion || user.region == null)) user.region = region.trim();
      if (username !== undefined && normalizeHandle(username) !== user.username) {
        const handle = normalizeHandle(username);
        if (!handlePattern.test(handle)) throw new Error('朋聊号须为 3–24 位字母、数字或下划线。');
        if (user.nextHandleChangeAt && Date.parse(user.nextHandleChangeAt) > Date.now())
          throw new Error('上次修改满一年后才能更换朋聊号。');
        if (demoPeople.some((person) => person.username === handle)) throw new Error('该朋聊号已被使用。');
        user.username = handle;
        user.nextHandleChangeAt = nextHandleChange(new Date());
      }
      return { ...stored, user };
    });
  }, [profileDoc.save]);
  const current = useRef(profile?.user);
  current.current = profile?.user;
  const demoRequest = demo.request;
  const request = useCallback(async <T,>(path: string, options?: ApiOptions) => {
    const result = await demoRequest<T>(path, options);
    const user = current.current;
    return user && (!options?.method || options.method === 'GET')
      && !/^\/(p1\/(boundary|reports|reviews|appeals)|chat-records)(?:\W|$)/.test(path)
      ? presentLocalIdentity(result, user) : result;
  }, [demoRequest]);

  return (
    <SessionContext.Provider value={{
      ...avatar, session, enterDemo, completeDemoProfile, demoAvatarKey: profile?.avatarKey ?? demoUser.username, request, saveProfile, loading: profileDoc.loading || demo.loading, restoreError: profileDoc.error || demo.storageError,
      restore: async () => { profileDoc.retry(); demo.retryStorage(); }, authenticate: async () => enterDemo(), logout: async () => profileDoc.update((value) => ({ ...value, active: false })),
    }}>
      {children}
    </SessionContext.Provider>
  );
}

function RealSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const avatar = useAccountAvatar(session?.user.id);
  const activeToken = useRef<string | undefined>(undefined);
  const version = useRef(0);
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
      const reading = version.current;
      const token = session?.token;
      try {
        const { user } = await request<{ user: User }>('/me');
        if (reading === version.current && token === activeToken.current)
          setSession((value) => value && JSON.stringify(value.user) !== JSON.stringify(user) ? { ...value, user } : value);
      } catch { /* Request handles session revocation. */ }
      finally { pending = false; }
    }
    const timer = setInterval(() => void verify(), 45_000);
    const lifecycle = AppState.addEventListener('change', (status) => { if (status === 'active') void verify(); });
    return () => { clearInterval(timer); lifecycle.remove(); };
  }, [request, session?.token]);

  const saveProfile = useCallback(async (patch: ProfilePatch) => {
    const token = session?.token;
    version.current++;
    const { user } = await request<{ user: User }>('/me', { method: 'PATCH', body: patch });
    version.current++;
    setSession((current) => current?.token === token && token === activeToken.current && current ? { ...current, user } : current);
  }, [request, session?.token]);

  const imported = useRef<string | undefined>(undefined);
  useEffect(() => {
    const id = session?.user.id;
    const photo = avatar.localAvatar;
    if (!id || !photo || session.user.avatarUpdatedAt || imported.current === id + ':' + photo) return;
    imported.current = id + ':' + photo;
    void encodeLegacyAvatar(photo).then((jpeg) => {
      if (jpeg && activeToken.current === session.token) return saveProfile({ avatar: jpeg, importAvatar: true });
    }).catch(() => { /* The existing local portrait remains available for this device. */ });
  }, [avatar.localAvatar, saveProfile, session]);

  async function changeLocalAvatar(photo: string | null, jpeg?: string) {
    const encoded = photo && (jpeg ?? await encodeLegacyAvatar(photo));
    if (photo && !encoded) throw new Error('暂时无法读取头像。');
    await saveProfile({ avatar: encoded || null });
    await avatar.changeLocalAvatar(photo).catch(() => {});
  }

  const logout = async () => {
    await request('/logout', { method: 'POST' });
    await SecureStore.deleteItemAsync(key);
    activeToken.current = undefined;
    setSession(null);
  };

  return (
    <SessionContext.Provider value={{ ...avatar, session, loading, restoreError, restore, authenticate, request, saveProfile, changeLocalAvatar, logout }}>
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
  return userId && state?.session?.user.id === userId
    && (isUiDemo || !state.session.user.avatarUpdatedAt) ? state.localAvatar : undefined;
}

export function useAccountIdentity() {
  return useContext(SessionContext)?.session?.user;
}

export function useAccountDemoPortrait(userId?: string) {
  const context = useContext(SessionContext);
  return isUiDemo && userId && context?.session?.user.id === userId ? context.demoAvatarKey : undefined;
}

async function encodeLegacyAvatar(photo: string) {
  const uri = nativePhotoUri(photo);
  if (!uri) return;
  const context = ImageManipulator.manipulate(uri);
  try {
    context.resize({ width: 224 });
    const image = await context.renderAsync();
    try {
      for (const compress of [0.74, 0.57, 0.42]) {
        const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress, base64: true });
        if (saved.base64 && saved.base64.length <= Math.floor(32768 / 3) * 4) return saved.base64;
      }
    } finally { image.release(); }
  } finally { context.release(); }
}
