import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { Avatar, Button, Empty, Screen } from '../../components/ui';
import { errorMessage, type User } from '../../services/api';
import { useFriends } from '../../services/friends';
import { useSession } from '../../services/session';
import { colors, styles } from '../../theme';

export default function FriendsScreen() {
  const { request } = useSession();
  const { relationships, refresh, error: listError } = useFriends();
  const [username, setUsername] = useState('');
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

  return (
    <Screen title="好友" subtitle="用账号查找好友并发送申请。">
      <View style={styles.card}>
        <View style={styles.row}>
          <TextInput accessibilityLabel="好友账号" placeholder="输入完整账号" placeholderTextColor={colors.muted}
            autoCapitalize="none" autoCorrect={false} value={username} editable={!busy} maxLength={24}
            onChangeText={(value) => { setUsername(value); setResult(undefined); }}
            onSubmitEditing={() => { if (!busy && username.trim()) search(); }}
            returnKeyType="search" style={[styles.input, styles.grow]} />
          <Button label="查找" disabled={busy || !username.trim()} onPress={search} />
        </View>
        {result === null && <Text style={styles.muted}>找不到这个账号。</Text>}
        {result && (
          <View style={styles.row}>
            <View style={styles.grow}>
              <Text style={styles.strong}>{result.name}</Text>
              <Text style={styles.muted}>@{result.username}</Text>
            </View>
            {foundRelationship ? <Text style={styles.muted}>{foundRelationship.status === 'accepted' ? '已是好友' : '已有好友申请'}</Text>
              : <Button label="发送申请" disabled={busy} onPress={() => change('/friends', { userId: result.id })} />}
          </View>
        )}
        {!!error && <Text accessibilityRole="alert" style={styles.body}>{error}</Text>}
      </View>
      <View style={styles.row}>
        <Text accessibilityRole="header" style={[styles.section, styles.grow]}>好友申请</Text>
        <Button label="刷新" icon="refresh" variant="soft" onPress={() => void refresh()} />
      </View>
      {!!listError && <Empty>{listError}</Empty>}
      {!relationships && !listError && <Empty>正在加载好友…</Empty>}
      {incoming.map((friend) => (
        <View key={friend.id} style={local.person}>
          <View style={styles.grow}>
            <Text style={styles.strong}>{friend.name}</Text>
            <Text style={styles.muted}>@{friend.username}</Text>
          </View>
          <Button label="拒绝" variant="soft" disabled={busy} onPress={() => change('/friends/decline', { id: friend.id })} />
          <Button label="接受" disabled={busy} onPress={() => change('/friends/accept', { id: friend.id })} />
        </View>
      ))}
      {outgoing.map((friend) => (
        <View key={friend.id} style={local.person}>
          <Text style={[styles.strong, styles.grow]}>{friend.name} · @{friend.username}</Text>
          <Text style={styles.muted}>等待接受</Text>
        </View>
      ))}
      {relationships && !incoming.length && !outgoing.length && <Empty>暂无好友申请。</Empty>}
      <Text accessibilityRole="header" style={styles.section}>我的好友 · {friends.length}</Text>
      {relationships && !friends.length && <Empty>还没有好友。</Empty>}
      {friends.map((friend) => (
        <View key={friend.id} style={local.person}>
          <Avatar name={friend.name} color={colors.sage} />
          <View style={styles.grow}>
            <Text style={styles.strong}>{friend.name}</Text>
            <Text style={styles.muted}>@{friend.username}{friend.bio ? ' · ' + friend.bio : ''}</Text>
          </View>
          <Button label="聊天" variant="soft"
            onPress={() => router.push({ pathname: '/chat/[id]', params: { id: friend.userId } })} />
        </View>
      ))}
    </Screen>
  );
}

const local = StyleSheet.create({
  person: { ...styles.card, ...styles.row, padding: 12, minHeight: 72 },
});
