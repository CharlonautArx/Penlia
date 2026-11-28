import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { createContext, memo, useContext } from 'react';
import { Platform, StyleSheet, View, type ViewStyle } from 'react-native';

import { useAppearance } from './appearance';
import type { GlassTarget } from './liquid-surface';
import { OpticalSample } from './optical-sample';

const levels = {
  strong: { blur: 28, shoulder: 5, depth: 0.10 },
  medium: { blur: 19, shoulder: 3, depth: 0.065 },
  light: { blur: 0, shoulder: 2, depth: 0.038 },
} as const;

export type BackdropSource = { target: GlassTarget; opaque: boolean };
export const ChatGlassBackdrop = createContext<BackdropSource | undefined>(undefined);

export type GlassLevel = keyof typeof levels;
type Corners = Pick<ViewStyle, 'borderBottomLeftRadius' | 'borderBottomRightRadius'>;

type Props = {
  level: GlassLevel;
  roundness: number;
  tone?: 'clear' | 'brand' | 'message' | 'sent';
  source?: BackdropSource;
  corners?: Corners;
  rimOnly?: boolean;
};

export function useChatGlassBackdrop() {
  return useContext(ChatGlassBackdrop);
}

export const DepthGlass = memo(function DepthGlass({
  level, roundness, tone = 'clear', source, corners, rimOnly,
}: Props) {
  const { scheme } = useAppearance();
  const dark = scheme === 'dark';
  const sdk = Platform.OS === 'android' ? Number(Platform.Version) : 0;
  const { blur, shoulder, depth } = levels[level];
  const sample = !rimOnly && !!source && !source.opaque && sdk >= 31 && blur > 0;
  const face = tone === 'sent' || tone === 'message' || rimOnly
    ? 'transparent'
    : sample
      ? dark ? '#20212ABA' : '#FDF9FDAB'
      : dark ? '#28272F' : '#FDFCFD';
  const highlight = dark ? '#FFF3FF' : '#FFFFFF';
  const edge = dark ? '#F3DAF3' : '#69596C';
  const leading = tone === 'brand' ? dark ? '#F0A6C426' : '#FFB6CE31' : 'transparent';
  const trailing = tone === 'brand' ? dark ? '#ABEBE119' : '#AEFFF827' : 'transparent';
  const shape = { borderRadius: roundness, ...corners };

  return <View pointerEvents="none" accessible={false} aria-hidden style={[StyleSheet.absoluteFill, local.clip, shape]}>
    {sample && <OpticalSample enabled={sdk >= 33} style={StyleSheet.absoluteFill}>
      <BlurView blurTarget={source.target} tint="default" intensity={blur} blurReductionFactor={5}
        blurMethod="dimezisBlurViewSdk31Plus" style={StyleSheet.absoluteFill} />
    </OpticalSample>}
    {face !== 'transparent' && <View style={[StyleSheet.absoluteFill, { backgroundColor: face }]} />}
    {tone === 'brand' && <LinearGradient colors={[leading, 'transparent', trailing]} locations={[0, .53, 1]}
      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />}
    {level !== 'light' && <LinearGradient
      colors={[highlight + (dark ? '26' : 'AD'), highlight + (dark ? '06' : '18'), 'transparent']}
      locations={[0, .5, 1]} start={{ x: 0, y: 0 }} end={{ x: 0.20, y: 1 }} style={[local.arc, { height: shoulder * 2 }]} />}
    <View style={[StyleSheet.absoluteFill, shape, local.edge, {
      borderTopColor: highlight + (dark ? '34' : 'EB'),
      borderLeftColor: edge + (dark ? '1A' : '20'),
      borderRightColor: edge + (dark ? '16' : '18'),
      borderBottomColor: edge + '26',
    }]} />
    {level !== 'light' && <View style={[local.contact, { opacity: depth, backgroundColor: dark ? '#EEE1FA' : '#4B4055' }]} />}
  </View>;
});

const local = StyleSheet.create({
  clip: { overflow: 'hidden' },
  edge: { borderWidth: StyleSheet.hairlineWidth },
  arc: { position: 'absolute', top: 0, left: 0, right: 0 },
  contact: { position: 'absolute', height: StyleSheet.hairlineWidth, bottom: 1, left: '24%', right: '11%' },
});
