import { useRecalls } from '../../features/chat/recalls';
import { applyRecalls, recalledCaption } from '../../features/chat/recall-model';
import { useChatHistory } from '../../features/chat/history';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSharedValue } from 'react-native-reanimated';

import { Avatar, Button, Empty, LoadingSkeleton, Notice, Screen, SearchField } from '../../components/ui';
import { PetSignal } from '../../features/pet/mark';
import { demoPortrait } from '../../demo/visuals';
import { useDemo } from '../../demo/state';
import { errorMessage, type Relationship } from '../../services/api';
import { useFriends } from '../../services/friends';
import { readPeerMessage, summaryOf, type RichMessage } from '../../features/media/messages';
import { imUserId, useIm } from '../../services/im';
import { useSession } from '../../services/session';
import { colors, space, styles } from '../../theme';
import { KeyboardInsets } from '../../features/chat/Viewport';
import {
  conversationAppearance, conversationMatches, orderConversations, setConversationPreference,
} from '../../features/chat/conversation-preferences';
import { ConversationSwipe, type ConversationAction } from '../../features/chat/ConversationSwipe';
import { useConversationPreferences } from '../../features/chat/useConversationPreferences';
import { useDirectory } from '../../features/friends/store';
import { formatHandle } from '../../services/handle';
import { isDesignPilot, useDesignPilot } from '../../features/design-pilot/context';
import { DesignSwitch, PilotInboxHeader, PilotInboxRow } from '../../features/chat/PilotInbox';
import { ConversationRow } from '../../features/chat/ui';
import { useReportConversationUnread } from '../../features/chat/unread';

type ThreadMessage = ReturnType<typeof applyRecalls<RichMessage>>[number];
type Thread = { person: Relationship; last: ThreadMessage; unread: number; pinned?: boolean };

