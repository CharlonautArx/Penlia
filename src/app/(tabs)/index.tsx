import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar, Button, Empty, Screen } from '../../components/ui';
import { type Relationship } from '../../services/api';
import { useFriends } from '../../services/friends';
import { imUserId, textMessage, type TextMessage, useIm } from '../../services/im';
import { useSession } from '../../services/session';
import { colors, styles } from '../../theme';

type Thread = { person: Relationship; last: TextMessage; unread: number };

export default function ChatsScreen() {
  const { session } = useSession();
  const { relationships, refresh, error: friendsError } = useFriends();
  const { connection, status, retry, revision } = useIm();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [listError, setListError] = useState('');
  const ownId = session?.user.id;

  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  useEffect(() => {
    if (!connection || !relationships || !ownId) return;
    const { client, sdk } = connection;
    const accepted = new Map(relationships.filter((person) => person.status === 'accepted')
      .map((person) => [imUserId(person.userId), person]));
    let active = true;
    async function load() {
      try {
        const local = await client.chatManager.getAllConversations();
        const visible = local.filter((item) => item.convType === sdk.ChatConversationType.PeerChat && accepted.has(item.convId));
        const rows = await Promise.all(visible.map(async (item) => {
          const [message, unread] = await Promise.all([item.getLatestMessage(), item.getUnreadCount()]);
          const last = textMessage(connection!, message, imUserId(ownId!));
          if (!last) return [];
          return [{ person: accepted.get(item.convId)!, last, unread }];
        }));
        if (active) {
          setThreads(rows.flat().sort((a, b) => b.last.timestamp - a.last.timestamp));
          setListError('');
        }
      } catch {
        if (active) setListError('暂时无法读取会话。');
      }
    }
    void load();
    return () => { active = false; };
  }, [connection, ownId, relationships, revision]);

  return (
    <Screen title="聊天" subtitle="查看最近会话，或去好友列表发起聊天。">
      {!!status && <View style={styles.card}>
        <Text style={styles.body}>{status}</Text>
        <Button label="重连" variant="soft" onPress={retry} />
      </View>}
      {!!(friendsError || listError) && <Empty>{friendsError || listError}</Empty>}
      <Text accessibilityRole="header" style={styles.section}>最近会话</Text>
      {connection && !threads.length && !listError && <Empty>暂无会话。可以从好友页发起聊天。</Empty>}
      {threads.map(({ person, last, unread }) => (
        <Pressable key={person.userId} accessibilityRole="button"
          accessibilityLabel={`${person.name}，${unread ? unread + ' 条未读消息，' : ''}${last.text}`}
          onPress={() => router.push({ pathname: '/chat/[id]', params: { id: person.userId } })}
          style={({ pressed }) => [styles.row, local.thread, pressed && local.pressed]}>
          <Avatar name={person.name} color={colors.sage} size={52} />
          <View style={styles.grow}>
            <Text style={styles.strong}>{person.name}</Text>
            <Text numberOfLines={1} style={styles.muted}>{last.mine ? '我：' : ''}{last.text}</Text>
          </View>
          <View style={local.meta}>
            <Text style={styles.small}>{new Date(last.timestamp).toLocaleDateString('zh-CN')}</Text>
            {unread > 0 && <View style={local.dot} />}
          </View>
        </Pressable>
      ))}
    </Screen>
  );
}

const local = StyleSheet.create({
  thread: { ...styles.card, padding: 13, minHeight: 78 },
  pressed: { backgroundColor: colors.sage },
  meta: { alignItems: 'flex-end', gap: 7 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.green },
});
