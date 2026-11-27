import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View, type TextStyle, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { Icon, type IconName } from '../../components/ui';
import { useDesignPilot } from './context';
import type { SpacePane } from '../space/SpaceHeader';

type Edition = 'A' | 'B' | 'C' | 'D';
const tabs: { key: SpacePane; label: string; icon: IconName }[] = [
  { key: 'thought', label: '动态', icon: 'chatbubble-ellipses-outline' },
  { key: 'journal', label: '日志', icon: 'book-outline' },
  { key: 'albums', label: '相册', icon: 'images-outline' },
];

export function MomentsCoverTitle({ edition, top, photo }: { edition: Edition; top: number; photo: boolean }) {
  const { width, fontScale } = useWindowDimensions();
  const { colors } = useDesignPilot();
  // Under large text or a short landscape cover, a normal-flow heading in the toolbar stays clear of the avatar.
  if (fontScale > 1.3 || width > 600) return null;
  const letter: TextStyle = edition === 'A' ? { fontSize: 31, lineHeight: 40, fontWeight: '500', letterSpacing: 1 }
    : edition === 'B' ? { fontSize: 21, lineHeight: 30, fontWeight: '600' }
    : edition === 'C' ? { fontSize: 39, lineHeight: 49, fontWeight: '700', letterSpacing: -1.2 }
    : { fontSize: 35, lineHeight: 46, fontFamily: 'PenliaReading', fontWeight: '400', letterSpacing: 2.5 };
  return <View pointerEvents="none" style={[layout.coverTitle, { paddingTop: top + (edition === 'B' ? 12 : 19),
    alignItems: edition === 'D' ? 'center' : 'flex-start', paddingHorizontal: edition === 'D' || edition === 'A' ? 24 : 18 }]}>
    {photo && <LinearGradient colors={['#15121AC9', '#15121A66', '#15121A00']} style={StyleSheet.absoluteFill} />}
    <Text accessibilityRole="header" style={[letter, { color: photo ? '#FFFFFF' : edition === 'D' ? colors.text : '#342D36' }]}>好友动态</Text>
  </View>;
}

