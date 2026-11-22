import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import {
  ActivityIndicator, Animated, Easing, Image, type ImageSourcePropType, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView,
  type ScrollViewProps, type StyleProp, StyleSheet, Text, TextInput, type TextInputProps, View, type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useLocalPhotoUri } from '../features/space/media';
import { useAccountPhoto } from '../services/session';
import { isUiDemo } from '../demo/mode';
import { brandGradient, colors, contentWidth, fixed, motion, radius, space, styles, touch, type, weight } from '../theme';
import { useAppearance } from './appearance';
import { GlassLayer } from './material';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export function Icon({ name, size = 21, color = colors.ink }: { name: IconName; size?: number; color?: ComponentProps<typeof Ionicons>['color'] }) {
  return <Ionicons accessible={false} name={name} size={size} color={color ?? undefined} />;
}

export function IconButton({ label, icon, onPress, tinted = false, disabled = false }: {
  label: string; icon: IconName; onPress: () => void; tinted?: boolean; disabled?: boolean;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled}
      accessibilityState={{ disabled }} onPress={onPress}
      style={({ pressed }) => [ui.iconButton, pressed && ui.pressed, disabled && ui.disabled]}>
      {tinted && <GlassLayer tone="control" roundness={radius.pill} />}
      <Icon name={icon} />
    </Pressable>
  );
}

export function Screen({ title, actions, children, inset = true, refreshing, onRefresh, solid = false, back }: {
  title?: string; actions?: ReactNode; children: ReactNode; inset?: boolean; refreshing?: boolean;
  onRefresh?: () => void; solid?: boolean; back?: () => void;
}) {
  return (
    <SafeAreaView style={[ui.safe, solid && ui.white]} edges={back ? ['top', 'left', 'right', 'bottom'] : ['top', 'left', 'right']}>
      {title && <TopBar title={title} actions={actions} back={back} />}
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
    <View style={[ui.bar, ui.width, back && ui.backBar]}>
      {back && <IconButton label="返回" icon="chevron-back" onPress={back} />}
      <Text accessibilityRole="header" numberOfLines={1} style={[ui.title, back && ui.pageTitle]}>{title}</Text>
      <DemoLabel />
      <View style={styles.grow} />
      <View style={ui.actions}>{actions}</View>
    </View>
  </View>;
}

export function DemoLabel() {
  return isUiDemo ? <Tag>演示</Tag> : null;
}

export function Tag({ children }: { children: string }) {
  return <View style={ui.tag}>
    <GlassLayer roundness={radius.small} />
    <Text style={ui.tagText}>{children}</Text>
  </View>;
}

export function BrandMark({ size = 54 }: { size?: number }) {
  return <Image accessible={false} source={require('../../assets/icon.png')}
    style={{ width: size, height: size, borderRadius: size * 0.31 }} />;
}

export function Avatar({ name, source, size = 46, userId, localPhotoId }: {
  name: string; source?: ImageSourcePropType; size?: number; userId?: string; localPhotoId?: string;
}) {
  const accountPhoto = useAccountPhoto(userId);
  const uri = useLocalPhotoUri(localPhotoId ?? accountPhoto);
  const imageSource = uri ? { uri } : source;
  const shades = [colors.tint, colors.lavender, colors.ice, colors.search];
  const color = shades[(name.codePointAt(0) ?? 0) % shades.length];
  const frame = { width: size, height: size, borderRadius: size / 2 };
  return imageSource
    ? <Image accessible={false} source={imageSource} style={[frame, { backgroundColor: color }]} />
    : <View accessible={false} style={[ui.avatar, frame, { backgroundColor: color }]}>
      <Text allowFontScaling={false} style={[ui.avatarText, { fontSize: Math.round(size * 0.39) }]}>{Array.from(name)[0] || '朋'}</Text>
    </View>;
}

export function Button({ label, icon, onPress, disabled, variant = 'primary' }: {
  label: string; icon?: IconName; onPress: () => void; disabled?: boolean;
  variant?: 'primary' | 'soft' | 'danger' | 'gradient' | 'quiet';
}) {
  const primary = variant === 'primary' || variant === 'gradient';
  const foreground = variant === 'danger' ? colors.danger : colors.ink;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled }}
      disabled={disabled} onPress={onPress}
      style={({ pressed }) => [
        ui.button, variant === 'soft' && ui.soft,
        variant === 'danger' && ui.danger, pressed && ui.pressed, disabled && ui.disabled,
      ]}>
      {primary && <GlassLayer tone={variant === 'gradient' ? 'feature' : 'control'} />}
      {icon && <Icon name={icon} size={17} color={foreground} />}
      <Text style={[ui.buttonText, { color: foreground }]}>{label}</Text>
    </Pressable>
  );
}

