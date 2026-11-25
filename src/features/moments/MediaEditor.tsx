import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type ScrollViewProps } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  measure, scrollTo, useAnimatedRef, useAnimatedScrollHandler, useAnimatedStyle, useFrameCallback, useSharedValue,
  withSpring, type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useAppearance } from '../../components/appearance';
import { Icon } from '../../components/ui';
import { colors, radius } from '../../theme';
import { movePhoto, photoDropIndex, photoEdgeSpeed, photoShiftedIndex } from './photo-grid';

const gap = 6;
const spring = { stiffness: 330, damping: 30, mass: 0.75, overshootClamping: true };
const emptyPress = () => {};

export function useMediaEditorScroll() {
  const ref = useAnimatedRef<Animated.ScrollView>();
  const offset = useSharedValue(0);
  const viewport = useSharedValue({ height: 0, top: 0, content: 0 });
  const [dragging, setDragging] = useState(false);
  const onScroll = useAnimatedScrollHandler(({ contentOffset }) => { offset.value = contentOffset.y; });
  return {
    ref, offset, viewport, setDragging,
    render: (props: ScrollViewProps) => <Animated.ScrollView {...props} ref={ref} scrollEnabled={!dragging}
      onScroll={onScroll} scrollEventThrottle={16}
      onLayout={({ nativeEvent }) => { viewport.modify((value) => ({ ...value, height: nativeEvent.layout.height })); }}
      onContentSizeChange={(_, content) => { viewport.modify((value) => ({ ...value, content })); }} />,
  };
}

type EditorScroll = ReturnType<typeof useMediaEditorScroll>;
type Drag = { id: string; from: number; to: number; x: number; y: number; dx: number; absoluteY: number; scroll: number };
type GridState = { order: SharedValue<readonly string[]>; drag: SharedValue<Drag | null>; scroll: EditorScroll };
type Item = { id: string; mime: string };

function updateDrag(current: Drag, dx: number, absoluteY: number, offset: number, step: number, count: number): Drag {
  'worklet';
  return { ...current, dx, absoluteY, to: photoDropIndex(current.from, dx, absoluteY - current.y + offset - current.scroll, step, count) };
}

export function MediaEditor<T extends Item>({ items, busy, scroll, add, open, remove, move, tile }: {
  items: readonly T[]; busy: boolean; scroll: EditorScroll; add?: () => void; open: (item: T) => void;
  remove: (item: T) => void; move: (id: string, to: number) => void; tile: (item: T) => ReactNode;
}) {
  const [width, setWidth] = useState(0);
  const size = Math.max(0, (width - gap * 2) / 3);
  const step = size + gap;
  const { reduced } = useAppearance();
  const order = useSharedValue<readonly string[]>(items.map(({ id }) => id));
  const drag = useSharedValue<Drag | null>(null);
  const { ref, offset, viewport } = scroll;
  useEffect(() => { order.value = items.map(({ id }) => id); }, [items, order]);
  useFrameCallback(({ timeSincePreviousFrame }) => {
    'worklet';
    const active = drag.value;
    if (!active || !timeSincePreviousFrame) return;
    const { top, height, content } = viewport.value;
    const velocity = photoEdgeSpeed(active.absoluteY, top, height);
    if (!velocity) return;
    const next = Math.max(0, Math.min(Math.max(0, content - height),
      offset.value + velocity * Math.min(timeSincePreviousFrame, 32) / 1000));
    if (Math.abs(next - offset.value) < 0.2) return;
    scrollTo(ref, 0, next, false);
    offset.value = next;
    drag.value = updateDrag(active, active.dx, active.absoluteY, next, step, order.value.length);
  });
  const count = items.length + Number(!!add);
  const height = Math.max(0, Math.ceil(count / 3) * step - gap);
  return <View onLayout={({ nativeEvent }) => setWidth(nativeEvent.layout.width)} style={{ height }}>
    {!!size && items.map((item, index) => <EditorTile key={item.id} item={item} index={index}
      count={items.length} size={size} busy={busy} reduced={reduced} open={() => open(item)} remove={() => remove(item)}
      move={move} state={{ order, drag, scroll }}>{tile(item)}</EditorTile>)}
    {!!size && add && <Pressable accessibilityRole="button" accessibilityLabel="选择照片" disabled={busy} onPress={add}
      style={({ pressed }) => [local.add, { width: size, height: size, left: items.length % 3 * step,
        top: Math.floor(items.length / 3) * step }, pressed && local.pressed]}>
      <Icon name="add-outline" size={26} color={colors.quiet} />
    </Pressable>}
  </View>;
}

