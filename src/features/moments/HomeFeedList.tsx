import { useState } from 'react';
import { View, type FlatListProps } from 'react-native';
import { FlatList, GestureDetector, GestureHandlerRootView, usePanGesture } from 'react-native-gesture-handler';
import { cancelAnimation, useSharedValue, withSpring, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { useAppearance } from '../../components/appearance';
import type { Moment } from './model';

export function HomeFeedList({ reveal, reserve, onRefresh, refreshing, ...props }: FlatListProps<Moment> & {
  reveal: SharedValue<number>; reserve: number;
}) {
  const { reduced } = useAppearance();
  const [atTop, setAtTop] = useState(true);
  const initial = useSharedValue(0);
  const pan = usePanGesture({
    enabled: atTop,
    maxPointers: 1,
    activeOffsetY: 8,
    failOffsetY: -5,
    failOffsetX: [-12, 12],
    onActivate: () => {
      'worklet';
      cancelAnimation(reveal);
      initial.value = reveal.value;
    },
    onUpdate: (event) => {
      'worklet';
      const distance = Math.max(0, event.translationY - 8);
      reveal.value = Math.min(reserve, initial.value + reserve * (1 - Math.exp(-distance / (reserve * 1.25))));
    },
    onDeactivate: (event) => {
      'worklet';
      if (!event.canceled && !refreshing && onRefresh && reveal.value >= reserve * 0.68) scheduleOnRN(onRefresh);
      reveal.value = reduced ? 0 : withSpring(0, { stiffness: 250, damping: 32, overshootClamping: true });
    },
  });
  return <GestureHandlerRootView style={{ flex: 1 }}>
    <GestureDetector gesture={pan} touchAction="pan-y">
      <View style={{ flex: 1 }} collapsable={false}>
        <FlatList {...props} requireToFail={pan} bounces={false} overScrollMode="never" scrollEventThrottle={16}
          onScroll={({ nativeEvent }) => {
            const next = nativeEvent.contentOffset.y <= 1;
            if (next !== atTop) setAtTop(next);
          }} />
      </View>
    </GestureDetector>
  </GestureHandlerRootView>;
}
