import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Image, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ChatMessage } from 'react-native-chat-sdk';

import { Avatar, Button, DemoLabel, Empty, Icon, IconButton, Notice, Sheet } from '../../components/ui';
import { DemoCall } from '../../demo/calls';
import { isUiDemo } from '../../demo/mode';
import type { CallKind } from '../../features/calls/model';
import { PetShortcut } from '../../features/pet/mark';
import { demoPortrait } from '../../demo/visuals';
import { useDemo } from '../../demo/state';
import { errorMessage, type Relationship } from '../../services/api';
import { useFriends } from '../../services/friends';
import { Moon } from '../../features/media/Moon';
import { ImageBubble } from '../../features/media/ImageBubble';
import { LocationBubble, LocationComposer } from '../../features/media/LocationCard';
import { deliverPeerMessage, readPeerMessage, SendRejected, UnknownDelivery, type PendingMessage, type RichMessage } from '../../features/media/messages';
import { pickPhotos, preparePhoto, type PreparedPhoto } from '../../features/media/picker';
import { useLocalPhotoUri } from '../../features/space/media';
import { imUserId, useIm } from '../../services/im';
import { useSession } from '../../services/session';
import { colors, styles } from '../../theme';

function Conversation({ person, initialDraft }: { person: Relationship; initialDraft: string }) {
  const { session, request } = useSession();
  const demo = useDemo();
  const markDemoRead = demo?.markRead;
  const shownMessages = demo ? [...(demo.messages[person.userId] ?? []), ...(demo.media[person.userId] ?? [])]
    .sort((a, b) => b.timestamp - a.timestamp) : undefined;
  const { connection, online, status, revision, retry, changed } = useIm();
  const [draft, setDraft] = useState(initialDraft);
  const [picker, setPicker] = useState<'emoji' | 'attachments' | 'location'>();
  const [sendError, setSendError] = useState(false);
  const [messages, setMessages] = useState<RichMessage[]>([]);
  const [cursor, setCursor] = useState<string>();
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [actionError, setActionError] = useState('');
  const [sending, setSending] = useState(false);
  const [photos, setPhotos] = useState<PreparedPhoto[]>([]);
  const photo=photos[0];
  const [quiet,setQuiet]=useState(false);
  const batch=useRef(false);
  const [prepareBusy, setPrepareBusy] = useState(false);
  const [transferProgress, setTransferProgress] = useState<number>();
  const pending = useRef<{ value: PendingMessage; original?: ChatMessage; uncertain?: boolean } | undefined>(undefined);
  const sendGuard = useRef(false);
  const photoUri = useLocalPhotoUri(photo?.id);
  const ownUsername = session ? imUserId(session.user.id) : '';
  const peer = imUserId(person.userId);

  const merge = useCallback((incoming: ChatMessage[]) => {
    if (!connection) return;
    setMessages((current) => {
      const known = new Map(current.map((message) => [message.id, message]));
      for (const item of incoming) {
        const message = readPeerMessage(connection, item, ownUsername, peer);
        if (message) known.set(message.id, message);
      }
      return [...known.values()].sort((a, b) => b.timestamp - a.timestamp);
    });
  }, [connection, ownUsername, peer]);

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
        msgTypes: [sdk.ChatMessageType.TXT, sdk.ChatMessageType.IMAGE, sdk.ChatMessageType.LOCATION],
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

  async function prepareImage() {
    if (prepareBusy || !session) return;
    setPrepareBusy(true); setActionError('');
    try {
      const inputs = await pickPhotos(6);
      setPicker(undefined);
      if (!inputs.length) return;
      const selected:PreparedPhoto[]=[];
      for(const input of inputs)selected.push(await preparePhoto(input,session.user.id));
      pending.current = undefined;
      setSendError(false);
      setPhotos(selected);
    } catch (error) {
      setPicker(undefined);
      setActionError(errorMessage(error));
    } finally { setPrepareBusy(false); }
  }

  async function transmit(value: PendingMessage, previous?: ChatMessage) {
    if (sendGuard.current || (!demo && (!connection || !online))) return false;
    sendGuard.current = true;
    setSending(true); setActionError(''); setSendError(false); setTransferProgress(undefined);
    try {
      if (demo) {
        if (value.kind === 'text') demo.send(person.userId, value.text);
        else demo.addMedia(person.userId, value);
      } else if (connection) {
        await request('/im/contact', { method: 'POST', body: { userId: person.userId } });
        if (await connection.client.getCurrentUsername() !== ownUsername) throw new Error('聊天已断开，请重新连接。');
        const sent = await deliverPeerMessage(connection, peer, value, previous, setTransferProgress);
        merge([sent]);
        changed();
      }
      pending.current = undefined;
      if (value.kind === 'text') setDraft('');
      if (value.kind === 'image') setPhotos((current)=>current.filter((item)=>item.id!==value.photoId));
      else setQuiet(false);
      return true;
    } catch (failure) {
      const uncertain = failure instanceof UnknownDelivery;
      pending.current = { value, uncertain, original: failure instanceof SendRejected ? failure.original : previous };
      setSendError(!uncertain);
      setActionError(errorMessage(failure));
      return false;
    } finally {
      sendGuard.current = false;
      setSending(false);
    }
  }

  function sendText() {
    const text = draft.trim();
    if (!text) return;
    const previous = pending.current;
    if (previous?.value.kind === 'text' && previous.value.text === text) {
      if (!previous.uncertain) void transmit(previous.value, previous.original);
    } else void transmit({ kind: 'text', text, silent:quiet });
  }

  async function sendImages() {
    if(batch.current)return;
    batch.current=true;
    try {
      for(const item of photos) {
        const retry=pending.current;
        if(retry?.value.kind==='image'&&retry.value.photoId===item.id){
          if(retry.uncertain||!await transmit(retry.value,retry.original))return;
        }else if(!await transmit({kind:'image',photoId:item.id,width:item.width,height:item.height,bytes:item.bytes,silent:quiet}))return;
      }
      setQuiet(false);
    }finally{batch.current=false;}
  }

  const items = shownMessages ?? messages;
  return (
    <>
      {!!demo?.mediaError && <View style={local.notice}><Notice action="重试" onAction={demo.retryMedia}>{demo.mediaError}</Notice></View>}
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
                {
                  'text' in message ? <Text style={styles.body}>{message.text}</Text>
                    : message.kind === 'image' ? <ImageBubble item={message} connection={connection} online={online} onDownloaded={changed} />
                    : <LocationBubble value={message} />
                }
                {message.silent && <Moon />}
              </View>
            </View>
          </View>;
        }}
      />
      {prepareBusy && <Text style={[styles.small,{paddingHorizontal:16}]}>正在处理所选图片…</Text>}
      {!!(actionError || historyError) && <View style={local.notice}>
        <Notice action={sendError && online ? '重试' : undefined} onAction={() => { const queued = pending.current; if (queued && !queued.uncertain) void transmit(queued.value, queued.original); }}>{actionError || historyError}</Notice>
      </View>}
      <View style={local.composer}>
        {!demo&&<IconButton label={quiet?'关闭安静送达':'安静送达'} icon={quiet?'moon':'moon-outline'}
          tinted={quiet} disabled={sending} onPress={()=>setQuiet(!quiet)}/>}
        <View style={local.entry}>
          <TextInput accessibilityLabel="消息" placeholder={demo ? '输入模拟消息' : '发消息'} placeholderTextColor={colors.quiet}
            multiline maxLength={500} value={draft} onChangeText={setDraft} editable={!sending}
            style={local.input} />
          <IconButton label="表情" icon="happy-outline" disabled={sending} onPress={() => setPicker('emoji')} />
        </View>
        <IconButton label="更多输入方式" icon="add-circle-outline" onPress={() => setPicker('attachments')} />
        <IconButton label="从图库选择图片" icon="image-outline" disabled={prepareBusy||sending}
          onPress={()=>void prepareImage()}/>
        <Button label={sending ? '发送中…' : '发送'} onPress={sendText}
          disabled={(!demo && !online) || !draft.trim() || sending || (pending.current?.uncertain && pending.current.value.kind === 'text' && pending.current.value.text === draft.trim())} />
      </View>
      {picker === 'location' && <LocationComposer online={!!demo || online} onClose={() => setPicker(undefined)} onConfirm={(value) => {
        setPicker(undefined);
        void transmit({ kind: 'location', ...value, silent:quiet });
      }} />}
      {picker && picker !== 'location' && <Sheet title={picker === 'emoji' ? '表情' : '更多输入方式'} onClose={() => setPicker(undefined)}>
        {picker === 'emoji' ? <View style={local.emoji}>
          {['😊', '😂', '🙌', '🤍', '👀', '🎉', '☕', '🌿', '📷', '👍', '🤝', '✨'].map((emoji) =>
            <Button key={emoji} label={emoji} variant="soft" onPress={() => {
              setDraft((text) => text.length + emoji.length <= 500 ? text + emoji : text);
              setPicker(undefined);
            }} />)}
        </View> : <>
          <Button label="位置" icon="location-outline" variant="soft" disabled={(!demo && !online) || sending}
            onPress={() => setPicker('location')} />
          {!demo && !online && <Text style={styles.muted}>聊天连接恢复后即可选择并发送附件。</Text>}
        </>}
      </Sheet>}
      {photo && <Sheet title={demo ? '图片预览 · 本机演示' : '发送图片'} onClose={() => { if (!sending) setPhotos([]); }}>
        {photoUri ? <Image source={{ uri: photoUri }} style={local.imagePreview} resizeMode="contain" accessibilityLabel="待发送图片" />
          : <Empty busy>正在读取图片…</Empty>}
        {photos.length>1&&<View style={{flexDirection:'row',gap:5,flexWrap:'wrap'}}>
          {photos.map((item,index)=><QueuePreview key={item.id} item={item} index={index}/>)}
        </View>}
        {quiet&&<Moon words/>}
        <Text style={styles.small}>{photo.width} × {photo.height} · {Math.max(1, Math.round(photo.bytes / 1024))} KB</Text>
        {!!actionError && <Notice>{actionError}</Notice>}
        {!demo && !online && <Notice>聊天连接已断开，恢复后可以继续发送。</Notice>}
        <Button label={sending ? ('发送中' + (transferProgress === undefined ? '…' : ' ' + transferProgress + '%'))
          : sendError ? '重试发送图片' : photos.length>1?'发送 '+photos.length+' 张图片':'发送图片'} variant="gradient"
          disabled={!photoUri || sending || pending.current?.uncertain || (!demo && !online)} onPress={()=>void sendImages()} />
        {demo && <Button label="模拟好友发来此图" variant="soft" disabled={!photoUri || sending} onPress={() => {
          try {
            demo.addMedia(person.userId, { kind: 'image', photoId: photo.id, width: photo.width, height: photo.height, bytes: photo.bytes }, false);
            setPhotos((current)=>current.slice(1));
          } catch (error) { setActionError(errorMessage(error)); }
        }} />}
      </Sheet>}
    </>
  );
}

