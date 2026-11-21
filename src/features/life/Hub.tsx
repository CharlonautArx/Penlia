import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon, ListRow, SettingGroup } from '../../components/ui';
import { colors, radius, space, styles } from '../../theme';
import { OrbFace } from '../pet/Orb';
import { useRecord } from '../social/ui';
import { LifeLead } from './Editorial';

const project = (kind: 'trip' | 'list' | 'map' | 'capsule') =>
  router.push({ pathname: '/life/projects', params: { kind } });

export function LifeHub() {
  const { data } = useRecord<{ reminders: { readAt: string | null }[] }>('/p2/reminders');
  return <View style={local.hub}>
    <LifeLead title="一起生活" detail="见面，也把相处的日子留下来。" tone="mint" />
    <SettingGroup title="一起做点什么">
      <ListRow title="约朋友一起玩" detail="心愿共振与约局" left={<Icon name="calendar-clear-outline" />}
        onPress={() => router.push('/social')} />
      <ListRow title="共享日程" detail="设置忙闲，找一个都方便的时间" left={<Icon name="calendar-outline" />}
        onPress={() => router.push('/life/calendar')} />
      <ListRow title="共同旅行" left={<Icon name="airplane-outline" />} onPress={() => project('trip')} />
      <ListRow title="共同愿望地图" left={<Icon name="map-outline" />}
        onPress={() => router.push({ pathname: '/life/items', params: { kind:'place' } })} separator={false} />
    </SettingGroup>
    <SettingGroup title="把日子留下来">
      <ListRow title="瞬间共鸣" detail="每个人的照片和感受，接成同一刻" left={<Icon name="camera-outline" />}
        onPress={() => router.push({ pathname:'/world', params:{ kind:'relay' } })} />
      <ListRow title="共同日记" left={<Icon name="book-outline" />}
        onPress={() => router.push({ pathname: '/social', params: { section: 'collections' } })} />
      <ListRow title="共同回忆" left={<Icon name="images-outline" />} onPress={() => router.push('/life/memories')} />
      <ListRow title="时光胶囊" left={<Icon name="time-outline" />} onPress={() => project('capsule')} separator={false} />
    </SettingGroup>
    <Pressable accessibilityRole="button" accessibilityLabel="共同世界"
      onPress={() => router.push({ pathname:'/world', params:{ kind:'world' } })}
      style={({ pressed }) => [local.world, pressed && local.pressed]}>
      <OrbFace size={52} expression="happy" />
      <View style={styles.grow}>
        <Text style={styles.section}>共同世界</Text>
        <Text style={styles.muted}>一起布置，摆上彼此的纪念物</Text>
      </View>
      <Icon name="chevron-forward" color={colors.accent} size={17} />
    </Pressable>
    <SettingGroup title="收藏与提醒">
      <ListRow title="我的收藏与好友推荐" left={<Icon name="bookmark-outline" />} onPress={() => router.push('/life/items')} />
      <ListRow title="共同清单" left={<Icon name="list-outline" />} onPress={() => project('list')} />
      <ListRow title="生活提醒" detail={data?.reminders.some((entry) => !entry.readAt) ? '有新提醒' : undefined}
        left={<Icon name="notifications-outline" />} onPress={() => router.push('/life/reminders')} separator={false} />
    </SettingGroup>
  </View>;
}

const local = StyleSheet.create({
  hub: { gap: space.md },
  world: { ...styles.row, minHeight: 83, padding: space.md, backgroundColor: colors.pink, borderRadius: radius.surface },
  pressed: { opacity: 0.7 },
});
