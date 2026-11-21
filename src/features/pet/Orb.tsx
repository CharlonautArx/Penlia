import { LinearGradient } from 'expo-linear-gradient';
import { useIsFocused } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, AppState, Platform, Pressable, StyleSheet, View } from 'react-native';

import { brandGradient } from '../../theme';

export type Expression = 'calm' | 'curious' | 'resting' | 'surprised' | 'happy' | 'blink';
const names: Record<Expression, string> = {
  calm: '平静', curious: '好奇', resting: '困倦', surprised: '惊喜', happy: '开心', blink: '眨眼',
};

export function OrbFace({ size, expression = 'curious' }: { size: number; expression?: Expression }) {
  return <View style={[local.sphere, { width: size, height: size, borderRadius: size / 2 }]}>
    <LinearGradient colors={brandGradient} locations={[0, 0.53, 1]} start={{ x: 0.09, y: 0.8 }} end={{ x: 0.95, y: 0.25 }}
      style={StyleSheet.absoluteFill} />
    <LinearGradient colors={['#FFFFFFA8', '#FFFFFF29', '#FFFFFF00']} locations={[0, 0.31, 0.9]}
      start={{ x: 0.2, y: 0.03 }} end={{ x: 0.72, y: 0.9 }} style={StyleSheet.absoluteFill} />
    <View style={[local.eyeRow, { gap: size * 0.13, top: size * 0.4, transform: [{ translateX: size * (expression === 'curious' ? 0.091 : 0.026) }] }]}>
      {[0, 1].map((side) => <Eye key={side} expression={expression} size={size} far={side === 1} />)}
    </View>
  </View>;
}

function Eye({ size, expression, far }: { size: number; expression: Expression; far: boolean }) {
  const scale = size / 168;
  if (expression === 'happy' || expression === 'calm') {
    const arc = { width: 22 * scale, height: 13 * scale, borderWidth: Math.max(0.7, 3.5 * scale), borderRadius: 16 * scale };
    return <View style={[local.eyeClip, { height: 7 * scale }]}>
      <View style={[local.eyeArc, arc, expression === 'calm' && { transform: [{ translateY: -6 * scale }] }]} />
    </View>;
  }
  const width = (expression === 'surprised' ? 13 : expression === 'curious' ? (far ? 8 : 10) : 15) * scale;
  const height = (expression === 'surprised' ? 18 : expression === 'curious' ? (far ? 12 : 15) : expression === 'resting' ? 5 : 2) * scale;
  return <View style={[local.eyeDot, { width, height, borderRadius: width / 2, transform: [{ rotate: expression === 'curious' ? '-10deg' : '0deg' }] }]} />;
}

export function PetOrb({ vitality, fed, size = 166, onPet }: {
  vitality: number; fed: number; size?: number; onPet?: () => void;
}) {
  const focus = useIsFocused();
  const [foreground, setForeground] = useState(AppState.currentState !== 'background');
  const [reduce, setReduce] = useState(true);
  const [brief, setBrief] = useState<Expression>();
  const clearing = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pulse = useRef(new Animated.Value(0)).current;
  const bump = useRef(new Animated.Value(0)).current;
  const base: Expression = vitality >= 80 ? 'happy' : vitality >= 55 ? 'curious' : vitality >= 40 ? 'calm' : 'resting';
  const moving = focus && foreground && !reduce;
  const expression = brief ?? base;

  useEffect(() => {
    const app = AppState.addEventListener('change', (state) => setForeground(state === 'active'));
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const media = window.matchMedia('(prefers-reduced-motion: reduce)');
      const sync = () => setReduce(media.matches);
      sync();
      const visibility = () => setForeground(document.visibilityState === 'visible');
      visibility();
      document.addEventListener('visibilitychange', visibility);
      media.addEventListener('change', sync);
      return () => { app.remove(); document.removeEventListener('visibilitychange', visibility); media.removeEventListener('change', sync); };
    }
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => { if (active) setReduce(value); }).catch(() => {});
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => { active = false; app.remove(); motion.remove(); };
  }, []);

  useEffect(() => {
    if (!moving) return;
    const duration = vitality >= 80 ? 1350 : vitality < 40 ? 3200 : 2300;
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration, useNativeDriver: Platform.OS !== 'web', isInteraction: false }),
      Animated.timing(pulse, { toValue: 0, duration, useNativeDriver: Platform.OS !== 'web', isInteraction: false }),
    ]));
    animation.start();
    const blink = setInterval(() => {
      if (clearing.current) return;
      setBrief('blink');
      clearing.current = setTimeout(() => { setBrief(undefined); clearing.current = undefined; }, 125);
    }, 6700);
    return () => { animation.stop(); pulse.setValue(0); clearInterval(blink); };
  }, [moving, pulse, vitality]);

  useEffect(() => () => clearTimeout(clearing.current), []);

  function react(next: Expression, duration: number) {
    clearTimeout(clearing.current);
    setBrief(next);
    clearing.current = setTimeout(() => { setBrief(undefined); clearing.current = undefined; }, duration);
    if (moving) {
      bump.stopAnimation();
      bump.setValue(0);
      Animated.sequence([
        Animated.timing(bump, { toValue: 1, duration: 160, useNativeDriver: Platform.OS !== 'web', isInteraction: false }),
        Animated.spring(bump, { toValue: 0, damping: 14, stiffness: 170, useNativeDriver: Platform.OS !== 'web', isInteraction: false }),
      ]).start();
    }
  }

  const lastFed = useRef(fed);
  useEffect(() => {
    if (fed !== lastFed.current) {
      lastFed.current = fed;
      react('happy', 1750);
    }
  }, [fed]);

  return <Pressable accessibilityRole="button" accessibilityLabel={'轻触小宠物，当前表情' + names[expression]}
    onPress={() => { react('surprised', 1100); onPet?.(); }} style={local.stage}>
    <View style={local.shadow} />
    <Animated.View style={moving ? { transform: [
      { translateY: bump.interpolate({ inputRange: [0, 1], outputRange: [0, -9] }) },
      { rotate: pulse.interpolate({ inputRange: [0, 1], outputRange: ['0deg', expression === 'curious' ? '-4deg' : '0deg'] }) },
      { scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, vitality >= 80 ? 1.04 : 1.022] }) },
    ] } : undefined}>
      <OrbFace size={size} expression={expression} />
    </Animated.View>
  </Pressable>;
}

const local = StyleSheet.create({
  sphere: { overflow: 'hidden', backgroundColor: '#EBC6D7', borderWidth: StyleSheet.hairlineWidth, borderColor: '#FFF7F9' },
  eyeRow: { position: 'absolute', left: 0, right: 0, justifyContent: 'center', alignItems: 'center', flexDirection: 'row' },
  eyeClip: { overflow: 'hidden' },
  eyeArc: { borderColor: '#493244' },
  eyeDot: { backgroundColor: '#493244' },
  stage: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  shadow: { position: 'absolute', bottom: 16, width: 104, height: 8, borderRadius: 100, backgroundColor: '#AA91B12B' },
});
