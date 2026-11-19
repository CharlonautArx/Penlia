import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, type ReactNode, useContext, useEffect } from 'react';

import { isUiDemo } from '../../demo/mode';
import { initialDemoPets } from '../../demo/pets';
import { useDemo } from '../../demo/state';
import { useSession } from '../../services/session';
import { useLocalDocument } from '../local/document';
import { creditConversation, emptyPet, type Pet, type PetDocument } from './model';

type PetState = ReturnType<typeof usePetsForAccount>;
const Context = createContext<PetState | null>(null);

export function PetProvider({ children }: { children: ReactNode }) {
  const value = usePetsForAccount();
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

function usePetsForAccount() {
  const { session } = useSession();
  const demo = useDemo();
  const key = isUiDemo && session ? 'penlia.pets.v1.' + session.user.id : undefined;
  const store = useLocalDocument<PetDocument>(key, async () => {
    const stored = await AsyncStorage.getItem(key!);
    return stored ? JSON.parse(stored) as PetDocument : initialDemoPets();
  });

  useEffect(() => {
    if (!key || !demo?.messages || !store.value) return;
    store.update((current) => {
      let next = current;
      for (const [id, pet] of Object.entries(current)) {
        const credited = creditConversation(pet, demo.messages[id] ?? []);
        if (credited !== pet) next = { ...next, [id]: credited };
      }
      return next;
    });
  }, [key, demo?.messages, store.value]);

  function mutate(id: string, change: (pet: Pet) => Pet) {
    store.update((current) => {
      const previous = current[id] ?? emptyPet();
      const next = change(previous);
      return next === previous ? current : { ...current, [id]: next };
    });
  }

  return { ...store, mutate, simulateResponse: demo?.receive };
}

export function usePets() {
  const value = useContext(Context);
  if (!value) throw new Error('PetProvider is required');
  return value;
}
