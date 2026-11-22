import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, type ReactNode, useCallback, useContext, useRef } from 'react';

import { useLocalDocument } from '../features/local/document';
import type { ImageItem, LocationItem, PendingMessage } from '../features/media/messages';
import type { TextMessage } from '../services/im';
import { offlineRequest } from './life';
import { seed, type Rows } from './life-fixtures';
import { demoMessages, demoPeople, demoRelationship, demoRelationships, demoUnread } from './data';

const DemoContext = createContext<{
  loading: boolean;
  storageError: string;
  retryStorage: () => void;
  messages: Record<string, TextMessage[]>;
  mediaError: string;
  retryMedia: () => void;
  media: Record<string, (ImageItem | LocationItem)[]>;
  addMedia: (peerId: string, item: Exclude<PendingMessage, { kind: 'text' | 'video' }>, mine?: boolean) => void;
  unread: Record<string, number>;
  markRead: (peerId: string) => void;
  send: (peerId: string, text: string) => void;
  receive: (peerId: string, text: string) => void;
  request: <T>(path: string, options?: { method?: string; body?: Record<string, unknown> }) => Promise<T>;
} | null>(null);

export function DemoProvider({ children }: { children: ReactNode }) {
  const mediaKey = 'penlia.demo-media.v1';
  const media = useLocalDocument<Record<string, (ImageItem | LocationItem)[]>>(mediaKey, async () => {
    const value = await AsyncStorage.getItem(mediaKey);
    return value ? JSON.parse(value) : {};
  });
  const key = 'penlia.demo.preview.v1';
  const stored = useLocalDocument(key, async () => {
    const existing = await AsyncStorage.getItem(key);
    const initial = { rows: seed() as Rows, messages: demoMessages, unread: demoUnread as Record<string, number>, relationships: demoRelationships };
    return existing ? { ...initial, ...JSON.parse(existing) } as typeof initial : initial;
  });
  const store = useRef(stored);
  store.current = stored;
  const relationships = useRef(demoRelationships);
  relationships.current = stored.value?.relationships ?? demoRelationships;
  const persistRelationships = (next: typeof demoRelationships) => {
    relationships.current = next;
    store.current.update((previous) => ({ ...previous, relationships: next }));
  };
  const setUnread = (change: (previous: Record<string, number>) => Record<string, number>) =>
    store.current.update((previous) => ({ ...previous, unread: change(previous.unread) }));
  const messageSequence = useRef(0);
  const messageSession = useRef(Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8));

  const markRead = useCallback((peerId: string) => {
    setUnread((current) => current[peerId] ? { ...current, [peerId]: 0 } : current);
  }, []);

  const addMessage = useCallback((peerId: string, text: string, mine: boolean) => {
    if (!relationships.current.some((friend) => friend.userId === peerId && friend.status === 'accepted')) return;
    const message = { id: 'simulated-' + messageSession.current + '-' + ++messageSequence.current, mine, text, timestamp: Date.now() };
    store.current.update((current) => ({ ...current, messages: { ...current.messages,
      [peerId]: [...(current.messages[peerId] ?? []), message].slice(-150) } }));
    if (!mine) setUnread((current) => ({ ...current, [peerId]: (current[peerId] ?? 0) + 1 }));
  }, []);
  const send = useCallback((peerId: string, text: string) => addMessage(peerId, text, true), [addMessage]);
  const receive = useCallback((peerId: string, text: string) => addMessage(peerId, text, false), [addMessage]);

  function addMedia(peerId: string, item: Exclude<PendingMessage, { kind: 'text' | 'video' }>, mine = true) {
    if (!relationships.current.some((friend) => friend.userId === peerId && friend.status === 'accepted')) return;
    if (!media.value) throw new Error('正在读取本机附件，请稍后重试。');
    const message = { ...item, id: 'demo-media-' + messageSession.current + '-' + ++messageSequence.current, timestamp: Date.now(), mine };
    media.update((current) => ({ ...current, [peerId]: [...(current[peerId] ?? []), message].slice(-100) }));
    if (!mine) setUnread((current) => ({ ...current, [peerId]: (current[peerId] ?? 0) + 1 }));
  }

  const request = useCallback(async <T,>(path: string, { method = 'GET', body }: {
    method?: string;
    body?: Record<string, unknown>;
  } = {}) => {
    if (method === 'GET' && path === '/friends') return { relationships: relationships.current } as T;
    if (method === 'GET' && path.startsWith('/people?username=')) {
      const username = decodeURIComponent(path.slice('/people?username='.length)).toLowerCase();
      return { person: demoPeople.find((person) => person.username === username) ?? null } as T;
    }
    if (method === 'POST' && path === '/friends') {
      const person = demoPeople.find((item) => item.id === body?.userId);
      if (person && !relationships.current.some((friend) => friend.userId === person.id)) {
        persistRelationships([...relationships.current, demoRelationship(person, 'pending', true)]);
      }
      return {} as T;
    }
    if (method === 'POST' && path === '/friends/accept') {
      persistRelationships(relationships.current.map((friend) => friend.id === body?.id && !friend.outgoing
        ? { ...friend, status: 'accepted', chatReady: true } : friend));
      return {} as T;
    }
    if (method === 'POST' && path === '/friends/decline') {
      persistRelationships(relationships.current.filter((friend) => friend.id !== body?.id || friend.outgoing));
      return {} as T;
    }
    if (method === 'POST' && ['/friends/remove', '/friends/block', '/friends/restrict'].includes(path)) {
      const person = demoPeople.find((entry) => entry.id === body?.userId);
      if (!person) throw new Error('这位本机好友已经不可用。');
      if (path !== '/friends/restrict') persistRelationships(relationships.current.filter((entry) => entry.userId !== person.id));
      if (path !== '/friends/remove') store.current.update((current) => {
        const name = path === '/friends/block' ? 'blocks' : 'restrictions';
        return { ...current, rows: { ...current.rows, [name]: [person, ...current.rows[name].filter((entry) => entry.id !== person.id)] } };
      });
      return {} as T;
    }
    const current = store.current.getLatest();
    if (!current) throw new Error('正在读取本机预览数据，请稍后重试。');
    const draft = { ...current.rows };
    const result = offlineRequest(draft, path, method, body ?? {});
    if (Object.keys(draft).some((key) => draft[key] !== current.rows[key])) {
      store.current.update((value) => ({ ...value, rows: draft }));
    }
    return result as T;
  }, []);

  return <DemoContext.Provider value={{ loading: stored.loading, storageError: stored.error, retryStorage: stored.retry, messages: stored.value?.messages ?? demoMessages, media: media.value ?? {}, mediaError: media.error, retryMedia: media.retry, addMedia, unread: stored.value?.unread ?? demoUnread, markRead, send, receive, request }}>{children}</DemoContext.Provider>;
}

export function useDemo() {
  return useContext(DemoContext);
}
