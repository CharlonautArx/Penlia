import { useDockClearance } from '../../components/liquid-dock';
import { useState, type ComponentProps, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { GestureDetector, ScrollView, usePanGesture } from 'react-native-gesture-handler';
import Animated, { cancelAnimation, interpolate, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { useAppearance } from '../../components/appearance';
import { GlassLayer } from '../../components/material';
import { colors, contentWidth, radius, space, styles, touch, type } from '../../theme';

const labels = ['全部', '分组', '群聊'] as const;
const spring = { stiffness: 290, damping: 32, mass: 0.85, overshootClamping: true };
const columnGap = 4;

export type DirectoryPan = ReturnType<typeof usePanGesture>;

export function DirectoryPager({ children }: {
  children: (pan: DirectoryPan) => readonly [ReactNode, ReactNode, ReactNode];
}) {
  const { width: viewport, fontScale } = useWindowDimensions();
  const columnWidth = Math.min(Math.floor((viewport - 2 * space.md - 2 * columnGap) / 3),
    Math.round(40 + 28 * Math.max(1, fontScale)));
  const { reduced } = useAppearance();
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState(0);
  const position = useSharedValue(0);
  const target = useSharedValue(0);
  const start = useSharedValue(0);

  function select(page: number) {
    target.value = page;
    setActive(page);
    position.value = reduced ? page : withSpring(page, spring);
  }

  const pan = usePanGesture({
    enabled: width > 0,
    maxPointers: 1,
    activeOffsetX: [-12, 12],
    failOffsetY: [-10, 10],
    onActivate: () => {
      'worklet';
      cancelAnimation(position);
      start.value = position.value;
    },
    onUpdate: (event) => {
      'worklet';
      const next = start.value - event.translationX / width;
      const edge = Math.max(0, Math.min(labels.length - 1, next));
      const overflow = next - edge;
      position.value = edge + overflow * 0.24 / (1 + Math.abs(overflow) * 2);
    },
    onDeactivate: (event) => {
      'worklet';
      const current = target.value;
      const distance = -event.translationX;
      const velocity = -event.velocityX;
      const projected = distance + 0.16 * velocity;
      const advances = Math.abs(distance) >= 16 && Math.abs(projected) > Math.min(width * 0.29, 128);
      const next = event.canceled ? current : Math.max(0, Math.min(labels.length - 1,
        current + (advances ? Math.sign(projected) : 0)));
      target.value = next;
      position.value = reduced ? next : withSpring(next, {
        ...spring, velocity: Math.max(-4, Math.min(4, velocity / width)),
      });
      if (next !== current) scheduleOnRN(setActive, next);
    },
  });

  const track = useAnimatedStyle(() => ({ transform: [{ translateX: -position.value * width }] }));
  const slider = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(position.value, [0, 2], [0, 2 * (columnWidth + columnGap)], 'clamp') }],
  }));

  return <>
    <View style={local.tabBar} accessibilityLabel="好友浏览方式">
      <Animated.View pointerEvents="none" style={[local.capsule, { width: columnWidth }, slider]}>
        <GlassLayer tone="control" roundness={radius.pill} />
      </Animated.View>
      {labels.map((label, index) => <Pressable key={label} accessibilityRole="tab"
        accessibilityLabel={label} aria-selected={active === index} onPress={() => select(index)}
        style={({ pressed }) => [local.tab, { width: columnWidth }, pressed && local.pressed]}>
        <Text style={active === index ? local.selected : styles.muted}>{label}</Text>
      </Pressable>)}
    </View>
    <GestureDetector gesture={pan} touchAction="pan-y">
      <View collapsable={false} style={local.viewport}
        onLayout={({ nativeEvent }) => setWidth(nativeEvent.layout.width)}>
        {width > 0 && <Animated.View style={[local.track, { width: width * labels.length }, track]}>
          {children(pan).map((pane, index) => <View key={labels[index]} style={{ width, height: '100%' }}
            pointerEvents={active === index ? 'auto' : 'none'} aria-hidden={active !== index}
            importantForAccessibility={active === index ? 'auto' : 'no-hide-descendants'}>{pane}</View>)}
        </Animated.View>}
      </View>
    </GestureDetector>
  </>;
}

export function DirectoryScroll({ pan, contentContainerStyle, ...props }: ComponentProps<typeof ScrollView> & { pan: DirectoryPan }) {
  const clearance = useDockClearance();
  return <ScrollView {...props} requireToFail={pan} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
    contentContainerStyle={[local.list, contentContainerStyle, !!clearance && { paddingBottom: space.xl + clearance }]} />;
}

const local = StyleSheet.create({
  tabBar: { position: 'relative', flexDirection: 'row', alignItems: 'center', marginHorizontal: space.md,
    gap: columnGap, marginTop: space.xxs, paddingBottom: space.xxs,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  capsule: { position: 'absolute', top: 5, left: 0, bottom: 9, borderRadius: radius.pill },
  tab: { minHeight: touch, alignItems: 'center', justifyContent: 'center', paddingVertical: space.xxs },
  selected: { ...type.control, color: colors.ink },
  pressed: { opacity: 0.72 },
  viewport: { flex: 1, overflow: 'hidden', backgroundColor: colors.panel },
  track: { flex: 1, flexDirection: 'row' },
  list: { width: '100%', maxWidth: contentWidth, alignSelf: 'center', flexGrow: 1, paddingBottom: space.xl },
});
