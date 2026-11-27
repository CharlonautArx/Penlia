import { useEffect, useState } from 'react';
import { AccessibilityInfo, AppState, Platform } from 'react-native';
import { backdropBudgetAllows } from './optical-sample';

export function useOpaqueMaterial() {
  const [opaque, setOpaque] = useState(true);
  useEffect(() => {
    if (Platform.OS === 'web') {
      const pref = window.matchMedia('(prefers-reduced-transparency: reduce), (forced-colors: active), (prefers-contrast: more)');
      const sync = () => setOpaque(pref.matches);
      sync();
      pref.addEventListener('change', sync);
      return () => pref.removeEventListener('change', sync);
    }
    let mounted = true;
    const android = Platform.OS === 'android';
    const refresh = (contrast: boolean) => { if (mounted) setOpaque(contrast || !backdropBudgetAllows()); };
    const sync = () => {
      const preference = android ? AccessibilityInfo.isHighTextContrastEnabled() : AccessibilityInfo.isReduceTransparencyEnabled();
      void preference.then(refresh).catch(() => refresh(true));
    };
    sync();
    const accessibility = AccessibilityInfo.addEventListener(android ? 'highTextContrastChanged' : 'reduceTransparencyChanged', refresh);
    const activity = AppState.addEventListener('change', state => { if (state === 'active') sync(); });
    return () => { mounted = false; accessibility.remove(); activity.remove(); };
  }, []);
  return opaque;
}
