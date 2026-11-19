import { createContext, type ReactNode, useCallback, useContext, useRef, useState } from 'react';

import type { TextMessage } from '../services/im';
import { demoMessages, demoPeople, demoRelationship, demoRelationships, demoUnread } from './data';

const DemoContext = createContext<{
  messages: Record<string, TextMessage[]>;
  unread: Record<string, number>;
  markRead: (peerId: string) => void;
  send: (peerId: string, text: string) => void;
  receive: (peerId: string, text: string) => void;
  request: <T>(path: string, options?: { method?: string; body?: Record<string, string> }) => Promise<T>;
} | null>(null);

export function DemoProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState(demoMessages);
  const [unread, setUnread] = useState<Record<string, number>>(demoUnread);
  const relationships = useRef(demoRelationships);
  const messageSequence = useRef(0);
  const messageSession = useRef(Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8));

  const markRead = useCallback((peerId: string) => {
    setUnread((current) => current[peerId] ? { ...current, [peerId]: 0 } : current);
  }, []);

  const addMessage = useCallback((peerId: string, text: string, mine: boolean) => {
    if (!relationships.current.some((friend) => friend.userId === peerId && friend.status === 'accepted')) return;
    const message = { id: 'simulated-' + messageSession.current + '-' + ++messageSequence.current, mine, text, timestamp: Date.now() };
    setMessages((current) => ({ ...current, [peerId]: [...(current[peerId] ?? []), message] }));
    if (!mine) setUnread((current) => ({ ...current, [peerId]: (current[peerId] ?? 0) + 1 }));
  }, []);
  const send = useCallback((peerId: string, text: string) => addMessage(peerId, text, true), [addMessage]);
  const receive = useCallback((peerId: string, text: string) => addMessage(peerId, text, false), [addMessage]);

  const request = useCallback(async <T,>(path: string, { method = 'GET', body }: {
    method?: string;
    body?: Record<string, string>;
  } = {}) => {
    if (method === 'GET' && path === '/friends') return { relationships: relationships.current } as T;
    if (method === 'GET' && path.startsWith('/people?username=')) {
      const username = decodeURIComponent(path.slice('/people?username='.length)).toLowerCase();
      return { person: demoPeople.find((person) => person.username === username) ?? null } as T;
    }
    if (method === 'POST' && path === '/friends') {
      const person = demoPeople.find((item) => item.id === body?.userId);
      if (person && !relationships.current.some((friend) => friend.userId === person.id)) {
        relationships.current = [...relationships.current, demoRelationship(person, 'pending', true)];
      }
      return {} as T;
    }
    if (method === 'POST' && path === '/friends/accept') {
      relationships.current = relationships.current.map((friend) => friend.id === body?.id && !friend.outgoing
        ? { ...friend, status: 'accepted', chatReady: true } : friend);
      return {} as T;
    }
    if (method === 'POST' && path === '/friends/decline') {
      relationships.current = relationships.current.filter((friend) => friend.id !== body?.id || friend.outgoing);
      return {} as T;
    }
    throw new Error('该操作在演示模式中不可用。');
  }, []);

  return <DemoContext.Provider value={{ messages, unread, markRead, send, receive, request }}>{children}</DemoContext.Provider>;
}

export function useDemo() {
  return useContext(DemoContext);
}
