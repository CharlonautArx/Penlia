import { useMemo, useRef, useState, type ComponentRef } from 'react';
import { Image, Platform, View, type GestureResponderEvent, type ViewStyle } from 'react-native';

import { clamp, cropRect, type Framing } from './profile-crop';

type Point = { cx: number; cy: number; span: number; count: number };
export type CoverSource = { jpeg: string; width: number; height: number };
export function ProfileCropView({ source, ratio, frame, onFrame, onDrag }: {
  source: CoverSource; ratio: number; frame: Framing; onFrame: (next: Framing) => void; onDrag: (active: boolean) => void;
}) {
  const image = useMemo(() => ({ uri: 'data:image/jpeg;base64,' + source.jpeg }), [source.jpeg]);
  const [width, setWidth] = useState(0);
  const view = useRef<ComponentRef<typeof View>>(null);
  const origin = useRef({ x: 0, y: 0 });
  const previous = useRef<Point | null>(null);
  const current = useRef(frame);
  current.current = frame;
  const rect = cropRect(source.width, source.height, ratio, frame);
  const scale = width / rect.width;
  function move(event: GestureResponderEvent) {
    const [a, b] = event.nativeEvent.touches;
    if (!a || !width) return;
    const point = { cx: (b ? (a.pageX + b.pageX) / 2 : a.pageX) - origin.current.x,
      cy: (b ? (a.pageY + b.pageY) / 2 : a.pageY) - origin.current.y,
      count: b ? 2 : 1, span: b ? Math.hypot(a.pageX-b.pageX, a.pageY-b.pageY) : 0 };
    const old = previous.current;
    previous.current = point;
    if (!old || old.count !== point.count) return;
    const start = cropRect(source.width, source.height, ratio, current.current);
    const zoom = clamp(current.current.zoom * (old.span > 0 ? point.span / old.span : 1), 1, 6);
    const next = cropRect(source.width, source.height, ratio, { ...current.current, zoom });
    const x = start.originX + (old.cx * start.width - point.cx * next.width) / width;
    const y = start.originY + (old.cy * start.width - point.cy * next.width) / width;
    current.current = { x: clamp(x / Math.max(1, source.width-next.width),0,1),
      y: clamp(y / Math.max(1, source.height-next.height),0,1), zoom };
    onFrame(current.current);
  }
  function end() { previous.current = null; onDrag(false); }
  return <View ref={view} accessible accessibilityRole="adjustable" accessibilityLabel="主页背景裁切框"
    accessibilityHint="拖动构图，双指缩放" accessibilityValue={{ min: 1, max: 6, now: frame.zoom }}
    accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
    onAccessibilityAction={({ nativeEvent }) => {
      const change = nativeEvent.actionName === 'increment' ? 0.25 : -0.25;
      onFrame({ ...frame, zoom: clamp(frame.zoom + change, 1, 6) });
    }} onLayout={e => setWidth(e.nativeEvent.layout.width)}
    style={[{ aspectRatio: ratio, overflow: 'hidden' }, Platform.OS === 'web' && { touchAction: 'none' } as ViewStyle]}
    onStartShouldSetResponder={() => true} onResponderGrant={e => {
      previous.current = null; view.current?.measureInWindow((x,y) => { origin.current = {x,y}; });
      onDrag(true); move(e);
    }} onResponderStart={e => { previous.current = null; move(e); }}
    onResponderMove={move} onResponderEnd={() => { previous.current = null; }}
    onResponderTerminationRequest={() => false} onResponderRelease={end} onResponderTerminate={end}>
    {width > 0 && <Image pointerEvents="none" source={image}
      fadeDuration={0} resizeMode="stretch" style={{ position: 'absolute', width: source.width*scale,
        height: source.height*scale, left: -rect.originX*scale, top: -rect.originY*scale }} />}
  </View>;
}
