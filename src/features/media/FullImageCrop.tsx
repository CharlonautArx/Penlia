import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { useEffect, useRef, useState } from 'react';
import { Image, Modal, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { Button, IconButton, Notice } from '../../components/ui';
import { useAppearance } from '../../components/appearance';
import { errorMessage } from '../../services/api';
import { fixed, space, styles } from '../../theme';
import { centered, cropRect, type Framing } from '../friends/profile-crop';

export type CropSource = { uri: string; width: number; height: number };
export type CropOutput = CropSource & { base64: string };
type Props = {
  source: CropSource;
  ratio: number;
  round?: boolean;
  initial?: Framing;
  revealFraction?: number;
  onClose: () => void;
  onConfirm: (source: CropSource, frame: Framing) => Promise<void>;
};

export async function cropJpeg(source: CropSource, ratio: number, framing: Framing, maxSide: number, byteLimit = 2 * 1024 * 1024): Promise<CropOutput> {
  const rect = cropRect(source.width, source.height, ratio, framing);
  const context = ImageManipulator.manipulate(source.uri);
  try {
    context.crop(rect);
    if (Math.max(rect.width, rect.height) > maxSide)
      context.resize(rect.width >= rect.height ? { width: maxSide } : { height: maxSide });
    const image = await context.renderAsync();
    try {
      for (const compress of [0.87, 0.72, 0.55, 0.42]) {
        const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress, base64: true });
        if (saved.base64 && saved.base64.length <= Math.floor(byteLimit / 3) * 4) return { ...saved, base64: saved.base64 };
      }
    } finally { image.release(); }
  } finally { context.release(); }
  throw new Error('图片压缩后仍超过大小限制，请换一张再试。');
}

async function normalizeSource(uri: string): Promise<CropSource> {
  const editor = ImageManipulator.manipulate(uri);
  try {
    const image = await editor.renderAsync();
    try {
      const longest = Math.max(image.width, image.height);
      if (longest <= 2400) return await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.94 });
      const resize = ImageManipulator.manipulate(image);
      try {
        resize.resize(image.width >= image.height ? { width: 2400 } : { height: 2400 });
        const sized = await resize.renderAsync();
        try { return await sized.saveAsync({ format: SaveFormat.JPEG, compress: 0.94 }); }
        finally { sized.release(); }
      } finally { resize.release(); }
    } finally { image.release(); }
  } finally { editor.release(); }
}

export function FullImageCrop({ source, ratio, round, initial = centered, revealFraction, onClose, onConfirm }: Props) {
  const { reduced } = useAppearance();
  const [decoded, setDecoded] = useState<CropSource>();
  const [failure, setFailure] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  useEffect(() => {
    let active = true;
    void normalizeSource(source.uri).then((result) => { if (active) setDecoded(result); })
      .catch(() => { if (active) setFailure('暂时无法读取这张照片，请返回重选。'); });
    return () => { active = false; };
  }, [source.uri]);
  const close = () => { if (!lock.current) onClose(); };
  async function confirm(frame: Framing) {
    if (lock.current || !decoded) return;
    lock.current = true; setBusy(true); setFailure('');
    try { await onConfirm(decoded, frame); }
    catch (problem) { setFailure(errorMessage(problem)); }
    finally { lock.current = false; setBusy(false); }
  }
  return <Modal presentationStyle="fullScreen" visible animationType={reduced ? 'none' : 'fade'} onRequestClose={close}>
    <GestureHandlerRootView style={local.root}>
      <SafeAreaView style={styles.grow} accessibilityViewIsModal>
        <View style={local.bar}>
          <IconButton label="返回" icon="chevron-back" color="#FFFFFF" disabled={busy} onPress={close} />
          <Text accessibilityRole="header" style={local.title}>移动和缩放</Text>
          <View style={local.spacer} />
        </View>
        {decoded ? <CropStage source={decoded} ratio={round ? 1 : ratio} round={round} revealFraction={revealFraction} initial={initial}
          confirm={confirm} failure={failure} busy={busy} /> : <View style={[styles.grow, local.loading]}>
          {failure ? <Notice>{failure}</Notice> : <Text style={local.title}>正在读取照片…</Text>}
        </View>}
      </SafeAreaView>
    </GestureHandlerRootView>
  </Modal>;
}

type StageProps = { source: CropSource; ratio: number; round?: boolean; initial: Framing; revealFraction?: number; confirm: (frame: Framing) => Promise<void>; busy: boolean; failure: string };
function CropStage(props: StageProps) {
  const { ratio, round, failure, busy, initial, confirm } = props;
  const [size, setSize] = useState({ width: 0, height: 0 });
  const frame = useRef(initial);
  const reader = useRef<(() => Framing) | undefined>(undefined);
  const width = Math.min(size.width * (round ? 0.78 : 0.91), size.height * 0.88 * ratio);
  const height = width / ratio;
  return <>
    <View style={local.stage} onLayout={({ nativeEvent: { layout } }) => {
      if (layout.width !== size.width || layout.height !== size.height) {
        if (reader.current) frame.current = reader.current();
        setSize({ width: layout.width, height: layout.height });
      }
    }}>
      {width > 0 && <CropCanvas key={size.width + ':' + size.height + ':' + ratio} {...props}
        width={width} height={height} stageWidth={size.width} stageHeight={size.height} initial={frame.current} reader={reader} />}
    </View>
    <View style={local.footer}>
      {!!failure && <Notice>{failure}</Notice>}
      <Text style={local.hint}>拖动构图 · 双指缩放{props.revealFraction ? ' · 下拉封面时显示上方区域' : ''}</Text>
      <Button variant="gradient" label={busy ? '处理中…' : '完成'} disabled={busy || width <= 0}
        onPress={() => void confirm(reader.current?.() ?? frame.current)} />
    </View>
  </>;
}

