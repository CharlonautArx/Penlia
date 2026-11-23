import { LinearGradient } from 'expo-linear-gradient';
import { useMemo, useRef, useState } from 'react';
import { Image, PanResponder, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { spaceSamplePhoto } from '../../demo/visuals';
import { useLocalPhotoUri } from './media';
import type { Cover } from './model';

export const coverTones = {
  mist: ['#F5D7E4', '#E5DDEE', '#C9EAE9'],
  dawn: ['#F9DAE2', '#FDEDE9', '#F1DFC7'],
  blue: ['#ECDDF6', '#E5E6F7', '#C7F0ED'],
} as const;

export function coverMetrics(width: number, height: number, inset: number) {
  const resting = inset + Math.min(300, height * 0.39, Math.max(160, width * 0.55));
  return { resting, reserve: Math.min(144, resting * 0.55) };
}

type Focus = NonNullable<Cover['focus']>;
const center = { x: 0.5, y: 0.5 };
const clamp = (value: number) => Math.min(1, Math.max(0, value));

export function ImmersiveCover({ cover, width, resting, reserve, reveal, onFocus, onDrag }: {
  cover: Cover; width: number; resting: number; reserve: number;
  reveal?: SharedValue<number>; onFocus?: (focus: Focus) => void; onDrag?: (active: boolean) => void;
}) {
  const photo = cover.photo;
  const uri = useLocalPhotoUri(photo?.type === 'local' ? photo.id : undefined);
  const source = photo?.type === 'sample' ? spaceSamplePhoto(photo.id) : uri ? { uri } : undefined;
  const [loaded, setLoaded] = useState<{ id: string; aspect: number }>();
  const full = resting + reserve;
  const aspect = loaded && loaded.id === photo?.id ? loaded.aspect : width / full;
  // The entire pull uses this one fixed-size plane. The viewport uncovers its top edge.
  const photoWidth = Math.max(width, full * aspect);
  const photoHeight = photoWidth / aspect;
  const excessX = Math.max(0, photoWidth - width);
  const excessY = Math.max(0, photoHeight - full);
  const focus = cover.focus ?? center;
  const edit = useRef({ focus, onFocus, onDrag, excessX, excessY });
  edit.current = { focus, onFocus, onDrag, excessX, excessY };
  const drag = useMemo(() => {
    let origin = center;
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        origin = edit.current.focus;
        edit.current.onDrag?.(true);
      },
      onPanResponderMove: (_, { dx, dy }) => {
        const { excessX: x, excessY: y, onFocus: update } = edit.current;
        update?.({ x: x > 1 ? clamp(origin.x - dx / x) : origin.x, y: y > 1 ? clamp(origin.y - dy / y) : origin.y });
      },
      onPanResponderRelease: () => edit.current.onDrag?.(false),
      onPanResponderTerminate: () => edit.current.onDrag?.(false),
    });
  }, []);
  const viewport = useAnimatedStyle(() => ({ height: resting + (reveal?.value ?? 0) }));
  return <Animated.View style={[local.clip, viewport]}>
    <View style={[local.plane, { height: full }]} pointerEvents="none">
      <LinearGradient colors={coverTones[cover.tone]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      {source && photo && <Image source={source} resizeMode="cover" accessible={false}
        onLoad={({ nativeEvent: { source: size } }) => {
          const ratio = size.width / size.height;
          if (ratio > 0 && Number.isFinite(ratio) && (loaded?.id !== photo.id || loaded.aspect !== ratio))
            setLoaded({ id: photo.id, aspect: ratio });
        }}
        style={{ position: 'absolute', width: photoWidth, height: photoHeight, left: -excessX * focus.x, top: -excessY * focus.y }} />}
    </View>
    {onFocus && photo && <View style={StyleSheet.absoluteFill} {...drag.panHandlers}
      accessibilityLabel="调整封面取景" accessibilityHint="拖动照片调整位置"
      accessible accessibilityRole="adjustable" accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={({ nativeEvent }) => {
        const axis = excessY >= excessX ? 'y' : 'x';
        onFocus({ ...focus, [axis]: clamp(focus[axis] + (nativeEvent.actionName === 'increment' ? 0.1 : -0.1)) });
      }} />}
  </Animated.View>;
}

const local = StyleSheet.create({
  clip: { overflow: 'hidden' },
  plane: { position: 'absolute', bottom: 0, left: 0, right: 0, overflow: 'hidden' },
});
