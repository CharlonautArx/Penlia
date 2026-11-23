import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useRef, type ReactNode } from 'react';

import { useLocalDocument } from '../local/document';
import { setConversationPreference, type ConversationPreferences } from './conversation-preferences';

const Context = createContext<(ReturnType<typeof useLocalDocument<ConversationPreferences>> & {
  clearManualUnread: (id: string) => void;
}) | null>(null);

export function ConversationPreferencesProvider({ account, children }: { account?: string; children: ReactNode }) {
  const key = account ? 'penlia:conversation-preferences:v1:' + account : undefined;
  const store = useLocalDocument<ConversationPreferences>(key, async () => {
    const raw = await AsyncStorage.getItem(key!);
    return raw ? JSON.parse(raw) as ConversationPreferences : {};
  });
  const current = useRef(store);
  current.current = store;
  const clearManualUnread = useCallback((id: string) => {
    current.current.update((state) => setConversationPreference(state, id, { manualUnread: false }));
  }, []);

  return <Context.Provider value={{ ...store, clearManualUnread }}>{children}</Context.Provider>;
}

export function useConversationPreferences() {
  const context = useContext(Context);
  if (!context) throw new Error('ConversationPreferencesProvider is required');
  return context;
}