function QueuePreview({item,index}:{item:PreparedPhoto;index:number}) {
  const uri=useLocalPhotoUri(item.id);
  return uri?<Image source={{uri}} accessibilityLabel={'第 '+(index+1)+' 张待发送图片'}
    style={{width:45,height:45,borderRadius:7}} />:null;
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
  const [call, setCall] = useState<{ kind: CallKind; incoming: boolean }>();
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
          {person ? <Pressable accessibilityRole="button" accessibilityLabel={'查看' + person.name + '的个人主页'}
            style={({ pressed }) => [local.profileLink, pressed && local.profilePressed]}
            onPress={() => router.push({ pathname: '/person/[id]', params: { id: person.userId } })}>
            <Avatar name={person.name} source={demoPortrait(person.username)} size={34} />
            <Text accessibilityRole="header" style={[styles.strong, styles.grow]} numberOfLines={1}>{person.name}</Text>
          </Pressable> : <Text accessibilityRole="header" style={[styles.strong, styles.grow]}>聊天</Text>}
          <DemoLabel />
          {person && <PetShortcut peer={person.userId} /> }
          {person && <IconButton label="聊天选项" icon="ellipsis-horizontal" onPress={() => setMore(true)} />}
        </View>
        {person ? <Conversation key={person.userId} person={person} initialDraft={typeof draft === 'string' ? draft.slice(0, 500) : ''} /> :
          <Empty busy={!relationships && !error}>{error || (relationships ? '只能与已接受请求的好友聊天。' : '正在加载会话…')}</Empty>}
        {more && person && <Sheet title="聊天选项" onClose={() => setMore(false)}>
          <Button label="语音通话" variant="soft" icon="call-outline" onPress={() => {
            setMore(false); setCall({ kind: 'voice', incoming: false });
          }} />
          <Button label="视频通话" variant="soft" icon="videocam-outline" onPress={() => {
            setMore(false); setCall({ kind: 'video', incoming: false });
          }} />
          {isUiDemo && <Button label="模拟视频来电" variant="quiet" onPress={() => {
            setMore(false); setCall({ kind: 'video', incoming: true });
          }} />}
          <Button label="查看好友资料" variant="soft" icon="person-outline" onPress={() => {
            setMore(false);
            router.push({ pathname: '/person/[id]', params: { id: person.userId } });
          }} />
        </Sheet>}
        {call && person && (isUiDemo ? <DemoCall kind={call.kind} incoming={call.incoming}
          name={person.name} username={person.username} onClose={() => setCall(undefined)} />
          : <Sheet title={call.kind === 'voice' ? '语音通话' : '视频通话'} onClose={() => setCall(undefined)}>
            <Notice>通话服务尚未启用。需要配置 RTC、通话信令和呼叫权限后才可以拨打。</Notice>
          </Sheet>)}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const local = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.panel },
  page: { flex: 1, width: '100%', maxWidth: 620, alignSelf: 'center', backgroundColor: '#F4F4F7' },
  header: { ...styles.row, ...styles.divider, minHeight: 58, gap: 9, paddingHorizontal: 8, backgroundColor: colors.panel },
  profileLink: { ...styles.row, ...styles.grow, gap: 9, minHeight: 44 },
  profilePressed: { opacity: 0.72 },
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
  imagePreview: { width: '100%', height: 290, borderRadius: 12, backgroundColor: colors.backdrop },
});
