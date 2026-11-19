import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ChatMessage } from 'react-native-chat-sdk';

import { Avatar, Button, DemoLabel, Empty } from '../../components/ui';
import { useDemo } from '../../demo/state';
import { errorMessage, type Relationship } from '../../services/api';
import { useFriends } from '../../services/friends';
import { imUserId, textMessage, type TextMessage, useIm } from '../../services/im';
import { useSession } from '../../services/session';
import { colors, styles } from '../../theme';

function Conversation({ person }: { person: Relationship }) {
  const { session, request } = useSession();
  const demo = useDemo();
  const markDemoRead = demo?.markRead;
  const shownMessages = demo ? [...(demo.messages[person.userId] ?? [])].reverse() : undefined;
  const { connection, online, status, revision, retry, changed } = useIm();
  const [draft, setDraft] = useState('');
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
    try {
      if (!chatReady) {
        await request('/im/contact', { method: 'POST', body: { userId: person.userId } });
        setChatReady(true);
      }
      const { client, sdk } = connection;
      if (await client.getCurrentUsername() !== ownUsername) throw new Error('聊天已断开，请重新连接。');
      const message = sdk.ChatMessage.createTextMessage(peer, content, sdk.ChatMessageChatType.PeerChat);
      const sent = await new Promise<ChatMessage>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('暂未确认送达，请查看会话后再重试。')), 20000);
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
      setActionError(errorMessage(failure));
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      {!!status && <View style={[styles.row, local.notice]}>
        <Text style={[styles.muted, styles.grow]}>{status}</Text>
        <Button label="重连" variant="soft" onPress={retry} />
      </View>}
      <FlatList
        inverted data={shownMessages ?? messages} style={styles.grow} contentContainerStyle={local.messages}
        keyboardShouldPersistTaps="handled" keyExtractor={(message) => message.id}
        ListEmptyComponent={<Text style={styles.muted}>还没有消息，可以先打个招呼。</Text>}
        ListFooterComponent={cursor && online ? (
          <Button label={loadingOlder ? '加载中…' : '加载更早消息'} variant="soft" disabled={loadingOlder}
            onPress={() => void loadOlder()} />
        ) : undefined}
        renderItem={({ item: message }) => (
          <View style={[local.bubble, message.mine ? local.mine : local.theirs]}>
            <Text style={styles.body}>{message.text}</Text>
            <Text style={styles.small}>{new Date(message.timestamp).toLocaleString('zh-CN')}</Text>
          </View>
        )}
      />
      {!!(actionError || historyError) && <Text accessibilityRole="alert" style={[styles.muted, local.notice]}>{actionError || historyError}</Text>}
      <View style={[styles.row, local.composer]}>
        <TextInput accessibilityLabel="消息" placeholder={demo ? '输入模拟消息' : '输入消息'} placeholderTextColor={colors.muted}
          multiline maxLength={500} value={draft} onChangeText={setDraft} editable={!sending}
          style={[styles.input, styles.grow, local.input]} />
        <Button label={sending ? '发送中…' : '发送'} onPress={() => void send()} disabled={(!demo && !online) || !draft.trim() || sending} />
      </View>
    </>
  );
}

export default function ConversationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
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
        <View style={[styles.row, local.header]}>
          <Pressable accessibilityRole="button" accessibilityLabel="返回" onPress={goBack} style={local.back}>
            <Ionicons name="chevron-back" size={24} color={colors.deep} />
          </Pressable>
          {person && <Avatar name={person.name} color={colors.sage} size={38} />}
          <Text style={styles.strong}>{person?.name ?? '聊天'}</Text>
          <DemoLabel />
        </View>
        {person ? <Conversation key={person.userId} person={person} />
          : <Empty>{error || (relationships ? '只能与已接受请求的好友聊天。' : '正在加载会话…')}</Empty>}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const local = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.backdrop },
  page: { flex: 1, width: '100%', maxWidth: 660, alignSelf: 'center' },
  header: { paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderColor: colors.border },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  messages: { padding: 18, gap: 10 },
  notice: { paddingHorizontal: 14, paddingVertical: 8 },
  bubble: { borderRadius: 19, paddingHorizontal: 14, paddingVertical: 10, gap: 3, maxWidth: '85%' },
  mine: { alignSelf: 'flex-end', backgroundColor: colors.sage, borderBottomRightRadius: 4 },
  theirs: { alignSelf: 'flex-start', backgroundColor: colors.panel, borderBottomLeftRadius: 4 },
  composer: { paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1, borderColor: colors.border },
  input: { maxHeight: 110 },
});
