import { LiquidSurface } from '../components/liquid-surface';
import { isLiquidGlass } from '../demo/mode';
import { router } from 'expo-router';
import { useRef, useState, type ComponentRef } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAppearance } from '../components/appearance';
import { GlassLayer } from '../components/material';
import { FontPreview, useFontSize } from '../components/Typography';
import { Notice, Screen } from '../components/ui';
import { fontSizes, readFontSize, type FontSize } from '../font-scale';
import { colors, radius, space, styles, type } from '../theme';

export default function FontSizeScreen() {
  const { size, save } = useFontSize();
  const { reduced } = useAppearance();
  const [preview, setPreview] = useState(size);
  const [width, setWidth] = useState(0);
  const [error, setError] = useState('');
  const position = useRef(new Animated.Value(size)).current;
  const track = useRef<ComponentRef<typeof View>>(null);
  const latest = useRef({ width, size, reduced, save });
  latest.current = { width, size, reduced, save };

  function settle(value: FontSize, persist = true) {
    setPreview(value);
    if (latest.current.reduced) position.setValue(value);
    else Animated.spring(position, { toValue: value, stiffness: 255, damping: 28, mass: 0.72, useNativeDriver: false }).start();
    if (persist) {
      setError('');
      void latest.current.save(value).catch(() => {
        setError('暂时无法保存字体大小，请重试。');
        settle(latest.current.size, false);
      });
    }
  }
  const startX = useRef(0);
  const offset = useRef(preview);
  const slider = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 4 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
    onPanResponderGrant: (event) => {
      startX.current = event.nativeEvent.pageX - event.nativeEvent.locationX;
      track.current?.measureInWindow((x) => { startX.current = x; });
      position.stopAnimation();
    },
    onPanResponderMove: (event) => {
      if (!latest.current.width) return;
      const value = Math.max(0, Math.min(3, (event.nativeEvent.pageX - startX.current - latest.current.width / 8) * 4 / latest.current.width));
      offset.current = readFontSize(Math.round(value));
      position.setValue(value);
      setPreview(offset.current);
    },
    onPanResponderRelease: () => settle(offset.current),
    onPanResponderTerminate: () => settle(latest.current.size, false),
  })).current;

  return <Screen title="字体大小" back={() => router.canGoBack() ? router.back() : router.replace('/me')}>
    <View ref={track} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={local.track} {...slider.panHandlers}>
      <GlassLayer roundness={radius.pill} />
      <Animated.View pointerEvents="none" style={[local.thumb, { width: Math.max(0, width / 4 - 8),
        transform: [{ translateX: Animated.multiply(position, width / 4) }] }]}>
        {isLiquidGlass ? <LiquidSurface finish="bubble" roundness={radius.pill} /> : <GlassLayer tone="control" roundness={radius.pill} />}
      </Animated.View>
      {fontSizes.map(({ label }, index) => <Pressable key={label} accessibilityRole="button"
        accessibilityLabel={label + '字号'} accessibilityState={{ selected: index === preview }}
        style={local.slot} onPress={() => settle(readFontSize(index))}><Text style={styles.strong}>{label}</Text></Pressable>)}
    </View>
    {!!error && <Notice>{error}</Notice>}
    <FontPreview size={preview}>
      <View style={local.preview}>
        <Text style={local.heading}>文字预览</Text>
        <Text style={styles.body}>周末见。选一家安静的小店，慢慢聊。</Text>
        <Text style={styles.muted}>字体大小会应用到聊天、动态和设置。</Text>
      </View>
    </FontPreview>
  </Screen>;
}

const local = StyleSheet.create({
  track: { ...styles.row, minHeight: 58, borderRadius: radius.pill, backgroundColor: colors.panel },
  thumb: { position: 'absolute', left: 4, top: 4, bottom: 4, borderRadius: radius.pill, overflow: 'hidden' },
  slot: { flex: 1, minHeight: 54, alignItems: 'center', justifyContent: 'center', paddingVertical: space.xxs },
  preview: { borderRadius: radius.surface, backgroundColor: colors.panel, padding: space.md, gap: space.sm },
  heading: { ...type.heading, color: colors.text },
});
