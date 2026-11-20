import { router } from 'expo-router';
import { ListRow, Screen, Section, Icon } from '../../components/ui';
import { back, useRecord } from '../../features/social/ui';

const link = (kind: 'trip' | 'list' | 'map' | 'capsule') =>
  router.push({ pathname: '/life/projects', params: { kind } });
type Reminders = { reminders: { readAt: string | null }[] };
export default function Life() {
  const { data } = useRecord<Reminders>('/p2/reminders');
  const unread = data?.reminders.some((entry) => !entry.readAt);
  return (
    <Screen title="一起生活" back={back}>
      <Section title="见面与计划" />
      <ListRow
        title="共享日程"
        detail="安排自己的时间，和朋友找空档"
        left={<Icon name="calendar-outline" />}
        onPress={() => router.push('/life/calendar')}
      />
      <ListRow
        title="共同旅行"
        detail="按天整理目的地、行程和投票"
        left={<Icon name="airplane-outline" />}
        onPress={() => link('trip')}
      />
      <ListRow
        title="共同愿望地图"
        detail="标记自己想去、去过和推荐的地方"
        left={<Icon name="map-outline" />}
        onPress={() => router.push({ pathname: '/life/items', params: { kind: 'place' } })}
      />
      <Section title="收藏与记忆" />
      <ListRow
        title="我的收藏与好友推荐"
        detail="自由记录名称、备注、图片和链接"
        left={<Icon name="bookmark-outline" />}
        onPress={() => router.push('/life/items')}
      />
      <ListRow title="共同清单" left={<Icon name="list-outline" />} onPress={() => link('list')} />
      <ListRow
        title="共同回忆"
        detail="选一段经历，设定自己的提醒节奏"
        left={<Icon name="images-outline" />}
        onPress={() => router.push('/life/memories')}
      />
      <ListRow
        title="时光胶囊"
        detail="和朋友一起写给未来"
        left={<Icon name="time-outline" />}
        onPress={() => link('capsule')}
      />
      <ListRow
        title="生活提醒"
        detail={unread ? '有新提醒' : undefined}
        left={<Icon name="notifications-outline" />}
        onPress={() => router.push('/life/reminders')}
      />
    </Screen>
  );
}
