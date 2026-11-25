import { useFontScale } from '../../components/Typography';
import { useHistoryJump } from '../../features/chat/history';
import { useRecalls } from '../../features/chat/recalls';
import { applyRecalls, canRecall, recalledCaption, recalledQuote, recallWindow } from '../../features/chat/recall-model';
import { fetchPeerPage, mergePeerRows } from '../../features/chat/peer-data';
import { PeerFile } from '../../features/media/PeerFile';
import type { MessageLongPress } from '../../features/chat/record-model';
import { ManagementUI, QuotePreview, RecordLink, SelectionBar, SelectionCheck, useMessageManagement, type ManagedMessage } from '../../features/chat/MessageManagement';
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
import { commentEmoji } from '../../features/moments/Comments';
import { MessageMarks, NoReply } from '../../features/media/NoReply';
import { PeerVideo } from '../../features/media/PeerVideo';
import { chooseMomentVideo,chooseMomentDraftVideo,MomentVideo } from '../../features/moments/media';
import { ReportForm, ReportSelectionBar, useReportSelection } from '../../features/social/ReportSheet';
import { Moon } from '../../features/media/Moon';
import { ImageBubble } from '../../features/media/ImageBubble';
import { LocationBubble, LocationComposer } from '../../features/media/LocationCard';
import { deliverPeerMessage, fetchAttachment, readPeerMessage, summaryOf, SendRejected, UnknownDelivery, type PendingMessage, type RichMessage } from '../../features/media/messages';
import { pickPhotos, preparePhoto, type PreparedPhoto } from '../../features/media/picker';
import { useLocalPhotoUri } from '../../features/space/media';
import { imUserId, useIm } from '../../services/im';
import { useSession } from '../../services/session';
import { colors, radius, space, styles, touch } from '../../theme';
import { ChatBubble, ChatTimestamp, MessageBody, MessageComposer, chatLayout, startsMessageBlock } from '../../features/chat/ui';
import { useConversationPreferences } from '../../features/chat/useConversationPreferences';
import { ChatViewport } from '../../features/chat/Viewport';
import { PeerChatFog } from '../../features/chat/PeerChatFog';
import { PeerSendMenu, type PeerSendOptions } from '../../features/chat/PeerSendMenu';

const headerHeight = 54;
const slowPhotoThreshold = 450;
const noMarkers = {};
type ShownMessage = ReturnType<typeof applyRecalls<RichMessage>>[number];
const isRecalled = (message: ShownMessage): message is Extract<ShownMessage, {kind:'recalled'}> =>
  'kind' in message && message.kind === 'recalled';
const messageKey = (message: ShownMessage) => message.id;

function EmptyConversation() {
  return <View style={chatLayout.inverted}><Empty>还没有消息，可以先打个招呼。</Empty></View>;
}

