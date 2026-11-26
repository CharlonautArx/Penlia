import { type ComponentRef, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View, type LayoutRectangle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useAppearance } from '../../components/appearance';
import { GlassLayer } from '../../components/material';
import { colors, radius, styles } from '../../theme';

export function FavoriteSegments<T extends string>({ labels, value, change, swipe = false, label }:
  { labels: Record<T, string>; value: T; change: (value: T) => void; swipe?: boolean; label: string }) {
  const values = Object.keys(labels) as T[];
  const { reduced } = useAppearance();
  const [positions, setPositions] = useState<Partial<Record<T, LayoutRectangle>>>({});
  const [viewport, setViewport] = useState(0);
  const [trackWidth, setTrackWidth] = useState(0);
  const x = useRef(new Animated.Value(0)).current;
  const width = useRef(new Animated.Value(0)).current;
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const selected = positions[value];

  useEffect(() => {
    if (!selected) return;
    if (reduced) {
      x.setValue(selected.x);
      width.setValue(selected.width);
    } else {
      const movement = Animated.parallel([
        Animated.timing(x, { toValue: selected.x, duration: 205, useNativeDriver: false }),
        Animated.timing(width, { toValue: selected.width, duration: 205, useNativeDriver: false }),
      ]);
      movement.start();
      return () => movement.stop();
    }
  }, [selected, reduced, x, width]);

  useEffect(() => {
    if (selected) scroll.current?.scrollTo({ x: Math.max(0, selected.x - 90), animated: !reduced });
  }, [selected, reduced]);

  const gesture = Gesture.Pan().enabled(swipe || (viewport > 0 && trackWidth <= viewport + 1)).activeOffsetX([-16, 16]).failOffsetY([-12, 12]).runOnJS(true)
    .onEnd(({ translationX, velocityX }) => {
      if (Math.abs(translationX) < 24 && Math.abs(velocityX) < 380) return;
      const next = values[values.indexOf(value) + (translationX < 0 ? 1 : -1)];
      if (next) change(next);
    });
  const track = <View accessibilityRole="tablist" accessibilityLabel={label} onLayout={({ nativeEvent }) => setTrackWidth(nativeEvent.layout.width)}
    style={[local.track, { minWidth: viewport }]} >
    {selected && <Animated.View pointerEvents="none" style={[local.indicator, { width, transform: [{ translateX: x }] }]}>
      <GlassLayer tone="control" roundness={radius.pill} />
    </Animated.View>}
    {values.map((item) => <Pressable key={item} accessibilityRole="tab" accessibilityState={{ selected: item === value }}
      onPress={() => change(item)} onLayout={({ nativeEvent }) => {
        const bounds = nativeEvent.layout;
        setPositions((old) => old[item]?.x === bounds.x && old[item]?.width === bounds.width ? old : { ...old, [item]: bounds });
      }} style={({ pressed }) => [local.tab, pressed && local.pressed]}>
      <Text style={[local.label, item === value && local.selected]}>{labels[item]}</Text>
    </Pressable>)}
  </View>;
  if (swipe) return <GestureDetector gesture={gesture}><View style={local.full}>{track}</View></GestureDetector>;
  return <GestureDetector gesture={gesture}>
    <View style={local.clip} onLayout={({ nativeEvent }) => setViewport(nativeEvent.layout.width)}>
    <ScrollView horizontal keyboardShouldPersistTaps="handled" ref={scroll} showsHorizontalScrollIndicator={false}
      contentContainerStyle={local.scroll}>{track}</ScrollView>
    </View>
  </GestureDetector>;
}

const local = StyleSheet.create({
  track: { flexDirection: 'row', flexGrow: 1, padding: 3, backgroundColor: colors.search, borderRadius: radius.pill },
  full: { flexDirection: 'row' },
  clip: { borderRadius: radius.pill, overflow: 'hidden' },
  scroll: { flexGrow: 1 },
  indicator: { position: 'absolute', left: 0, top: 3, bottom: 3, borderRadius: radius.pill,
    backgroundColor: colors.panel, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  tab: { flexGrow: 1, minHeight: 44, paddingHorizontal: 11, paddingVertical: 7, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.66 },
  label: { ...styles.small, color: colors.quiet, textAlign: 'center' },
  selected: { color: colors.ink, fontWeight: '600' },
});
