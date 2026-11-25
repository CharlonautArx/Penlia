import { getRandomBytes } from 'expo-crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, type ReactNode, useCallback, useContext, useRef } from 'react';

import { useLocalDocument } from '../features/local/document';
import type { FileItem, ImageItem, LocationItem, PendingMessage, VideoItem } from '../features/media/messages';
import type { TextMessage } from '../services/im';
import type { FriendCode, PublicIntro } from '../features/friends/invitations';
import { offlineRequest } from './life';
import { seed, type Rows } from './life-fixtures';
import { demoMessages, demoPeople, demoRelationship, demoRelationships, demoUnread } from './data';

type MessageOptions = Pick<TextMessage, 'silent' | 'noReply' | 'sticker' | 'quote' | 'recordId'>;

const demoInvitation = 'penlia:add:ba43afd7c9ee723da034ef7340ab1c98';

const DemoContext = createContext<{
  loading: boolean;
  storageError: string;
  retryStorage: () => void;
  messages: Record<string, TextMessage[]>;
  mediaError: string;
  retryMedia: () => void;
  media: Record<string, (FileItem | ImageItem | LocationItem | VideoItem)[]>;
  addMedia: (peerId: string, item: Exclude<PendingMessage, { kind: 'text' }>, mine?: boolean) => void;
  unread: Record<string, number>;
  markRead: (peerId: string) => void;
  send: (peerId: string, text: string, options?: MessageOptions) => void;
  receive: (peerId: string, text: string) => void;
  request: <T>(path: string, options?: { method?: string; body?: Record<string, unknown> }) => Promise<T>;
} | null>(null);

