import { BlurTargetView, BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useRef, useState, type ReactNode } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { isLiquidGlass } from '../demo/mode';
import { radius } from '../theme';
import { useAppearance } from './appearance';
import type { BackdropSource } from './depth-glass';
import { useOpaqueMaterial } from './liquid-access';
import { OpticalSample } from './optical-sample';

export function useFocusedGlassSource(): BackdropSource {
  const target = useRef<NonNullable<BackdropSource['target']['current']>>(null);
  const opaque = useOpaqueMaterial();
  return { target, opaque };
}

export function GlassFooter({ content, footer }: {
  content: (clearance: number) => ReactNode;
  footer: (source?: BackdropSource) => ReactNode;
}) {
  const source = useFocusedGlassSource();
  const [clearance, setClearance] = useState(64);
  if (!isLiquidGlass) return <View style={local.fill}>{content(0)}{footer()}</View>;
  return <View style={local.fill}>
    <BlurTargetView style={local.fill} ref={source.target}>{content(clearance)}</BlurTargetView>
    <View pointerEvents="box-none" style={local.footer} onLayout={({ nativeEvent }) => setClearance(nativeEvent.layout.height)}>
      {footer(source)}
    </View>
  </View>;
}

export function FocusedGlass({ source, kind = 'bar' }: { source?: BackdropSource; kind?: 'bar' | 'sheet' | 'send' }) {
  const { scheme } = useAppearance();
  const dark = scheme === 'dark';
  const sheet = kind === 'sheet';
  const android = Platform.OS === 'android';
  const sdk = android ? Number(Platform.Version) : 0;
  const sample = !!source && !source.opaque && (sdk >= 31 || Platform.OS === 'ios');
  const roundness = sheet ? radius.sheet : kind === 'send' ? 18 : 26;
  const frame = { borderRadius: roundness, ...(sheet && { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }) };
  const tint = dark ? (sample ? '#211C2ACA' : '#282632') : (sample ? '#FBFCFDA0' : '#F5F8FE');
  const blur = sample && <BlurView blurTarget={source.target} tint="default" intensity={sheet ? 39 : 25}
    blurReductionFactor={4} blurMethod="dimezisBlurViewSdk31Plus" style={StyleSheet.absoluteFill} />;
  return <View pointerEvents="none" aria-hidden style={[StyleSheet.absoluteFill, local.clip, frame]}>
    {sample && android && sdk >= 33 && !sheet && kind !== 'send'
      ? <OpticalSample enabled style={StyleSheet.absoluteFill}>{blur}</OpticalSample> : blur}
    <View style={[StyleSheet.absoluteFill, { backgroundColor: tint }]} />
    <LinearGradient colors={dark ? ['#FFFFFF43', '#FFFFFF09', '#0E173229'] : ['#FFFFFFBF', '#F9FBFF0C', '#96B1DC27']}
      locations={[0, .32, 1]} start={{ x: 0.09, y: 0 }} end={{ x: 0.52, y: 1 }} style={StyleSheet.absoluteFill} />
    <View style={[StyleSheet.absoluteFill, local.edge, frame, {
      borderTopColor: dark ? '#FFFFFF56' : '#FFFFFFF5',
      borderLeftColor: dark ? '#C3C8FD34' : '#FFFFFFB8',
      borderRightColor: dark ? '#A3B8DB2A' : '#8AA2BE51',
      borderBottomColor: dark ? '#A3B8DB35' : '#8098B24F',
    }]} />
  </View>;
}

const local = StyleSheet.create({
  fill: { flex: 1 },
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  clip: { overflow: 'hidden' },
  edge: { borderWidth: StyleSheet.hairlineWidth },
});
