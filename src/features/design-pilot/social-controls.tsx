import { type ComponentProps } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon, IconButton } from '../../components/ui';
import { contentWidth } from '../../theme';
import { Button, Screen, Section } from '../together/ui';
import { useDesignPilot } from './context';

export function SocialPage(props: ComponentProps<typeof Screen>) {
  const { variant, colors } = useDesignPilot();
  if (variant === 'original' || variant === 'C') return <Screen {...props} />;
  const book = variant === 'D';
  const fast = variant === 'B';
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
    <View style={[local.bar, { paddingHorizontal: fast ? 8 : 14, borderBottomWidth: fast ? StyleSheet.hairlineWidth : 0, borderColor: colors.line }]}>
      {props.back && <IconButton icon="chevron-back" color={colors.text} label="返回" onPress={props.back} />}
      <Text accessibilityRole="header" style={{ color: colors.text, flex: 1, fontSize: fast ? 18 : 16, fontWeight: fast ? '700' : '500', textAlign: book ? 'center' : 'left' }}>{props.title}</Text>
      <View style={{ minWidth: book ? 48 : 0 }}>{props.actions}</View>
    </View>
    <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
      refreshControl={props.onRefresh ? <RefreshControl refreshing={!!props.refreshing} onRefresh={props.onRefresh} tintColor={colors.accent} /> : undefined}
      contentContainerStyle={[local.flow, { paddingHorizontal: book ? 24 : fast ? 16 : 18, gap: fast ? 10 : 15 }]}>
      {props.children}
    </ScrollView>
  </SafeAreaView>;
}

export function SocialButton(props: ComponentProps<typeof Button>) {
  const { variant, colors, dark } = useDesignPilot();
  if (variant === 'original') return <Button {...props} />;
  const prominent = !props.variant || props.variant === 'primary' || props.variant === 'gradient';
  const quiet = props.variant === 'quiet';
  const book = variant === 'D';
  const flat = variant === 'B' || book;
  const filled = prominent && !book && !props.disabled;
  const danger = props.variant === 'danger';
  const ink = danger ? (dark ? '#F4AEAA' : '#983F3B') : props.disabled ? colors.muted : filled && variant === 'B' ? colors.accent : filled ? colors.background : quiet ? colors.muted : colors.text;
  return <Pressable accessibilityRole="button" accessibilityLabel={props.label} accessibilityState={{ disabled: !!props.disabled }}
    disabled={props.disabled} onPress={props.onPress} onLongPress={props.onLongPress}
    android_ripple={{ color: dark ? '#ffffff28' : '#00000010' }}
    style={({ pressed }) => [local.action, {
      alignSelf: 'stretch', backgroundColor: filled && variant === 'B' ? colors.tint : filled ? colors.text : flat || quiet || danger || props.disabled ? 'transparent' : colors.surface,
      borderRadius: variant === 'C' ? 22 : variant === 'A' ? 15 : 0, borderColor: colors.line,
      borderBottomWidth: flat && !filled ? StyleSheet.hairlineWidth : 0,
      paddingHorizontal: flat && !filled ? 3 : 15, opacity: props.disabled ? 0.82 : pressed ? 0.72 : 1,
    }]}>
    {props.icon && <Icon name={props.icon} size={18} color={ink} />}
    <Text style={{ color: ink, flexShrink: 1, fontSize: 15, fontWeight: prominent ? '700' : '500' }}>{props.label}</Text>
    {book && !props.disabled && !danger && <View style={{ flex: 1, alignItems: 'flex-end' }}><Icon name="chevron-forward" size={15} color={colors.muted} /></View>}
  </Pressable>;
}

export function SocialSection(props: ComponentProps<typeof Section>) {
  const { variant, colors } = useDesignPilot();
  if (variant === 'original') return <Section {...props} />;
  return <View style={{ gap: 3, paddingTop: variant === 'B' ? 4 : 9 }}>
    <Text accessibilityRole="header" style={{
      color: colors.text, fontSize: variant === 'B' ? 18 : variant === 'D' ? 24 : 22,
      fontWeight: variant === 'D' ? '400' : '700', fontFamily: variant === 'D' ? 'PenliaReading' : undefined,
    }}>{props.title}</Text>
    {!!props.detail && <Text style={{ fontSize: 14, color: colors.muted }}>{props.detail}</Text>}
    {props.children}
  </View>;
}

const local = StyleSheet.create({
  bar: { width: '100%', maxWidth: contentWidth, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', minHeight: 50 },
  flow: { width: '100%', maxWidth: contentWidth, alignSelf: 'center', paddingBottom: 60, paddingTop: 7 },
  action: { minHeight: 48, paddingVertical: 10, gap: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
