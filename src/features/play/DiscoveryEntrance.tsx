import { BlurTargetView, BlurView } from 'expo-blur';
import { useIsFocused } from 'expo-router/react-navigation';
import { useRef, type ComponentRef } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAppearance } from '../../components/appearance';
import { GlassLayer } from '../../components/material';
import { Icon } from '../../components/ui';
import { colors, radius, space, styles, type } from '../../theme';
import { OrbFace } from '../pet/Orb';

export function DiscoveryEntrance({ onPress }: { onPress: () => void }) {
  const { reduced, scheme } = useAppearance();
  const focused = useIsFocused();
  const target = useRef<ComponentRef<typeof View>>(null);
  const supportsBlur = Platform.OS === 'ios' || (Platform.OS === 'android' && Number(Platform.Version) >= 31);
  const useBlur = focused && supportsBlur;
  const Layers = useBlur ? BlurTargetView : View;

  return <Pressable accessibilityLabel="一起" accessibilityRole="button" onPress={onPress}
    style={({ pressed }) => [local.entrance, pressed && local.pressed, pressed && !reduced && local.shrink]}>
    <Layers ref={target} pointerEvents="none" aria-hidden style={StyleSheet.absoluteFill}>
      <GlassLayer tone="feature" roundness={radius.sheet} />
      <View style={local.ripple} />
      <View style={local.rippleInner} />
    </Layers>
    {useBlur && <BlurView pointerEvents="none" aria-hidden blurTarget={target}
      tint={scheme === 'dark' ? 'dark' : 'light'} intensity={22} blurReductionFactor={4}
      blurMethod="dimezisBlurViewSdk31Plus" style={local.lens} />}
    <View pointerEvents="none" aria-hidden style={local.orb}><OrbFace size={64} expression="happy" /></View>
    <Text style={local.title}>一起</Text>
    <View style={local.arrow}><Icon name="chevron-forward" size={17} /></View>
  </Pressable>;
}

const local = StyleSheet.create({
  entrance: { ...styles.row, minHeight: 125, padding: space.lg, borderRadius: radius.sheet, overflow: 'hidden',
    backgroundColor: colors.tint },
  title: { ...type.display, color: colors.ink, flexShrink: 1, paddingRight: 50 },
  arrow: { width: 32, height: 32, marginLeft: 'auto', alignItems: 'center', justifyContent: 'center' },
  orb: { position: 'absolute', right: 63, top: 25 },
  lens: { position: 'absolute', right: 35, top: 10, width: 134, height: 106, borderRadius: 40 },
  ripple: { position: 'absolute', right: 16, top: -7, width: 161, height: 143, borderRadius: 72,
    borderWidth: StyleSheet.hairlineWidth, borderColor: '#FFFFFFA3', backgroundColor: '#FFFFFF28',
    transform: [{ rotate: '-22deg' }] },
  rippleInner: { position: 'absolute', right: 43, top: 13, width: 135, height: 91, borderRadius: 42,
    borderWidth: StyleSheet.hairlineWidth, borderColor: '#FFFFFF90', backgroundColor: '#FFFFFF2A',
    transform: [{ rotate: '-32deg' }] },
  pressed: { opacity: 0.85 },
  shrink: { transform: [{ scale: 0.991 }] },
});
