import { View, type FlatListProps } from 'react-native';
import { FlatList, GestureDetector, GestureHandlerRootView, GestureStateManager, usePanGesture } from 'react-native-gesture-handler';
import { cancelAnimation, useSharedValue, withSpring, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { useAppearance } from '../../components/appearance';
import type { Moment } from './model';

export function HomeFeedList({ reveal, reserve, onRefresh, refreshing, ...props }: FlatListProps<Moment> & {
  reveal: SharedValue<number>; reserve: number;
}) {
  const { reduced } = useAppearance();
  const scrollY = useSharedValue(0);
  const start = useSharedValue({ x: 0, y: 0 });
  const initial = useSharedValue(0);
  const active = useSharedValue(false);
  const pan = usePanGesture({
    manualActivation: true,
    onTouchesDown: (event) => {
      'worklet';
      const finger = event.allTouches[0];
      if (!finger || event.numberOfTouches !== 1 || scrollY.value > 1) {
        GestureStateManager.fail(event.handlerTag);
        return;
      }
      start.value = { x: finger.absoluteX, y: finger.absoluteY };
    },
    onTouchesMove: (event) => {
      'worklet';
      if (active.value) return;
      const finger = event.allTouches[0];
      if (!finger) return;
      const dy = finger.absoluteY - start.value.y;
      const dx = Math.abs(finger.absoluteX - start.value.x);
      if (dy < -5 || dx > Math.max(8, dy) || event.numberOfTouches !== 1) GestureStateManager.fail(event.handlerTag);
      else if (dy > 8) GestureStateManager.activate(event.handlerTag);
    },
    onActivate: () => {
      'worklet';
      cancelAnimation(reveal);
      initial.value = reveal.value;
      active.value = true;
    },
    onUpdate: (event) => {
      'worklet';
      const distance = Math.max(0, event.absoluteY - start.value.y - 8);
      reveal.value = Math.min(reserve, initial.value + reserve * (1 - Math.exp(-distance / (reserve * 1.25))));
    },
    onDeactivate: (event) => {
      'worklet';
      if (!event.canceled && !refreshing && onRefresh && reveal.value >= reserve * 0.68) scheduleOnRN(onRefresh);
      reveal.value = reduced ? 0 : withSpring(0, { stiffness: 250, damping: 32, overshootClamping: true });
      active.value = false;
    },
  });
  return <GestureHandlerRootView style={{ flex: 1 }}>
    <GestureDetector gesture={pan} touchAction="pan-y">
      <View style={{ flex: 1 }} collapsable={false}>
        <FlatList {...props} requireToFail={pan} bounces={false} overScrollMode="never" scrollEventThrottle={16}
          onScroll={({ nativeEvent }) => { scrollY.value = nativeEvent.contentOffset.y; }} />
      </View>
    </GestureDetector>
  </GestureHandlerRootView>;
}
