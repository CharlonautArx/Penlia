import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { fixed, radius, space, styles, touch, type } from '../theme';
import { useAppearance } from './appearance';
import { Icon } from './ui';
import { LiquidSurface } from './liquid-surface';
import { isLiquidGlass } from '../demo/mode';

export function MediaViewer({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const { reduced } = useAppearance();
  return <Modal visible animationType={reduced ? 'none' : 'fade'} presentationStyle="fullScreen" onRequestClose={onClose}>
    <SafeAreaView style={local.surface} accessibilityViewIsModal>
      <View style={local.bar}>
        <Pressable accessibilityRole="button" accessibilityLabel="关闭预览" onPress={onClose}
          style={({ pressed }) => [local.close, pressed && local.pressed]}>
          {isLiquidGlass && <LiquidSurface finish="quiet" roundness={radius.pill} rimOnly />}
          <Icon name="close" color={fixed.onLens} size={23} />
        </Pressable>
        <Text accessibilityRole="header" style={local.title}>{title}</Text>
        <View style={local.spacer} />
      </View>
      <View style={local.stage}>{children}</View>
    </SafeAreaView>
  </Modal>;
}

export function MediaViewerMessage({ children, busy = false, retry }: {
  children: string; busy?: boolean; retry?: () => void;
}) {
  return <View style={local.message}>
    <Text accessibilityRole={busy ? 'progressbar' : undefined} accessibilityLiveRegion="polite"
      style={local.note}>{children}</Text>
    {retry && <Pressable accessibilityRole="button" onPress={retry}
      style={({ pressed }) => [local.retry, pressed && local.pressed]}><Text style={local.title}>重试</Text></Pressable>}
  </View>;
}

export const viewerStyles = StyleSheet.create({
  photo: { width: '100%', flex: 1, minHeight: 0, maxWidth: 1024, alignSelf: 'center' },
});

const local = StyleSheet.create({
  surface: { flex: 1, backgroundColor: fixed.lens },
  bar: { ...styles.row, justifyContent: 'space-between', paddingHorizontal: space.xs },
  title: { ...type.emphasis, color: fixed.onLens, textAlign: 'center' },
  close: { width: touch, height: touch, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.65 },
  spacer: { width: touch },
  stage: { flex: 1, minHeight: 0, justifyContent: 'center', alignItems: 'stretch' },
  message: { alignSelf: 'center', padding: space.xl, gap: space.md, alignItems: 'center' },
  note: { ...type.support, color: fixed.onLens, textAlign: 'center' },
  retry: { paddingHorizontal: space.md, paddingVertical: space.xs, borderRadius: radius.control,
    backgroundColor: '#FFFFFF22', minHeight: touch, justifyContent: 'center' },
});
