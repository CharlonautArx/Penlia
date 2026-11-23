import { BlurTargetView, BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useIsFocused } from 'expo-router';
import { useRef, type ComponentRef } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useAppearance } from '../../components/appearance';
import { Icon, type IconName } from '../../components/ui';
import { colors, radius, space, touch, type } from '../../theme';

const androidBlur = Platform.OS === 'android' && Number(Platform.Version) >= 31;
const supportsBlur = androidBlur || Platform.OS === 'ios' || Platform.OS === 'web';

export function FrostedAction({ label, icon, onPress, small, unread, target, style }: {
  label: string; icon: IconName; onPress: () => void; small?: boolean; unread?: boolean;
  target?: React.RefObject<ComponentRef<typeof View> | null>; style?: StyleProp<ViewStyle>;
}) {
  const reference = useRef<ComponentRef<typeof View>>(null);
  const { reduced } = useAppearance();
  const focused = useIsFocused();
  return <View style={[local.shadow, style]}>
    {!target && androidBlur && <BlurTargetView ref={reference} pointerEvents="none" aria-hidden style={local.sample} />}
    <Pressable accessibilityRole="button" accessibilityLabel={label}
      accessibilityHint={unread ? '有未读互动' : undefined} onPress={onPress}
      style={({ pressed }) => [local.pressable, small && local.small, pressed && local.pressed,
        pressed && !reduced && local.shrink]}>
      <View pointerEvents="none" aria-hidden style={StyleSheet.absoluteFill}>
        {focused && supportsBlur && <BlurView blurTarget={target ?? reference}
          blurMethod="dimezisBlurViewSdk31Plus" tint="light" intensity={22} blurReductionFactor={1}
          style={StyleSheet.absoluteFill} />}
        <LinearGradient colors={target ? ['#FFFFFFDC', '#FFFFFF94'] : ['#FFFFFF', '#FFFFFFEB']}
          style={StyleSheet.absoluteFill} />
        <View style={local.rim} />
      </View>
      <Icon name={icon} size={small ? 22 : 18} color="#303038" />
      {!small && <Text style={local.label}>{label}</Text>}
    </Pressable>
    {unread && <View pointerEvents="none" aria-hidden style={local.dot} />}
  </View>;
}

const local = StyleSheet.create({
  shadow: { borderRadius: radius.pill, boxShadow: '0px 2px 8px #2826311C' },
  sample: { ...StyleSheet.absoluteFill, backgroundColor: colors.backdrop, borderRadius: radius.pill, overflow: 'hidden' },
  pressable: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', minHeight: touch, gap: space.xs,
    paddingHorizontal: space.md, paddingVertical: space.xs, borderRadius: radius.pill, overflow: 'hidden' },
  small: { width: touch, height: touch, paddingHorizontal: 0, paddingVertical: 0 },
  label: { ...type.control, color: '#303038' },
  rim: { ...StyleSheet.absoluteFill, borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E2DFE5', borderTopColor: '#FFFFFF' },
  dot: { width: 11, height: 11, borderRadius: radius.pill, backgroundColor: '#E72442', borderColor: '#FFFFFF',
    borderWidth: 1.5, position: 'absolute', top: 1, right: 1 },
  pressed: { opacity: 0.78 },
  shrink: { transform: [{ scale: 0.97 }] },
});