export function DemoProvider({ children }: { children: ReactNode }) {
  const mediaKey = 'penlia.demo-media.v1';
  const media = useLocalDocument<Record<string, (FileItem | ImageItem | LocationItem | VideoItem)[]>>(mediaKey, async () => {
    const value = await AsyncStorage.getItem(mediaKey);
    const data = value ? JSON.parse(value) as Record<string, (FileItem | ImageItem | LocationItem | VideoItem)[]> : {};
    const sampleText = '周末见。集合地点在街角书店门口。';
    const sample: FileItem = { id: 'demo-xiaoman-note', kind: 'file', name: '周末行程.txt', bytes: 48,
      timestamp: (demoMessages['demo-xiaoman']?.[0]?.timestamp ?? Date.now()) - 60000, mine: false, sampleText };
    return { ...data, 'demo-xiaoman': [sample, ...(data['demo-xiaoman'] ?? []).filter((item) => item.id !== sample.id)] };
  });
  const key = 'penlia.demo.preview.v1';
  const stored = useLocalDocument(key, async () => {
    const existing = await AsyncStorage.getItem(key);
    const initial = { rows: seed() as Rows, messages: demoMessages, unread: demoUnread as Record<string, number>, relationships: demoRelationships,
      declines: [] as typeof demoRelationships, friendCode: null as FriendCode | null,
      publicIntro: { enabled: false, region: '' } as PublicIntro };
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

  const addMessage = useCallback((peerId: string, text: string, mine: boolean, options?: MessageOptions) => {
    if (!relationships.current.some((friend) => friend.userId === peerId && friend.status === 'accepted')) return;
    const message: TextMessage = { id: 'simulated-' + messageSession.current + '-' + ++messageSequence.current, mine, text, timestamp: Date.now(),
      sticker: options?.sticker, quote: options?.quote, recordId: options?.recordId,
      ...(options?.silent ? { silent: true } : {}), ...(options?.noReply ? { noReply: true } : {}) };
    store.current.update((current) => ({ ...current, messages: { ...current.messages,
      [peerId]: [...(current.messages[peerId] ?? []), message].slice(-150) } }));
    if (!mine) setUnread((current) => ({ ...current, [peerId]: (current[peerId] ?? 0) + 1 }));
  }, []);
  const send = useCallback((peerId: string, text: string, options?: MessageOptions) => addMessage(peerId, text, true, options), [addMessage]);
  const receive = useCallback((peerId: string, text: string) => addMessage(peerId, text, false), [addMessage]);

  function addMedia(peerId: string, item: Exclude<PendingMessage, { kind: 'text' }>, mine = true) {
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
    const snapshot = store.current.getLatest();
    if (snapshot) relationships.current = snapshot.relationships;
    if (method === 'GET' && path === '/friends') return { relationships: relationships.current.map((entry) => entry.status === 'accepted' ? entry : { ...entry, username: '', bio: '' }) } as T;
    if (path === '/friends/code' && method === 'POST') {
      const days = body?.days ?? 1;
      if (typeof days !== 'number' || !Number.isInteger(days) || days < 1 || days > 30)
        throw new Error('有效期须为 1 至 30 天的整数。');
      const code = 'penlia:add:' + Array.from(getRandomBytes(16), (byte) => byte.toString(16).padStart(2, '0')).join('');
      const friendCode = { code, expiresAt: new Date(Date.now() + days * 86400000).toISOString() };
      await store.current.save((value) => ({ ...value, friendCode }));
      return friendCode as T;
    }
    if (path === '/friends/code' && method === 'DELETE') {
      await store.current.save((value) => ({ ...value, friendCode: null }));
      return {} as T;
    }
    if (path === '/friends/code/status' && method === 'POST') {
      const current = snapshot?.friendCode;
      return { expiresAt: current && body?.code === current.code && Date.parse(current.expiresAt) > Date.now() ? current.expiresAt : null } as T;
    }
    if (path === '/me/public-intro' && method === 'GET') return snapshot?.publicIntro as T;
    if (path === '/me/public-intro' && method === 'PATCH') {
      const publicIntro = { enabled: body?.enabled === true, region: String(body?.region ?? '').slice(0, 30) };
      await store.current.save((value) => ({ ...value, publicIntro }));
      return publicIntro as T;
    }
    const rejected = snapshot?.declines ?? [];
    const publicPerson = (person: typeof demoPeople[number], isFriend: boolean) => ({
      id: person.id, name: person.name, bio: person.bio, region: '上海', demoPortraitKey: person.username, isFriend,
    });
    const scanPerson = body?.code === demoInvitation && demoPeople.find((person) => person.id === 'demo-zhouzhou'
      && !snapshot?.rows.blocks?.some((entry) => entry.id === person.id));
    if (path === '/people/code' && method === 'POST') {
      return { person: scanPerson ? publicPerson(scanPerson, relationships.current.some((friend) =>
        friend.userId === scanPerson.id && friend.status === 'accepted')) : null } as T;
    }
    if (path === '/friend-requests' && method === 'GET') {
      const entry = (record: typeof demoRelationships[number], declined = false) => ({
        id: record.id, name: record.name, outgoing: record.outgoing, status: declined ? 'declined' : record.status,
        friendId: !declined && record.status === 'accepted' ? record.userId : undefined,
        verificationMessage: record.verificationMessage ?? '', demoPortraitKey: record.username,
      });
      return { requests: [...relationships.current.map((item) => entry(item)), ...rejected.map((item) => entry(item, true))] } as T;
    }
    if (path.startsWith('/friend-requests/') && method === 'GET') {
      const id = path.split('/').at(-1);
      const existing = relationships.current.find((item) => !item.outgoing && item.id === id);
      const request = existing ?? rejected.find((item) => !item.outgoing && item.id === id);
      const person = demoPeople.find((item) => item.id === request?.userId);
      if (!request || !person || snapshot?.rows.blocks?.some((item) => item.id === person.id))
        throw new Error('这条好友申请已不可访问。');
      return { person: publicPerson(person, existing?.status === 'accepted'), status: existing?.status ?? 'declined',
        verificationMessage: request.verificationMessage ?? '' } as T;
    }
    if (method === 'GET' && path.startsWith('/people?username=')) {
      const username = decodeURIComponent(path.slice('/people?username='.length)).toLowerCase();
      return { person: demoPeople.find((person) => person.username === username) ?? null } as T;
    }
    if (method === 'POST' && path === '/friends') {
      const person = body?.code === undefined ? demoPeople.find((item) => item.id === body?.userId) : scanPerson;
      if (!person) throw new Error('二维码或好友已不可访问。');
      const existing = relationships.current.find((item) => item.userId === person.id);
      if (existing) return { id: existing.id } as T;
      const entry = { ...demoRelationship(person, 'pending', true),
        id: 'relationship-' + person.id + '-' + Date.now(), verificationMessage: String(body?.note ?? '').slice(0, 100) };
      await store.current.save((value) => ({ ...value, relationships: [...value.relationships, entry] }));
      return { id: entry.id } as T;
    }
    if (method === 'POST' && path === '/friends/accept') {
      await store.current.save((value) => ({ ...value, relationships: value.relationships.map((friend) =>
        friend.id === body?.id && !friend.outgoing && friend.status === 'pending'
          ? { ...friend, status: 'accepted', chatReady: true } : friend) }));
      return {} as T;
    }
    if (method === 'POST' && path === '/friends/decline') {
      await store.current.save((value) => {
        const entry = value.relationships.find((item) => item.id === body?.id && !item.outgoing && item.status === 'pending');
        return entry ? { ...value, declines: [...value.declines, entry],
          relationships: value.relationships.filter((item) => item.id !== entry.id) } : value;
      });
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
    const savingMoment = (path === '/moments' && method === 'POST')
      || (/^\/moments\/[^/?]+$/.test(path) && ['PATCH', 'DELETE'].includes(method));
    const savingReport = method === 'POST' && ['/p1/reports', '/p1/boundary'].includes(path);
    if (savingMoment || savingReport) {
      let result: unknown;
      await store.current.save((value) => {
        const rows = { ...value.rows };
        result = offlineRequest(rows, path, method, body ?? {}, relationships.current);
        return Object.keys(rows).some((key) => rows[key] !== value.rows[key]) ? { ...value, rows } : value;
      });
      return result as T;
    }
    const current = store.current.getLatest();
    if (!current) throw new Error('正在读取本机预览数据，请稍后重试。');
    const draft = { ...current.rows };
    const result = offlineRequest(draft, path, method, body ?? {}, relationships.current);
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
