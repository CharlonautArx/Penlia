import { requireNativeView } from 'expo';
import { useState, type ReactNode } from 'react';
import { StyleSheet, View, type NativeSyntheticEvent, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '../../theme';
import { chatLayout } from './ui';

type ImeOverlap = { height: number; visible: boolean };
const ImeProbe = requireNativeView<ViewProps & {
  onOverlap: (event: NativeSyntheticEvent<ImeOverlap>) => void;
}>('PenliaChatInsets');

export function KeyboardInsets({ children, bottom = 0, style }: {
  children: ReactNode; bottom?: number; style?: StyleProp<ViewStyle>;
}) {
  const [ime, setIme] = useState<ImeOverlap>({ height: 0, visible: false });
  return <View style={local.frame}>
    <View style={[local.frame, style, { paddingBottom: ime.visible ? ime.height : bottom }]}>
      {children}
    </View>
    <View style={StyleSheet.absoluteFill} pointerEvents="none" importantForAccessibility="no-hide-descendants">
      <ImeProbe style={StyleSheet.absoluteFill} onOverlap={(event) => setIme(event.nativeEvent)} />
    </View>
  </View>;
}

export function ChatViewport({ children, floatingChrome }: { children: ReactNode; floatingChrome?: boolean }) {
  const { bottom } = useSafeAreaInsets();
  return <SafeAreaView style={[local.safe, floatingChrome && local.floating]} edges={['top', 'left', 'right']}>
    <KeyboardInsets bottom={bottom} style={chatLayout.page}>{children}</KeyboardInsets>
  </SafeAreaView>;
}

const local = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.panel },
  floating: { backgroundColor: colors.backdrop },
  frame: { flex: 1 },
});
