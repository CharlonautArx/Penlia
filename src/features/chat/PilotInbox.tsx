import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFontScale } from '../../components/Typography';
import { Icon } from '../../components/ui';
import { UnreadMark } from '../../components/material';
import { useDesignPilot } from '../design-pilot/context';
import { MessageMarks } from '../media/NoReply';

type Pilot = ReturnType<typeof useDesignPilot>;
const letterFont = 'PenliaReading';
const hair = StyleSheet.hairlineWidth;

export function DesignSwitch({ color }: { color?: string }) {
  return <Pressable accessibilityRole="button" accessibilityLabel="切换设计方案" onPress={() => router.push('/design-pilot')}
    style={({ pressed }) => [s.designSwitch, pressed && s.pressed]}>
    <Icon name="color-palette-outline" size={18} color={color} />
    <Text style={[s.switchLabel, color ? { color } : undefined]}>方案</Text>
  </Pressable>;
}

export function PilotInboxHeader({ pilot, value, onChange, onFocus }: {
  pilot: Pilot; value: string; onChange: (next: string) => void; onFocus: () => void;
}) {
  const { colors, variant } = pilot;
  const [focused, setFocused] = useState(false);
  const large = useFontScale() > 1.25;
  const minimal = variant === 'B';
  const letter = variant === 'D';
  const search = <View style={[s.search, { backgroundColor: colors.surface }, minimal && s.compactSearch,
    variant === 'C' && s.nativeSearch, letter && s.letterSearch,
    { borderColor: focused ? colors.accent : colors.line, borderWidth: letter || minimal ? 0 : hair },
    letter && { borderBottomWidth: hair }]}>
    <Icon name="search-outline" color={colors.muted} size={18} />
    <TextInput accessibilityLabel="搜索会话" placeholder={minimal && !large ? '搜索会话' : '搜索联系人或消息'}
      value={value} onChangeText={onChange} onFocus={() => { onFocus(); setFocused(true); }} onBlur={() => setFocused(false)}
      returnKeyType="search" placeholderTextColor={colors.muted} selectionColor={colors.accent}
      style={[s.input, { color: colors.text }]} />
    {!!value && <Pressable accessibilityLabel="清空搜索" accessibilityRole="button" onPress={() => onChange('')}
      style={s.clear}><Icon name="close-circle" color={colors.muted} size={18} /></Pressable>}
  </View>;
  const inline = minimal && !large;
  return <View style={[s.header, minimal && s.utilityHeader, variant === 'C' && s.nativeHeader]}>
    <View style={s.headline}>
      <Text accessibilityRole="header" style={[s.title, { color: colors.text }, minimal && s.utilityTitle,
        variant === 'C' && s.nativeTitle, letter && s.letterTitle]}>聊天</Text>
      {inline ? search : <View style={s.fill} />}
      <DesignSwitch color={colors.muted} />
    </View>
    {!inline && search}
  </View>;
}

export type InboxRowProps = {
  name: string; avatar?: ReactNode; preview: string; time: string; unread: number;
  pinned?: boolean; silent?: boolean; noReply?: boolean; signal?: ReactNode; manualUnread?: boolean; onPress: () => void;
};

