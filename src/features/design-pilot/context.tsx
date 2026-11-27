import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFonts } from 'expo-font';
import { usePathname } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { useAppearance } from '../../components/appearance';
import { isDesignPilot, isVariant, pilotColors, routeScene, type PilotVariant } from './model';

export { isDesignPilot } from './model';
export type { PilotVariant, PilotColors } from './model';

const preferenceKey = 'penlia.design-pilot.variant.v1';
const inert = {
  variant: 'original' as PilotVariant, colors: pilotColors('original', false), dark: false, ready: true,
  select: (_next: PilotVariant) => {},
};
const PilotContext = createContext(inert);
export const useDesignPilot = () => useContext(PilotContext);

export function DesignPilotProvider({ children }: { children: ReactNode }) {
  return isDesignPilot ? <ActiveProvider>{children}</ActiveProvider> : children;
}

function ActiveProvider({ children }: { children: ReactNode }) {
  const [variant, setVariant] = useState<PilotVariant>('original');
  const [hydrated, setHydrated] = useState(false);
  const [fonts, fontError] = useFonts({ PenliaReading: require('./assets/PenliaReading.otf') });
  const changed = useRef(false);
  const writes = useRef(Promise.resolve());
  const { scheme } = useAppearance();
  const dark = scheme === 'dark';
  const path = usePathname();
  useEffect(() => {
    let mounted = true;
    void AsyncStorage.getItem(preferenceKey).then((saved) => {
      if (mounted && !changed.current && isVariant(saved)) setVariant(saved);
    }).catch(() => {}).finally(() => { if (mounted) setHydrated(true); });
    return () => { mounted = false; };
  }, []);
  const select = useCallback((next: PilotVariant) => {
    changed.current = true;
    setVariant(next);
    writes.current = writes.current.then(() => AsyncStorage.setItem(preferenceKey, next)).catch(() => {});
  }, []);
  const value = useMemo(() => ({
    variant, dark, colors: pilotColors(variant, dark), ready: hydrated && (fonts || !!fontError), select,
  }), [variant, dark, hydrated, fonts, fontError, select]);
  return <PilotContext.Provider value={value}>
    <View collapsable={false} testID={value.ready ? 'pilot-' + variant + '-' + (routeScene(path) ?? 'navigation') : undefined}
      style={{ flex: 1 }}>{children}</View>
  </PilotContext.Provider>;
}
