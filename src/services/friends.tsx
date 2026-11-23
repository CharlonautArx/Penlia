import { createContext, type ReactNode, useCallback, useContext, useRef, useState } from 'react';

import { DirectoryProvider } from '../features/friends/store';
import { errorMessage, type Relationship } from './api';
import { useSession } from './session';

const FriendsContext = createContext<{
  relationships: Relationship[] | null;
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

  return <FriendsContext.Provider value={{ relationships, refresh, error }}><DirectoryProvider account={session?.user.id}>{children}</DirectoryProvider></FriendsContext.Provider>;
}

export function useFriends() {
  const friends = useContext(FriendsContext);
  if (!friends) throw new Error('FriendsProvider is required');
  return friends;
}
