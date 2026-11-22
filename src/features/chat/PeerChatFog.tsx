import MaskedView from '@react-native-masked-view/masked-view';
import { BlurTargetView, BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useIsFocused } from 'expo-router';
import type { ComponentRef, ComponentType, ReactElement, ReactNode, RefObject } from 'react';
import { Platform, StyleSheet, View, type ViewProps, type ViewStyle } from 'react-native';

import { useAppearance } from '../../components/appearance';

const androidBlur = Platform.OS === 'android' && Number(Platform.Version) >= 31;
export const PeerBlurTarget = androidBlur ? BlurTargetView : View;

// MaskedView's declaration still extends the old React Native instance type.
const NativeMask = MaskedView as unknown as ComponentType<ViewProps & {
  androidRenderingMode: 'hardware'; children: ReactNode; maskElement: ReactElement;
}>;
const fade = ['#000000', '#000000FA', '#00000066', '#00000000'] as const;
const stops = [0, 0.48, 0.78, 1] as const;
const webFog = {
  backdropFilter: 'blur(7px)',
  maskImage: 'linear-gradient(#000, #000 48%, #0006 78%, transparent)',
} as ViewStyle;
const light = ['#FFFFFF91', '#FFFFFF75', '#FFFFFF26', '#FFFFFF00'] as const;
const dark = ['#222222CA', '#2222229E', '#2222222A', '#22222200'] as const;

export function PeerChatFog({ target, ready }: {
  target: RefObject<ComponentRef<typeof View> | null>; ready: boolean;
}) {
  const { scheme } = useAppearance();
  const focused = useIsFocused();
  const useBlur = ready && focused && (androidBlur || Platform.OS === 'ios' || Platform.OS === 'web');

  return <View pointerEvents="none" aria-hidden importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
    {useBlur && (Platform.OS === 'web'
      ? <View style={[StyleSheet.absoluteFill, webFog]} />
      : <NativeMask androidRenderingMode="hardware" style={StyleSheet.absoluteFill}
          maskElement={<LinearGradient colors={fade} locations={stops} style={StyleSheet.absoluteFill} />}>
          <BlurView blurTarget={target} blurMethod="dimezisBlurViewSdk31Plus"
            tint={scheme === 'dark' ? 'dark' : 'light'} intensity={30} blurReductionFactor={4}
            style={StyleSheet.absoluteFill} />
        </NativeMask>)}
    <LinearGradient colors={scheme === 'dark' ? dark : light} locations={stops} style={StyleSheet.absoluteFill} />
  </View>;
}
