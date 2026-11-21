import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { glass, glassStops, unread, type GlassTone } from '../material';
import { radius, type } from '../theme';
import { useAppearance } from './appearance';

const start = { x: 0, y: 0.2 };
const end = { x: 1, y: 0.84 };

export function GlassLayer({ tone = 'soft', roundness = radius.control }: { tone?: GlassTone; roundness?: number }) {
  const { scheme } = useAppearance();
  const material = glass[scheme];
  return <View pointerEvents="none" accessible={false} aria-hidden
    style={[StyleSheet.absoluteFill, local.layer, { borderRadius: roundness, backgroundColor: material.base }]}>
    <LinearGradient colors={glassStops(scheme, tone)} start={start} end={end} style={StyleSheet.absoluteFill} />
    <View style={[StyleSheet.absoluteFill, local.rim, {
      borderRadius: roundness, borderColor: material.edge, borderTopColor: material.shine,
    }]} />
  </View>;
}

export function UnreadMark({ count, dot = false, style }: { count: number; dot?: boolean; style?: StyleProp<ViewStyle> }) {
  if (count <= 0) return null;
  return <View pointerEvents="none" accessible={false} aria-hidden
    style={[local.unread, dot ? local.dot : local.counter, style]}>
    <LinearGradient colors={unread.stops} style={StyleSheet.absoluteFill} />
    <View style={[StyleSheet.absoluteFill, local.rim, local.unreadRim]} />
    {!dot && <Text style={local.digits}>{count > 99 ? '99+' : count}</Text>}
  </View>;
}

const local = StyleSheet.create({
  layer: { overflow: 'hidden' },
  rim: { borderWidth: StyleSheet.hairlineWidth },
  unread: { overflow: 'hidden', borderRadius: radius.pill, backgroundColor: unread.stops[1] },
  unreadRim: { borderColor: unread.edge, borderTopColor: unread.gleam, borderRadius: radius.pill },
  dot: { width: 9, height: 9 },
  counter: { minWidth: 20, minHeight: 20, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' },
  digits: { ...type.tag, color: unread.ink, fontVariant: ['tabular-nums'] },
});