function Conversation({ person, initialDraft, chromeHeight }: { person: Relationship; initialDraft: string; chromeHeight: number }) {
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
  const [sticker, setSticker] = useState<string>();
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
  const [video,setVideo]=useState<{ uri?: string; videoId?: string; bytes: number; duration?: number }>();
  const savedVideoUri = useLocalPhotoUri(video?.videoId);
  const videoUri = video?.uri ?? savedVideoUri;
  const report = useReportSelection(session?.user.id, person.userId, '/chat/[id]');
  const manage = useMessageManagement('peer:' + person.userId);
  const recalls = useRecalls();
  const markers = recalls.peers[person.userId] ?? noMarkers;
  const jumps = useHistoryJump();
  const [position, setPosition] = useState<string>();
  const [window, setWindow] = useState<RichMessage[]>();
  const list = useRef<FlatList<ShownMessage>>(null);
  const searchJump = useRef<string | undefined>(undefined);
  const retries = useRef(0);
  useFocusEffect(useCallback(() => {
    const target = jumps?.current[person.userId];
    if (!target || !jumps) return;
    delete jumps.current[person.userId];
    searchJump.current = target.id;
    retries.current = 0;
    setWindow(target.window);
    setPosition(target.id);
  }, [jumps, person.userId]));
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
    setMessages((current) => mergePeerRows(current, incoming.flatMap((item) => {
      const row = readPeerMessage(connection, item, ownUsername, peer);
      return row ? [row] : [];
    })));
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
    return fetchPeerPage(connection, peer, after);
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
        else demo.addMedia(person.userId, value);
      } else if (connection) {
        await request('/im/contact', { method: 'POST', body: { userId: person.userId } });
        if (await connection.client.getCurrentUsername() !== ownUsername) throw new Error('聊天已断开，请重新连接。');
        const sent = await deliverPeerMessage(connection, peer, value, previous, setTransferProgress);
        merge([sent]);
        changed();
      }
      pending.current = undefined;
      if (value.kind === 'text') { setDraft((current) => current.trim() === value.text ? '' : current); setSticker(undefined); }
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
    if (retry && retry.value.quote?.id === manage.quote?.id && !!retry.value.silent === options.silent && !!retry.value.noReply === options.noReply) {
      if (await transmit(retry.value, retry.original)) manage.setQuote(undefined);
    } else {
      if (await transmit({ kind: 'text', text, sticker: sticker === text, quote: manage.quote, ...options })) manage.setQuote(undefined);
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
        }else if(!await transmit({kind:'image',photoId:item.id,width:item.width,height:item.height,bytes:item.bytes,silent:quiet,noReply,quote:manage.quote}))return;
      }
      setQuiet(false);setNoReply(false);manage.setQuote(undefined);
    }finally{batch.current=false;}
  }

  function openCall(kind: 'voice' | 'video') {
    setPicker(undefined);
    router.push({ pathname: '/peer-call', params: { peer: person.userId, kind } });
  }

  const base = window ?? shownMessages ?? messages;
  const items = useMemo(() => {
    if (!manage.history.ready || !recalls.ready) return [];
    if (!window) return applyRecalls(base, markers, manage.history.hidden);
    const lower = base.at(-1)?.timestamp ?? 0, upper = base[0]?.timestamp ?? Infinity;
    return applyRecalls(base, Object.fromEntries(Object.entries(markers).filter(([, row]) => row.timestamp >= lower && row.timestamp <= upper)), manage.history.hidden);
  }, [base, manage.history.hidden, manage.history.ready, markers, recalls.ready, window]);
  useEffect(() => {
    if (manage.quote && Object.hasOwn(markers, manage.quote.id)) manage.setQuote(undefined);
  }, [manage.quote, manage.setQuote, markers]);
  useEffect(() => {
    if (!position) return;
    const index = items.findIndex((item) => item.id === position && !isRecalled(item));
    if (index < 0) return;
    const timer = setTimeout(() => list.current?.scrollToIndex({ index, animated: false, viewPosition: 0.5 }), 120);
    const fade = setTimeout(() => {
      setPosition(undefined);
      searchJump.current = undefined;
    }, 2700);
    return () => { clearTimeout(timer); clearTimeout(fade); };
  }, [items, position]);
  function managed(message: RichMessage): ManagedMessage {
    const text = 'text' in message;
    const file = !text && message.kind === 'file';
    const kind = text || file ? 'text' : message.kind as 'image' | 'video' | 'location';
    const sentAt = demo ? message.timestamp : message.confirmedAt;
    const revoke = recalls.available && !!sentAt && canRecall(message.mine, sentAt) ? async () => {
      await recalls.recall(person.userId, message);
      if (manage.quote?.id === message.id) manage.setQuote(undefined);
      changed();
    } : undefined;
    const asset = !text && (message.kind === 'image' || message.kind === 'video') ? {
      mime: message.kind === 'video' ? 'video/mp4' as const : 'image/jpeg' as const,
      photoId: message.kind === 'image' ? message.photoId : undefined,
      load: connection && message.source ? () => fetchAttachment(connection, message.source!) : undefined,
    } : undefined;
    return { recall: revoke, recallUntil: revoke && sentAt ? sentAt + recallWindow : undefined, portable: !file, id: message.id, time: message.timestamp, kind, author: message.mine ? session?.user.name ?? '我' : person.name,
      body: text ? message.text : message.kind === 'location' ? message.name + ' · ' + message.address : message.kind === 'file' ? '[文件] ' + message.name : '',
      canCopy: (text && !message.recordId) || kind === 'location', recordId: message.recordId,
      quote: message.quote && message.quote.author + ' · ' + message.quote.body, assets: asset ? [asset] : undefined };
  }
  const selected = manage.selected && items.filter((message): message is RichMessage => !isRecalled(message) && !!manage.selected?.has(message.id)).map(managed);
  const reportLines = report.selected ? items.filter((line): line is RichMessage =>
    !isRecalled(line) && !!report.selected?.has(line.id)).reverse().map((line) => ({
      id: line.id, mine: line.mine, author: line.mine ? '我' : person.name, content: summaryOf(line),
      sentAt: new Date(line.timestamp).toISOString(),
    })) : [];

  const renderMessage = useCallback<ListRenderItem<ShownMessage>>(({ item: message, index }) => {
    if (isRecalled(message)) return <View>
      {startsMessageBlock(message.timestamp, items[index + 1]?.timestamp) && <ChatTimestamp value={message.timestamp} />}
      <Text style={local.recalled}>{recalledCaption(message.mine)}</Text>
    </View>;
    const openActions: MessageLongPress = ({ nativeEvent }) => manage.setMenu(managed(message), { x: nativeEvent.pageX, y: nativeEvent.pageY });
    const older = items[index + 1];
    const newer = items[index - 1];
    const block = startsMessageBlock(message.timestamp, older?.timestamp);
    const first = block || message.mine !== older?.mine;
    const last = !newer || newer.mine !== message.mine || startsMessageBlock(newer.timestamp, message.timestamp);
    return <SelectionCheck active={!!(report.selected || manage.selected)} checked={!!(report.selected ?? manage.selected)?.has(message.id)}
      toggle={() => report.selected ? report.toggle(message.id) : manage.toggle(message.id)}><View style={position === message.id && local.highlight}>
      {block && <ChatTimestamp value={message.timestamp} />}
      <ChatBubble bare={'kind' in message && message.kind === 'image'} mine={message.mine} first={first} last={last} onActions={(anchor) => manage.setMenu(managed(message), anchor)}
        avatar={<Pressable accessibilityRole="button" accessibilityLabel={'查看' + person.name + '的资料'} hitSlop={4}
          onPress={() => router.push({ pathname: '/person/[id]', params: { id: person.userId } })}>
          <Avatar userId={person.userId} name={person.name} source={demoPortrait(person.username)} size={31} />
        </Pressable>}>
        {message.quote && <QuotePreview quote={Object.hasOwn(markers, message.quote.id) ? { ...message.quote, body: recalledQuote } : message.quote} />}
        {message.recordId ? <RecordLink id={message.recordId} onLongPress={openActions} /> : 'text' in message ? <MessageBody text={message.text} onLongPress={openActions} />
          : message.kind === 'image' ? <ImageBubble item={message} onLongPress={openActions} connection={connection} online={online} onDownloaded={changed} />
          : message.kind === 'video' ? <PeerVideo item={message} onLongPress={openActions} connection={connection} /> : message.kind === 'file' ? <PeerFile item={message} connection={connection} onLongPress={openActions} /> : <LocationBubble value={message} onLongPress={openActions} />}
        <MessageMarks sharing={message.noReply} silent={message.silent} />
      </ChatBubble>
    </View></SelectionCheck>;
  }, [changed, connection, items, online, person, manage.selected, manage.quote, report.selected, markers, position, recalls.available, session?.user.name, demo]);

  const hasTopNotice = !!(demo?.mediaError || status);
  const sendDisabled = (!demo && !online) || !draft.trim() || sending
    || !!(pending.current?.uncertain && pending.current.value.kind === 'text' && pending.current.value.text === draft.trim());
  return (
    <>
      <View style={styles.grow}>
        {hasTopNotice && <View style={[local.headerClearance, { paddingTop: chromeHeight + space.xs }]}>
          {!!demo?.mediaError && <View style={local.notice}><Notice action="重试" onAction={demo.retryMedia}>{demo.mediaError}</Notice></View>}
          {!!status && <View style={local.notice}><Notice action="重连" onAction={retry}>{status}</Notice></View>}
        </View>}
        {window && <View style={[local.headerClearance, { paddingTop: chromeHeight + space.xs }]}><Button label="返回最新消息" variant="quiet" onPress={() => {
          setWindow(undefined); setPosition(undefined); list.current?.scrollToOffset({ offset: 0, animated: false });
        }} /></View>}
        <FlatList
          ref={list} onScrollToIndexFailed={({ index, averageItemLength }) => {
            if (!searchJump.current || retries.current++ >= 4) return;
            list.current?.scrollToOffset({ offset: Math.max(0, index - 1) * averageItemLength, animated: false });
            setTimeout(() => { if (searchJump.current) list.current?.scrollToIndex({ index, animated: false, viewPosition: 0.5 }); }, 120);
          }}
          inverted data={items} style={styles.grow}
          contentContainerStyle={[chatLayout.messages, !hasTopNotice && !window && { paddingBottom: chromeHeight + space.lg }]}
          keyboardShouldPersistTaps="handled" keyExtractor={messageKey}
          ListEmptyComponent={EmptyConversation}
          ListFooterComponent={!window && cursor && online ? (
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
      {report.selected ? <ReportSelectionBar state={report} lines={reportLines} /> : selected ? <SelectionBar manage={manage} selected={selected} /> : <>
      <MessageComposer label="消息" floating focusKey={manage.quote?.id}
        value={draft} onChange={(text) => { setDraft(text); setSticker(undefined); }} maxLength={500}
        attachLabel="添加" photoLabel="从图库选择图片" onAttach={() => setPicker('attachments')}
        onPhoto={() => void prepareImage()} onEmoji={() => setPicker('emoji')}
        photoDisabled={photoLocked} photoBusy={photoBusy} toolsDisabled={sending}
        sendLabel={sending ? '发送中…' : '发送'} onSend={() => void sendText()} sendDisabled={sendDisabled}
        onLayout={({ nativeEvent }) => setComposerHeight(nativeEvent.layout.height)}
        onSendLongPress={() => { setSendOptions({ silent: quiet, noReply }); setSendMenuOpen(true); }}
        mode={manage.quote ? <QuotePreview quote={manage.quote} cancel={() => manage.setQuote(undefined)} /> :
          !demo && (quiet || noReply) ? <>{quiet && <Moon words />}{noReply && <NoReply />}</> : undefined} />
      <PeerSendMenu open={sendMenuOpen} bottom={composerHeight} options={sendOptions} disabled={sendDisabled} sending={sending}
        onToggle={(option) => setSendOptions((current) => ({ ...current, [option]: !current[option] }))}
        onSend={() => void sendText(sendOptions).then(closeSendMenu)} onClose={closeSendMenu} />
      </>}
      <ManagementUI manage={manage} />
      {picker === 'location' && <LocationComposer online={!!demo || online} onClose={() => setPicker(undefined)} onConfirm={(value) => {
        setPicker(undefined);
        void transmit({ kind: 'location', ...value, silent:quiet, quote: manage.quote }).then((ok) => { if (ok) manage.setQuote(undefined); });
      }} />}
      {(picker === 'emoji' || picker === 'attachments') && <Sheet
        title={picker === 'emoji' ? '表情' : '添加'} tone="neutral" onClose={() => setPicker(undefined)}>
        {picker === 'emoji' ? <View style={local.emoji}>
          {commentEmoji.map((emoji) =>
            <Button key={emoji} label={emoji} variant="soft" onPress={() => {
              if (!draft.trim()) setSticker(emoji);
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

          </>}
          <Button label="短视频" icon="videocam-outline" variant="soft" disabled={(!demo && !online) || sending} onPress={() => {
            setPicker(undefined);
            const select = demo && session ? chooseMomentDraftVideo(session.user.id + '-chat') : chooseMomentVideo();
            void select.then(setVideo).catch((failure) => setActionError(errorMessage(failure)));
          }} />
          {!demo && !online && <Text style={styles.muted}>聊天连接恢复后即可选择并发送附件。</Text>}
        </>}
      </Sheet>}
      {report.showForm && <ReportForm peerId={person.userId} lines={reportLines} onClose={() => report.setShowForm(false)} onFinish={report.cancel} />}
      {video&&<Sheet title="发送短视频" onClose={()=>{if(!sending)setVideo(undefined);}}>
        {videoUri ? <MomentVideo source={{ uri: videoUri }} /> : <Empty busy>正在读取视频…</Empty>}
        {noReply&&<NoReply/>}
        {quiet&&<Moon words/>}
        {!!actionError&&<Notice>{actionError}</Notice>}
        <Button label={sending?'发送中…':'发送视频'} variant="gradient" disabled={sending || (!demo && !online) || !videoUri || pending.current?.uncertain}
          onPress={()=>{
            const queued=pending.current;
            if(queued?.value.kind==='video'&&queued.value.uri===video.uri)void transmit(queued.value,queued.original);
            else if (videoUri) void transmit({kind:'video',uri:video.uri,videoId:video.videoId,bytes:video.bytes,duration:video.duration,silent:quiet,noReply,quote:manage.quote}).then((ok) => { if (ok) manage.setQuote(undefined); });
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
  const fontScale = useFontScale();
  const chromeHeight = fontScale <= 1 ? headerHeight : Math.max(headerHeight, 2 * Math.ceil(24 * fontScale) + 4);
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
        {person ? <Conversation key={person.userId} person={person} chromeHeight={chromeHeight}
          initialDraft={typeof draft === 'string' ? draft.slice(0, 500) : ''} /> :
          <View style={local.headerClearance}>
            <Empty busy={!relationships && !error}>{error || (relationships ? '只能与已接受请求的好友聊天。' : '正在加载会话…')}</Empty>
          </View>}
        <View pointerEvents="box-none" style={[local.headerOverlay, { height: chromeHeight + space.xxl }]}>
          <PeerChatFog ready={!!person} />
          <View style={[local.header, { height: chromeHeight }]} pointerEvents="box-none">
            <IconButton label="返回" icon="chevron-back" onPress={goBack} />
            {person ? <Pressable accessibilityRole="button" accessibilityLabel={'查看' + person.name + '的个人主页'}
              style={({ pressed }) => [local.profileLink, pressed && local.profilePressed]}
              onPress={() => router.push({ pathname: '/person/[id]', params: { id: person.userId } })}>
              <Text accessibilityRole="header" style={[styles.strong, styles.grow]} numberOfLines={fontScale > 1 ? 2 : 1}>{person.name}</Text>
            </Pressable> : <Text accessibilityRole="header" style={[styles.strong, styles.grow]}>聊天</Text>}
            {person && <>
              <PetShortcut peer={person.userId} />
              <IconButton label="聊天设置" icon="menu" onPress={() => router.push({ pathname: '/chat-settings/[id]', params: { id: person.userId } })} />
            </>}
          </View>
        </View>
      </View>
    </ChatViewport>
  );
}

const local = StyleSheet.create({
  recalled: { ...styles.small, textAlign: 'center', paddingVertical: space.sm },
  highlight: { backgroundColor: colors.lavender, borderRadius: radius.control },
  headerOverlay: { position: 'absolute', top: 0, left: 0, right: 0, height: headerHeight + space.xxl },
  header: { ...styles.row, height: headerHeight, gap: space.xxs, paddingLeft: space.xxs, paddingRight: space.xs },
  profileLink: { ...styles.row, ...styles.grow, minHeight: touch },
  headerClearance: { paddingTop: headerHeight + space.xs },
  profilePressed: { opacity: 0.72 },
  notice: { paddingHorizontal: space.md, paddingVertical: space.xxs },
  emoji: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  imagePreview: { width: '100%', height: 290, borderRadius: radius.control, backgroundColor: colors.backdrop },
});
