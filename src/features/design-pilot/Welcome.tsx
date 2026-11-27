import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, usePathname, useRootNavigationState } from 'expo-router';
import { useEffect, useRef } from 'react';
import { useDesignPilot } from './context';

const entryKey = 'penlia.design-pilot.entry.v1';

/** Open the comparison desk once on an ordinary launch. A link always leads to its requested screen. */
export function PilotWelcome() {
  const path = usePathname();
  const navigation = useRootNavigationState();
  const { ready } = useDesignPilot();
  const checked = useRef(false);
  useEffect(() => {
    if (!ready || !navigation?.key || checked.current) return;
    if (path !== '/') {
      checked.current = true;
      void AsyncStorage.setItem(entryKey, '1').catch(() => {});
      return;
    }
    let active = true;
    void AsyncStorage.getItem(entryKey).then((seen) => {
      if (!active || checked.current) return;
      checked.current = true;
      if (!seen) {
        router.push('/design-pilot');
        void AsyncStorage.setItem(entryKey, '1').catch(() => {});
      }
    }).catch(() => {});
    return () => { active = false; };
  }, [navigation?.key, path, ready]);
  return null;
}
