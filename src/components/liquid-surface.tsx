import { BlurView, type BlurTargetView } from 'expo-blur';
import { useId, type RefObject, type ComponentRef } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';

import { useAppearance } from './appearance';
import { OpticalSample } from './optical-sample';

export type GlassTarget = RefObject<ComponentRef<typeof BlurTargetView> | null>;
type Finish = 'dock' | 'search' | 'control' | 'bubble' | 'sheet' | 'quiet';

// Keep the reading surface neutral. Existing brand colors are strongest on the shoulder.
const finishes = {
  dock: { tint: 0.10, shoulder: 0.19, shine: 0.70 },
  search: { tint: 0.06, shoulder: 0.34, shine: 0.84 },
  control: { tint: 0.10, shoulder: 0.17, shine: 0.60 },
  bubble: { tint: 0.23, shoulder: 0.29, shine: 0.76 },
  sheet: { tint: 0.02, shoulder: 0.06, shine: 0.48 },
  quiet: { tint: 0.02, shoulder: 0.05, shine: 0.40 },
} as const;

export function LiquidSurface({ finish, roundness, target, opaque, rimOnly }: {
  finish: Finish; roundness: number; target?: GlassTarget; opaque?: boolean; rimOnly?: boolean;
}) {
  const { scheme } = useAppearance();
  const dark = scheme === 'dark';
  const sdk = Platform.OS === 'android' ? Number(Platform.Version) : 0;
  const sample = !!target && sdk >= 31 && !opaque;
  const { tint, shoulder, shine } = finishes[finish];
  const radius = roundness;
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const fill = dark
    ? sample ? '#24212BD9' : finish === 'bubble' ? '#484451' : '#24252D'
    : sample ? '#FAF9FBC2' : finish === 'sheet' ? '#FDFCFD' : '#FCFBFC';
  const reflection = dark ? '#E4E3FF' : '#FFFFFF';
  const separation = dark ? '#F1DDF0' : '#554861';
  const bevel = (finish === 'dock' || finish === 'search') ? 4.6 : 3;
  const materialWidth = finish === 'dock' ? 340 : finish === 'search' ? 328 : 160;
  const materialHeight = finish === 'dock' ? 56 : finish === 'sheet' ? 175 : 49;
  const r = Math.min(materialHeight / 2, radius);
  return <View pointerEvents="none" accessible={false} aria-hidden
    style={[StyleSheet.absoluteFill, local.surface, { borderRadius: radius, backgroundColor: rimOnly ? 'transparent' : fill }]}>
    {sample && <OpticalSample enabled={sdk >= 33} style={StyleSheet.absoluteFill}>
      <BlurView blurTarget={target} tint="default" intensity={23} blurReductionFactor={5}
        blurMethod="dimezisBlurViewSdk31Plus" style={StyleSheet.absoluteFill} />
    </OpticalSample>}
    {sample && <View style={[StyleSheet.absoluteFill, { backgroundColor: dark ? '#24222B91' : '#FFFFFF68' }]} />}
    <Svg width="100%" height="100%" viewBox={`0 0 ${materialWidth} ${materialHeight}`}
      preserveAspectRatio="none" style={StyleSheet.absoluteFill}>
      <Defs>
        <LinearGradient id={uid + 'body'} x1="0%" y1="10%" x2="100%" y2="90%">
          <Stop offset="0%" stopColor="#FF768D" stopOpacity={tint * (dark ? .72 : 1)} />
          <Stop offset="47%" stopColor={reflection} stopOpacity={dark ? .025 : .12} />
          <Stop offset="100%" stopColor="#AEFFF8" stopOpacity={tint * (dark ? .48 : .75)} />
        </LinearGradient>
        <RadialGradient id={uid + 'warm'} cx="0%" cy="0%" rx="26%" ry="82%">
          <Stop offset="0%" stopColor="#FCAFCA" stopOpacity={shoulder * (dark ? .60 : 1)} />
          <Stop offset="100%" stopColor="#FCAFCA" stopOpacity="0" />
        </RadialGradient>
        <RadialGradient id={uid + 'cool'} cx="100%" cy="100%" rx="34%" ry="79%">
          <Stop offset="0%" stopColor="#ACDDD9" stopOpacity={shoulder * (dark ? .52 : 1)} />
          <Stop offset="100%" stopColor="#ACDDD9" stopOpacity="0" />
        </RadialGradient>
        <LinearGradient id={uid + 'surface'} x1="0%" y1="0%" x2="0%" y2="100%">
          <Stop offset="0%" stopColor={reflection} stopOpacity={shine * (dark ? .25 : 1)} />
          <Stop offset="19%" stopColor={reflection} stopOpacity={dark ? .06 : .30} />
          <Stop offset="58%" stopColor={reflection} stopOpacity="0" />
          <Stop offset="91%" stopColor={separation} stopOpacity={dark ? .055 : .016} />
          <Stop offset="100%" stopColor={separation} stopOpacity={dark ? .10 : .06} />
        </LinearGradient>
        <LinearGradient id={uid + 'rim'} x1="4%" y1="0%" x2="94%" y2="100%">
          <Stop offset="0%" stopColor={reflection} stopOpacity={dark ? .31 : .95} />
          <Stop offset="42%" stopColor={reflection} stopOpacity={dark ? .09 : .38} />
          <Stop offset="62%" stopColor={separation} stopOpacity={dark ? .12 : .15} />
          <Stop offset="100%" stopColor={reflection} stopOpacity={dark ? .24 : .92} />
        </LinearGradient>
        <LinearGradient id={uid + 'bevel'} x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor={reflection} stopOpacity={dark ? .15 : .56} />
          <Stop offset="27%" stopColor={reflection} stopOpacity={dark ? .05 : .19} />
          <Stop offset="69%" stopColor={reflection} stopOpacity="0" />
          <Stop offset="100%" stopColor={reflection} stopOpacity={dark ? .12 : .42} />
        </LinearGradient>
      </Defs>
      {!rimOnly && <>
        <Rect width={materialWidth} height={materialHeight} rx={r} fill={`url(#${uid}body)`} />
        <Rect width={materialWidth} height={materialHeight} rx={r} fill={`url(#${uid}warm)`} />
        <Rect width={materialWidth} height={materialHeight} rx={r} fill={`url(#${uid}cool)`} />
        <Rect width={materialWidth} height={materialHeight} rx={r} fill={`url(#${uid}surface)`} />
      </> }
      {radius > 0 && <>
        <Rect x={.7} y={.7} width={materialWidth - 1.4} height={materialHeight - 1.4}
          rx={Math.max(0,r-.7)} fill="none" stroke={`url(#${uid}rim)`} strokeWidth={1.4} />
        <Rect x={bevel/2} y={bevel/2} width={materialWidth-bevel} height={materialHeight-bevel}
          rx={Math.max(0,r-bevel/2)} fill="none" stroke={`url(#${uid}bevel)`} strokeWidth={bevel*.62} />
      </> }
    </Svg>
  </View>;
}

const local = StyleSheet.create({ surface: { overflow: 'hidden' } });
