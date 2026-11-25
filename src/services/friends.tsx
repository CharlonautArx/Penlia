import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { AppState } from 'react-native';

import { DirectoryProvider } from '../features/friends/store';
import { errorMessage, type Relationship } from './api';
import { useAccountIdentity, useSession } from './session';

const FriendsContext = createContext<{
  relationships: Relationship[] | null;
  identities: ReadonlyMap<string, Relationship>;
  error: string;
  refresh: () => Promise<void>;
} | null>(null);

export function FriendsProvider({ children }: { children: ReactNode }) {
  const { request, session } = useSession();
  const [relationships, setRelationships] = useState<Relationship[] | null>(null);
  const [error, setError] = useState('');
  const sequence = useRef(0);

  const refresh = useCallback(async () => {
    const latest = ++sequence.current;
    try {
      const result = await request<{ relationships: Relationship[] }>('/friends');
      if (latest === sequence.current) {
        setRelationships(result.relationships);
        setError('');
      }
    } catch (failure) {
      if (latest === sequence.current) setError(errorMessage(failure));
    }
  }, [request]);

  const identities = useMemo(() => new Map(
    (relationships ?? []).filter(({ status }) => status === 'accepted').map((person) => [person.userId, person]),
  ), [relationships]);
  useEffect(() => {
    if (!session) return;
    const update = () => { if (AppState.currentState !== 'background') void refresh(); };
    const listener = AppState.addEventListener('change', (state) => { if (state === 'active') update(); });
    const timer = setInterval(update, 45000);
    return () => { listener.remove(); clearInterval(timer); };
  }, [refresh, session?.token]);
  return <FriendsContext.Provider value={{ relationships, refresh, error, identities }}><DirectoryProvider account={session?.user.id}>{children}</DirectoryProvider></FriendsContext.Provider>;
}

export function useFriends() {
  const friends = useContext(FriendsContext);
  if (!friends) throw new Error('FriendsProvider is required');
  return friends;
}

export function useIdentityResolver() {
  const self = useAccountIdentity();
  const identities = useContext(FriendsContext)?.identities;
  return useCallback((id?: string) => id && id === self?.id ? self : id ? identities?.get(id) : undefined, [identities, self]);
}
