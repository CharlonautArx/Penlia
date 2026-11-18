import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, type Dispatch, type ReactNode, type SetStateAction, useContext, useEffect, useState } from 'react';

import { type DemoState, initialDemo } from './demo-data';

const storageKey = 'penlia.demo.v1';

const DemoContext = createContext<{
  demo: DemoState;
  setDemo: Dispatch<SetStateAction<DemoState>>;
  storageFailed: boolean;
} | null>(null);

export function DemoProvider({ children }: { children: ReactNode }) {
  const [demo, setDemo] = useState(initialDemo);
  const [ready, setReady] = useState(false);
  const [storageFailed, setStorageFailed] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const saved = await AsyncStorage.getItem(storageKey);
        if (active && saved) setDemo(JSON.parse(saved) as DemoState);
      } catch {
        if (active) setStorageFailed(true);
      } finally {
        if (active) setReady(true);
      }
    }
    void load();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!ready) return;
    AsyncStorage.setItem(storageKey, JSON.stringify(demo))
      .then(() => setStorageFailed(false))
      .catch(() => setStorageFailed(true));
  }, [demo, ready]);

  if (!ready) return null;
  return (
    <DemoContext.Provider value={{ demo, setDemo, storageFailed }}>
      {children}
    </DemoContext.Provider>
  );
}

export function useDemo() {
  const context = useContext(DemoContext);
  if (!context) throw new Error('DemoProvider is required');
  return context;
}
