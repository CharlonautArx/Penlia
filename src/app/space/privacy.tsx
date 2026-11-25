import { formatHandle } from '../../services/handle';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Avatar, Empty, Icon, ListRow, Notice, Screen, Section, Sheet } from '../../components/ui';
import { demoPortrait } from '../../demo/visuals';
import { AudienceSheet, Choice } from '../../features/space/AudienceSheet';
import { historyLabels, type MomentHistory } from '../../features/space/moment-history';
import { MomentDatePicker } from '../../features/space/MomentDatePicker';
import { useRecord } from '../../features/social/ui';
import { isUiDemo } from '../../demo/mode';
import { audienceName, type Privacy, type Audience } from '../../features/space/model';
import { useSpace } from '../../features/space/store';
import { colors, styles } from '../../theme';

const comments = { friends: '可见好友可以评论和留言', closed: '关闭好友评论和留言' } as const;
const replies = { viewers: '动态可见的好友', author: '仅空间主人' } as const;

export default function PrivacyScreen() {
  const state = useSpace();
  const [panel, setPanel] = useState<'access' | 'history' | 'comments' | 'replies' | 'viewer' | 'date'>();
  const disk = state.value?.space.privacy;
  const remote = useRecord<{ privacy: Audience & MomentHistory; configured: boolean }>('/moment-space-preferences');
  const cloud = remote.data?.configured ? remote.data.privacy : undefined;
  const privacy = disk && (cloud ? { ...disk, access: { mode: cloud.mode, ids: cloud.ids }, momentHistory: cloud } : disk);
  const range: MomentHistory = privacy?.momentHistory ?? { history: privacy?.history ?? 'all' };
  function saveShared(access: Audience, history: MomentHistory, changeJournal = false) {
    if (!remote.data || remote.busy) return;
    void remote.run(async () => {
      await remote.request('/moment-space-preferences', { method: 'PUT', body: { ...access, ...history } });
      await state.save((data) => ({
        ...data, space: { ...data.space, privacy: { ...data.space.privacy, access, momentHistory: history,
          history: changeJournal && history.history !== 'custom' ? history.history : data.space.privacy.history } },
      }));
      setPanel(undefined);
    });
  }

  function save(update: Partial<Privacy>) {
    state.update((data) => ({ ...data, space: { ...data.space, privacy: { ...data.space.privacy, ...update } } }));
    setPanel(undefined);
  }

  return <Screen title="空间隐私" back={() => router.canGoBack() ? router.back() : router.replace('/moments')}>
    {state.error && <Notice action="重试" onAction={state.retry}>{state.error}</Notice>}
    {privacy ? <>
      <Notice>{isUiDemo ? '此预览版的设置保存在本机。单条可见范围仍会同时生效。' :
        '动态访问和展示时间按账号生效。日志和留言设置保存在本机。'}</Notice>
      {!!remote.error && <Notice action="重试" onAction={() => void remote.load()}>{remote.error}</Notice>}
      <Section title="谁可以访问" />
      <View style={local.group}>
        <ListRow title="空间访问权限" detail={audienceName(privacy.access)} left={<Icon name="lock-closed-outline" />}
          onPress={remote.data ? () => setPanel('access') : undefined} />
        <ListRow title="动态展示时间范围" detail={range.history === 'custom' ? (range.date ?? '自定义时间') + ' 起' : historyLabels[range.history]} left={<Icon name="time-outline" />}
          onPress={remote.data ? () => setPanel('history') : undefined} />
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
        onSave={(access) => saveShared(access, range)} onClose={() => setPanel(undefined)} />}
      {panel === 'history' && <Sheet title="动态展示时间范围" onClose={() => { if (!remote.busy) setPanel(undefined); }}>
        <Text style={styles.muted}>你始终可以查看自己的全部动态。自定义日期从当地时间当天零点开始。</Text>
        {(Object.keys(historyLabels) as (keyof typeof historyLabels)[]).map((key) => <Choice key={key} label={historyLabels[key]}
          detail={key === 'custom' && range.history === 'custom' ? range.date ?? undefined : undefined} picked={range.history === key}
          onPress={() => {
            if (remote.busy) return;
            if (key === 'custom') setPanel('date'); else saveShared(privacy.access, { history: key }, true);
          }} />)}
      </Sheet>}
      {panel === 'date' && <Sheet title="自定义展示日期" avoidKeyboard onClose={() => { if (!remote.busy) setPanel('history'); }}>
        {!!remote.error && <Notice>{remote.error}</Notice>}
        <MomentDatePicker value={range.date} busy={remote.busy}
          save={(date, zone) => saveShared(privacy.access, { history: 'custom', date, zone })} />
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
        {state.friends.map((friend) => <ListRow key={friend.userId} title={friend.name} detail={formatHandle(friend.username)}
          left={<Avatar userId={friend.userId} name={friend.name} source={demoPortrait(friend.username)} size={35} />} onPress={() => {
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
