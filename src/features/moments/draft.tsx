import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, type ReactNode } from 'react';
import { useLocalDocument } from '../local/document';
import type { LocalMedia } from './media';
import type { Audience } from './model';

export type MomentDraft = {
  body: string; location: string; scope: Audience; groupId: string; memberIds: string[];
  assets: LocalMedia[];
  attempt?: { id: string; signature: string };
};

export const emptyMomentDraft = (scope: Audience = 'private'): MomentDraft => ({
  body: '', location: '', scope, groupId: '', memberIds: [], assets: [],
});

const Context = createContext<ReturnType<typeof useLocalDocument<MomentDraft | null>> | null>(null);

export function MomentDraftProvider({ account, children }: { account?: string; children: ReactNode }) {
  const key = account && 'penlia:moment:draft:v1:' + account;
  const store = useLocalDocument<MomentDraft | null>(key, async () => JSON.parse((key && await AsyncStorage.getItem(key)) || 'null'));
  return <Context.Provider value={store}>{children}</Context.Provider>;
}

export function useMomentDraft() {
  const store = useContext(Context);
  if (!store) throw Error('MomentDraftProvider is required');
  return store;
}
