import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import type { ComponentProps, ReactNode } from 'react';
import {
  ActivityIndicator, Image, type ImageSourcePropType, Modal, Pressable, RefreshControl, ScrollView,
  type ScrollViewProps, StyleSheet, Text, TextInput, type TextInputProps, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { isUiDemo } from '../demo/mode';
import { brandGradient, colors, styles } from '../theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export function Icon({ name, size = 21, color = colors.ink }: { name: IconName; size?: number; color?: string }) {
  return <Ionicons accessible={false} name={name} size={size} color={color} />;
}

export function IconButton({ label, icon, onPress, tinted = false, disabled = false }: {
  label: string; icon: IconName; onPress: () => void; tinted?: boolean; disabled?: boolean;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled}
      accessibilityState={{ disabled }} onPress={onPress}
      style={({ pressed }) => [ui.iconButton, tinted && ui.tinted, pressed && ui.pressed, disabled && ui.disabled]}>
      <Icon name={icon} color={tinted ? colors.accent : colors.ink} />
    </Pressable>
  );
}

export function Screen({ title, actions, children, inset = true, refreshing, onRefresh, solid = false, back }: {
  title: string; actions?: ReactNode; children: ReactNode; inset?: boolean; refreshing?: boolean;
  onRefresh?: () => void; solid?: boolean; back?: () => void;
}) {
  return (
    <SafeAreaView style={[ui.safe, solid && ui.white]} edges={['top', 'left', 'right']}>
      <TopBar title={title} actions={actions} back={back} />
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
        refreshControl={onRefresh && <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        contentContainerStyle={[ui.column, inset && ui.inset]}>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function TopBar({ title, actions, back }: { title: string; actions?: ReactNode; back?: () => void }) {
  return <View style={ui.barWrap}>
    <View style={[ui.bar, ui.width]}>
      {back && <IconButton label="返回" icon="chevron-back" onPress={back} />}
      <Text accessibilityRole="header" style={ui.title}>{title}</Text>
      <DemoLabel />
      <View style={styles.grow} />
      <View style={ui.actions}>{actions}</View>
    </View>
  </View>;
}

export function DemoLabel() {
  return isUiDemo ? <Text style={ui.demoLabel}>演示</Text> : null;
}

export function BrandMark({ size = 54 }: { size?: number }) {
  return <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
    style={{ width: size, height: size, borderRadius: size * 0.32, alignItems: 'center', justifyContent: 'center' }}>
    <Icon name="chatbubbles" size={Math.round(size * 0.55)} color="#292430" />
  </LinearGradient>;
}

export function Avatar({ name, source, size = 46 }: { name: string; source?: ImageSourcePropType; size?: number }) {
  const shades = [colors.pink, colors.lavender, colors.ice, '#FAF1E5', '#EDF1FA'];
  const color = shades[(name.codePointAt(0) ?? 0) % shades.length];
  const frame = { width: size, height: size, borderRadius: size * 0.32 };
  return source
    ? <Image accessible={false} source={source} style={[frame, { backgroundColor: color }]} />
    : <View accessible={false} style={[ui.avatar, frame, { backgroundColor: color }]}>
      <Text style={[ui.avatarText, { fontSize: Math.round(size * 0.39) }]}>{Array.from(name)[0] || '朋'}</Text>
    </View>;
}

export function Button({ label, icon, onPress, disabled, variant = 'primary' }: {
  label: string; icon?: IconName; onPress: () => void; disabled?: boolean;
  variant?: 'primary' | 'soft' | 'danger' | 'gradient' | 'quiet';
}) {
  const foreground = variant === 'primary' ? '#FFFFFF' : variant === 'danger' ? colors.danger : colors.ink;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled }}
      disabled={disabled} onPress={onPress}
      style={({ pressed }) => [
        ui.button, variant === 'primary' && ui.primary, variant === 'soft' && ui.soft,
        variant === 'danger' && ui.danger, pressed && ui.pressed, disabled && ui.disabled,
      ]}>
      {variant === 'gradient' && <LinearGradient colors={brandGradient} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }}
        style={StyleSheet.absoluteFill} />}
      {icon && <Icon name={icon} size={17} color={foreground} />}
      <Text style={[ui.buttonText, { color: foreground }]}>{label}</Text>
    </Pressable>
  );
}

export function SearchField({ label, value, onChangeText, ...props }: TextInputProps & { label: string }) {
  return <View style={ui.search}>
    <Icon name="search-outline" size={19} color={colors.quiet} />
    <TextInput {...props} accessibilityLabel={label} value={value} onChangeText={onChangeText}
      placeholderTextColor={colors.quiet} style={ui.searchInput} />
    {!!value && <IconButton label="清空搜索" icon="close-circle-outline" onPress={() => onChangeText?.('')} />}
  </View>;
}

export function Notice({ children, action, onAction }: { children: string; action?: string; onAction?: () => void }) {
  return <View style={ui.notice} accessibilityLiveRegion="polite">
    <Icon name="information-circle-outline" size={20} color={colors.accent} />
    <Text style={[styles.muted, styles.grow]}>{children}</Text>
    {action && onAction && <Button label={action} variant="quiet" onPress={onAction} />}
  </View>;
}

