import { router } from 'expo-router';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon } from '../../components/ui';
import { colors, radius, space, styles } from '../../theme';
import { formatTime, useRecord } from '../social/ui';
import type { MessageLongPress } from './record-model';

export type ChatInvitation = {
  id: string;
  gatheringId: string;
  title: string;
  mine: boolean;
  sentAt: string;
  state: string;
  startsAt?: string | null;
  place?: string | null;
  optionCount: number;
  hasCover: boolean;
};

function Cover({ id }: { id: string }) {
  const { data } = useRecord<{ gathering: { cover: string | null } }>('/p1/gatherings/' + id, 30000);
  return data?.gathering.cover
    ? <Image source={{ uri: 'data:image/jpeg;base64,' + data.gathering.cover }} resizeMode="cover" style={local.photo} />
    : null;
}

export function GatheringMessage({ value, onLongPress }: { value: ChatInvitation; onLongPress?: MessageLongPress }) {
  const timing = value.startsAt ? formatTime(value.startsAt) : '时间待定';
  const state = value.state === 'cancelled' ? '已取消' : value.state === 'completed' ? '已完成' : '约局邀请';
  return <Pressable accessibilityRole="link" accessibilityLabel={'查看约局 ' + value.title}
    onPress={() => router.push({ pathname: '/gathering/[id]', params: { id: value.gatheringId, together: '1' } })}
    onLongPress={onLongPress} style={({ pressed }) => [local.card, pressed && { opacity: 0.76 }]}>
    {value.hasCover && <Cover id={value.gatheringId} />}
    <View style={local.content}>
      <Text style={styles.small}>{state}</Text>
      <View style={styles.row}>
        <Text style={[styles.strong, styles.grow]}>{value.title}</Text>
        <Icon name="chevron-forward" size={16} color={colors.quiet} />
      </View>
      <Text style={styles.muted}>{timing}{value.state === 'interest' && value.optionCount > 1 ? ' · 候选时间' : ''}</Text>
      <Text style={styles.small}>{value.place || '地点待定'}</Text>
    </View>
  </Pressable>;
}

const local = StyleSheet.create({
  card: { width: 236, maxWidth: '100%', overflow: 'hidden', borderRadius: radius.control,
    backgroundColor: colors.panel, borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth },
  photo: { height: 106, width: '100%', backgroundColor: colors.lavender },
  content: { padding: space.sm, gap: 3 },
});
