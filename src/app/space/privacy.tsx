import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Avatar, Empty, Icon, ListRow, Notice, Screen, Section, Sheet } from '../../components/ui';
import { demoPortrait } from '../../demo/visuals';
import { AudienceSheet, Choice } from '../../features/space/AudienceSheet';
import { audienceName, type Privacy } from '../../features/space/model';
import { useSpace } from '../../features/space/store';
import { colors, styles } from '../../theme';

const history = { all: '全部历史', '3d': '最近三天', '180d': '最近半年' } as const;
const comments = { friends: '可见好友可以评论和留言', closed: '关闭好友评论和留言' } as const;
const replies = { viewers: '动态可见的好友', author: '仅空间主人' } as const;

export default function PrivacyScreen() {
  const state = useSpace();
  const [panel, setPanel] = useState<'access' | 'history' | 'comments' | 'replies' | 'viewer'>();
  const privacy = state.value?.space.privacy;

  function save(update: Partial<Privacy>) {
    state.update((data) => ({ ...data, space: { ...data.space, privacy: { ...data.space.privacy, ...update } } }));
    setPanel(undefined);
  }

  return <Screen title="空间隐私" back={() => router.canGoBack() ? router.back() : router.replace('/moments')}>
    {state.error && <Notice action="重试" onAction={state.retry}>{state.error}</Notice>}
    {privacy ? <>
      <Notice>当前设置只在这台设备生效。单条内容的限制也会同时生效。</Notice>
      <Section title="谁可以访问" />
      <View style={local.group}>
        <ListRow title="空间访问权限" detail={audienceName(privacy.access)} left={<Icon name="lock-closed-outline" />}
          onPress={() => setPanel('access')} />
        <ListRow title="动态历史范围" detail={history[privacy.history]} left={<Icon name="time-outline" />}
          onPress={() => setPanel('history')} />
      </View>
      <Section title="留言与互动" />
      <View style={local.group}>
        <ListRow title="评论与留言权限" detail={comments[privacy.interact]} left={<Icon name="chatbubble-outline" />}
          onPress={() => setPanel('comments')} />
        <ListRow title="谁能看到评论和留言" detail={replies[privacy.revealReplies]} left={<Icon name="eye-outline" />}
          onPress={() => setPanel('replies')} />
      </View>
      <View style={local.group}>
        <ListRow title="从好友视角预览" detail="核对空间、历史范围和单条动态的可见效果" left={<Icon name="people-outline" />}
          onPress={() => setPanel('viewer')} />
      </View>
      {panel === 'access' && <AudienceSheet title="空间访问权限" initial={privacy.access} friends={state.friends}
        onSave={(access) => save({ access })} onClose={() => setPanel(undefined)} />}
      {panel === 'history' && <Sheet title="动态历史范围" onClose={() => setPanel(undefined)}>
        <Text style={styles.muted}>只限制好友能看到的说说和日志。你始终可以查看自己的历史。</Text>
        {(Object.keys(history) as (keyof typeof history)[]).map((value) => <Choice key={value}
          label={history[value]} picked={value === privacy.history} onPress={() => save({ history: value })} />)}
      </Sheet>}
      {panel === 'comments' && <Sheet title="评论与留言权限" onClose={() => setPanel(undefined)}>
        {(Object.keys(comments) as (keyof typeof comments)[]).map((value) => <Choice key={value}
          label={comments[value]} picked={value === privacy.interact} onPress={() => save({ interact: value })} />)}
      </Sheet>}
      {panel === 'replies' && <Sheet title="谁能看到评论和留言" onClose={() => setPanel(undefined)}>
        {(Object.keys(replies) as (keyof typeof replies)[]).map((value) => <Choice key={value}
          label={replies[value]} picked={value === privacy.revealReplies} onPress={() => save({ revealReplies: value })} />)}
      </Sheet>}
      {panel === 'viewer' && <Sheet title="选择预览好友" onClose={() => setPanel(undefined)}>
        {state.friends.map((friend) => <ListRow key={friend.userId} title={friend.name} detail={'@' + friend.username}
          left={<Avatar name={friend.name} source={demoPortrait(friend.username)} size={35} />} onPress={() => {
            if (!state.me) return;
            setPanel(undefined);
            router.push({ pathname: '/space/[id]', params: { id: state.me.id, viewer: friend.userId } });
          }} />)}
        {!state.friends.length && <Text style={styles.muted}>现在还没有可预览的好友。</Text>}
      </Sheet>}
    </> : <Empty busy={state.loading}>正在读取空间设置…</Empty>}
  </Screen>;
}

const local = StyleSheet.create({
  group: { backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: 13, overflow: 'hidden' },
});
