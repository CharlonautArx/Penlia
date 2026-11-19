import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps, ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { isUiDemo } from '../demo/mode';
import { colors, styles } from '../theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export function Screen({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <SafeAreaView style={ui.safe} edges={['top', 'left', 'right']}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={ui.screen}>
        <View style={ui.heading}>
          <View style={ui.brandRow}>
            <Text style={ui.brand}>朋聊 · Penlia</Text>
            <DemoLabel />
          </View>
          <Text accessibilityRole="header" style={ui.title}>{title}</Text>
          <Text style={styles.muted}>{subtitle}</Text>
        </View>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function DemoLabel() {
  return isUiDemo ? <Text style={ui.demoLabel}>演示数据</Text> : null;
}

export function Avatar({ name, color, size = 48 }: { name: string; color: string; size?: number }) {
  return (
    <View accessible={false} style={[ui.avatar, { width: size, height: size, borderRadius: size * 0.36, backgroundColor: color }]}>
      <Text style={[ui.avatarText, { fontSize: Math.round(size * 0.38) }]}>{Array.from(name)[0]}</Text>
    </View>
  );
}

export function Button({ label, icon, onPress, disabled, variant = 'primary' }: {
  label: string;
  icon?: IconName;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'soft' | 'danger';
}) {
  const foreground = variant === 'primary' ? '#FFFFFF' : variant === 'danger' ? colors.danger : colors.deep;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        ui.button,
        { backgroundColor: variant === 'primary' ? colors.green : variant === 'danger' ? '#F8EBE6' : colors.sage },
        (pressed || disabled) && ui.dim,
      ]}
    >
      {icon && <Ionicons name={icon} size={17} color={foreground} />}
      <Text style={[ui.buttonText, { color: foreground }]}>{label}</Text>
    </Pressable>
  );
}

export function Empty({ children }: { children: string }) {
  return <Text style={[styles.card, styles.muted]}>{children}</Text>;
}

const ui = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.backdrop },
  screen: { width: '100%', maxWidth: 660, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 30, gap: 16 },
  heading: { gap: 5, paddingBottom: 3 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brand: { color: colors.green, fontSize: 13, fontWeight: '700' },
  demoLabel: { alignSelf: 'flex-start', color: colors.deep, backgroundColor: colors.sage, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, fontSize: 11, fontWeight: '700' },
  title: { color: colors.text, fontSize: 36, fontWeight: '800' },
  avatar: { alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.deep, fontWeight: '800' },
  button: { minHeight: 44, justifyContent: 'center', alignItems: 'center', flexDirection: 'row', gap: 6, borderRadius: 14, paddingHorizontal: 13, paddingVertical: 9 },
  buttonText: { fontSize: 14, fontWeight: '700' },
  dim: { opacity: 0.56 },
});