export function MomentsToolbar({ edition, pane, onPane, onPublish, onPrivacy, collections }: {
  edition: Edition; pane: SpacePane; onPane: (next: SpacePane) => void;
  onPublish: () => void; onPrivacy: () => void; collections: boolean;
}) {
  const { colors } = useDesignPilot();
  const { width, fontScale } = useWindowDimensions();
  const moreRoom = fontScale > 1.18 || width < 350;
  const doubleRow = moreRoom;
  const rounded = edition === 'C';
  const [rowWidth, setRowWidth] = useState(0);
  const available = tabs.filter(tab => collections || tab.key === 'thought');
  const barStyle: ViewStyle = edition === 'D' ? { borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.line }
    : edition === 'B' ? { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.line } : {};
  return <View style={{ backgroundColor: colors.background, paddingHorizontal: rounded ? 16 : 14, paddingVertical: edition === 'D' ? 10 : 6 }}>
    {(fontScale > 1.3 || width > 600) && <Text accessibilityRole="header" style={{ color: colors.text, paddingVertical: 8,
      fontSize: 27, fontWeight: edition === 'D' ? '400' : '600', fontFamily: edition === 'D' ? 'PenliaReading' : undefined }}>好友动态</Text>}
    <View style={[barStyle, { flexDirection: doubleRow ? 'column' : 'row', alignItems: doubleRow ? 'stretch' : 'center', gap: rounded ? 4 : 6 }]}>
      <View accessibilityRole="tablist" onLayout={event => setRowWidth(event.nativeEvent.layout.width)}
        style={[layout.panes, !doubleRow && layout.grow, rounded && { backgroundColor: colors.tint, borderRadius: 16, padding: 2 }]}>
        {available.map(tab => {
          const selected = tab.key === pane;
          const tabColor = selected ? colors.text : colors.muted;
          const showIcon = edition === 'C' && rowWidth > 248 * Math.min(fontScale, 1.6);
          return <Pressable key={tab.key} accessibilityRole="tab" accessibilityLabel={tab.label} accessibilityState={{ selected }} aria-selected={selected}
            onPress={() => onPane(tab.key)} style={({ pressed }) => [layout.tab, { opacity: pressed ? 0.65 : 1 },
              selected && rounded && { backgroundColor: colors.surface, borderRadius: 13 }]}>
            {showIcon && <Icon name={tab.icon} size={17} color={tabColor} />}
            <Text style={{ color: tabColor, fontSize: edition === 'A' ? 16 : 15, fontWeight: selected ? '600' : '400' }}>{tab.label}</Text>
            {selected && !rounded && <View style={[layout.selection, { backgroundColor: colors.accent, width: edition === 'D' ? 30 : 19 }]} />}
          </Pressable>;
        })}
      </View>
      {pane === 'thought' && <View style={[layout.tools, doubleRow && { justifyContent: edition === 'C' ? 'space-between' : 'flex-end' }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="空间隐私" onPress={onPrivacy}
          style={({ pressed }) => [layout.tool, { opacity: pressed ? 0.65 : 1 }]}>
          <Icon name="shield-checkmark-outline" size={19} color={colors.muted} />
          {rounded && doubleRow && <Text style={{ color: colors.muted, fontSize: 13 }}>空间隐私</Text>}
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="发布动态" accessibilityHint="选择普通或共创发布方式" onPress={onPublish}
          style={({ pressed }) => [layout.tool, { paddingHorizontal: rounded ? 8 : 6, opacity: pressed ? 0.65 : 1 },
            (edition === 'A' || rounded) && { backgroundColor: edition === 'A' ? colors.tint : colors.surface, borderRadius: rounded ? 20 : 12 }]}>
          <Icon name="create-outline" size={19} color={colors.accent} />
          <Text style={{ color: colors.text, fontSize: 14, fontWeight: '500' }}>发布动态</Text>
        </Pressable>
      </View>}
    </View>
  </View>;
}

export function PilotPostArticle({ edition, author, body, media, before, footer, singlePhoto, date }: {
  edition: Edition; author: ReactNode; body: ReactNode; media: ReactNode; before: ReactNode; footer: ReactNode;
  singlePhoto: boolean; date: Date;
}) {
  const { colors } = useDesignPilot();
  const { width, fontScale } = useWindowDimensions();
  const edges = { borderColor: colors.line, backgroundColor: colors.background };
  const readable = width >= 355 && fontScale <= 1.28;
  if (edition === 'A') return <View style={[layout.album, edges]}>
    {author}{before}
    {media}
    <View style={layout.albumCaption}>
      {Number.isFinite(date.valueOf()) && <View style={[layout.calendar, { borderColor: colors.line }]} accessible
        accessibilityLabel={date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })}>
        {date.getFullYear() !== new Date().getFullYear() && <Text style={{ color: colors.muted, fontSize: 12 }}>{date.getFullYear()}</Text>}
        <Text style={{ color: colors.muted, fontSize: 12 }}>{date.getMonth() + 1}月</Text>
        <Text style={{ color: colors.accent, fontSize: 21, lineHeight: 27, fontVariant: ['tabular-nums'] }}>{date.getDate()}</Text>
      </View>}
      <View style={layout.grow}>{body}</View>
    </View>
    {footer}
  </View>;
  if (edition === 'B') return <View style={[layout.stream, edges]}>
    {author}{before}
    {singlePhoto && readable ? <View style={layout.digest}>
      <View style={layout.grow}>{body}</View>
      <View style={{ width: '39%', maxWidth: 178 }}>{media}</View>
    </View> : <>{body}{media}</>}
    {footer}
  </View>;
  if (edition === 'C') return <View style={[layout.group, { backgroundColor: colors.surface, borderColor: colors.line }]}>
    {author}{before}{body}{media}{footer}
  </View>;
  return <View style={[layout.letter, edges]}>
    {body}{before}{author}{media}{footer}
  </View>;
}

const layout = StyleSheet.create({
  coverTitle: { position: 'absolute', left: 0, right: 0, top: 0, paddingBottom: 18 },
  panes: { flexDirection: 'row', alignItems: 'stretch' },
  tab: { flex: 1, flexDirection: 'row', gap: 6, minHeight: 48, paddingVertical: 8, justifyContent: 'center', alignItems: 'center' },
  selection: { position: 'absolute', bottom: 4, height: 2, borderRadius: 2 },
  tools: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  tool: { minWidth: 48, minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  album: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6, gap: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  albumCaption: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  calendar: { alignItems: 'center', justifyContent: 'center', minWidth: 36, borderRightWidth: StyleSheet.hairlineWidth, paddingRight: 8 },
  grow: { flex: 1, minWidth: 0 },
  stream: { paddingHorizontal: 16, paddingTop: 11, paddingBottom: 2, gap: 6, borderBottomWidth: StyleSheet.hairlineWidth },
  digest: { flexDirection: 'row', gap: 16, alignItems: 'center' },
  group: { marginHorizontal: 14, marginTop: 6, marginBottom: 7, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4,
    borderWidth: StyleSheet.hairlineWidth, borderRadius: 23, gap: 10 },
  letter: { marginHorizontal: 23, paddingTop: 14, paddingBottom: 6, borderBottomWidth: StyleSheet.hairlineWidth, gap: 12 },
});
