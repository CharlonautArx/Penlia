import { randomUUID } from 'expo-crypto';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { AppState, FlatList, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Empty, IconButton, ListRow, Notice, Section, Sheet, TopBar } from '../../components/ui';
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
import { NoReply } from '../../features/media/NoReply';
import { ReportSheet,type EvidenceLine } from '../../features/social/ReportSheet';
import { Moon } from '../../features/media/Moon';
import { QRImage } from '../../features/privacy/CodeSheet';
import type { ChatGroup } from '../../features/privacy/types';
import { ApiError, errorMessage } from '../../services/api';
import { useFriends } from '../../services/friends';
import { useSession } from '../../services/session';
import { colors, styles } from '../../theme';

type Line = {
  id: string;
  senderId: string;
  name: string;
  content: string;
  silent: boolean;
  noReply: boolean;
  sentAt: string;
  media: Media[];
};

export default function GroupConversation() {
  const { id, call: requestedCall } = useLocalSearchParams<{ id: string; call?: string }>();
  const { request, session } = useSession();
  const { relationships, refresh } = useFriends();
  const [group, setGroup] = useState<ChatGroup>();
  const [members, setMembers] = useState<{ id: string; name: string }[]>([]);
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
  const [call,setCall]=useState(requestedCall==='1');
  const [report,setReport]=useState<{anchor:EvidenceLine;lines:EvidenceLine[]}>();
  const [busy, setBusy] = useState(false);
  const [details, setDetails] = useState(false);
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
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await task();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
      setProgress('');
    }
  }

  const own = session?.user.id;
  const back = () => (router.canGoBack() ? router.back() : router.replace('/groups'));
  async function send() {
    const content = draft.trim();
    if (!content && !photos.length) return;
    const signature = JSON.stringify([content, quiet, noReply, photos.map((photo) => photo.id)]);
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
      body: { clientId: pending.current.id, content, silent: quiet, noReply, mediaIds },
    });
    pending.current = undefined;
    uploaded.current.clear();
    setPhotos([]);
    setDraft('');
    setQuiet(false);
    setNoReply(false);
    await load();
  }
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.backdrop }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <TopBar
          title={group?.name ?? '群聊'}
          back={back}
          actions={
            group && (
              <IconButton
                label="群资料和邀请"
                icon="ellipsis-horizontal"
                onPress={() => {
                  setDetails(true);
                  void info();
                }}
              />
            )
          }
        />
        <FlatList
          data={messages}
          inverted
          keyboardShouldPersistTaps="handled"
          keyExtractor={(line) => line.id}
          contentContainerStyle={{ padding: 16, gap: 10 }}
          ListEmptyComponent={
            <View style={{ transform: [{ scaleY: -1 }] }}>
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
          renderItem={({ item,index }) => (
            <View style={{ alignSelf: item.senderId === own ? 'flex-end' : 'flex-start', maxWidth: '88%' }}>
              <Text style={styles.small}>
                {item.senderId === own ? '我' : item.name} ·{' '}
                {new Date(item.sentAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
              </Text>
              <Pressable
                onLongPress={item.senderId!==own?()=>{
                  const lines=messages.slice(Math.max(0,index-3),index+4).map((line)=>({
                    id:line.id, author:line.name,mine:line.senderId===own,
                    content:line.content+(line.media.length?' [附件 '+line.media.length+']':''),
                  }));
                  const anchor=lines.find((line)=>line.id===item.id);
                  if(anchor)setReport({anchor,lines});
                }:undefined}
                style={[
                  styles.card,
                  { backgroundColor: item.senderId === own ? colors.lavender : colors.panel, paddingVertical: 9 },
                ]}
              >
                {!!item.content && <Text style={styles.body}>{item.content}</Text>}
                {!!item.media.length && (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, minWidth: 160 }}>
                    {item.media.map((media) => (
                      <MomentMediaTile key={media.id} item={media} context="chat" />
                    ))}
                  </View>
                )}
                {item.noReply && <NoReply/>}
                {item.silent && <Moon words />}
              </Pressable>
            </View>
          )}
        />
        {!!error && !!group && !details && <Notice>{error}</Notice>}
        {noReply&&<View style={{paddingHorizontal:14}}><NoReply/></View>}
        {!!group && (
          <View style={[styles.row, { padding: 9, backgroundColor: colors.panel, gap: 5 }]}>
            <IconButton label="更多群消息选项" icon="add-circle-outline" disabled={busy} onPress={()=>setTools(true)}/>
            <IconButton
              label="从图库选择群图片"
              icon="image-outline"
              disabled={busy}
              onPress={() =>
                void run(async () => {
                  if (own) {
                    const chosen = await chooseMomentPhotos(own, 6);
                    if (chosen.length) setPhotos(chosen);
                  }
                })
              }
            />
            <IconButton
              label={quiet ? '关闭安静送达' : '安静送达'}
              icon={quiet ? 'moon' : 'moon-outline'}
              tinted={quiet}
              disabled={busy}
              onPress={() => setQuiet(!quiet)}
            />
            <TextInput
              accessibilityLabel="群消息"
              placeholder="发消息"
              value={draft}
              onChangeText={setDraft}
              multiline
              maxLength={1000}
              editable={!busy}
              style={[styles.input, styles.grow]}
            />
            <Button label="发送" disabled={(!draft.trim() && !photos.length) || busy} onPress={() => void run(send)} />
          </View>
        )}
      </KeyboardAvoidingView>
      {tools&&<Sheet title="更多群消息选项" onClose={()=>setTools(false)}>
        <Button label={noReply?'关闭只是分享':'只是分享'} variant={noReply?'primary':'soft'} onPress={()=>{setNoReply(!noReply);setTools(false);}}/>
        <Text style={styles.muted}>可以与安静送达同时使用。</Text>
        <Button label="选择短视频" icon="videocam-outline" variant="soft" onPress={()=>{
          setTools(false);
          void run(async()=>{const chosen=await chooseMomentVideo();if(chosen)setPhotos([chosen]);});
        }}/>
      </Sheet>}
      {report&&<ReportSheet groupId={id} anchor={report.anchor} lines={report.lines} onClose={()=>setReport(undefined)}/>}
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
          <Button label="群视频通话" icon="videocam-outline" variant="soft" onPress={()=>{setDetails(false);setCall(true);}}/>
          <Section title="群成员" detail={members.length + ' 位'} />
          {members.map((member) => (
            <ListRow key={member.id} title={member.name} detail={member.id === group.ownerId ? '群主' : undefined} />
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
    </SafeAreaView>
  );
}