function threadSummary(value: ThreadMessage) {
  return 'kind' in value && value.kind === 'recalled' ? recalledCaption(value.mine) :
    (value.mine ? '我：' : '') + summaryOf(value);
}
export default function ChatsScreen() {
  const pilot = useDesignPilot();
  const custom = pilot.variant !== 'original';
  const { session } = useSession();
  const { relationships, refresh, error: friendsError } = useFriends();
  const { connection, status, retry, revision, changed } = useIm();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [listError, setListError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const owner = useSharedValue<string | null>(null);
  const closeSwipe = useCallback(() => { owner.value = null; }, [owner]);
  const ownId = session?.user.id;
  const demo = useDemo();
  const preferences = useConversationPreferences();
  const { peers: recalls, ready: recallsReady } = useRecalls();
  const { all: deleted } = useChatHistory();
  const { value: directory } = useDirectory();

  useFocusEffect(useCallback(() => {
    void refresh();
    return closeSwipe;
  }, [refresh, closeSwipe]));

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
          let [message, unread] = await Promise.all([item.getLatestMessage(), item.getUnreadCount()]);
          const hidden = new Set(deleted?.['peer:' + accepted.get(item.convId)!.userId]);
          if (message && hidden.has(message.msgId)) {
            const history = await client.chatManager.getMsgs({ convId: item.convId, convType: item.convType, startMsgId: '', loadCount: 50 });
            message = history.filter((entry) => !hidden.has(entry.msgId)).sort((a, b) =>
              (b.serverTime || b.localTime) - (a.serverTime || a.localTime))[0];
          }
          const candidate = readPeerMessage(connection!, message, imUserId(ownId!), item.convId);
          const last = applyRecalls(candidate ? [candidate] : [], recalls[accepted.get(item.convId)!.userId] ?? {}, hidden)[0];
          if (!last) return [];
          return [{ person: accepted.get(item.convId)!, last, unread, pinned: item.isPinned }];
        }));
        if (active) {
          const threads = rows.flat();
          const existing = new Set(threads.map((row) => row.person.userId));
          const markers = [...accepted.values()].flatMap((person) => {
            if (existing.has(person.userId)) return [];
            const hidden = new Set(deleted?.['peer:' + person.userId]);
            const last = applyRecalls<RichMessage>([], recalls[person.userId] ?? {}, hidden)[0];
            return last ? [{ person, last, unread: 0 }] : [];
          });
          setThreads([...threads, ...markers]);
          setListError('');
          setLoaded(true);
        }
      } catch {
        if (active) setListError('暂时无法读取会话。');
      }
    }
    void load();
    return () => { active = false; };
  }, [connection, ownId, relationships, revision, deleted, recalls]);

  const visibleThreads: Thread[] = !recallsReady || !deleted ? [] : demo
    ? (relationships ?? []).flatMap((person) => {
      const hidden = new Set(deleted?.['peer:' + person.userId]);
      const last = applyRecalls([...(demo.messages[person.userId] ?? []), ...(demo.media[person.userId] ?? [])],
        recalls[person.userId] ?? {}, hidden)[0];
      return person.status === 'accepted' && last ? [{ person, last, unread: demo.unread[person.userId] ?? 0 }] : [];
    })
    : threads.filter(({ person }) => relationships?.some((contact) => contact.userId === person.userId && contact.status === 'accepted'));

  const rows = orderConversations(visibleThreads.map((thread) => ({
    ...thread, ...conversationAppearance(preferences.value?.[thread.person.userId], thread.pinned),
  })));
  const reportUnread = useReportConversationUnread();
  const unreadTotal = rows.reduce((sum, thread) => sum + thread.unread, 0);
  const hasManualUnread = rows.some((thread) => thread.manualUnread && thread.unread === 0);
  useEffect(() => { reportUnread(unreadTotal, hasManualUnread); }, [reportUnread, unreadTotal, hasManualUnread]);

  const term = formatHandle(query).toLowerCase();
  const filtered = rows.filter(({ person, last, hidden }) => conversationMatches(
    [person.name, formatHandle(person.username), directory?.remarks[person.userId] ?? '', threadSummary(last)], term, hidden,
  ));

  function openPeer(id: string) {
    const wasOpen = owner.value === id;
    closeSwipe();
    if (!wasOpen) router.push({ pathname: '/chat/[id]', params: { id } });
  }

  async function act(thread: typeof rows[number], action: ConversationAction | 'restore') {
    if (!preferences.value || saving.current) return;
    const id = thread.person.userId;
    saving.current = true;
    setBusy(true);
    setActionError('');
    closeSwipe();
    try {
      switch (action) {
        case 'pin':
          await preferences.save((value) => setConversationPreference(value, id, { pinned: !thread.pinned }));
          break;
        case 'hide':
        case 'restore':
          await preferences.save((value) => setConversationPreference(value, id, { hidden: action === 'hide' }));
          break;
        case 'unread': {
          const makeUnread = !thread.manualUnread && !thread.unread;
          if (!makeUnread && thread.unread) {
            if (demo) demo.markRead(id);
            else if (connection) {
              await connection.client.chatManager.clearConversationUnreadMessageCount(imUserId(id));
              setThreads((current) => current.map((entry) => entry.person.userId === id ? { ...entry, unread: 0 } : entry));
              changed();
            } else throw new Error('暂时无法读取会话，请重试。');
          }
          await preferences.save((value) => setConversationPreference(value, id, { manualUnread: makeUnread }));
          break;
        }
      }
    } catch (failure) {
      setActionError(errorMessage(failure));
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  async function reload() {
    setRefreshing(true);
    try { await refresh(); } finally { setRefreshing(false); }
  }

  return (
    <GestureHandlerRootView style={local.root}>
      <KeyboardInsets>
        <Screen solid inset={false} fill refreshing={refreshing} onRefresh={() => void reload()}
          renderScroll={custom ? (props) => <ScrollView {...props} style={{ backgroundColor: pilot.colors.background }} /> : undefined}
          onScroll={() => { if (owner.value) closeSwipe(); }}>
          <View style={local.controls}>
            {custom ? <PilotInboxHeader pilot={pilot} value={query} onFocus={closeSwipe}
              onChange={(next) => { closeSwipe(); setQuery(next); }} /> : <View style={local.searchLine}><View style={styles.grow}>
            <SearchField variant="glass" label="搜索会话" placeholder="搜索联系人或消息" value={query}
              onFocus={closeSwipe} onChangeText={(next) => { closeSwipe(); setQuery(next); }} returnKeyType="search" /></View>{isDesignPilot && <DesignSwitch color={pilot.colors.muted} />}</View>}
            {!!status && <Notice action="重连" onAction={retry}>{status}</Notice>}
            {!!(friendsError || listError) && <Notice action="重试" onAction={() => void reload()}>{friendsError || listError}</Notice>}
            {!!preferences.error && <Notice action="重试" onAction={preferences.retry}>{preferences.error}</Notice>}
            {!!actionError && <Notice>{actionError}</Notice>}
          </View>
          <View style={pilot.variant === 'C' ? local.groupedList : pilot.variant === 'D' ? local.letterList : undefined}>
          {preferences.value && filtered.map((thread, index) => {
            const { person, last, unread, pinned, manualUnread, hidden } = thread;
            const lead = index === 0 && !term;
            const avatarSize = pilot.variant === 'D' ? 26 : pilot.variant === 'B' ? 36 : pilot.variant === 'A' && lead ? 72 : 48;
            const rowProps = {
              name: directory?.remarks[person.userId] || person.name,
              avatar: <Avatar userId={person.userId} name={person.name} source={demoPortrait(person.username)} size={avatarSize} />,
              preview: threadSummary(last).replace(/\s+/g, ' '), time: threadTime(last.timestamp),
              unread, pinned, manualUnread, silent: 'silent' in last && last.silent, noReply: 'noReply' in last && last.noReply,
              signal: <PetSignal peer={person.userId} />, onPress: () => openPeer(person.userId),
            };
            const row = custom ? <PilotInboxRow {...rowProps} pilot={pilot} lead={lead} /> : <ConversationRow {...rowProps} />;
            return hidden
              ? <View key={person.userId} style={local.searchResult}>
                <View style={styles.grow}>{row}</View>
                <Button label="恢复显示" variant="quiet" disabled={busy} onPress={() => void act(thread, 'restore')} />
              </View>
              : <ConversationSwipe key={person.userId} id={person.userId} owner={owner} pinned={pinned}
                unread={manualUnread || unread > 0} busy={busy} onAction={(action) => void act(thread, action)}>{row}</ConversationSwipe>;
          })}</View>
          {preferences.loading || (!relationships && !friendsError) || (!demo && connection && !loaded && !listError)
            ? <LoadingSkeleton label="正在加载会话" />
            : preferences.value && filtered.length === 0 && !(friendsError || listError) && (demo || connection) &&
            <Empty>{term ? '没有找到符合条件的会话。' : rows.some((row) => row.hidden)
              ? '没有可见会话。可通过搜索恢复隐藏的会话。' : '还没有会话。可以从好友页开始聊天。'}</Empty>}
          <Pressable accessible={false} onPress={closeSwipe} style={local.blank} />
        </Screen>
      </KeyboardInsets>
    </GestureHandlerRootView>
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
  root: { flex: 1, backgroundColor: colors.panel },
  blank: { flexGrow: 1 },
  groupedList: { marginHorizontal: 14, marginTop: 6, borderRadius: 23, overflow: 'hidden' },
  letterList: { marginHorizontal: 20 },
  searchLine: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  searchResult: { flexDirection: 'row', alignItems: 'center', paddingRight: space.xs },
  controls: { gap: space.xs, paddingHorizontal: space.md, paddingTop: space.sm, paddingBottom: space.sm },
});
