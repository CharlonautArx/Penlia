import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar, Empty, Icon, IconButton, ListRow, Notice, Screen, SearchField, Sheet } from '../../components/ui';
import { PetSignal } from '../../features/pet/mark';
import { demoPortrait } from '../../demo/visuals';
import { useDemo } from '../../demo/state';
import { type Relationship } from '../../services/api';
import { useFriends } from '../../services/friends';
import { readPeerMessage, summaryOf, type RichMessage } from '../../features/media/messages';
import { imUserId, useIm } from '../../services/im';
import { useSession } from '../../services/session';
import { colors, styles } from '../../theme';

type Thread = { person: Relationship; last: RichMessage; unread: number };

export default function ChatsScreen() {
  const { session } = useSession();
  const { relationships, refresh, error: friendsError } = useFriends();
  const { connection, status, retry, revision } = useIm();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [listError, setListError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [compose, setCompose] = useState(false);
  const ownId = session?.user.id;
  const demo = useDemo();

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
          const last = readPeerMessage(connection!, message, imUserId(ownId!), item.convId);
          if (!last) return [];
          return [{ person: accepted.get(item.convId)!, last, unread }];
        }));
        if (active) {
          setThreads(rows.flat().sort((a, b) => b.last.timestamp - a.last.timestamp));
          setListError('');
          setLoaded(true);
        }
      } catch {
        if (active) setListError('暂时无法读取会话。');
      }
    }
    void load();
    return () => { active = false; };
  }, [connection, ownId, relationships, revision]);

  const visibleThreads = demo
    ? (relationships ?? []).flatMap((person) => {
      const lastText = demo.messages[person.userId]?.at(-1);
      const lastMedia = demo.media[person.userId]?.at(-1);
      const last = lastMedia && (!lastText || lastMedia.timestamp >= lastText.timestamp) ? lastMedia : lastText;
      return person.status === 'accepted' && last ? [{ person, last, unread: demo.unread[person.userId] ?? 0 }] : [];
    }).sort((a, b) => b.last.timestamp - a.last.timestamp)
    : threads.filter(({ person }) => relationships?.some((contact) => contact.userId === person.userId && contact.status === 'accepted'));

  const term = query.trim().toLowerCase();
  const filtered = visibleThreads.filter(({ person, last }) =>
    !term || [person.name, person.username, summaryOf(last)].some((value) => value.toLowerCase().includes(term)));
  const accepted = relationships?.filter((person) => person.status === 'accepted') ?? [];

  function openChat(id: string) {
    setCompose(false);
    router.push({ pathname: '/chat/[id]', params: { id } });
  }

  async function reload() {
    setRefreshing(true);
    try { await refresh(); } finally { setRefreshing(false); }
  }

  return (
    <Screen title="聊天" solid inset={false} refreshing={refreshing} onRefresh={() => void reload()} actions={
      <>
        {!demo && <IconButton label="群聊" icon="people-outline" onPress={() => router.push('/groups')} />}
        <IconButton label="发起会话" icon="add-outline" tinted onPress={() => setCompose(true)} />
      </>
    }>
      <View style={local.controls}>
        <SearchField label="搜索会话" placeholder="搜索联系人或消息" value={query} onChangeText={setQuery} returnKeyType="search" />
        {!!status && <Notice action="重连" onAction={retry}>{status}</Notice>}
        {!!(friendsError || listError) && <Notice action="重试" onAction={() => void reload()}>{friendsError || listError}</Notice>}
      </View>
      {filtered.map(({ person, last, unread }) => (
        <Pressable key={person.userId} accessibilityRole="button"
          accessibilityLabel={`${person.name}，${unread ? unread + ' 条未读消息，' : ''}${summaryOf(last)}`}
          onPress={() => openChat(person.userId)} style={({ pressed }) => [local.thread, pressed && local.pressed]}>
          <Avatar name={person.name} source={demoPortrait(person.username)} size={48} />
          <View style={local.threadBody}>
            <View style={local.line}>
              <View style={[local.threadName, styles.grow]}>
                <Text style={styles.strong} numberOfLines={1}>{person.name}</Text><PetSignal peer={person.userId} />
              </View>
              <Text style={styles.small}>{threadTime(last.timestamp)}</Text>
            </View>
            <View style={local.line}>
              <Text numberOfLines={1} style={[styles.muted, styles.grow]}>{last.mine ? '我：' : ''}{summaryOf(last).replace(/\s+/g, ' ')}</Text>
              {unread > 0 && <View style={local.badge}>
                <Text style={local.badgeText}>{unread > 99 ? '99+' : unread}</Text>
              </View>}
            </View>
          </View>
        </Pressable>
      ))}
      {filtered.length === 0 && !(friendsError || listError) && (
        !relationships || (!demo && connection && !loaded) ? <Empty busy>正在加载会话…</Empty> :
          (demo || connection) && <Empty>{term ? '没有找到符合条件的会话。' : '还没有会话。点右上角，和好友聊聊。'}</Empty>
      )}
      {compose && <Sheet title="发起会话" onClose={() => setCompose(false)}>
        <ListRow title="查找或添加好友" left={<Icon name="person-add-outline" />}
          onPress={() => { setCompose(false); router.navigate('/friends'); }} />
        {accepted.map((person) => <ListRow key={person.userId} title={person.name} detail={'@' + person.username}
          left={<Avatar name={person.name} source={demoPortrait(person.username)} size={40} />}
          onPress={() => openChat(person.userId)} />)}
        {accepted.length === 0 && <Empty>添加一位好友，就可以开始聊天。</Empty>}
      </Sheet>}
    </Screen>
  );
}

function threadTime(timestamp: number) {
  const date = new Date(timestamp);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
  }
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return '昨天';
  const parts = { month: 'numeric', day: 'numeric' } as const;
  return date.toLocaleDateString('zh-CN', date.getFullYear() === today.getFullYear() ? parts : { ...parts, year: 'numeric' });
}

const local = StyleSheet.create({
  controls: { gap: 8, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 7 },
  thread: { flexDirection: 'row', alignItems: 'center', paddingLeft: 16, gap: 12, minHeight: 71 },
  threadBody: { ...styles.grow, ...styles.divider, alignSelf: 'stretch', justifyContent: 'center', gap: 4, paddingRight: 16, paddingVertical: 8 },
  threadName: { ...styles.row, gap: 6 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 19 },
  badge: { minWidth: 18, height: 18, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#B83259', borderRadius: 10 },
  badgeText: { color: '#FFFFFF', fontSize: 11, lineHeight: 14, fontWeight: '800' },
  pressed: { backgroundColor: colors.backdrop },
});
