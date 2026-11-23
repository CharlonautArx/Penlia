import { createContext, useContext, useMemo, useRef, useState } from 'react';
import { Image, PanResponder, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useAppearance } from '../../../components/appearance';
import { pictureFrame, unit, type LocalPicture } from './model';

export const WallpaperVisible = createContext(false);

export function useWallpaperLabel() {
  const visible = useContext(WallpaperVisible);
  const { scheme } = useAppearance();
  return visible ? scheme === 'dark' ? local.labelDark : local.labelLight : undefined;
}

export function WallpaperImage({ picture, style, onPosition, onDrag }: {
  picture: LocalPicture; style?: StyleProp<ViewStyle>;
  onPosition?: (position: { x: number; y: number }) => void; onDrag?: (dragging: boolean) => void;
}) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const frame = pictureFrame(picture, size.width, size.height);
  const canMove = frame.width - size.width > 1 || frame.height - size.height > 1;
  const latest = useRef({ picture, frame, size, onPosition, onDrag });
  latest.current = { picture, frame, size, onPosition, onDrag };
  const pan = useMemo(() => {
    let origin = { x: 0.5, y: 0.5 };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => { origin = latest.current.picture; latest.current.onDrag?.(true); },
      onPanResponderMove: (_, { dx, dy }) => {
        const { frame, size, onPosition } = latest.current;
        const x = frame.width - size.width;
        const y = frame.height - size.height;
        onPosition?.({ x: x > 1 ? unit(origin.x - dx / x) : origin.x, y: y > 1 ? unit(origin.y - dy / y) : origin.y });
      },
      onPanResponderRelease: () => latest.current.onDrag?.(false),
      onPanResponderTerminate: () => latest.current.onDrag?.(false),
    });
  }, []);
  const editing = !!onPosition && canMove;
  return <View style={[local.clip, style]} pointerEvents={onPosition ? 'auto' : 'none'}
    onLayout={({ nativeEvent: { layout: { width, height } } }) => setSize({ width, height })}>
    {size.width > 0 && size.height > 0 && <Image source={{ uri: picture.uri }} resizeMode="cover" fadeDuration={0}
      accessible={false} style={[local.image, frame]} />}
    {editing && <View style={StyleSheet.absoluteFill} {...pan.panHandlers}
      accessible accessibilityRole="adjustable" accessibilityLabel="调整聊天背景位置"
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={({ nativeEvent }) => {
        const axis = frame.width - size.width > frame.height - size.height ? 'x' : 'y';
        onPosition({ ...picture, [axis]: unit(picture[axis] + (nativeEvent.actionName === 'increment' ? 0.1 : -0.1)) });
      }} />}
  </View>;
}

const local = StyleSheet.create({
  clip: { overflow: 'hidden' },
  image: { position: 'absolute' },
  labelLight: { backgroundColor: '#FFFFFFE8', borderRadius: 4 },
  labelDark: { backgroundColor: '#14151AE8', borderRadius: 4 },
});
