import AsyncStorage from '@react-native-async-storage/async-storage';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router/react-navigation';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Appearance, Platform, useColorScheme } from 'react-native';

import { colorNames, palette } from '../theme';

type Preference = 'system' | 'light' | 'dark';
type AppearanceState = {
  preference: Preference;
  scheme: 'light' | 'dark';
  reduced: boolean;
  setPreference: (mode: Preference) => Promise<void>;
};
const key = 'penlia.appearance.v1';
const AppearanceContext = createContext<AppearanceState>({
  preference: 'system', scheme: 'light', reduced: true, setPreference: async () => undefined,
});
export const useAppearance = () => useContext(AppearanceContext);

export function PenliaAppearance({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [preference, setMode] = useState<Preference>('system');
  const [reduced, setReduced] = useState(true);
  const requested = useRef(false);
  const scheme = preference === 'system' ? system === 'dark' ? 'dark' : 'light' : preference;
  const setPreference = useCallback(async (mode: Preference) => {
    requested.current = true;
    await AsyncStorage.setItem(key, mode);
    setMode(mode);
  }, []);

  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(key).then((mode) => {
      if (active && !requested.current && (mode === 'light' || mode === 'dark')) setMode(mode);
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web') Appearance.setColorScheme(preference === 'system' ? 'unspecified' : preference);
  }, [preference]);

  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const root = document.documentElement;
      root.style.colorScheme = scheme;
      for (const name of colorNames) root.style.setProperty('--penlia-' + name, palette[scheme][name]);
    }
  }, [scheme]);

  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const pref = window.matchMedia('(prefers-reduced-motion: reduce)');
      const sync = () => setReduced(pref.matches);
      sync();
      pref.addEventListener('change', sync);
      return () => pref.removeEventListener('change', sync);
    }
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => { if (active) setReduced(value); }).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => { active = false; sub.remove(); };
  }, []);

  const navigation = useMemo(() => {
    const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
    const selected = palette[scheme];
    return {
      ...base,
      colors: { ...base.colors, background: selected.backdrop, card: selected.panel, text: selected.text,
        border: selected.border, primary: selected.accent, notification: selected.accent },
    };
  }, [scheme]);
  return <AppearanceContext.Provider value={{ preference, scheme, reduced, setPreference }}>
    <ThemeProvider value={navigation}>{children}</ThemeProvider>
  </AppearanceContext.Provider>;
}
