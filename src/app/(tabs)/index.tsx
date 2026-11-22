import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Avatar, Empty, LoadingSkeleton, Notice, Screen, SearchField } from '../../components/ui';
import { PetSignal } from '../../features/pet/mark';
import { demoPortrait } from '../../demo/visuals';
import { useDemo } from '../../demo/state';
import { type Relationship } from '../../services/api';
import { useFriends } from '../../services/friends';
import { readPeerMessage, summaryOf, type RichMessage } from '../../features/media/messages';
import { imUserId, useIm } from '../../services/im';
import { useSession } from '../../services/session';
import { space } from '../../theme';
import { KeyboardInsets } from '../../features/chat/Viewport';
import { ConversationRow } from '../../features/chat/ui';
import { useReportConversationUnread } from '../../features/chat/unread';

type Thread = { person: Relationship; last: RichMessage; unread: number; pinned?: boolean; pinnedTime?: number };

export default function ChatsScreen() {
  const { session } = useSession();
  const { relationships, refresh, error: friendsError } = useFriends();
  const { connection, status, retry, revision } = useIm();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [listError, setListError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
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
          return [{ person: accepted.get(item.convId)!, last, unread, pinned: item.isPinned, pinnedTime: item.pinnedTime }];
        }));
        if (active) {
          setThreads(rows.flat().sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned)
            || (a.pinned && b.pinned ? (b.pinnedTime ?? 0) - (a.pinnedTime ?? 0) : 0)
            || b.last.timestamp - a.last.timestamp));
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

  const visibleThreads: Thread[] = demo
    ? (relationships ?? []).flatMap((person) => {
      const lastText = demo.messages[person.userId]?.at(-1);
      const lastMedia = demo.media[person.userId]?.at(-1);
      const last = lastMedia && (!lastText || lastMedia.timestamp >= lastText.timestamp) ? lastMedia : lastText;
      return person.status === 'accepted' && last ? [{ person, last, unread: demo.unread[person.userId] ?? 0 }] : [];
    }).sort((a, b) => b.last.timestamp - a.last.timestamp)
    : threads.filter(({ person }) => relationships?.some((contact) => contact.userId === person.userId && contact.status === 'accepted'));

  const reportUnread = useReportConversationUnread();
  const unreadTotal = visibleThreads.reduce((sum, thread) => sum + thread.unread, 0);
  useEffect(() => { reportUnread(unreadTotal); }, [reportUnread, unreadTotal]);

  const term = query.trim().toLowerCase();
  const filtered = visibleThreads.filter(({ person, last }) =>
    !term || [person.name, person.username, summaryOf(last)].some((value) => value.toLowerCase().includes(term)));
  async function reload() {
    setRefreshing(true);
    try { await refresh(); } finally { setRefreshing(false); }
  }

  return (
    <KeyboardInsets>
      <Screen solid inset={false} refreshing={refreshing} onRefresh={() => void reload()}>
        <View style={local.controls}>
          <SearchField variant="glass" label="搜索会话" placeholder="搜索联系人或消息" value={query} onChangeText={setQuery} returnKeyType="search" />
          {!!status && <Notice action="重连" onAction={retry}>{status}</Notice>}
          {!!(friendsError || listError) && <Notice action="重试" onAction={() => void reload()}>{friendsError || listError}</Notice>}
        </View>
        {filtered.map(({ person, last, unread, pinned }) => (
          <ConversationRow key={person.userId} name={person.name}
            avatar={<Avatar name={person.name} source={demoPortrait(person.username)} size={48} />}
            preview={(last.mine ? '我：' : '') + summaryOf(last).replace(/\s+/g, ' ')}
            time={threadTime(last.timestamp)} unread={unread} pinned={pinned} silent={last.silent}
            signal={<PetSignal peer={person.userId} />}
            onPress={() => router.push({ pathname: '/chat/[id]', params: { id: person.userId } })} />
        ))}
        {filtered.length === 0 && !(friendsError || listError) && (
          !relationships || (!demo && connection && !loaded) ? <LoadingSkeleton label="正在加载会话" /> :
            (demo || connection) && <Empty>{term ? '没有找到符合条件的会话。' : '还没有会话。可以从好友页开始聊天。'}</Empty>
        )}
      </Screen>
    </KeyboardInsets>
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
  controls: { gap: space.xs, paddingHorizontal: space.md, paddingTop: space.sm, paddingBottom: space.sm },
});
