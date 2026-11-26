import { Pressable, Text, View } from 'react-native';
import { Invitation } from '../together/ui';
import { useSession } from '../../services/session';
import { styles } from '../../theme';
import { useTogetherRouter } from '../together/navigation';
import { type Href } from 'expo-router';

import { Icon, ListRow, SettingGroup, type IconName } from '../together/ui';
import { useRecord } from '../social/ui';

const routes: readonly (readonly { title: string; icon: IconName; href: Href }[])[] = [
  [
    { title: '约朋友一起玩', icon: 'calendar-clear-outline', href: '/playground/with-friends' },
    { title: '共享日程', icon: 'calendar-outline', href: '/life/calendar' },
    {
      title: '共同旅行',
      icon: 'airplane-outline',
      href: { pathname: '/life/projects', params: { kind: 'trip' } },
    },
    {
      title: '共同愿望地图',
      icon: 'map-outline',
      href: { pathname: '/life/items', params: { kind: 'place' } },
    },
  ],
  [
    { title: '瞬间共鸣', icon: 'camera-outline', href: { pathname: '/world', params: { kind: 'relay' } } },
    {
      title: '共同日记',
      icon: 'book-outline',
      href: { pathname: '/social', params: { section: 'collections' } },
    },
    { title: '共同回忆', icon: 'images-outline', href: '/life/memories' },
    {
      title: '时光胶囊',
      icon: 'time-outline',
      href: { pathname: '/life/projects', params: { kind: 'capsule' } },
    },
    { title: '共同世界', icon: 'planet-outline', href: { pathname: '/world', params: { kind: 'world' } } },
  ],
  [
    {
      title: '共同清单',
      icon: 'list-outline',
      href: { pathname: '/life/projects', params: { kind: 'list' } },
    },
    { title: '我的收藏与好友推荐', icon: 'bookmark-outline', href: '/life/items' },
    { title: '生活提醒', icon: 'notifications-outline', href: '/life/reminders' },
  ],
];

export function LifeHub() {
  const router = useTogetherRouter();
  const { data } = useRecord<{ reminders: { readAt: string | null }[] }>('/p2/reminders');
  const hasReminders = data?.reminders.some((entry) => !entry.readAt);
  const { session } = useSession();
  const events = useRecord<{
    gatherings: {
      id: string;
      title: string;
      state: string;
      cover?: string;
      confirmed?: boolean;
      ownerId?: string;
      startsAt?: string;
      createdAt?: string;
    }[];
  }>('/p1/gatherings');
  const upcoming =
    events.data?.gatherings.filter((event) => ['interest', 'confirming', 'formed'].includes(event.state)) ??
    [];
  const lead = [...upcoming].sort(
    (a, b) =>
      (a.startsAt ? Date.parse(a.startsAt) : Infinity) - (b.startsAt ? Date.parse(b.startsAt) : Infinity),
  )[0];
  const pending = upcoming.find(
    (event) => event.ownerId !== session?.user.id && !event.confirmed && event.state === 'confirming',
  );
  return (
    <>
      {lead ? (
        <HubInvitation key={lead.id} id={lead.id} title={lead.title} state={lead.state} />
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="发起约局"
          onPress={() => router.push('/gathering/new')}
        >
          <Invitation title="发起约局" detail="约朋友一起玩" />
        </Pressable>
      )}
      {pending && (
        <ListRow
          title="待我确认"
          detail={pending.title}
          onPress={() => router.push({ pathname: '/gathering/[id]', params: { id: pending.id } })}
        />
      )}
      {upcoming
        .filter((event) => event.id !== lead?.id && event.id !== pending?.id)
        .slice(0, 3)
        .map((event) => (
          <ListRow
            key={event.id}
            title={event.title}
            detail={event.state === 'formed' ? '已成局' : '待商量'}
            onPress={() => router.push({ pathname: '/gathering/[id]', params: { id: event.id } })}
          />
        ))}
      <ListRow
        title="邀请与消息"
        left={<Icon name="mail-outline" />}
        onPress={() => router.push({ pathname: '/social', params: { section: 'events' } })}
      />

      {routes.map((rows, i) => (
        <View style={{ gap: 8 }} key={rows[0].title}>
          <Text style={styles.section}>{['见面与出行', '共同记录', '日常生活'][i]}</Text>
          <SettingGroup>
            {rows.map(({ title, href, icon }, index) => (
              <ListRow
                key={title}
                title={title}
                detail={href === '/life/reminders' && hasReminders ? '有新提醒' : undefined}
                left={<Icon name={icon} />}
                onPress={() => router.push(href)}
                separator={index < rows.length - 1}
              />
            ))}
          </SettingGroup>
        </View>
      ))}
    </>
  );
}

function HubInvitation({ id, title, state }: { id: string; title: string; state: string }) {
  const router = useTogetherRouter();
  const { data, error } = useRecord<{
    gathering: { cover?: string; title: string; choiceId?: string; confirmed: boolean };
    options: { id: string; startsAt: string }[];
  }>('/p1/gatherings/' + id, 15000);
  if (error) return null;
  const selected = data?.options.find((o) => o.id === data.gathering.choiceId);
  const date = selected
    ? new Date(selected.startsAt).toLocaleDateString('zh-CN', {
        month: 'long',
        day: 'numeric',
        weekday: 'short',
      })
    : '';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={() => router.push({ pathname: '/gathering/[id]', params: { id } })}
    >
      <Invitation
        title={data?.gathering.title ?? title}
        cover={data?.gathering.cover}
        detail={[
          state === 'interest'
            ? '待商量'
            : state === 'formed'
              ? '已成局'
              : data?.gathering.confirmed
                ? '已确认参加'
                : '自愿确认',
          date,
        ]
          .filter(Boolean)
          .join('  ·  ')}
      />
    </Pressable>
  );
}
