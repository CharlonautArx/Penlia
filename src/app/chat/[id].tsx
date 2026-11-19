import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ChatMessage } from 'react-native-chat-sdk';

import { Avatar, Button, DemoLabel, Empty, Icon, IconButton, Notice, Sheet } from '../../components/ui';
import { PetShortcut } from '../../features/pet/mark';
import { demoPortrait } from '../../demo/visuals';
import { useDemo } from '../../demo/state';
import { errorMessage, type Relationship } from '../../services/api';
import { useFriends } from '../../services/friends';
import { imUserId, textMessage, type TextMessage, useIm } from '../../services/im';
import { useSession } from '../../services/session';
import { colors, styles } from '../../theme';

class UnconfirmedDelivery extends Error {}

function Conversation({ person, initialDraft }: { person: Relationship; initialDraft: string }) {
  const { session, request } = useSession();
  const demo = useDemo();
  const markDemoRead = demo?.markRead;
  const shownMessages = demo ? [...(demo.messages[person.userId] ?? [])].reverse() : undefined;
  const { connection, online, status, revision, retry, changed } = useIm();
  const [draft, setDraft] = useState(initialDraft);
  const [picker, setPicker] = useState<'emoji' | 'attachments'>();
  const [sendError, setSendError] = useState(false);
  const [messages, setMessages] = useState<TextMessage[]>([]);
  const [cursor, setCursor] = useState<string>();
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [actionError, setActionError] = useState('');
  const [sending, setSending] = useState(false);
  const [chatReady, setChatReady] = useState(person.chatReady);
  const ownUsername = session ? imUserId(session.user.id) : '';
  const peer = imUserId(person.userId);

  const merge = useCallback((incoming: ChatMessage[]) => {
    if (!connection) return;
    setMessages((current) => {
      const known = new Map(current.map((message) => [message.id, message]));
      for (const item of incoming) {
        const message = textMessage(connection, item, ownUsername);
        if (message) known.set(message.id, message);
      }
      return [...known.values()].sort((a, b) => b.timestamp - a.timestamp);
    });
  }, [connection, ownUsername]);

  useFocusEffect(useCallback(() => {
    markDemoRead?.(person.userId);
  }, [markDemoRead, person.userId]));

  useFocusEffect(useCallback(() => {
    if (!connection) return;
    let active = true;
    const { sdk, client } = connection;
    const manager = client.chatManager;
    const convType = sdk.ChatConversationType.PeerChat;
    async function loadLocal() {
      try {
        const conversation = await manager.getConversation(peer, convType);
        if (!conversation || !active) return;
        const local = await manager.getMsgs({ convId: peer, convType, startMsgId: '', loadCount: 50 });
        if (!active) return;
        merge(local);
        if (await conversation.getUnreadCount() > 0 && active) {
          await manager.clearConversationUnreadMessageCount(peer);
          if (active) changed();
        }
      } catch {
        if (active) setActionError('暂时无法读取本机消息。');
      }
    }
    void loadLocal();
    return () => { active = false; };
  }, [changed, connection, merge, peer, revision]));

  const fetchHistory = useCallback(async (after?: string) => {
    if (!connection || !online) return;
    const { client, sdk } = connection;
    return client.chatManager.fetchHistoryMessagesByOptions(peer, sdk.ChatConversationType.PeerChat, {
      cursor: after,
      pageSize: 40,
      options: new sdk.ChatFetchMessageOptions({
        startTs: -1, endTs: -1, direction: sdk.ChatSearchDirection.UP, needSave: true,
        msgTypes: [sdk.ChatMessageType.TXT],
      }),
    });
  }, [connection, online, peer]);

  useEffect(() => {
    let active = true;
    void fetchHistory().then((page) => {
      if (!active || !page) return;
      merge(page.list ?? []);
      setCursor(page.cursor || undefined);
      setHistoryError('');
    }).catch(() => { if (active) setHistoryError('暂时无法加载环信历史消息。'); });
    return () => { active = false; };
  }, [fetchHistory, merge]);

  async function loadOlder() {
    if (!cursor || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const page = await fetchHistory(cursor);
      if (!page) return;
      merge(page.list ?? []);
      setCursor(page.cursor && page.cursor !== cursor ? page.cursor : undefined);
      setHistoryError('');
    } catch {
      setHistoryError('暂时无法加载更早的消息。');
    } finally {
      setLoadingOlder(false);
    }
  }

  async function send() {
    const content = draft.trim();
    if (!content || sending) return;
    if (demo) {
      demo.send(person.userId, content);
      setDraft('');
      return;
    }
    if (!connection || !online) return;
    setSending(true);
    setActionError('');
    setSendError(false);
    try {
      if (!chatReady) {
        await request('/im/contact', { method: 'POST', body: { userId: person.userId } });
        setChatReady(true);
      }
      const { client, sdk } = connection;
      if (await client.getCurrentUsername() !== ownUsername) throw new Error('聊天已断开，请重新连接。');
      const message = sdk.ChatMessage.createTextMessage(peer, content, sdk.ChatMessageChatType.PeerChat);
      const sent = await new Promise<ChatMessage>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new UnconfirmedDelivery('暂未确认送达，请查看会话后再重试。')), 20000);
        const fail = () => { clearTimeout(timeout); reject(new Error('发送失败，请重试。')); };
        void client.chatManager.sendMessage(message, {
          onSuccess: (confirmed) => { clearTimeout(timeout); resolve(confirmed); },
          onError: fail,
        }).catch(fail);
      });
      merge([sent]);
      setDraft('');
      changed();
    } catch (failure) {
      setSendError(!(failure instanceof UnconfirmedDelivery));
      setActionError(errorMessage(failure));
    } finally {
      setSending(false);
    }
  }

  const items = shownMessages ?? messages;
  return (
    <>
      {!!status && <View style={local.notice}><Notice action="重连" onAction={retry}>{status}</Notice></View>}
      <FlatList
        inverted data={items} style={styles.grow} contentContainerStyle={local.messages}
        keyboardShouldPersistTaps="handled" keyExtractor={(message) => message.id}
        ListEmptyComponent={<View style={local.invertedEmpty}><Empty>还没有消息，可以先打个招呼。</Empty></View>}
        ListFooterComponent={cursor && online ? (
          <Button label={loadingOlder ? '加载中…' : '加载更早消息'} variant="quiet" disabled={loadingOlder}
            onPress={() => void loadOlder()} />
        ) : undefined}
        renderItem={({ item: message, index }) => {
          const previous = items[index + 1];
          const groupStart = !previous || message.timestamp - previous.timestamp >= 8 * 60_000;
          const standalone = groupStart || message.mine !== previous?.mine;
          return <View>
            {groupStart && <Text style={local.time}>{messageTime(message.timestamp)}</Text>}
            <View style={[local.messageRow, message.mine && local.myRow, standalone && local.groupGap]}>
              {!message.mine && (standalone
                ? <Avatar name={person.name} source={demoPortrait(person.username)} size={30} />
                : <View style={local.avatarSpace} />)}
              <View style={[local.bubble, message.mine ? local.mine : local.theirs]}>
                <Text style={styles.body}>{message.text}</Text>
              </View>
            </View>
          </View>;
        }}
      />
      {!!(actionError || historyError) && <View style={local.notice}>
        <Notice action={sendError && online ? '重试' : undefined} onAction={() => void send()}>{actionError || historyError}</Notice>
      </View>}
      <View style={local.composer}>
        <IconButton label="更多输入方式" icon="add-circle-outline" onPress={() => setPicker('attachments')} />
        <View style={local.entry}>
          <TextInput accessibilityLabel="消息" placeholder={demo ? '输入模拟消息' : '发消息'} placeholderTextColor={colors.quiet}
            multiline maxLength={500} value={draft} onChangeText={setDraft} editable={!sending}
            style={local.input} />
          <IconButton label="表情" icon="happy-outline" disabled={sending} onPress={() => setPicker('emoji')} />
        </View>
        <Button label={sending ? '发送中…' : '发送'} onPress={() => void send()}
          disabled={(!demo && !online) || !draft.trim() || sending} />
      </View>
      {picker && <Sheet title={picker === 'emoji' ? '表情' : '更多输入方式'} onClose={() => setPicker(undefined)}>
        {picker === 'emoji' ? <View style={local.emoji}>
          {['😊', '😂', '🙌', '🤍', '👀', '🎉', '☕', '🌿', '📷', '👍', '🤝', '✨'].map((emoji) =>
            <Button key={emoji} label={emoji} variant="soft" onPress={() => {
              setDraft((text) => text.length + emoji.length <= 500 ? text + emoji : text);
              setPicker(undefined);
            }} />)}
        </View> : <>
          <Text style={styles.muted}>当前支持文字和表情。以下方式将随功能上线开放。</Text>
          <View style={local.emoji}>
            {([['mic-outline', '语音'], ['image-outline', '照片'], ['document-outline', '文件']] as const)
              .map(([icon, label]) => <View key={label} style={local.future}>
                <Icon name={icon} /><Text style={styles.strong}>{label}</Text><Text style={styles.small}>待支持</Text>
              </View>)}
          </View>
        </>}
      </Sheet>}
    </>
  );
}