function EditorTile({ item, index, count, size, busy, reduced, state, move, open, remove, children }: {
  item: Item; index: number; count: number; size: number; busy: boolean; reduced: boolean; state: GridState;
  move: (id: string, to: number) => void; open: () => void; remove: () => void; children: ReactNode;
}) {
  const { order, drag, scroll: { ref, offset, viewport, setDragging } } = state;
  const id = item.id;
  const step = size + gap;
  const pan = usePanGesture({
    enabled: count > 1 && !busy, activateAfterLongPress: 255, maxPointers: 1, shouldCancelWhenOutside: false,
    onActivate: ({ absoluteX, absoluteY }) => {
      'worklet';
      const from = order.value.indexOf(id);
      if (from < 0 || drag.value) return;
      const bounds = measure(ref);
      if (bounds) viewport.value = { ...viewport.value, top: bounds.pageY, height: bounds.height };
      drag.value = { id, from, to: from, x: absoluteX, y: absoluteY, dx: 0, absoluteY, scroll: offset.value };
      scheduleOnRN(setDragging, true);
    },
    onUpdate: ({ absoluteX, absoluteY }) => {
      'worklet';
      const active = drag.value;
      if (active?.id === id) drag.value = updateDrag(active, absoluteX - active.x, absoluteY, offset.value, step, order.value.length);
    },
    onDeactivate: ({ canceled }) => {
      'worklet';
      const active = drag.value;
      if (active?.id !== id) return;
      if (!canceled && active.from !== active.to) {
        order.value = movePhoto(order.value, active.from, active.to);
        scheduleOnRN(move, id, active.to);
      }
      drag.value = null;
      scheduleOnRN(setDragging, false);
    },
  });
  const motion = useAnimatedStyle(() => {
    const active = drag.value;
    const held = active?.id === id;
    const index = Math.max(0, order.value.indexOf(id));
    const slot = active ? photoShiftedIndex(index, active.from, active.to) : index;
    const x = slot % 3 * step, y = Math.floor(slot / 3) * step;
    return { zIndex: held ? 3 : 1, elevation: held && !reduced ? 5 : 0, transform: [
      { translateX: held ? x + active.dx : reduced ? x : withSpring(x, spring) },
      { translateY: held ? y + active.absoluteY - active.y + offset.value - active.scroll : reduced ? y : withSpring(y, spring) },
      { scale: reduced ? 1 : withSpring(held ? 1.07 : 1, spring) },
    ] };
  });
  const number = index + 1;
  return <Animated.View style={[local.tile, { width: size, height: size }, motion]}>
    <GestureDetector gesture={pan} touchAction="pan-y" userSelect="none">
      <Pressable accessibilityRole="button" accessibilityLabel={'预览附件 ' + number} disabled={busy}
        onPress={open} onLongPress={count > 1 ? emptyPress : undefined} delayLongPress={255}
        accessibilityActions={[
          ...(index > 0 ? [{ name: 'earlier', label: '向前移动照片' }] : []),
          ...(number < count ? [{ name: 'later', label: '向后移动照片' }] : []),
        ]}
        onAccessibilityAction={({ nativeEvent }) => {
          if (busy) return;
          if (nativeEvent.actionName === 'earlier') move(id, index - 1);
          if (nativeEvent.actionName === 'later') move(id, index + 1);
        }}
        style={({ pressed }) => [local.photo, pressed && local.pressed]}>
        {children}
      </Pressable>
    </GestureDetector>
    <Pressable accessibilityRole="button" accessibilityLabel={'移除附件 ' + number} disabled={busy} hitSlop={7} onPress={remove}
      style={local.remove}>
      <Icon name="close" size={13} color="#FFFFFF" />
    </Pressable>
  </Animated.View>;
}

const local = StyleSheet.create({
  tile: { position: 'absolute', top: 0, left: 0, borderRadius: radius.small },
  photo: { flex: 1, borderRadius: radius.small, overflow: 'hidden', backgroundColor: colors.search,
    justifyContent: 'center', alignItems: 'center' },
  add: { position: 'absolute', borderRadius: radius.small, backgroundColor: colors.search,
    justifyContent: 'center', alignItems: 'center' },
  remove: { position: 'absolute', right: 4, top: 4, width: 23, height: 23, borderRadius: 12,
    backgroundColor: '#24252B99', justifyContent: 'center', alignItems: 'center' },
  pressed: { opacity: 0.84 },
});
