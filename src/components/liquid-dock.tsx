import { BlurTargetView } from 'expo-blur';
import { useFocusEffect } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { useAppearance } from './appearance';
import { LiquidSurface, type GlassTarget } from './liquid-surface';

const DockClearance = createContext(0);
export const useDockClearance = () => useContext(DockClearance);

export function DockScene({ height, register, children }: {
  height: number; register: (target: GlassTarget | undefined) => void; children: ReactNode;
}) {
  const target = useRef<NonNullable<GlassTarget["current"]>>(null);
  useFocusEffect(useCallback(() => {
    register(target);
    return () => register(undefined);
  }, [register]));
  return <DockClearance.Provider value={height}>
    <BlurTargetView ref={target} style={s.scene}>{children}</BlurTargetView>
  </DockClearance.Provider>;
}

export function LiquidDock({ active, count, safeBottom, target }: {
  active: number; count: number; safeBottom: number; target?: GlassTarget;
}) {
  const [width, setWidth] = useState(0);
  const { reduced, scheme } = useAppearance();
  const item = width / count;
  const position = item * (active + 0.5) - 22;
  const slide = useRef(new Animated.Value(position)).current;
  const ready = useRef(false);
  useEffect(() => {
    if (!width) return;
    if (!ready.current || reduced) {
      ready.current = true;
      slide.setValue(position);
      return;
    }
    const task = Animated.spring(slide, {
      toValue: position, stiffness: 245, damping: 25, mass: 0.85, useNativeDriver: true,
    });
    task.start();
    return () => task.stop();
  }, [position, reduced, slide, width]);
  return <View pointerEvents="none" accessible={false} aria-hidden style={StyleSheet.absoluteFill}
    onLayout={({ nativeEvent }) => setWidth(nativeEvent.layout.width)}>
    <View style={[s.frame, { bottom: safeBottom + 1 }, scheme === 'dark' ? s.dark : s.light]}>
      <LiquidSurface finish="dock" roundness={31} target={target} />
    </View>
    {width > 0 && <Animated.View style={[s.bubble, { transform: [{ translateX: slide }] }]}>
      <LiquidSurface finish="bubble" roundness={19} />
    </Animated.View>}
  </View>;
}

const s = StyleSheet.create({
  scene: { flex: 1 }, frame: { position: 'absolute', top: 1, left: 7, right: 7, borderRadius: 31 },
  light: { boxShadow: '0px 3px 8px #39304524, 0px 1px 2px #39304514' },
  dark: { boxShadow: '0px 3px 8px #00000070, 0px 1px 2px #00000035' },
  bubble: { position: 'absolute', top: 5, left: 0, width: 44, height: 30, borderRadius: 19,
    boxShadow: '0px 1px 3px #3930452A' },
});