export function PilotInboxRow({ pilot, lead, name, avatar, preview, time, unread, pinned, silent, noReply, signal, manualUnread, onPress }: InboxRowProps & {
  pilot: Pilot; lead: boolean;
}) {
  const { colors, variant } = pilot;
  const large = useFontScale() > 1.2;
  const featured = variant === 'A' && lead;
  const utility = variant === 'B';
  const native = variant === 'C';
  const letter = variant === 'D';
  const count = <UnreadMark count={unread || Number(manualUnread === true)} dot={!unread} />;
  const nameLine = <View style={s.nameGroup}>
    <Text numberOfLines={large ? 2 : 1} style={[s.name, { color: colors.text }, featured && s.featureName,
      native && s.nativeName, letter && s.byline]}>{name}</Text>
    {pinned && <Icon name="pin-outline" size={13} color={colors.muted} />}{signal}
  </View>;
  const summary = <Text numberOfLines={featured || large || letter ? 2 : 1} style={[s.summary,
    { color: featured || letter ? colors.text : colors.muted }, featured && s.featureSummary, letter && s.letterSummary]}>{preview}</Text>;
  const stamp = <Text numberOfLines={1} style={[s.time, { color: colors.muted }]}>{time}</Text>;
  const marks = <MessageMarks sharing={noReply} silent={silent} preview />;
  const label = [name, pinned && '置顶', unread ? unread + ' 条未读消息' : manualUnread && '已标为未读', preview].filter(Boolean).join('，');
  if (letter) return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
    style={({ pressed }) => [s.letterRow, { backgroundColor: pressed || pinned ? colors.tint : colors.background, borderColor: colors.line }]}>
    <View style={s.summaryLine}>{summary}{marks}</View>
    <View style={s.bylineRow}>{avatar}{nameLine}<View style={s.fill} />{stamp}{count}</View>
  </Pressable>;
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
    style={({ pressed }) => [s.row, utility && s.utilityRow, native && s.nativeRow, featured && s.featureRow,
      { backgroundColor: pressed || pinned || featured ? colors.tint : native ? colors.surface : colors.background }]}>
    {utility && !large && <View style={s.timeRail}>{stamp}</View>}
    {avatar}
    <View style={[s.content, utility && s.utilityContent, { borderColor: colors.line },
      (featured || variant === 'A') && s.noSeparator]}>
      <View style={s.nameLine}>{nameLine}<View style={s.fill} />{utility && !large ? count : stamp}</View>
      <View style={s.summaryLine}>{summary}{marks}<View style={s.fill} />
        {utility && !large ? null : count}
        {native && <Icon name="chevron-forward" size={13} color={colors.muted} />}
      </View>
    </View>
  </Pressable>;
}

const s = StyleSheet.create({
  header: { gap: 12, paddingTop: 7 },
  utilityHeader: { paddingTop: 0 },
  nativeHeader: { paddingTop: 14 },
  headline: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 32, lineHeight: 43, fontWeight: '500', letterSpacing: -0.7 },
  utilityTitle: { fontSize: 23, lineHeight: 32, fontWeight: '700', marginRight: 4 },
  nativeTitle: { fontSize: 38, lineHeight: 48, fontWeight: '700', letterSpacing: -1.1 },
  letterTitle: { fontSize: 35, lineHeight: 45, fontWeight: '400', fontFamily: letterFont, letterSpacing: 1.2 },
  designSwitch: { minWidth: 52, minHeight: 48, gap: 3, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  switchLabel: { fontSize: 12, lineHeight: 18 },
  pressed: { opacity: 0.58 },
  search: { minHeight: 48, flexDirection: 'row', borderRadius: 24, alignItems: 'center', paddingHorizontal: 14, gap: 9 },
  compactSearch: { flex: 1, minWidth: 0, borderRadius: 10, paddingHorizontal: 10 },
  nativeSearch: { borderRadius: 14 }, letterSearch: { borderRadius: 0, backgroundColor: 'transparent', paddingHorizontal: 1 },
  input: { minWidth: 0, flex: 1, fontSize: 15, minHeight: 46, paddingVertical: 8 },
  clear: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  fill: { flexGrow: 1 },
  row: { flexDirection: 'row', gap: 12, alignItems: 'center', minHeight: 76, paddingLeft: 18 },
  utilityRow: { minHeight: 63, paddingLeft: 12, gap: 9 },
  nativeRow: { minHeight: 77, paddingLeft: 12 },
  featureRow: { minHeight: 116, gap: 17, paddingLeft: 17 },
  content: { flex: 1, minWidth: 0, alignSelf: 'stretch', justifyContent: 'center', gap: 3,
    paddingVertical: 9, paddingRight: 16, borderBottomWidth: hair },
  utilityContent: { paddingVertical: 7, paddingRight: 12 }, noSeparator: { borderBottomWidth: 0 },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  nameGroup: { minWidth: 0, flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 5 },
  name: { fontSize: 17, lineHeight: 24, fontWeight: '500', flexShrink: 1 },
  featureName: { fontSize: 23, lineHeight: 30, fontWeight: '600' }, nativeName: { fontWeight: '600' },
  summaryLine: { flexDirection: 'row', gap: 5, alignItems: 'center' }, summary: { flexShrink: 1, fontSize: 14, lineHeight: 21 },
  featureSummary: { fontSize: 16, lineHeight: 24 },
  time: { fontSize: 12, lineHeight: 17, fontVariant: ['tabular-nums'] }, timeRail: { width: 52, alignItems: 'flex-start' },
  letterRow: { paddingVertical: 12, paddingHorizontal: 2, gap: 6, borderBottomWidth: hair },
  bylineRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  byline: { fontSize: 14, lineHeight: 21, fontWeight: '500' },
  letterSummary: { fontFamily: letterFont, fontSize: 18, lineHeight: 28 },
});
