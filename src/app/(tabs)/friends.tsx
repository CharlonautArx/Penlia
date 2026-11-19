import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Avatar, Button, Empty, Icon, IconButton, ListRow, Notice, Screen, SearchField, Section, Sheet } from '../../components/ui';
import { demoPortrait } from '../../demo/visuals';
import { errorMessage, type User } from '../../services/api';
import { useFriends } from '../../services/friends';
import { useSession } from '../../services/session';
import { colors, styles } from '../../theme';

export default function FriendsScreen() {
  const { request } = useSession();
  const { relationships, refresh, error: listError } = useFriends();
  const [username, setUsername] = useState('');
  const [filter, setFilter] = useState('');
  const [sheet, setSheet] = useState<'add' | 'requests'>();
  const [refreshing, setRefreshing] = useState(false);
  const [result, setResult] = useState<User | null>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const foundRelationship = relationships?.find((item) => item.userId === result?.id);

  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  function search() {
    setResult(undefined);
    void run(async () => {
      const { person } = await request<{ person: User | null }>('/people?username=' + encodeURIComponent(username.trim()));
      setResult(person);
    });
  }

  function change(path: string, body: Record<string, string>) {
    void run(async () => {
      await request(path, { method: 'POST', body });
      await refresh();
    });
  }

  const incoming = relationships?.filter((item) => item.status === 'pending' && !item.outgoing) ?? [];
  const outgoing = relationships?.filter((item) => item.status === 'pending' && item.outgoing) ?? [];
  const friends = relationships?.filter((item) => item.status === 'accepted') ?? [];

  const key = filter.trim().toLowerCase().replace(/^@/, '');
  const shown = friends.filter((friend) => !key || friend.name.includes(key) || friend.username.toLowerCase().includes(key));

  async function reload() {
    setRefreshing(true);
    try { await refresh(); } finally { setRefreshing(false); }
  }

  function openSheet(next: typeof sheet) {
    setError('');
    setSheet(next);
  }

  return (
    <Screen title="好友" solid inset={false} refreshing={refreshing} onRefresh={() => void reload()} actions={
      <IconButton label="添加好友" icon="person-add-outline" tinted onPress={() => openSheet('add')} />
    }>
      <View style={local.control}>
        <SearchField label="搜索好友" placeholder="搜索好友的昵称或朋聊号" value={filter} onChangeText={setFilter} />
        {!!listError && <Notice action="重试" onAction={() => void reload()}>{listError}</Notice>}
      </View>
      <ListRow title="新的朋友" detail={incoming.length ? '有好友申请待处理' : '查看好友申请'}
        left={<View style={local.requestsIcon}><Icon name="people-outline" color={colors.accent} /></View>}
        trailing={<View style={styles.row}>
          {incoming.length > 0 && <Text style={local.counter}>{incoming.length}</Text>}
          <Icon name="chevron-forward" size={16} color={colors.quiet} />
        </View>} onPress={() => openSheet('requests')} />
      <View style={local.section}><Section title="我的好友" detail={relationships ? friends.length + ' 位' : undefined} /></View>
      {!relationships && !listError && <Empty busy>正在加载好友…</Empty>}
      {relationships && !shown.length && <Empty icon="people-outline">{key ? '找不到匹配的好友。' : '添加一位好友，随时聊聊。'}</Empty>}
      {shown.map((friend) => <View key={friend.id} style={local.contact}>
        <View style={styles.grow}><ListRow title={friend.name} detail={'@' + friend.username + (friend.bio ? ' · ' + friend.bio : '')}
          left={<Avatar name={friend.name} source={demoPortrait(friend.username)} size={44} />}
          trailing={<View />} onPress={() => router.push({ pathname: '/person/[id]', params: { id: friend.userId } })} /></View>
        <IconButton label={`和${friend.name}聊天`} icon="chatbubble-outline"
          onPress={() => router.push({ pathname: '/chat/[id]', params: { id: friend.userId } })} />
      </View>)}
      {sheet && <Sheet title={sheet === 'add' ? '添加好友' : '新的朋友'} onClose={() => setSheet(undefined)}>
        {!!error && <Notice>{error}</Notice>}
        {sheet === 'add' ? <>
          <SearchField label="好友账号" placeholder="输入完整朋聊号" value={username}
            autoCapitalize="none" autoCorrect={false} editable={!busy} maxLength={24}
            onChangeText={(value) => { setUsername(value); setResult(undefined); }}
            onSubmitEditing={() => { if (!busy && username.trim()) search(); }} returnKeyType="search" />
          <Button label={busy ? '查找中…' : '查找'} disabled={busy || !username.trim()} onPress={search} />
          {result === null && <Empty>找不到这个朋聊号。</Empty>}
          {result && <ListRow title={result.name} detail={'@' + result.username}
            left={<Avatar name={result.name} source={demoPortrait(result.username)} />} trailing={foundRelationship
              ? <Text style={styles.small}>{foundRelationship.status === 'accepted' ? '已是好友' : '已有好友申请'}</Text>
              : <Button label="发送申请" variant="soft" disabled={busy} onPress={() => change('/friends', { userId: result.id })} />} />}
        </> : <>
          {incoming.map((friend) => <ListRow key={friend.id} title={friend.name} detail={'@' + friend.username}
            left={<Avatar name={friend.name} source={demoPortrait(friend.username)} size={36} />}
            trailing={<View style={local.requestActions}>
              <Button label="拒绝" variant="quiet" disabled={busy} onPress={() => change('/friends/decline', { id: friend.id })} />
              <Button label="接受" variant="soft" disabled={busy} onPress={() => change('/friends/accept', { id: friend.id })} />
            </View>} />)}
          {outgoing.map((friend) => <ListRow key={friend.id} title={friend.name} detail={'@' + friend.username}
            left={<Avatar name={friend.name} source={demoPortrait(friend.username)} size={36} />}
            trailing={<Text style={styles.small}>等待接受</Text>} />)}
          {!incoming.length && !outgoing.length && <Empty icon="people-outline">目前没有待处理的好友申请。</Empty>}
        </>}
      </Sheet>}
    </Screen>
  );
}

const local = StyleSheet.create({
  control: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 9, gap: 8 },
  section: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 7, backgroundColor: colors.backdrop },
  requestsIcon: { width: 46, height: 46, borderRadius: 13, backgroundColor: colors.pink, alignItems: 'center', justifyContent: 'center' },
  counter: { fontSize: 12, color: colors.accent, backgroundColor: colors.pink, borderRadius: 10, overflow: 'hidden', paddingHorizontal: 6, paddingVertical: 2 },
  contact: { ...styles.row, gap: 0, paddingRight: 6 },
  requestActions: { flexDirection: 'row' },
});
