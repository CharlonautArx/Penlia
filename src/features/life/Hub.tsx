import { router, type Href } from 'expo-router';

import { Icon, ListRow, SettingGroup, type IconName } from '../../components/ui';
import { useRecord } from '../social/ui';

const routes: readonly (readonly { title: string; icon: IconName; href: Href }[])[] = [
  [
    { title: '约朋友一起玩', icon: 'calendar-clear-outline', href: '/playground/with-friends' },
    { title: '共享日程', icon: 'calendar-outline', href: '/life/calendar' },
    { title: '共同旅行', icon: 'airplane-outline', href: { pathname: '/life/projects', params: { kind: 'trip' } } },
    { title: '共同愿望地图', icon: 'map-outline', href: { pathname: '/life/items', params: { kind: 'place' } } },
  ],
  [
    { title: '瞬间共鸣', icon: 'camera-outline', href: { pathname: '/world', params: { kind: 'relay' } } },
    { title: '共同日记', icon: 'book-outline', href: { pathname: '/social', params: { section: 'collections' } } },
    { title: '共同回忆', icon: 'images-outline', href: '/life/memories' },
    { title: '时光胶囊', icon: 'time-outline', href: { pathname: '/life/projects', params: { kind: 'capsule' } } },
    { title: '共同世界', icon: 'planet-outline', href: { pathname: '/world', params: { kind: 'world' } } },
  ],
  [
    { title: '共同清单', icon: 'list-outline', href: { pathname: '/life/projects', params: { kind: 'list' } } },
    { title: '我的收藏与好友推荐', icon: 'bookmark-outline', href: '/life/items' },
    { title: '生活提醒', icon: 'notifications-outline', href: '/life/reminders' },
  ],
];

export function LifeHub() {
  const { data } = useRecord<{ reminders: { readAt: string | null }[] }>('/p2/reminders');
  const hasReminders = data?.reminders.some((entry) => !entry.readAt);
  return <>
    {routes.map((rows) => <SettingGroup key={rows[0].title}>
      {rows.map(({ title, href, icon }, index) => <ListRow key={title} title={title}
        detail={href === '/life/reminders' && hasReminders ? '有新提醒' : undefined}
        left={<Icon name={icon} />} onPress={() => router.push(href)} separator={index < rows.length - 1} />)}
    </SettingGroup>)}
  </>;
}