export function SearchField({ label, value, onChangeText, onFocus, onBlur, variant, ...props }: TextInputProps & {
  label: string; variant?: 'glass';
}) {
  const [focused, setFocused] = useState(false);
  const { scheme } = useAppearance();
  const glazed = variant === 'glass';
  return <View style={[ui.search, glazed && ui.glassSearch,
    glazed && scheme === 'light' && ui.glassSearchShadow]}>
    {glazed && <GlassLayer tone={focused ? 'soft' : 'chrome'} roundness={radius.pill} />}
    <Icon name="search-outline" size={19} color={colors.quiet} />
    <TextInput {...props} accessibilityLabel={label} value={value} onChangeText={onChangeText}
      onFocus={glazed ? (event) => { setFocused(true); onFocus?.(event); } : onFocus}
      onBlur={glazed ? (event) => { setFocused(false); onBlur?.(event); } : onBlur}
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

export function ListRow({ title, detail, left, trailing, onPress, separator = true, style }: {
  title: string; detail?: string; left?: ReactNode; trailing?: ReactNode; onPress?: () => void; separator?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const content = <>
    {left}
    <View style={styles.grow}>
      <Text style={styles.strong} numberOfLines={2}>{title}</Text>
      {!!detail && <Text numberOfLines={3} style={styles.small}>{detail}</Text>}
    </View>
    {trailing ?? (onPress && <Icon name="chevron-forward" size={17} color={colors.quiet} />)}
  </>;
  return onPress ? <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress}
    style={({ pressed }) => [ui.listRow, separator && styles.divider, style, pressed && ui.pressed]}>{content}</Pressable>
    : <View style={[ui.listRow, separator && styles.divider, style]}>{content}</View>;
}

export function Sheet({ title, onClose, children, footer, ...props }: ScrollViewProps & {
  title: string; onClose: () => void; children: ReactNode; footer?: ReactNode;
}) {
  const { reduced } = useAppearance();
  const entering = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  useEffect(() => {
    if (reduced) {
      entering.setValue(1);
      return;
    }
    entering.setValue(0);
    const transition = Animated.timing(entering, {
      toValue: 1, duration: motion.sheet, easing: Easing.out(Easing.cubic), useNativeDriver: Platform.OS !== 'web', isInteraction: false,
    });
    transition.start();
    return () => transition.stop();
  }, [entering, reduced]);
  return <Modal visible animationType={reduced ? 'none' : 'fade'} transparent onRequestClose={onClose}>
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={ui.scrim}>
      <Pressable accessibilityRole="button" accessibilityLabel="关闭浮层" onPress={onClose} style={StyleSheet.absoluteFill} />
      <Animated.View style={[ui.sheetFrame, !reduced && {
        transform: [{ translateY: entering.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }],
      }]}>
      <SafeAreaView edges={['bottom', 'left', 'right']} style={ui.sheet}>
        <GlassLayer tone="chrome" roundness={radius.sheet} />
        <View accessibilityElementsHidden style={ui.grip} />
        <View style={ui.sheetTop}>
          <Text accessibilityRole="header" style={[styles.section, styles.grow]}>{title}</Text>
          <IconButton label="关闭" icon="close-outline" onPress={onClose} />
        </View>
        <ScrollView {...props} keyboardShouldPersistTaps="handled" contentContainerStyle={ui.sheetBody}>{children}</ScrollView>
        {footer && <View style={ui.sheetFooter}>{footer}</View>}
      </SafeAreaView>
      </Animated.View>
    </KeyboardAvoidingView>
  </Modal>;
}

export function LoadingSkeleton({ label, rows = 3 }: { label: string; rows?: number }) {
  return <View accessibilityRole="progressbar" accessibilityLabel={label} accessibilityState={{ busy: true }}>
    {Array.from({ length: rows }, (_, index) => <View key={index} aria-hidden style={ui.skeletonRow}>
      <View style={ui.skeletonAvatar} />
      <View style={styles.grow}>
        <View style={[ui.skeletonLine, { width: '43%' }]} />
        <View style={[ui.skeletonLine, { width: index % 2 === 0 ? '76%' : '63%' }]} />
      </View>
    </View>)}
  </View>;
}

export function Segments<T extends string>({ options, value, onChange, label }: {
  options: readonly { id: T; label: string }[]; value: T; onChange: (value: T) => void; label: string;
}) {
  return <View accessibilityLabel={label} style={ui.segments}>
    {options.map((option) => <Pressable key={option.id} accessibilityRole="button"
      accessibilityState={{ selected: option.id === value }} onPress={() => onChange(option.id)}
      style={({ pressed }) => [ui.segment, option.id === value && ui.activeSegment, pressed && ui.pressed]}>
      {option.id === value && <GlassLayer roundness={radius.small} />}
      <Text style={option.id === value ? ui.activeSegmentText : styles.muted}>{option.label}</Text>
    </Pressable>)}
  </View>;
}

export function SettingGroup({ children, title }: { children: ReactNode; title?: string }) {
  return <View style={ui.settings}>
    {!!title && <View style={ui.settingLabel}><Section title={title} /></View>}
    <View style={ui.settingRows}>{children}</View>
  </View>;
}

const ui = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.backdrop },
  white: { backgroundColor: colors.panel },
  width: { width: '100%', maxWidth: contentWidth, alignSelf: 'center' },
  column: { width: '100%', maxWidth: contentWidth, alignSelf: 'center', paddingBottom: space.xl },
  inset: { paddingHorizontal: space.md, paddingTop: space.sm, gap: space.md },
  barWrap: { backgroundColor: colors.panel },
  bar: { minHeight: 60, paddingHorizontal: space.md, flexDirection: 'row', alignItems: 'center', gap: space.xs },
  backBar: { minHeight: 54, paddingLeft: space.xxs },
  title: { flexShrink: 1, ...type.title, color: colors.text },
  pageTitle: { ...type.heading },
  actions: { flexDirection: 'row', alignItems: 'center' },
  tag: { alignSelf: 'center', borderRadius: radius.small, flexShrink: 0, paddingHorizontal: space.xs, paddingVertical: 2 },
  tagText: { ...type.tag, color: colors.ink },
  avatar: { alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.ink, fontWeight: weight.medium },
  iconButton: { width: touch, minHeight: touch, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  button: { minHeight: touch, borderRadius: radius.control, paddingHorizontal: space.sm, paddingVertical: space.xs, gap: space.xs,
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', overflow: 'hidden', flexShrink: 1 },
  soft: { backgroundColor: colors.search },
  danger: { backgroundColor: colors.dangerSurface },
  pressed: { opacity: 0.76 },
  disabled: { opacity: 0.48 },
  buttonText: { ...type.control, flexShrink: 1, textAlign: 'center' },
  search: { minHeight: touch, borderRadius: radius.control, backgroundColor: colors.search, flexDirection: 'row',
    alignItems: 'center', paddingLeft: space.sm, gap: space.xs },
  glassSearch: { minHeight: touch + space.xxs, borderRadius: radius.pill, backgroundColor: 'transparent',
    paddingLeft: space.md },
  glassSearchShadow: { boxShadow: `-5px 1px 15px ${brandGradient[0]}24, 5px 1px 15px ${brandGradient[2]}46, 0px 3px 6px #24212A0C` },
  searchInput: { flex: 1, minWidth: 0, minHeight: touch, paddingVertical: space.xs, paddingRight: space.xs, ...type.support, color: colors.text },
  notice: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.xs, backgroundColor: colors.lavender, borderRadius: radius.control,
    minHeight: touch, paddingHorizontal: space.sm, paddingVertical: space.xxs },
  empty: { gap: space.xs, minHeight: 112, padding: space.lg, justifyContent: 'center', alignItems: 'center' },
  centerText: { textAlign: 'center' },
  section: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: space.xs, minHeight: 26 },
  listRow: { ...styles.row, minHeight: 58, paddingVertical: space.xs, paddingHorizontal: space.sm },
  scrim: { flex: 1, justifyContent: 'flex-end', backgroundColor: fixed.overlay },
  sheetFrame: { width: '100%', maxWidth: contentWidth, maxHeight: '90%', alignSelf: 'center' },
  sheet: { flexShrink: 1, backgroundColor: colors.panel, borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet, paddingBottom: space.xs },
  grip: { height: 4, width: 30, borderRadius: 2, alignSelf: 'center', marginTop: space.xs, backgroundColor: colors.border },
  sheetTop: { ...styles.row, ...styles.divider, paddingLeft: space.md, paddingRight: space.xs },
  sheetBody: { padding: space.md, gap: space.sm },
  sheetFooter: { paddingHorizontal: space.md, paddingVertical: space.xs, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  skeletonRow: { ...styles.row, minHeight: 68, paddingHorizontal: space.md },
  skeletonAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.search },
  skeletonLine: { height: 8, borderRadius: 4, marginVertical: space.xxs, backgroundColor: colors.search },
  segments: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space.md, rowGap: 0, ...styles.divider },
  segment: { minHeight: touch, justifyContent: 'center', paddingHorizontal: space.xs, paddingVertical: space.xxs },
  activeSegment: { borderRadius: radius.small },
  activeSegmentText: { ...type.control, color: colors.ink },
  settings: { gap: space.xs },
  settingLabel: { paddingHorizontal: space.xxs },
  settingRows: { borderRadius: radius.surface, backgroundColor: colors.panel, overflow: 'hidden' },
});
