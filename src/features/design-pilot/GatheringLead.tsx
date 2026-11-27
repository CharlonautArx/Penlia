import { readingFont } from './reading';
import { Image, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon, type IconName } from '../../components/ui';
import { Backdrop } from '../together/Backdrop';
import { formatTime } from '../social/ui';
import { useDesignPilot } from './context';

type WhenWhere = { startsAt: string; endsAt?: string; place: string };
type Invitation = {
  title: string;
  cover?: string;
  description?: string;
  meetingNote?: string;
  category: string;
  state: string;
  selected?: WhenWhere;
  candidate?: WhenWhere;
  proposal?: { selected: boolean; choose: () => void };
};

function Cover({ value }: { value?: string }) {
  return value ? <Image accessible={false} source={{ uri: 'data:image/jpeg;base64,' + value }} resizeMode="cover" style={StyleSheet.absoluteFill} />
    : <Backdrop />;
}

function Fact({ label, icon, value, proposal }: { label: string; icon: IconName; value: string; proposal?: Invitation['proposal'] }) {
  const { colors, variant } = useDesignPilot();
  const compact = variant === 'B';
  const content = <View style={{ flexDirection: 'row', alignItems: 'center', gap: compact ? 9 : 12, minHeight: 48, paddingVertical: 7 }}>
    <Icon name={icon} size={compact ? 18 : 21} color={colors.accent} />
    <View style={{ flex: 1, gap: 3 }}>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <Text style={{ fontSize: 12, color: colors.muted }}>{label}</Text>
        {proposal && <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
          <Icon name={proposal.selected ? 'checkmark-circle' : 'ellipse-outline'} size={17} color={colors.accent} />
          <Text style={{ fontSize: 13, color: colors.accent, fontWeight: '600' }}>{proposal.selected ? '已选择' : '选择'}</Text>
        </View>}
      </View>
      <Text style={{ fontSize: compact ? 15 : 16, color: colors.text, fontWeight: '500' }}>{value}</Text>
    </View>
  </View>;
  return proposal ? <Pressable accessibilityRole="radio" aria-checked={proposal.selected} accessibilityLabel="选择要提议的时间" accessibilityHint={value}
    accessibilityState={{ checked: proposal.selected }} onPress={proposal.choose}
    style={({ pressed }) => ({ opacity: pressed ? 0.64 : 1 })}>{content}</Pressable> : content;
}

export function GatheringLead({ title, cover, description, meetingNote, category, state, selected, candidate, proposal }: Invitation) {
  const { colors, variant } = useDesignPilot();
  const { width, fontScale } = useWindowDimensions();
  const schedule = selected ?? candidate;
  const tentative = !selected && !!candidate;
  const timeLabel = tentative ? '候选时间' : '时间';
  const placeLabel = tentative ? '候选地点' : '地点';
  const time = schedule ? formatTime(schedule.startsAt) + (schedule.endsAt ? ' 至 ' + formatTime(schedule.endsAt) : '') : '待商量';
  const place = schedule?.place || meetingNote || '待商量';
  const split = width >= 365 && fontScale < 1.3;
  const titleText = (size: number, ink = colors.text, reading = false) => <Text accessibilityRole="header" style={{
    fontSize: width < 350 ? size - 4 : size, lineHeight: Math.ceil((width < 350 ? size - 4 : size) * (reading ? 1.33 : 1.2)), color: ink, fontFamily: reading ? readingFont(title) : undefined,
    fontWeight: reading ? '400' : '700', letterSpacing: reading ? 0.2 : -0.55, flexShrink: 1,
  }}>{title}</Text>;
  const metadata = (ink = colors.muted) => <Text style={{ fontSize: 13, color: ink, fontWeight: '500' }}>{category}　·　{state}</Text>;
  const aside = !!description && <Text style={{ color: colors.text, fontSize: 16, lineHeight: 25 }}>{description}</Text>;
  const note = !!schedule?.place && !!meetingNote && <Text style={{ color: colors.muted, fontSize: 15 }}>{meetingNote}</Text>;
  const facts = <>
    <Fact label={timeLabel} icon="calendar-clear-outline" value={time} proposal={proposal} />
    <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.line }} />
    <Fact label={placeLabel} icon="location-outline" value={place} />
  </>;
  if (variant === 'C') return <View style={{ gap: 16 }}>
    <View style={{ overflow: 'hidden', minHeight: 255, borderRadius: 29, padding: 23, paddingTop: 95, justifyContent: 'flex-end', gap: 9 }}>
      <Cover value={cover} />
      <LinearGradient pointerEvents="none" colors={['#10232100','#10232128','#102321ed']} locations={[0, 0.35, 1]} style={StyleSheet.absoluteFill} />
      {metadata('#F6F6FA')}
      {titleText(35, '#FFFFFF')}
    </View>
    <View style={{ paddingHorizontal: 17, paddingVertical: 3, borderRadius: 19, backgroundColor: colors.surface }}>{facts}</View>
    {aside}{note}
  </View>;
  if (variant === 'D') return <View style={{ gap: 16, paddingTop: 13 }}>
    <View style={{ borderTopColor: colors.text, borderTopWidth: 1, paddingTop: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <Text style={{ color: colors.accent, fontSize: 14, fontWeight: '700' }}>{category}</Text>
      <Text style={{ color: colors.muted, fontSize: 13 }}>{state}</Text>
    </View>
    {titleText(35, colors.text, true)}
    <View style={{ flexDirection: split ? 'row' : 'column', alignItems: 'stretch', gap: 20 }}>
      <View style={{ width: split ? 100 : '100%', minHeight: split ? 140 : 96, overflow: 'hidden', borderRadius: 3 }}><Cover value={cover} /></View>
      <View style={{ flex: split ? 1 : undefined, justifyContent: 'center' }}>{facts}</View>
    </View>
    {aside}{note}
  </View>;
  if (variant === 'B') return <View style={{ gap: 8 }}>
    <View style={{ flexDirection: split ? 'row' : 'column', gap: 14, alignItems: split ? 'center' : 'stretch', paddingVertical: 12 }}>
      <View style={{ flex: split ? 1 : undefined, gap: 6 }}>{metadata()}{titleText(26)}</View>
      <View style={{ overflow: 'hidden', width: split ? 83 : '100%', height: split ? 83 : 100, borderRadius: 7 }}><Cover value={cover} /></View>
    </View>
    <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.line }}>{facts}</View>
    {aside}{note}
  </View>;
  return <View style={{ gap: 15 }}>
    <View style={{ overflow: 'hidden', height: width < 360 ? 120 : 154, borderTopLeftRadius: 33, borderTopRightRadius: 8, borderBottomLeftRadius: 8, borderBottomRightRadius: 33 }}><Cover value={cover} /></View>
    <View style={{ gap: 7, paddingHorizontal: 3 }}>{metadata(colors.accent)}{titleText(32)}</View>
    {aside}
    <View style={{ borderLeftWidth: 3, borderColor: colors.accent, marginLeft: 3, paddingLeft: 14 }}>{facts}</View>
    {note}
  </View>;
}
