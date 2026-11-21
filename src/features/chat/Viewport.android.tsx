import { requireNativeView } from 'expo';
import { useState, type ReactNode } from 'react';
import { StyleSheet, View, type NativeSyntheticEvent, type ViewProps } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '../../theme';
import { chatLayout } from './ui';

type ImeOverlap = { height: number; visible: boolean };
const ImeProbe = requireNativeView<ViewProps & {
  onOverlap: (event: NativeSyntheticEvent<ImeOverlap>) => void;
}>('PenliaChatInsets');

export function ChatViewport({ children }: { children: ReactNode }) {
  const { bottom } = useSafeAreaInsets();
  const [ime, setIme] = useState<ImeOverlap>({ height: 0, visible: false });
  return <SafeAreaView style={local.safe} edges={['top', 'left', 'right']}>
    <View style={local.frame}>
      <View style={[chatLayout.page, { paddingBottom: ime.visible ? ime.height : bottom }]}>
        {children}
      </View>
      <View style={StyleSheet.absoluteFill} pointerEvents="none" importantForAccessibility="no-hide-descendants">
        <ImeProbe style={StyleSheet.absoluteFill} onOverlap={(event) => setIme(event.nativeEvent)} />
      </View>
    </View>
  </SafeAreaView>;
}

const local = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.panel },
  frame: { flex: 1 },
});
