import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Image, Pressable, StyleSheet, Text, View, type ListRenderItem } from 'react-native';
import type { ChatMessage } from 'react-native-chat-sdk';

import { Avatar, Button, Empty, IconButton, Notice, Sheet } from '../../components/ui';
import { PetShortcut } from '../../features/pet/mark';
import { demoPortrait } from '../../demo/visuals';
import { useDemo } from '../../demo/state';
import { errorMessage, type Relationship } from '../../services/api';
import { useFriends } from '../../services/friends';
import { MessageMarks, NoReply } from '../../features/media/NoReply';
import { PeerVideo } from '../../features/media/PeerVideo';
import { chooseMomentVideo,MomentVideo } from '../../features/moments/media';
import { ReportSheet,type EvidenceLine } from '../../features/social/ReportSheet';
import { Moon } from '../../features/media/Moon';
import { ImageBubble } from '../../features/media/ImageBubble';
import { LocationBubble, LocationComposer } from '../../features/media/LocationCard';
import { deliverPeerMessage, readPeerMessage, SendRejected, UnknownDelivery, type PendingMessage, type RichMessage } from '../../features/media/messages';
import { pickPhotos, preparePhoto, type PreparedPhoto } from '../../features/media/picker';
import { useLocalPhotoUri } from '../../features/space/media';
import { imUserId, useIm } from '../../services/im';
import { useSession } from '../../services/session';
import { colors, radius, space, styles, touch } from '../../theme';
import { ChatBubble, ChatTimestamp, MessageActions, MessageBody, MessageComposer, chatLayout, startsMessageBlock } from '../../features/chat/ui';
import { useConversationPreferences } from '../../features/chat/useConversationPreferences';
import { ChatViewport } from '../../features/chat/Viewport';
import { PeerChatFog } from '../../features/chat/PeerChatFog';
import { PeerSendMenu, type PeerSendOptions } from '../../features/chat/PeerSendMenu';

const headerHeight = 54;
const slowPhotoThreshold = 450;
const messageKey = (message: RichMessage) => message.id;

function EmptyConversation() {
  return <View style={chatLayout.inverted}><Empty>还没有消息，可以先打个招呼。</Empty></View>;
}