export function Empty({ children, busy = false, icon = 'chatbubble-ellipses-outline' }: {
  children: string; busy?: boolean; icon?: IconName;
}) {
  return <View style={ui.empty}>
    {busy ? <ActivityIndicator color={colors.accent} /> : <Icon name={icon} size={25} color={colors.quiet} />}
    <Text style={[styles.muted, ui.centerText]}>{children}</Text>
  </View>;
}

export function Section({ title, detail, children }: { title: string; detail?: string; children?: ReactNode }) {
  return <View style={ui.section}>
    <Text accessibilityRole="header" style={styles.section}>{title}</Text>
    {detail && <Text style={[styles.small, styles.grow]}>{detail}</Text>}
    {children}
  </View>;
}

export function ListRow({ title, detail, left, trailing, onPress }: {
  title: string; detail?: string; left?: ReactNode; trailing?: ReactNode; onPress?: () => void;
}) {
  const content = <>
    {left}
    <View style={styles.grow}>
      <Text style={styles.strong} numberOfLines={1}>{title}</Text>
      {!!detail && <Text numberOfLines={2} style={styles.small}>{detail}</Text>}
    </View>
    {trailing ?? (onPress && <Icon name="chevron-forward" size={17} color={colors.quiet} />)}
  </>;
  return onPress ? <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress}
    style={({ pressed }) => [ui.listRow, pressed && ui.pressed]}>{content}</Pressable>
    : <View style={ui.listRow}>{content}</View>;
}

export function Sheet({ title, onClose, children, ...props }: ScrollViewProps & {
  title: string; onClose: () => void; children: ReactNode;
}) {
  return <Modal visible animationType="fade" transparent onRequestClose={onClose}>
    <View style={ui.scrim}>
      <Pressable accessibilityRole="button" accessibilityLabel="关闭浮层" onPress={onClose} style={StyleSheet.absoluteFill} />
      <SafeAreaView edges={['bottom']} style={ui.sheet}>
        <View style={ui.sheetTop}>
          <Text accessibilityRole="header" style={[styles.section, styles.grow]}>{title}</Text>
          <IconButton label="关闭" icon="close-outline" onPress={onClose} />
        </View>
        <ScrollView {...props} keyboardShouldPersistTaps="handled" contentContainerStyle={ui.sheetBody}>{children}</ScrollView>
      </SafeAreaView>
    </View>
  </Modal>;
}

const ui = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.backdrop },
  white: { backgroundColor: colors.panel },
  width: { width: '100%', maxWidth: 620, alignSelf: 'center' },
  column: { width: '100%', maxWidth: 620, alignSelf: 'center', paddingBottom: 22 },
  inset: { paddingHorizontal: 16, paddingTop: 10, gap: 16 },
  barWrap: { backgroundColor: colors.panel, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  bar: { minHeight: 57, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 9 },
  title: { fontSize: 25, lineHeight: 32, fontWeight: '800', color: colors.text, letterSpacing: -0.8 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  demoLabel: { color: '#7E3B50', backgroundColor: colors.pink, borderRadius: 5, overflow: 'hidden',
    paddingHorizontal: 6, paddingVertical: 2, fontSize: 10, lineHeight: 14, fontWeight: '700' },
  avatar: { alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.ink, fontWeight: '700' },
  iconButton: { width: 44, minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  tinted: { backgroundColor: colors.pink },
  button: { minHeight: 44, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 8, gap: 6,
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  primary: { backgroundColor: colors.ink },
  soft: { backgroundColor: colors.lavender },
  danger: { backgroundColor: colors.pink },
  pressed: { opacity: 0.73 },
  disabled: { opacity: 0.43 },
  buttonText: { fontSize: 14, lineHeight: 20, fontWeight: '700' },
  search: { minHeight: 43, borderRadius: 12, backgroundColor: '#F2F3F5', flexDirection: 'row',
    alignItems: 'center', paddingLeft: 12, gap: 8 },
  searchInput: { flex: 1, minWidth: 0, minHeight: 43, paddingVertical: 7, paddingRight: 10, fontSize: 14, color: colors.text },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.pink, borderRadius: 12,
    minHeight: 44, paddingHorizontal: 11, paddingVertical: 7 },
  empty: { gap: 8, minHeight: 118, padding: 18, justifyContent: 'center', alignItems: 'center' },
  centerText: { textAlign: 'center' },
  section: { flexDirection: 'row', alignItems: 'center', gap: 9, minHeight: 27 },
  listRow: { ...styles.row, ...styles.divider, minHeight: 58, paddingVertical: 8, paddingHorizontal: 13 },
  scrim: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#201B2A65' },
  sheet: { width: '100%', maxWidth: 620, alignSelf: 'center', backgroundColor: colors.panel, borderTopLeftRadius: 19,
    borderTopRightRadius: 19, maxHeight: '88%', paddingBottom: 12 },
  sheetTop: { ...styles.row, ...styles.divider, paddingHorizontal: 16, paddingVertical: 4 },
  sheetBody: { padding: 16, gap: 14 },
});
