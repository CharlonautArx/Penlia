import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, type ReactNode } from 'react';

import { useLocalDocument } from '../local/document';
import { emptyDirectory, type Directory } from './directory';

const Context = createContext<ReturnType<typeof useLocalDocument<Directory>> | null>(null);

export function DirectoryProvider({ account, children }: { account?: string; children: ReactNode }) {
  const key = account ? 'penlia:friend-directory:v1:' + account : undefined;
  const store = useLocalDocument<Directory>(key, async () => {
    const raw = await AsyncStorage.getItem(key!);
    return raw ? JSON.parse(raw) : emptyDirectory;
  });

  return <Context.Provider value={store}>{children}</Context.Provider>;
}

export function useDirectory() {
  const store = useContext(Context);
  if (!store) throw new Error('DirectoryProvider is required');
  return store;
}

export type SaveDirectory = ReturnType<typeof useDirectory>['save'];