function bounded(value: number, edge: number) {
  'worklet';
  return Math.max(-edge, Math.min(edge, value));
}
function CropCanvas({ source, busy, round, initial, reader, revealFraction, width, height, stageWidth, stageHeight }: StageProps & {
  width: number; height: number; stageWidth: number; stageHeight: number; reader: { current?: () => Framing };
}) {
  const base = Math.max(width / source.width, height / source.height);
  const imageWidth = source.width * base;
  const imageHeight = source.height * base;
  const left = (stageWidth - width) / 2, top = (stageHeight - height) / 2;
  const cx = stageWidth / 2, cy = stageHeight / 2;
  const scale = useSharedValue(initial.zoom);
  const x = useSharedValue((0.5 - initial.x) * Math.max(0, imageWidth * initial.zoom - width));
  const y = useSharedValue((0.5 - initial.y) * Math.max(0, imageHeight * initial.zoom - height));
  const oldX = useSharedValue(0), oldY = useSharedValue(0), oldScale = useSharedValue(1);
  const oldFx = useSharedValue(0), oldFy = useSharedValue(0), pinching = useSharedValue(false);
  function update(nx: number, ny: number, zoom: number) {
    'worklet';
    scale.value = zoom;
    x.value = bounded(nx, Math.max(0, imageWidth * zoom - width) / 2);
    y.value = bounded(ny, Math.max(0, imageHeight * zoom - height) / 2);
  }
  reader.current = () => {
    const zoom = scale.value;
    const dx = Math.max(0, imageWidth * zoom - width);
    const dy = Math.max(0, imageHeight * zoom - height);
    return { zoom, x: dx > 0.0001 ? 0.5 - x.value / dx : 0.5, y: dy > 0.0001 ? 0.5 - y.value / dy : 0.5 };
  };
  const pan = Gesture.Pan().enabled(!busy).maxPointers(1).minDistance(1)
    .onStart(() => { if (!pinching.value) { oldX.value = x.value; oldY.value = y.value; } })
    .onUpdate((event) => { if (!pinching.value && event.numberOfPointers === 1) update(oldX.value + event.translationX, oldY.value + event.translationY, scale.value); });
  const pinch = Gesture.Pinch().enabled(!busy)
    .onStart((event) => {
      pinching.value = true; oldScale.value = scale.value; oldX.value = x.value; oldY.value = y.value;
      oldFx.value = event.focalX - cx; oldFy.value = event.focalY - cy;
    })
    .onUpdate((event) => {
      const zoom = Math.max(1, Math.min(6, oldScale.value * event.scale));
      const factor = zoom / oldScale.value;
      update(event.focalX - cx - (oldFx.value - oldX.value) * factor,
        event.focalY - cy - (oldFy.value - oldY.value) * factor, zoom);
    })
    .onFinalize(() => { 'worklet'; pinching.value = false; });
  const moving = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value }, { scale: scale.value }],
  }));
  const outline = round ? `M ${left} ${cy} a ${width / 2} ${height / 2} 0 1 0 ${width} 0 a ${width / 2} ${height / 2} 0 1 0 -${width} 0 z`
    : `M ${left} ${top} h ${width} v ${height} h -${width} z`;
  return <GestureDetector gesture={Gesture.Simultaneous(pan, pinch)}>
    <View style={StyleSheet.absoluteFill} accessible accessibilityRole="adjustable" accessibilityLabel="图片裁剪区域"
      accessibilityHint="单指拖动，双指缩放"
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={({ nativeEvent }) => {
        const zoom = Math.max(1, Math.min(6, scale.value + (nativeEvent.actionName === 'increment' ? 0.25 : -0.25)));
        update(x.value, y.value, zoom);
      }}>
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', width: imageWidth, height: imageHeight,
        left: cx - imageWidth / 2, top: cy - imageHeight / 2 }, moving]}>
        <Image source={{ uri: source.uri }} resizeMode="contain" fadeDuration={0} style={StyleSheet.absoluteFill} />
      </Animated.View>
      <Svg pointerEvents="none" width={stageWidth} height={stageHeight}>
        <Path d={`M 0 0 h ${stageWidth} v ${stageHeight} H 0 Z ${outline}`} fill="#000000A0" fillRule="evenodd" />
        <Path d={outline} stroke="#FFFFFFD9" strokeWidth={1.3} fill="none" />
        {!!revealFraction && <Path d={`M ${left} ${top + height * revealFraction} h ${width}`}
          stroke="#FFFFFFD9" strokeDasharray="6 4" strokeWidth={1.3} />}
      </Svg>
    </View>
  </GestureDetector>;
}

const local = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#080809' },
  stage: { flex: 1, overflow: 'hidden' },
  bar: { ...styles.row, justifyContent: 'space-between', paddingHorizontal: space.xs, minHeight: 52 },
  spacer: { width: 44 },
  title: { ...styles.strong, color: fixed.onLens },
  hint: { ...styles.small, color: '#D6D5D9', textAlign: 'center' },
  loading: { justifyContent: 'center', alignItems: 'center' },
  footer: { gap: space.xs, paddingHorizontal: space.md, paddingBottom: space.sm },
});
