import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type TextStyle, type ViewStyle } from 'react-native';
import type { useDesignPilot } from '../design-pilot/context';
import { Icon } from '../../components/ui';

export type ThreadPilot = ReturnType<typeof useDesignPilot>;

export function ContactHeading({ pilot, name, avatar, onPress }: {
  pilot: ThreadPilot; name: string; avatar: ReactNode; onPress: () => void;
}) {
  const { variant, colors } = pilot;
  return <Pressable accessibilityRole="button" accessibilityLabel={'查看' + name + '的个人主页'} onPress={onPress}
    style={({ pressed }) => [s.heading, variant === 'C' && s.stacked, pressed && s.pressed]}>
    {(variant === 'A' || variant === 'C') && avatar}
    <View style={s.headingLine}>
      <Text accessibilityRole="header" numberOfLines={2} style={[s.contact, { color: colors.text },
        variant === 'D' && s.letterHeading, variant === 'C' && s.centerName]}>{name}</Text>
      {variant === 'A' && <Icon name="chevron-forward" size={13} color={colors.muted} />}
    </View>
  </Pressable>;
}

export function threadPaper(pilot: ThreadPilot, mine: boolean): ViewStyle {
  const { variant, colors } = pilot;
  if (variant === 'D') return mine ? {
    borderRadius: 13, borderBottomRightRadius: 4, paddingHorizontal: 15, paddingVertical: 10, backgroundColor: colors.tint,
  } : { borderRadius: 5, paddingHorizontal: 8, paddingVertical: 8, backgroundColor: colors.surface };
  if (variant === 'B') return {
    borderRadius: 10, paddingHorizontal: 11, paddingVertical: 7,
    backgroundColor: mine ? colors.tint : colors.surface,
    borderColor: colors.line, borderWidth: mine ? 0 : StyleSheet.hairlineWidth,
  };
  if (variant === 'C') return {
    borderRadius: 21, borderBottomLeftRadius: mine ? 21 : 8, borderBottomRightRadius: mine ? 8 : 21,
    paddingHorizontal: 14, paddingVertical: 9, backgroundColor: mine ? colors.tint : colors.surface,
  };
  return {
    borderRadius: 19, borderBottomLeftRadius: mine ? 19 : 5, borderBottomRightRadius: mine ? 5 : 19,
    paddingHorizontal: 15, paddingVertical: 10, backgroundColor: mine ? colors.tint : colors.surface,
  };
}

export function threadInk(pilot: ThreadPilot): TextStyle {
  const { variant, colors } = pilot;
  return variant === 'D' ? { color: colors.text, fontFamily: 'PenliaReading', fontSize: 18, lineHeight: 29 } :
    { color: colors.text, fontSize: variant === 'B' ? 16 : 17, lineHeight: variant === 'B' ? 22 : 25 };
}

export function ThreadDate({ pilot, children, wallpaper }: { pilot: ThreadPilot; children: string; wallpaper: boolean }) {
  const { colors, variant } = pilot;
  const letter = variant === 'D';
  return <View style={[s.date, variant === 'A' && s.startDate, variant === 'B' && s.tightDate]}>
    {letter && <View style={[s.rule, { backgroundColor: colors.line }]} />}
    <Text style={[s.dateLabel, { color: colors.muted }, (wallpaper || variant === 'A') && [s.dateChip, { backgroundColor: colors.surface }]]}>
      {children}
    </Text>
    {letter && <View style={[s.rule, { backgroundColor: colors.line }]} />}
  </View>;
}

const s = StyleSheet.create({
  heading: { flex: 1, minWidth: 0, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 2 },
  stacked: { flexDirection: 'column', justifyContent: 'center', gap: 0 },
  headingLine: { minWidth: 0, flexShrink: 1, flexDirection: 'row', gap: 3, alignItems: 'center' },
  contact: { fontSize: 19, lineHeight: 25, fontWeight: '600', flexShrink: 1 },
  centerName: { fontSize: 17, lineHeight: 23, fontWeight: '600', textAlign: 'center' },
  letterHeading: { fontFamily: 'PenliaReading', fontWeight: '400', fontSize: 24, lineHeight: 33 },
  pressed: { opacity: 0.65 },
  date: { paddingTop: 17, paddingBottom: 9, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 12 },
  startDate: { justifyContent: 'flex-start' }, tightDate: { paddingTop: 9, paddingBottom: 5 },
  dateLabel: { fontSize: 12, lineHeight: 18, fontVariant: ['tabular-nums'] },
  dateChip: { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2, overflow: 'hidden' },
  rule: { flex: 1, height: StyleSheet.hairlineWidth },
});
