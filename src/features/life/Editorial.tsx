import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon, type IconName } from '../../components/ui';
import { colors, radius, space, styles, touch, type } from '../../theme';

export function LifeLead({ title, detail, icon, tone = 'paper', children }: {
  title: string; detail?: string; icon?: IconName; tone?: 'paper' | 'rose' | 'mint'; children?: ReactNode;
}) {
  return <View style={[local.lead, tone === 'rose' && local.rose, tone === 'mint' && local.mint]}>
    {!!icon && <View style={local.leadIcon}><Icon name={icon} color={colors.accent} size={22} /></View>}
    {!!detail && <Text style={styles.muted}>{detail}</Text>}
    <Text accessibilityRole="header" style={local.title}>{title}</Text>
    {children}
  </View>;
}

export function DateBadge({ date }: { date: string }) {
  const [, month, day] = date.slice(0,10).split('-');
  return <View style={local.date} accessible={false}>
    <Text style={local.dateNum}>{Number(day)}</Text>
    <Text style={styles.small}>{Number(month)}月</Text>
  </View>;
}

export function TimelineNode({ last, children }: { last?: boolean; children: ReactNode }) {
  return <View style={local.timeline}>
    <View style={local.rail} accessibilityElementsHidden>
      <View style={local.pin} />
      {!last && <View style={local.line} />}
    </View>
    <View style={local.timelineContent}>{children}</View>
  </View>;
}

export function CalendarCell({ date, selected, today, count, weekday, onPress }: {
  date: Date; selected: boolean; today: boolean; count: number; weekday?: string; onPress: () => void;
}) {
  const label = date.toLocaleDateString('zh-CN', { month:'long',day:'numeric',weekday:'long' })
    + (today ? '，今天' : '') + (count ? '，' + count + ' 项已显示日程' : '');
  return <Pressable accessibilityRole="button" accessibilityLabel={label}
    accessibilityState={{ selected }} onPress={onPress}
    style={({ pressed }) => [local.cell, selected && local.selected, pressed && local.pressed]}>
    {!!weekday && <Text style={styles.small}>{weekday}</Text>}
    <Text style={[local.day, (today || selected) && local.today]}>{date.getDate()}</Text>
    {count > 0 && <View style={local.marker} />}
  </Pressable>;
}

const local = StyleSheet.create({
  lead: { backgroundColor: colors.panel, padding: space.md, gap: space.xxs, borderRadius: radius.surface },
  rose: { backgroundColor: colors.pink },
  mint: { backgroundColor: colors.ice },
  title: { ...type.title, color: colors.text },
  leadIcon: { alignSelf: 'flex-start', paddingBottom: space.xxs },
  date: { width: 45, minHeight: 50, paddingVertical: space.xxs, backgroundColor: colors.ice, borderRadius: radius.control,
    alignItems: 'center', justifyContent: 'center' },
  dateNum: { ...type.heading, color: colors.text },
  timeline: { flexDirection: 'row', alignItems: 'stretch', gap: space.xs },
  rail: { width: 13, alignItems: 'center', paddingTop: 17 },
  line: { width: StyleSheet.hairlineWidth, backgroundColor: colors.border, flex: 1 },
  pin: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent },
  timelineContent: { ...styles.grow, paddingBottom: space.xs },
  cell: { minHeight: touch, minWidth: 0, borderRadius: radius.small, justifyContent: 'center', alignItems: 'center', gap: 1 },
  selected: { backgroundColor: colors.pink },
  pressed: { opacity: 0.7 },
  day: { ...type.emphasis, color: colors.text },
  today: { color: colors.accent, fontWeight: '700' },
  marker: { width: 4, height: 4, backgroundColor: colors.accent, borderRadius: 2 },
});
