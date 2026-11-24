import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useMemo, useRef, type ReactNode } from 'react';
import { useLocalDocument } from '../local/document';

import type { RichMessage } from '../media/protocol';
export type Bridge = { id: string; window: RichMessage[] };
const Jump = createContext<{ current: Record<string, Bridge> } | undefined>(undefined);
export const useHistoryJump = () => useContext(Jump);

type Deleted = Record<string, string[]>;
const emptyIds: string[] = [];
const History = createContext<{ value?: Deleted; remove?: (key: string, ids: string[]) => Promise<void> }>({});

export function ChatHistoryProvider({ account, children }: { account?: string; children: ReactNode }) {
  const key = account && 'penlia:deleted-chat:v1:' + account;
  const stored = useLocalDocument<Deleted>(key, async () => (key && JSON.parse(await AsyncStorage.getItem(key) ?? '{}')) || {});
  const jumps = useRef<Record<string, Bridge>>({});
  return <Jump.Provider value={jumps}><History.Provider value={{ value: stored.value, remove: (scope, ids) => stored.save((old) => ({
    ...old, [scope]: [...new Set([...(old[scope] ?? []), ...ids])],
  })) }}>{children}</History.Provider></Jump.Provider>;
}

export function useChatHistory(scope?: string) {
  const { value, remove } = useContext(History);
  const ids = scope ? value?.[scope] ?? emptyIds : emptyIds;
  const hidden = useMemo(() => new Set(ids), [ids]);
  return { ready: !!value, hidden, all: value, deleteSelected: (ids: string[]) => {
    if (!scope || !remove) return Promise.reject(new Error('本机聊天记录暂时不可用。'));
    return remove(scope, ids);
  } };
}
