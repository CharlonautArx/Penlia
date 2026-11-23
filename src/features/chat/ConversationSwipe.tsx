import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation, LinearTransition, useAnimatedReaction, useAnimatedStyle, useSharedValue, withSpring, type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { useAppearance } from '../../components/appearance';
import { colors, space, type, weight } from '../../theme';

export type ConversationAction = 'pin' | 'unread' | 'hide';
const width = 222;
const rowTransition = LinearTransition.duration(200);
const spring = { stiffness: 310, damping: 32, mass: 0.9, overshootClamping: true };
const actionColors = {
  pin: { color: '#FFD4C4', shadow: '#704C40D0', width: 70 },
  unread: { color: '#BBD8FF', shadow: '#3B5370D0', width: 82 },
  hide: { color: '#800020', shadow: 'transparent', width: 70 },
};

export function ConversationSwipe({ id, owner, pinned, unread, busy, onAction, children }: {
  id: string; owner: SharedValue<string | null>; pinned: boolean; unread: boolean; busy: boolean;
  onAction: (action: ConversationAction) => void; children: ReactNode;
}) {
  const { reduced } = useAppearance();
  const travel = useSharedValue(0);
  const start = useSharedValue(0);
  const [ready, setReady] = useState(false);

  function settle(open: boolean) {
    'worklet';
    if (!open) scheduleOnRN(setReady, false);
    const destination = open ? width : 0;
    if (reduced) {
      travel.value = destination;
      if (open) scheduleOnRN(setReady, true);
    } else {
      travel.value = withSpring(destination, spring, (finished) => {
        if (finished && open && owner.value === id) scheduleOnRN(setReady, true);
      });
    }
  }

  useAnimatedReaction(() => owner.value === id, (active, previous) => {
    if (!active && previous) settle(false);
  }, [id, reduced]);

  const swipe = usePanGesture({
    maxPointers: 1,
    activeOffsetX: [-11, 11],
    failOffsetY: [-8, 8],
    onActivate: () => {
      'worklet';
      owner.value = id;
      cancelAnimation(travel);
      start.value = travel.value;
      scheduleOnRN(setReady, false);
    },
    onUpdate: (event) => {
      'worklet';
      if (owner.value === id) travel.value = Math.max(0, Math.min(width, start.value - event.translationX));
    },
    onDeactivate: (event) => {
      'worklet';
      const projected = travel.value - 0.12 * event.velocityX;
      const wasOpen = start.value > width / 2;
      const open = owner.value === id && (event.canceled
        ? wasOpen
        : travel.value > 26 && projected >= width * (wasOpen ? 0.68 : 0.40));
      if (owner.value === id && !open) owner.value = null;
      settle(open);
    },
  });
  const foreground = useAnimatedStyle(() => ({ transform: [{ translateX: -travel.value }] }));
  const actions = [
    ['pin', pinned ? '取消置顶' : '置顶'],
    ['unread', unread ? '标为已读' : '标为未读'],
    ['hide', '不显示'],
  ] as const;

  return <Animated.View layout={reduced ? undefined : rowTransition} style={local.row}>
    <View style={local.actions} pointerEvents={ready && !busy ? 'auto' : 'none'}
      aria-hidden={!ready} importantForAccessibility={ready ? 'auto' : 'no-hide-descendants'}>
      {actions.map(([action, label]) => {
        const ink = actionColors[action];
        return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: busy }}
          key={action} disabled={busy} onPress={() => { if (owner.value === id && ready) onAction(action); }}
          style={({ pressed }) => [local.action, { width: ink.width }, pressed && local.pressed]}>
          <Text style={[local.label, { color: ink.color, textShadowColor: ink.shadow }]}>{label}</Text>
        </Pressable>;
      })}
    </View>
    <GestureDetector gesture={swipe} touchAction="pan-y">
      <Animated.View collapsable={false} style={[local.foreground, foreground]}>{children}</Animated.View>
    </GestureDetector>
  </Animated.View>;
}

const local = StyleSheet.create({
  row: { overflow: 'hidden', backgroundColor: '#FFFFFF' },
  foreground: { backgroundColor: colors.panel },
  actions: { position: 'absolute', right: 0, top: 0, bottom: 0, flexDirection: 'row', backgroundColor: '#FFFFFF' },
  action: { justifyContent: 'center', alignItems: 'center', paddingHorizontal: space.xxs,
    borderLeftWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#EEE9EB' },
  label: { ...type.control, fontWeight: weight.semibold, textAlign: 'center',
    textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 1.1 },
  pressed: { backgroundColor: '#F7F6F7' },
});