function Conversation({ person, initialDraft }: { person: Relationship; initialDraft: string }) {
  const { session, request } = useSession();
  const demo = useDemo();
  const markDemoRead = demo?.markRead;
  const { value: preferences, clearManualUnread } = useConversationPreferences();
  const preferencesReady = !!preferences;
  useFocusEffect(useCallback(() => {
    if (preferencesReady) clearManualUnread(person.userId);
  }, [clearManualUnread, person.userId, preferencesReady]));
  const demoText = demo?.messages[person.userId];
  const demoMedia = demo?.media[person.userId];
  const isDemo = !!demo;
  const shownMessages = useMemo(() => isDemo ? [...(demoText ?? []), ...(demoMedia ?? [])]
    .sort((a, b) => b.timestamp - a.timestamp) : undefined, [demoMedia, demoText, isDemo]);
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
  const [noReply,setNoReply]=useState(false);
  const [composerHeight, setComposerHeight] = useState(0);
  const [sendMenuOpen, setSendMenuOpen] = useState(false);
  const [sendOptions, setSendOptions] = useState<PeerSendOptions>({ silent: false, noReply: false });
  const closeSendMenu = useCallback(() => setSendMenuOpen(false), []);
  const [video,setVideo]=useState<Awaited<ReturnType<typeof chooseMomentVideo>>>();
  const [report,setReport]=useState<{anchor:EvidenceLine;lines:EvidenceLine[]}>();
  const [actions, setActions] = useState<RichMessage>();
  const batch=useRef(false);
  const preparingPhoto = useRef(false);
  const [photoLocked, setPhotoLocked] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState('');
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
    if (preparingPhoto.current || !session) return;
    preparingPhoto.current = true;
    setPhotoLocked(true);
    let progress: ReturnType<typeof setTimeout> | undefined;
    try {
      const inputs = await pickPhotos(6);
      if (!inputs.length) return;
      progress = setTimeout(() => setPhotoBusy(true), slowPhotoThreshold);
      // Let the system picker hand the screen back before starting the first image.
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const selected: PreparedPhoto[] = [];
      for (const input of inputs) selected.push(await preparePhoto(input, session.user.id));
      pending.current = undefined;
      setSendError(false);
      setPhotoError('');
      setActionError('');
      setPhotos(selected);
    } catch (error) {
      setPhotoError(errorMessage(error));
    } finally {
      clearTimeout(progress);
      preparingPhoto.current = false;
      setPhotoBusy(false);
      setPhotoLocked(false);
    }
  }

  async function transmit(value: PendingMessage, previous?: ChatMessage) {
    if (sendGuard.current || (!demo && (!connection || !online))) return false;
    sendGuard.current = true;
    setSending(true); setActionError(''); setSendError(false); setTransferProgress(undefined);
    try {
      if (demo) {
        if (value.kind === 'text') demo.send(person.userId, value.text, value);
        else if(value.kind!=='video') demo.addMedia(person.userId, value);
      } else if (connection) {
        await request('/im/contact', { method: 'POST', body: { userId: person.userId } });
        if (await connection.client.getCurrentUsername() !== ownUsername) throw new Error('聊天已断开，请重新连接。');
        const sent = await deliverPeerMessage(connection, peer, value, previous, setTransferProgress);
        merge([sent]);
        changed();
      }
      pending.current = undefined;
      if (value.kind === 'text') setDraft((current) => current.trim() === value.text ? '' : current);
      if (value.kind === 'image') setPhotos((current)=>current.filter((item)=>item.id!==value.photoId));
      else {
        setQuiet(false);setNoReply(false);
        if (value.kind==='video')setVideo(undefined);
      }
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

  async function sendText(options = { silent: quiet, noReply }) {
    const text = draft.trim();
    if (!text) return;
    const previous = pending.current;
    const retry = previous?.value.kind === 'text' && previous.value.text === text ? previous : undefined;
    if (retry?.uncertain) return;
    if (retry && !!retry.value.silent === options.silent && !!retry.value.noReply === options.noReply) {
      await transmit(retry.value, retry.original);
    } else {
      await transmit({ kind: 'text', text, ...options });
    }
  }

  async function sendImages() {
    if(batch.current)return;
    batch.current=true;
    try {
      for(const item of photos) {
        const retry=pending.current;
        if(retry?.value.kind==='image'&&retry.value.photoId===item.id){
          if(retry.uncertain||!await transmit(retry.value,retry.original))return;
        }else if(!await transmit({kind:'image',photoId:item.id,width:item.width,height:item.height,bytes:item.bytes,silent:quiet,noReply}))return;
      }
      setQuiet(false);setNoReply(false);
    }finally{batch.current=false;}
  }

  function openCall(kind: 'voice' | 'video') {
    setPicker(undefined);
    router.push({ pathname: '/peer-call', params: { peer: person.userId, kind } });
  }

  const items = shownMessages ?? messages;
  const renderMessage = useCallback<ListRenderItem<RichMessage>>(({ item: message, index }) => {
    const older = items[index + 1];
    const newer = items[index - 1];
    const block = startsMessageBlock(message.timestamp, older?.timestamp);
    const first = block || message.mine !== older?.mine;
    const last = !newer || newer.mine !== message.mine || startsMessageBlock(newer.timestamp, message.timestamp);
    return <View>
      {block && <ChatTimestamp value={message.timestamp} />}
      <ChatBubble mine={message.mine} first={first} last={last} onActions={() => setActions(message)}
        avatar={<Pressable accessibilityRole="button" accessibilityLabel={'查看' + person.name + '的资料'} hitSlop={4}
          onPress={() => router.push({ pathname: '/person/[id]', params: { id: person.userId } })}>
          <Avatar userId={person.userId} name={person.name} source={demoPortrait(person.username)} size={31} />
        </Pressable>}>
        {'text' in message ? <MessageBody text={message.text} />
          : message.kind === 'image' ? <ImageBubble item={message} connection={connection} online={online} onDownloaded={changed} />
          : message.kind === 'video' ? <PeerVideo item={message} connection={connection} /> : <LocationBubble value={message} />}
        <MessageMarks sharing={message.noReply} silent={message.silent} />
      </ChatBubble>
    </View>;
  }, [changed, connection, items, online, person.name, person.username, person.userId]);

  const hasTopNotice = !!(demo?.mediaError || status);
  const sendDisabled = (!demo && !online) || !draft.trim() || sending
    || !!(pending.current?.uncertain && pending.current.value.kind === 'text' && pending.current.value.text === draft.trim());
  return (
    <>
      <View style={styles.grow}>
        {hasTopNotice && <View style={local.headerClearance}>
          {!!demo?.mediaError && <View style={local.notice}><Notice action="重试" onAction={demo.retryMedia}>{demo.mediaError}</Notice></View>}
          {!!status && <View style={local.notice}><Notice action="重连" onAction={retry}>{status}</Notice></View>}
        </View>}
        <FlatList
          inverted data={items} style={styles.grow}
          contentContainerStyle={[chatLayout.messages, !hasTopNotice && local.messageClearance]}
          keyboardShouldPersistTaps="handled" keyExtractor={messageKey}
          ListEmptyComponent={EmptyConversation}
          ListFooterComponent={cursor && online ? (
            <Button label={loadingOlder ? '加载中…' : '加载更早消息'} variant="quiet" disabled={loadingOlder}
              onPress={() => void loadOlder()} />
          ) : undefined}
          renderItem={renderMessage}
        />
      </View>
      {!!photoError && <View style={local.notice}>
        <Notice action="重试选图" onAction={() => void prepareImage()}>{photoError}</Notice>
      </View>}
      {!!(actionError || historyError) && <View style={local.notice}>
        <Notice action={sendError && (demo || online) ? '重试' : undefined} onAction={() => { const queued = pending.current; if (queued && !queued.uncertain) void transmit(queued.value, queued.original); }}>{actionError || historyError}</Notice>
      </View>}
      <MessageComposer label="消息" floating
        value={draft} onChange={setDraft} maxLength={500}
        attachLabel="添加" photoLabel="从图库选择图片" onAttach={() => setPicker('attachments')}
        onPhoto={() => void prepareImage()} onEmoji={() => setPicker('emoji')}
        photoDisabled={photoLocked} photoBusy={photoBusy} toolsDisabled={sending}
        sendLabel={sending ? '发送中…' : '发送'} onSend={() => void sendText()} sendDisabled={sendDisabled}
        onLayout={({ nativeEvent }) => setComposerHeight(nativeEvent.layout.height)}
        onSendLongPress={() => { setSendOptions({ silent: quiet, noReply }); setSendMenuOpen(true); }}
        mode={!demo && (quiet || noReply) ? <>{quiet && <Moon words />}{noReply && <NoReply />}</> : undefined} />
      <PeerSendMenu open={sendMenuOpen} bottom={composerHeight} options={sendOptions} disabled={sendDisabled} sending={sending}
        onToggle={(option) => setSendOptions((current) => ({ ...current, [option]: !current[option] }))}
        onSend={() => void sendText(sendOptions).then(closeSendMenu)} onClose={closeSendMenu} />
      {actions && <MessageActions timestamp={actions.timestamp}
        text={'text' in actions ? actions.text : undefined} onClose={() => setActions(undefined)}
        report={!demo && !actions.mine ? () => {
          const index = items.findIndex((line) => line.id === actions.id);
          const context = index < 0 ? [] : items.slice(Math.max(0, index - 3), index + 4).map((line) => ({
            id: line.id, mine: line.mine,
            content: 'text' in line ? line.text : line.kind === 'image' ? '[图片]' : line.kind === 'video' ? '[视频]' : '[位置]',
          }));
          const anchor = context.find((line) => line.id === actions.id);
          setActions(undefined);
          if (anchor) setReport({ anchor, lines: context });
        } : undefined} />}
      {picker === 'location' && <LocationComposer online={!!demo || online} onClose={() => setPicker(undefined)} onConfirm={(value) => {
        setPicker(undefined);
        void transmit({ kind: 'location', ...value, silent:quiet });
      }} />}
      {(picker === 'emoji' || picker === 'attachments') && <Sheet
        title={picker === 'emoji' ? '表情' : '添加'} tone="neutral" onClose={() => setPicker(undefined)}>
        {picker === 'emoji' ? <View style={local.emoji}>
          {['😊', '😂', '🙌', '🤍', '👀', '🎉', '☕', '🌿', '📷', '👍', '🤝', '✨'].map((emoji) =>
            <Button key={emoji} label={emoji} variant="soft" onPress={() => {
              setDraft((text) => text.length + emoji.length <= 500 ? text + emoji : text);
              setPicker(undefined);
            }} />)}
        </View> : <>
          <Button label="语音通话" icon="call-outline" variant="quiet" onPress={() => openCall('voice')} />
          <Button label="视频通话" icon="videocam-outline" variant="quiet" onPress={() => openCall('video')} />
          <Button label="位置" icon="location-outline" variant="quiet" disabled={(!demo && !online) || sending}
            onPress={() => setPicker('location')} />
          {!demo&&<>
            <Button label={quiet ? '关闭安静送达' : '安静送达'} icon={quiet ? 'moon' : 'moon-outline'}
              variant={quiet ? 'primary' : 'soft'} disabled={sending}
              onPress={() => { setQuiet(!quiet); setPicker(undefined); }} />
            <Button label={noReply?'关闭只是分享':'只是分享'} variant={noReply?'primary':'soft'}
              disabled={sending} onPress={()=>{setNoReply(!noReply);setPicker(undefined);}}/>
            <Text style={styles.muted}>可与安静送达同时使用。</Text>
            <Button label="短视频" icon="videocam-outline" variant="soft" disabled={!online||sending} onPress={()=>{
              setPicker(undefined);
              void chooseMomentVideo().then(setVideo).catch((failure)=>setActionError(errorMessage(failure)));
            }}/>
          </>}
          {!demo && !online && <Text style={styles.muted}>聊天连接恢复后即可选择并发送附件。</Text>}
        </>}
      </Sheet>}
      {report&&<ReportSheet peerId={person.userId} anchor={report.anchor} lines={report.lines} onClose={()=>setReport(undefined)}/>}
      {video&&<Sheet title="发送短视频" onClose={()=>{if(!sending)setVideo(undefined);}}>
        <MomentVideo source={{uri:video.uri}}/>
        {noReply&&<NoReply/>}
        {quiet&&<Moon words/>}
        {!!actionError&&<Notice>{actionError}</Notice>}
        <Button label={sending?'发送中…':'发送视频'} variant="gradient" disabled={sending||!online||pending.current?.uncertain}
          onPress={()=>{
            const queued=pending.current;
            if(queued?.value.kind==='video'&&queued.value.uri===video.uri)void transmit(queued.value,queued.original);
            else void transmit({kind:'video',uri:video.uri,bytes:video.bytes,duration:video.duration,silent:quiet,noReply});
          }}/>
      </Sheet>}
      {photo && <Sheet title={demo ? '图片预览' : '发送图片'} onClose={() => { if (!sending) setPhotos([]); }}>
        {photoUri ? <Image source={{ uri: photoUri }} style={local.imagePreview} resizeMode="contain" accessibilityLabel="待发送图片" />
          : <Empty busy>正在读取图片…</Empty>}
        {photos.length>1&&<View style={{flexDirection:'row',gap:5,flexWrap:'wrap'}}>
          {photos.map((item,index)=><QueuePreview key={item.id} item={item} index={index}/>)}
        </View>}
        {quiet&&<Moon words/>}
        {noReply&&<NoReply/>}
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

export default function ConversationScreen() {
  const { id, draft } = useLocalSearchParams<{ id: string; draft?: string }>();
  const { relationships, refresh, error } = useFriends();
  const person = relationships?.find((item) => item.userId === id && item.status === 'accepted');
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }

  return (
    <ChatViewport floatingChrome peer={person?.userId}>
      {/* Anchor absolute overlays inside the keyboard-adjusted area, using a stable native parent. */}
      <View collapsable={false} style={styles.grow}>
        {person ? <Conversation key={person.userId} person={person}
          initialDraft={typeof draft === 'string' ? draft.slice(0, 500) : ''} /> :
          <View style={local.headerClearance}>
            <Empty busy={!relationships && !error}>{error || (relationships ? '只能与已接受请求的好友聊天。' : '正在加载会话…')}</Empty>
          </View>}
        <View pointerEvents="box-none" style={local.headerOverlay}>
          <PeerChatFog ready={!!person} />
          <View style={local.header} pointerEvents="box-none">
            <IconButton label="返回" icon="chevron-back" onPress={goBack} />
            {person ? <Pressable accessibilityRole="button" accessibilityLabel={'查看' + person.name + '的个人主页'}
              style={({ pressed }) => [local.profileLink, pressed && local.profilePressed]}
              onPress={() => router.push({ pathname: '/person/[id]', params: { id: person.userId } })}>
              <Text accessibilityRole="header" style={[styles.strong, styles.grow]} numberOfLines={1}>{person.name}</Text>
            </Pressable> : <Text accessibilityRole="header" style={[styles.strong, styles.grow]}>聊天</Text>}
            {person && <PetShortcut peer={person.userId} />}
          </View>
        </View>
      </View>
    </ChatViewport>
  );
}

const local = StyleSheet.create({
  headerOverlay: { position: 'absolute', top: 0, left: 0, right: 0, height: headerHeight + space.xxl },
  header: { ...styles.row, height: headerHeight, gap: space.xxs, paddingLeft: space.xxs, paddingRight: space.xs },
  profileLink: { ...styles.row, ...styles.grow, minHeight: touch },
  headerClearance: { paddingTop: headerHeight + space.xs },
  // Padding at the visual top of the inverted list keeps the oldest item reachable.
  messageClearance: { paddingBottom: headerHeight + space.lg },
  profilePressed: { opacity: 0.72 },
  notice: { paddingHorizontal: space.md, paddingVertical: space.xxs },
  emoji: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  imagePreview: { width: '100%', height: 290, borderRadius: radius.control, backgroundColor: colors.backdrop },
});
