import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Icon, type IconName } from '../../components/ui';
import { useDesignPilot } from './context';

type Action = { label: string; icon: IconName; onPress: () => void };
export function GatheringActions({ privateChoice, discuss, more, availability }: {
  privateChoice?: () => void; discuss: () => void; more: () => void;
  availability?: { label: string; onPress: () => void };
}) {
  const { colors, variant } = useDesignPilot();
  const { width, fontScale } = useWindowDimensions();
  const book = variant === 'D';
  const compact = variant === 'B';
  const segmented = width >= 340 && fontScale < 1.3 && !book;
  const actions: Action[] = [
    { label: '活动留言', icon: 'chatbubble-outline', onPress: discuss },
    ...(availability ? [{ ...availability, icon: 'calendar-outline' as const }] : []),
    { label: '活动操作', icon: 'ellipsis-horizontal', onPress: more },
  ];
  function cell(action: Action, primary = false) {
    const ink = primary ? colors.accent : colors.text;
    return <Pressable key={action.label} accessibilityRole="button" accessibilityLabel={action.label} onPress={action.onPress}
      android_ripple={{ color: colors.line }} style={({ pressed }) => [{
        minHeight: 48, flexGrow: segmented ? 1 : 0, flexBasis: segmented ? 0 : undefined, paddingHorizontal: 8, gap: 6,
        flexDirection: compact || !segmented || primary ? 'row' : 'column', alignItems: 'center', justifyContent: book ? 'flex-start' : 'center',
        paddingVertical: 7, opacity: pressed ? 0.65 : 1,
        borderBottomWidth: !segmented || primary ? StyleSheet.hairlineWidth : 0, borderColor: colors.line,
      }]}>
      <Icon name={action.icon} color={ink} size={primary ? 19 : 17} />
      <Text style={{ color: ink, flexShrink: 1, textAlign: 'center', fontSize: primary || book ? 15 : 13, fontWeight: primary ? '700' : '500' }}>{action.label}</Text>
      {book && <View style={{ flex: 1, alignItems: 'flex-end' }}><Icon name="chevron-forward" size={15} color={colors.muted} /></View>}
    </Pressable>;
  }
  return <View style={{ borderRadius: variant === 'C' ? 19 : variant === 'A' ? 14 : 0,
    overflow: 'hidden', borderTopWidth: compact || book ? StyleSheet.hairlineWidth : 0, borderColor: colors.line,
    backgroundColor: compact || book ? 'transparent' : colors.surface }}>
    {privateChoice && cell({ label: '我的私密选择', icon: 'lock-closed-outline', onPress: privateChoice }, true)}
    <View style={{ flexDirection: segmented ? 'row' : 'column', alignItems: 'stretch' }}>{actions.map(action => cell(action))}</View>
  </View>;
}