function messageTime(timestamp: number) {
  const date = new Date(timestamp);
  const clock = date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
  return date.toDateString() === new Date().toDateString()
    ? '今天 ' + clock : date.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' }) + ' ' + clock;
}

export default function ConversationScreen() {
  const { id, draft } = useLocalSearchParams<{ id: string; draft?: string }>();
  const [more, setMore] = useState(false);
  const { relationships, refresh, error } = useFriends();
  const person = relationships?.find((item) => item.userId === id && item.status === 'accepted');
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }

  return (
    <SafeAreaView style={local.safe}>
      <KeyboardAvoidingView style={local.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={local.header}>
          <IconButton label="返回" icon="chevron-back" onPress={goBack} />
          {person && <Avatar name={person.name} source={demoPortrait(person.username)} size={34} />}
          <View style={styles.grow}>
            <Text accessibilityRole="header" style={styles.strong} numberOfLines={1}>{person?.name ?? '聊天'}</Text>
            {person && <Text style={styles.small}>@{person.username}</Text>}
          </View>
          <DemoLabel />
          {person && <PetShortcut peer={person.userId} /> }
          {person && <IconButton label="聊天选项" icon="ellipsis-horizontal" onPress={() => setMore(true)} />}
        </View>
        {person ? <Conversation key={person.userId} person={person} initialDraft={typeof draft === 'string' ? draft.slice(0, 500) : ''} /> :
          <Empty busy={!relationships && !error}>{error || (relationships ? '只能与已接受请求的好友聊天。' : '正在加载会话…')}</Empty>}
        {more && person && <Sheet title="聊天选项" onClose={() => setMore(false)}>
          <Button label="查看好友资料" variant="soft" icon="person-outline" onPress={() => {
            setMore(false);
            router.push({ pathname: '/person/[id]', params: { id: person.userId } });
          }} />
        </Sheet>}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const local = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.panel },
  page: { flex: 1, width: '100%', maxWidth: 620, alignSelf: 'center', backgroundColor: '#F4F4F7' },
  header: { ...styles.row, ...styles.divider, minHeight: 58, gap: 9, paddingHorizontal: 8, backgroundColor: colors.panel },
  messages: { paddingHorizontal: 13, paddingVertical: 14 },
  invertedEmpty: { transform: [{ scaleY: -1 }] },
  notice: { paddingHorizontal: 12, paddingVertical: 6 },
  time: { ...styles.small, textAlign: 'center', paddingTop: 9, paddingBottom: 13 },
  messageRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingTop: 4 },
  myRow: { justifyContent: 'flex-end' },
  groupGap: { paddingTop: 9 },
  avatarSpace: { width: 30 },
  bubble: { borderRadius: 17, paddingHorizontal: 12, paddingVertical: 8, maxWidth: '79%' },
  mine: { backgroundColor: '#F1E3F0', borderBottomRightRadius: 5 },
  theirs: { backgroundColor: colors.panel, borderBottomLeftRadius: 5 },
  composer: { ...styles.row, gap: 5, backgroundColor: colors.panel, paddingHorizontal: 8, paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  entry: { ...styles.grow, ...styles.row, gap: 0, borderRadius: 12, backgroundColor: colors.backdrop },
  input: { ...styles.grow, fontSize: 15, color: colors.text, maxHeight: 110, minHeight: 44, paddingLeft: 11, paddingVertical: 9 },
  emoji: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  future: { padding: 12, borderRadius: 12, backgroundColor: colors.backdrop, alignItems: 'center', gap: 5 },
});
