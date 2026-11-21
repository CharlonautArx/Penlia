import { useFocusEffect } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '../../theme';
import { remainingImeInset } from './ime';
import { chatLayout } from './ui';

export function ChatViewport({ children }: { children: ReactNode }) {
  if (Platform.OS === 'android') return <AndroidChatViewport>{children}</AndroidChatViewport>;
  return <SafeAreaView style={local.safe}>
    <KeyboardAvoidingView style={chatLayout.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {children}
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

function AndroidChatViewport({ children }: { children: ReactNode }) {
  const { bottom } = useSafeAreaInsets();
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [viewport, setViewport] = useState({ width: 0, height: 0, restingHeight: 0 });

  useFocusEffect(useCallback(() => {
    setKeyboardHeight(Keyboard.metrics()?.height ?? 0);
    const show = Keyboard.addListener('keyboardDidShow', (event) => setKeyboardHeight(event.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, []));

  return <SafeAreaView style={local.safe} edges={['top', 'left', 'right']}>
    <View style={local.frame} onLayout={({ nativeEvent: { layout: { width, height } } }) => {
      // Resize can happen before the IME event arrives. Keep the unobstructed height for that width.
      setViewport((previous) => previous.width === width && previous.height === height ? previous : {
        width, height, restingHeight: width === previous.width ? Math.max(previous.restingHeight, height) : height,
      });
    }}>
      <View style={[chatLayout.page, {
        paddingBottom: remainingImeInset(keyboardHeight, bottom, viewport.restingHeight, viewport.height),
      }]}>
        {children}
      </View>
    </View>
  </SafeAreaView>;
}

const local = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.panel },
  frame: { flex: 1 },
});
