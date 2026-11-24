import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { isUiDemo } from '../../demo/mode';
import { useSession } from '../../services/session';
import { useLocalDocument } from '../local/document';
import { canRecall, type RecallMarker } from './recall-model';

type Remote = { id: string; timestamp: number; senderId: string; peerId: string };
type ByPeer = Record<string, Record<string, RecallMarker>>;
type Store = { peers: ByPeer; after: string };
type ContextValue = { ready: boolean; available: boolean; peers: ByPeer;
  add: (peer: string, marker: RecallMarker) => Promise<void>; sync: () => void;
  recall: (peer: string, message: RecallMarker) => Promise<void> };
const empty: ByPeer = {};
const Context = createContext<ContextValue | undefined>(undefined);
export const useRecalls = () => {
  const context = useContext(Context);
  if (!context) throw new Error('ChatRecallsProvider is required');
  return context;
};

function addMarkers(state: Store, updates: [string, RecallMarker][], after = state.after): Store {
  if ((!updates.length || updates.every(([peer, marker]) => state.peers[peer]?.[marker.id])) && after === state.after) return state;
  const peers = { ...state.peers };
  for (const [peer, marker] of updates) {
    if (!Object.hasOwn(peers[peer] ?? {}, marker.id)) peers[peer] = { ...peers[peer], [marker.id]: marker };
  }
  return { peers, after };
}

export function ChatRecallsProvider({ children }: { children: ReactNode }) {
  const { session, request } = useSession();
  const me = session?.user.id;
  const key = me && 'penlia:chat-recalls:v1:' + me;
  const store = useLocalDocument<Store>(key, async () => JSON.parse((key && await AsyncStorage.getItem(key)) || '{"peers":{},"after":"0"}'));
  const latest = useRef(store);
  latest.current = store;
  const [available, setAvailable] = useState(isUiDemo);
  const reading = useRef(false);
  const ready = !!store.value;
  const add = useCallback((peer: string, marker: RecallMarker) => latest.current.save((state) => addMarkers(state, [[peer, marker]])), []);
  const sync = useCallback(() => {
    if (isUiDemo || !me || !ready || reading.current || AppState.currentState === 'background') return;
    reading.current = true;
    void (async () => {
      let after = latest.current.getLatest()?.after ?? '0';
      for (;;) {
        const page = await request<{ enabled: boolean; messages: Remote[]; next: string | null; more?: boolean }>('/im/recalls?after=' + after);
        setAvailable(page.enabled);
        const next = page.next ?? after;
        const incoming = page.messages.flatMap((row): [string, RecallMarker][] => {
          if (row.senderId !== me && row.peerId !== me) return [];
          const mine = row.senderId === me;
          return [[mine ? row.peerId : row.senderId, { id: row.id, timestamp: row.timestamp, mine }]];
        });
        await latest.current.save((state) => addMarkers(state, incoming, next));
        if (!page.more || next === after) break;
        after = next;
      }
    })().catch(() => {}).finally(() => { reading.current = false; });
  }, [me, ready, request]);
  useEffect(() => {
    sync();
    const timer = setInterval(sync, 25_000);
    const visits = AppState.addEventListener('change', (state) => { if (state === 'active') sync(); });
    return () => { clearInterval(timer); visits.remove(); };
  }, [sync]);

  async function recall(peer: string, message: RecallMarker) {
    if (isUiDemo) {
      if (!canRecall(message.mine, message.timestamp)) throw new Error('这条消息已超过两分钟，无法撤回。');
      return add(peer, message);
    }
    const { message: confirmed } = await request<{ message: Remote }>('/im/recall', { method: 'POST', body: { peerId: peer, id: message.id } });
    await add(peer, { id: confirmed.id, timestamp: confirmed.timestamp, mine: true });
    sync();
  }

  return <Context.Provider value={{ ready, available, peers: store.value?.peers ?? empty, add, sync, recall }}>{children}</Context.Provider>;
}
