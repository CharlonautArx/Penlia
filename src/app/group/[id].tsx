import { isLiquidGlass } from '../../demo/mode';
import { GlassFooter } from '../../components/focused-glass';
import { StickerPanel } from '../../features/stickers/StickerPanel';
import { appendOfficialSticker, encodeOfficialDraft } from '../../features/stickers/catalog';
import { isBuiltInStickerOnly } from '../../features/stickers/wire';
import { parsePlaceCard } from '../../features/play/place-card-model';
import { canRecall, recalledCaption, recalledQuote, recallWindow } from '../../features/chat/recall-model';
import type { MessageLongPress } from '../../features/chat/record-model';
import { ManagementUI, QuotePreview, RecordLink, SelectionBar, SelectionCheck, useMessageManagement, type ManagedMessage } from '../../features/chat/MessageManagement';
import { recordAsset } from '../../features/chat/record-media';
import type { MessageReferences } from '../../features/chat/record-model';
import { randomUUID } from 'expo-crypto';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { AppState, FlatList, Text, View } from 'react-native';
import { Avatar, Button, Empty, IconButton, ListRow, Notice, Section, Sheet, TopBar } from '../../components/ui';
import {
  chooseMomentPhotos,
  chooseMomentVideo,
  DraftMediaTile,
  encodeMomentMedia,
  MomentMediaTile,
  type LocalMedia,
  type Media,
} from '../../features/moments/media';
import { GroupCallScreen } from '../../features/calls/GroupCallScreen';
import { MessageMarks, NoReply } from '../../features/media/NoReply';
import { ReportForm, ReportSelectionBar, useReportSelection } from '../../features/social/ReportSheet';
import { Moon } from '../../features/media/Moon';
import { QRImage } from '../../features/privacy/CodeSheet';
import { GroupPortrait, useGroupPortraitPicker } from '../../features/groups/GroupPortrait';
import type { ChatGroup } from '../../features/privacy/types';
import { ApiError, errorMessage } from '../../services/api';
import { useFriends, useIdentityResolver } from '../../services/friends';
import { useSession } from '../../services/session';
import { colors, space, styles } from '../../theme';
import { ChatBubble, ChatTimestamp, MessageBody, MessageComposer, chatLayout, startsMessageBlock } from '../../features/chat/ui';
import { ChatViewport } from '../../features/chat/Viewport';

type Line = {
  id: string;
  senderId: string;
  name: string;
  content: string;
  silent: boolean;
  noReply: boolean;
  sentAt: string;
  recalled?: boolean;
  media: Media[];
} & MessageReferences;

