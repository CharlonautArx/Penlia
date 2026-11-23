import { BlurTargetView, BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useIsFocused } from 'expo-router/react-navigation';
import { useRef, type ComponentRef } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAppearance } from '../../components/appearance';
import { Icon } from '../../components/ui';
import { colors, radius, space, styles, type } from '../../theme';

const glassTint = ['rgba(211, 255, 217, 0.30)', 'rgba(255, 198, 133, 0.30)'] as const;
const supportsAndroidBlur = Platform.OS === 'android' && Number(Platform.Version) >= 31;
const supportsBlur = supportsAndroidBlur || Platform.OS === 'ios' || Platform.OS === 'web';

export function DiscoveryEntrance({ onPress }: { onPress: () => void }) {
  const { reduced, scheme } = useAppearance();
  const focused = useIsFocused();
  const target = useRef<ComponentRef<typeof View>>(null);

  return <View style={local.shadow}>
    {/* Android samples a separate copy of the page's backdrop so the card never blurs its own contents. */}
    {supportsAndroidBlur && <BlurTargetView ref={target} pointerEvents="none" aria-hidden style={local.backdrop}>
      <View style={local.backdropPaint} />
    </BlurTargetView>}
    <Pressable accessibilityLabel="一起" accessibilityRole="button" onPress={onPress}
      style={({ pressed }) => [local.entrance, pressed && !reduced && local.shrink]}>
      {({ pressed }) => <>
        <View pointerEvents="none" aria-hidden style={StyleSheet.absoluteFill}>
          {focused && supportsBlur && <BlurView blurTarget={target} blurMethod="dimezisBlurViewSdk31Plus"
            tint={scheme === 'dark' ? 'dark' : 'default'} intensity={24} blurReductionFactor={1}
            style={StyleSheet.absoluteFill} />}
          <LinearGradient colors={glassTint} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }}
            style={[StyleSheet.absoluteFill, pressed && local.pressed]} />
          <View style={local.rim} />
        </View>
        <Text style={local.title}>一起</Text>
        <View style={local.arrow}><Icon name="chevron-forward" size={17} /></View>
      </>}
    </Pressable>
  </View>;
}

const local = StyleSheet.create({
  shadow: { borderRadius: radius.sheet, boxShadow: '0px 3px 10px #24212A0B' },
  backdrop: { ...StyleSheet.absoluteFill, borderRadius: radius.sheet, overflow: 'hidden' },
  backdropPaint: { ...StyleSheet.absoluteFill, backgroundColor: colors.backdrop },
  entrance: { ...styles.row, minHeight: 125, padding: space.lg, borderRadius: radius.sheet, overflow: 'hidden' },
  rim: { ...StyleSheet.absoluteFill, borderRadius: radius.sheet, borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#FFFFFF52', borderTopColor: '#FFFFFF8F' },
  title: { ...type.display, color: colors.ink, flexShrink: 1, paddingRight: 50 },
  arrow: { width: 32, height: 32, marginLeft: 'auto', alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.85 },
  shrink: { transform: [{ scale: 0.991 }] },
});