export default function GroupConversation() {
  const { id, call: requestedCall } = useLocalSearchParams<{ id: string; call?: string }>();
  const { request, session } = useSession();
  const { relationships, refresh } = useFriends();
  const portraitPicker = useGroupPortraitPicker();
  const [group, setGroup] = useState<ChatGroup>();
  const [members, setMembers] = useState<{ id: string; name: string; avatar?: string }[]>([]);
  const identity = useIdentityResolver();
  const [messages, setMessages] = useState<Line[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [seenOlder, setSeenOlder] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState('');
  const [photos, setPhotos] = useState<LocalMedia[]>([]);
  const [progress, setProgress] = useState('');
  const uploaded = useRef(new Map<string, string>());
  const [quiet, setQuiet] = useState(false);
  const [noReply,setNoReply]=useState(false);
  const [tools,setTools]=useState(false);
  const [emoji, setEmoji] = useState(false);
  const manage = useMessageManagement('group:' + id);
  const [call,setCall]=useState(requestedCall==='1');
  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  const [details, setDetails] = useState(false);
  const report = useReportSelection(session?.user.id, id, '/group/[id]', () => setDetails(true));
  const [invite, setInvite] = useState<{ name: string; code: string }>();
  const [confirmExit, setConfirmExit] = useState(false);
  const pending = useRef<{ id: string; signature: string } | undefined>(undefined);
  const loading = useRef(false);
  const groupPath = '/groups/' + id;

  const load = useCallback(async () => {
    if (loading.current || AppState.currentState === 'background') return;
    loading.current = true;
    try {
      const { messages: latest, next: cursor } = await request<{ messages: Line[]; next: string | null }>(
        groupPath + '/messages',
      );
      setMessages((current) => {
        if (!seenOlder) return latest;
        const first = latest.at(-1)?.sentAt;
        return [
          ...latest,
          ...current.filter((line) => first && line.sentAt < first && !latest.some((value) => value.id === line.id)),
        ];
      });
      if (!seenOlder) setNext(cursor);
      setError('');
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 404) {
        setGroup(undefined);
        setMessages([]);
        setMembers([]);
      }
      setError(errorMessage(failure));
    } finally {
      loading.current = false;
    }
  }, [groupPath, request, seenOlder]);

  const info = useCallback(async () => {
    try {
      const data = await request<{ group: ChatGroup; members: typeof members }>(groupPath);
      setGroup(data.group);
      setMembers(data.members);
    } catch (failure) {
      setGroup(undefined);
      setMembers([]);
      setError(errorMessage(failure));
    }
  }, [groupPath, request]);

  useFocusEffect(
    useCallback(() => {
      void info();
      void refresh();
    }, [info, refresh]),
  );
  useFocusEffect(
    useCallback(() => {
      void load();
      const timer = setInterval(() => void load(), 4500);
      return () => clearInterval(timer);
    }, [load]),
  );

  async function run(task: () => Promise<void>) {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setError('');
    try {
      await task();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      working.current = false;
      setBusy(false);
      setProgress('');
    }
  }

  const own = session?.user.id;
  const back = () => (router.canGoBack() ? router.back() : router.replace('/groups'));
  async function send() {
    const content = encodeOfficialDraft(draft.trim());
    if ((!content && !photos.length) || content.length > 1000) return;
    const signature = JSON.stringify([content, quiet, noReply, manage.quote?.id, photos.map((photo) => photo.id)]);
    if (pending.current?.signature !== signature) pending.current = { id: randomUUID(), signature };
    const mediaIds: string[] = [];
    for (let index = 0; index < photos.length; index++) {
      const photo = photos[index];
      let mediaId = uploaded.current.get(photo.id);
      if (!mediaId) {
        setProgress('上传 ' + (index + 1) + ' / ' + photos.length);
        const saved = await request<{ media: Media }>('/moment-media', {
          method: 'POST',
          body: await encodeMomentMedia(photo),
        });
        mediaId = saved.media.id;
        uploaded.current.set(photo.id, mediaId);
      }
      mediaIds.push(mediaId);
    }
    await request(groupPath + '/messages', {
      method: 'POST',
      body: { clientId: pending.current.id, content, silent: quiet, noReply, mediaIds, replyTo: manage.quote?.id },
    });
    pending.current = undefined;
    uploaded.current.clear();
    setPhotos([]);
    setDraft((current) => current === draft ? '' : current);
    setQuiet(false);
    setNoReply(false);
    manage.setQuote(undefined);
    await load();
  }
  const items = messages.filter((item) => !manage.history.hidden.has(item.id));
  const portraits = new Map(members.map(({ id, avatar }) => [id, avatar]));
  function picture(id: string) {
    const avatar = portraits.get(id);
    return avatar ? { uri: 'data:image/jpeg;base64,' + avatar } : undefined;
  }
  function managed(item: Line): ManagedMessage {
    const asset = item.media[0];
    const timestamp = Date.parse(item.sentAt);
    const recall = !item.recalled && canRecall(item.senderId === own, timestamp) ? async () => {
      await request(groupPath + '/recall', { method: 'POST', body: { id: item.id } });
      setMessages((current) => current.map((line) => line.id === item.id
        ? { ...line, recalled: true, content: '', media: [], quote: undefined, recordId: undefined }
        : line.quote?.id === item.id ? { ...line, quote: { ...line.quote, body: recalledQuote } } : line));
      if (manage.quote?.id === item.id) manage.setQuote(undefined);
    } : undefined;
    return { recall, recallUntil: recall ? timestamp + recallWindow : undefined, id: item.id, kind: !asset ? 'text' : asset.mime === 'video/mp4' ? 'video' : 'image',
      time: Date.parse(item.sentAt), author: item.name, authorId: item.senderId, body: item.content,
      canCopy: !!item.content && !item.recordId && !parsePlaceCard(item.content), recordId: item.recordId,
      assets: item.media.map(recordAsset), quote: item.quote && item.quote.author + ' · ' + item.quote.body };
  }
  const selected = manage.selected && items.filter((item) => !item.recalled && manage.selected?.has(item.id)).map(managed);
  const reportLines = report.selected ? items.filter((line) => !line.recalled && report.selected?.has(line.id))
    .reverse().map((line) => ({ id: line.id, author: line.senderId === own ? '我' : line.name, senderId: line.senderId,
      mine: line.senderId === own, sentAt: line.sentAt,
      content: line.content || (line.media.length ? '[附件 ' + line.media.length + ']' : '[群消息]') })) : [];
  return (
    <ChatViewport>
      <TopBar
        title={group?.name ?? '群聊'}
        back={back}
        actions={
          group && (
            <IconButton label="聊天设置" icon="menu"
              onPress={() => router.push({ pathname: '/group-settings/[id]', params: { id } })} />
          )
        }
      />
      <GlassFooter content={(clearance) => <FlatList
        data={items}
        inverted
        keyboardShouldPersistTaps="handled"
        keyExtractor={(line) => line.id}
        contentContainerStyle={[chatLayout.messages, clearance > 0 && { paddingTop: clearance + space.xs }]}
        ListEmptyComponent={
          <View style={chatLayout.inverted}>
            <Empty busy={!group && !error}>{error || (group ? '还没有群消息。' : '正在读取群聊…')}</Empty>
          </View>
        }
        ListFooterComponent={
          next ? (
            <Button
              label="加载更早消息"
              disabled={busy}
              variant="quiet"
              onPress={() =>
                void run(async () => {
                  const page = await request<{ messages: Line[]; next: string | null }>(
                    groupPath + '/messages?before=' + encodeURIComponent(next),
                  );
                  setMessages((current) => [
                    ...current,
                    ...page.messages.filter((line) => !current.some((existing) => existing.id === line.id)),
                  ]);
                  setSeenOlder(true);
                  setNext(page.next);
                })
              }
            />
          ) : undefined
        }
        renderItem={({ item, index }) => {
          const openActions: MessageLongPress = ({ nativeEvent }) => manage.setMenu(managed(item), { x: nativeEvent.pageX, y: nativeEvent.pageY });
          const mine = item.senderId === own;
          const timestamp = Date.parse(item.sentAt);
          const older = items[index + 1];
          const newer = items[index - 1];
          const block = startsMessageBlock(timestamp, older ? Date.parse(older.sentAt) : undefined);
          if (item.recalled) return <>
            {block && <ChatTimestamp value={timestamp} />}
            <Text style={[styles.small, { textAlign: 'center', paddingVertical: space.sm }]}>{recalledCaption(mine)}</Text>
          </>;
          return <SelectionCheck active={!!(report.selected || manage.selected)} checked={!!(report.selected ?? manage.selected)?.has(item.id)}
            toggle={() => report.selected ? report.toggle(item.id) : manage.toggle(item.id)}><View>
            {block && <ChatTimestamp value={timestamp} />}
            <ChatBubble bare={!item.recordId && ((!item.media.length && isBuiltInStickerOnly(item.content)) || !item.content && item.media.length > 0 &&
              item.media.every(({ mime }) => mime.startsWith('image/')) || !!parsePlaceCard(item.content))} mine={mine} first={block || item.senderId !== older?.senderId}
              last={!newer || item.senderId !== newer.senderId || startsMessageBlock(Date.parse(newer.sentAt), timestamp)}
              author={identity(item.senderId)?.name ?? item.name}
              avatar={<Avatar userId={item.senderId} name={item.name} source={picture(item.senderId)} size={31} />} onActions={(anchor) => manage.setMenu(managed(item), anchor)}>
              {item.quote && <QuotePreview quote={item.quote} />}
              {item.recordId && <RecordLink id={item.recordId} onLongPress={openActions} />}
              {!!item.content && <MessageBody text={item.content} onLongPress={openActions} />}
              {!!item.media.length && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, minWidth: 160 }}>
                  {item.media.map((media) => <MomentMediaTile key={media.id} item={media} context="chat" onLongPress={openActions} />)}
                </View>
              )}
              <MessageMarks sharing={item.noReply} silent={item.silent} />
            </ChatBubble>
          </View></SelectionCheck>;
        }}
      />} footer={(glassSource) => <>
      {!!error && !!group && !details && <Notice>{error}</Notice>}
      {!!group && (report.selected ? <ReportSelectionBar state={report} lines={reportLines} /> : selected ? <SelectionBar manage={manage} selected={selected} /> : <MessageComposer label="群消息" floating={isLiquidGlass} glassSource={glassSource} focusKey={manage.quote?.id} placeholder={isLiquidGlass ? undefined : '发消息'} value={draft} onChange={setDraft}
        maxLength={1000} attachLabel="更多群消息选项" photoLabel="从图库选择群图片"
        toolsDisabled={busy} onAttach={() => setTools(true)} onEmoji={() => setEmoji(true)}
        onPhoto={() => void run(async () => {
          if (own) {
            const chosen = await chooseMomentPhotos(own, 6);
            if (chosen.length) setPhotos(chosen);
          }
        })}
        sendLabel={busy ? '发送中…' : '发送'} sendDisabled={(!draft.trim() && !photos.length) || encodeOfficialDraft(draft.trim()).length > 1000 || busy}
        onSend={() => void run(send)} mode={manage.quote ? <QuotePreview quote={manage.quote} cancel={() => manage.setQuote(undefined)} />
          : quiet || noReply ? <>{quiet && <Moon words />}{noReply && <NoReply />}</> : undefined} />)}
      </>} />
      <ManagementUI manage={manage} />
      {emoji && <Sheet title="表情" tone="neutral" style={{ maxHeight: 315 }} onClose={() => setEmoji(false)}
        footer={<Button label="完成选择" variant="soft" onPress={() => setEmoji(false)} />}>
        <StickerPanel draft={draft} limit={1000} onSelect={(item) => setDraft((current) => appendOfficialSticker(current, item, 1000))} />
      </Sheet>}
      {tools&&<Sheet title="更多群消息选项" onClose={()=>setTools(false)}>
        <Button label={quiet ? '关闭安静送达' : '安静送达'} icon={quiet ? 'moon' : 'moon-outline'}
          variant={quiet ? 'primary' : 'soft'} onPress={() => { setQuiet(!quiet); setTools(false); }} />
        <Button label={noReply?'关闭只是分享':'只是分享'} variant={noReply?'primary':'soft'} onPress={()=>{setNoReply(!noReply);setTools(false);}}/>
        <Text style={styles.muted}>可以与安静送达同时使用。</Text>
        <Button label="选择短视频" icon="videocam-outline" variant="soft" onPress={()=>{
          setTools(false);
          void run(async()=>{const chosen=await chooseMomentVideo();if(chosen)setPhotos([chosen]);});
        }}/>
      </Sheet>}
      {group && report.showForm && <ReportForm groupId={id} lines={reportLines} onClose={() => report.setShowForm(false)} onFinish={report.cancel} />}
      {call&&<GroupCallScreen groupId={id} onClose={()=>setCall(false)}/>}
      {!!photos.length && (
        <Sheet
          title={photos[0]?.mime==='video/mp4'?'发送群视频':'发送群图片'}
          onClose={() => {
            if (!busy) setPhotos([]);
          }}
        >
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {photos.map((item) => (
              <DraftMediaTile key={item.id} item={item} />
            ))}
          </View>
          {noReply && <NoReply/>}
          {quiet && <Moon words />}
          {!!error && <Notice>{error}</Notice>}
          <Button
            label={progress || (photos[0]?.mime==='video/mp4'?'发送视频':'发送 '+photos.length+' 张图片')}
            disabled={busy}
            variant="gradient"
            onPress={() => void run(send)}
          />
        </Sheet>
      )}
      {details && group && (
        <Sheet
          title="群资料"
          onClose={() => {
            setDetails(false);
            setInvite(undefined);
            setConfirmExit(false);
          }}
        >
          {!!error && <Notice>{error}</Notice>}
          <ListRow title={group.name} detail={group.ownerId === own ? '更换群头像' : undefined}
            left={<GroupPortrait name={group.name} avatar={group.avatar} />}
            onPress={group.ownerId === own ? () => void run(() => portraitPicker.choose(async (avatar) => {
              await request(groupPath + '/avatar', { method: 'PUT', body: { avatar } });
              setGroup((latest) => latest && { ...latest, avatar });
            })) : undefined} />
          <Button label="群视频通话" icon="videocam-outline" variant="soft" onPress={()=>{setDetails(false);setCall(true);}}/>
          <Section title="群成员" detail={members.length + ' 位'} />
          {members.map((member) => (
            <ListRow key={member.id} title={identity(member.id)?.name ?? member.name}
              left={<Avatar userId={member.id} name={member.name} source={picture(member.id)} size={34} />}
              detail={member.id === group.ownerId ? '群主' : undefined} />
          ))}
          {(group.ownerId === own || group.membersCanInvite) && (
            <>
              <Section title="邀请好友" />
              {invite && (
                <View style={styles.card}>
                  <Text style={styles.strong}>已向 {invite.name} 发出邀请</Text>
                  <Text style={styles.muted}>识别码只对受邀者有效，48 小时后过期。</Text>
                  <QRImage value={invite.code} />
                  <Text selectable style={styles.small}>
                    {invite.code}
                  </Text>
                </View>
              )}
              {relationships
                ?.filter(
                  (person) => person.status === 'accepted' && !members.some((member) => member.id === person.userId),
                )
                .map((person) => (
                  <ListRow
                    key={person.userId}
                    title={person.name}
                    trailing={
                      <Button
                        label={'邀请 ' + person.name}
                        disabled={busy}
                        variant="soft"
                        onPress={() =>
                          void run(async () => {
                            const { code } = await request<{ code: string }>(groupPath + '/invites', {
                              method: 'POST',
                              body: { userId: person.userId },
                            });
                            setInvite({ name: person.name, code });
                          })
                        }
                      />
                    }
                  />
                ))}
            </>
          )}
          <Button
            label={(confirmExit ? '确认' : '') + (group.ownerId === own ? '解散群聊' : '退出群聊')}
            variant="danger"
            disabled={busy}
            onPress={() => {
              if (!confirmExit) {
                setConfirmExit(true);
                return;
              }
              void run(async () => {
                await request(group.ownerId === own ? groupPath : groupPath + '/leave', {
                  method: group.ownerId === own ? 'DELETE' : 'POST',
                });
                router.replace('/groups');
              });
            }}
          />
        </Sheet>
      )}
      {portraitPicker.crop}
    </ChatViewport>
  );
}
