import { randomUUID } from 'expo-crypto';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, IconButton, Notice, Screen, Section, SettingGroup } from '../../components/ui';
import { isUiDemo } from '../../demo/mode';
import { errorMessage } from '../../services/api';
import { useSession } from '../../services/session';
import { colors, radius, space, styles, touch } from '../../theme';
import { EditorMediaPreview, EditorMediaThumbnail, encodeMomentMedia, removeMomentDraftMedia, type LocalMedia } from '../moments/media';
import { pickPhotos, preparePhoto } from '../media/picker';
import { CheckRow, Field, formatTime } from './ui';

export type EvidenceLine = { id: string; content: string; mine: boolean; author: string; sentAt: string; senderId?: string };
export const reportKinds = {
  boundary: '生活边界保护计划', sexual: '色情低俗', rumor: '政治谣言',
  advertising: '广告引流', fraud: '欺诈骗钱', violence: '暴力恐怖',
  illegal: '违法违规', self_harm: '自杀自残', spam: '营销水军',
  harassment: '恶意骚扰', threat: '严重威胁',
};
const reasonCodes = ['boundary', 'sexual', 'rumor', 'advertising', 'fraud', 'violence', 'illegal', 'self_harm', 'spam'] as const;
const limit = 5;
const photoLimit = 384 * 1024;
type ReportPhoto = Extract<LocalMedia, { mime: 'image/jpeg' }>;
export type ChatDestination = '/chat/[id]' | '/group/[id]';
type ConversationAction = 'report' | 'group-info';
const pendingActions = new Map<string, ConversationAction>();

export function openConversationAction(account: string, id: string, pathname: ChatDestination, action: ConversationAction) {
  if (router.canGoBack()) {
    pendingActions.set(account + ':' + pathname + ':' + id, action);
    router.dismissTo({ pathname, params: { id } });
  } else {
    pendingActions.set(account + ':' + pathname + ':' + id, action);
    router.replace({ pathname, params: { id } });
  }
}

export function useReportSelection(account: string | undefined, id: string, pathname: ChatDestination, onGroupInfo?: () => void) {
  const [selected, setSelected] = useState<Set<string>>();
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const showGroupInfo = useRef(onGroupInfo);
  showGroupInfo.current = onGroupInfo;
  useFocusEffect(useCallback(() => {
    if (!account) return;
    const key = account + ':' + pathname + ':' + id;
    const action = pendingActions.get(key);
    pendingActions.delete(key);
    if (action === 'group-info') showGroupInfo.current?.();
    if (action === 'report') {
      Keyboard.dismiss();
      setSelected(new Set());
      setError('');
    }
  }, [account, id, pathname]));

  function toggle(messageId: string) {
    if (!selected) return;
    const next = new Set(selected);
    if (next.delete(messageId)) setError('');
    else if (next.size >= limit) { setError('每次最多选择 5 条消息。'); return; }
    else { next.add(messageId); setError(''); }
    setSelected(next);
  }
  function cancel() {
    setShowForm(false);
    setSelected(undefined);
    setError('');
  }
  return { selected, toggle, cancel, error, showForm, setShowForm };
}

export function ReportEntry({ onPress }: { onPress: () => void }) {
  return <SettingGroup>
    <Pressable accessibilityRole="button" onPress={onPress}
      style={({ pressed }) => [local.entry, pressed && local.pressed]}>
      <Text style={[styles.strong, local.danger]}>举报</Text>
    </Pressable>
  </SettingGroup>;
}

export function ReportSelectionBar({ state, lines }: { state: ReturnType<typeof useReportSelection>; lines: EvidenceLine[] }) {
  return <View style={local.selection}>
    {!!state.error && <Notice>{state.error}</Notice>}
    <View style={[styles.row, local.bar]}>
      <IconButton label="退出举报选择" icon="close" onPress={state.cancel} />
      <View style={styles.grow}>
        <Text style={styles.strong}>举报 · 已选 {lines.length} 条</Text>
        <Text style={styles.small}>请选择对方的消息和必要的上下文</Text>
      </View>
      <Button label="下一步" variant="gradient" disabled={!lines.some((line) => !line.mine)}
        onPress={() => state.setShowForm(true)} />
    </View>
  </View>;
}

export function ReportLines({ lines }: { lines: (Pick<EvidenceLine, 'id' | 'author' | 'content'> & { sentAt?: string; attachments?: number })[] }) {
  return <View style={local.lines}>
    {lines.map((line) => <View style={local.line} key={line.id}>
      <View style={local.lineMeta}>
        <Text style={styles.strong}>{line.author}</Text>
        {!!line.sentAt && <Text style={styles.small}>{formatTime(line.sentAt)}</Text>}
      </View>
      <Text selectable style={styles.body}>{line.content || (line.attachments ? '附件 ' + line.attachments : '无文字')}</Text>
    </View>)}
  </View>;
}

export function ReportForm({ groupId, peerId, lines, onClose, onFinish }: {
  groupId?: string; peerId?: string; lines: EvidenceLine[]; onClose: () => void; onFinish: () => void;
}) {
  const { request, session } = useSession();
  const [clientId] = useState(randomUUID);
  const [kind, setKind] = useState<typeof reasonCodes[number]>();
  const targets = [...new Map(lines.filter(({ mine }) => !mine).map((line) => [line.senderId ?? line.author, line])).values()];
  const [anchorId, setAnchor] = useState(lines.find((line) => !line.mine)?.id);
  const anchor = lines.find((line) => line.id === anchorId && !line.mine);
  const [explanation, setExplanation] = useState('');
  const [photos, setPhotos] = useState<ReportPhoto[]>([]);
  const [preview, setPreview] = useState<ReportPhoto>();
  const keep = useRef(false);
  const photoRef = useRef<ReportPhoto[]>([]);
  const [stage, setStage] = useState<'form' | 'review' | 'success'>('form');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  useEffect(() => () => {
    if (!keep.current) void Promise.allSettled(photoRef.current.map(removeMomentDraftMedia));
  }, []);

  async function run(task: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try { await task(); }
    catch (failure) { setError(errorMessage(failure)); }
    finally { lock.current = false; setBusy(false); }
  }
  function close() {
    if (lock.current) return;
    if (stage === 'success') onFinish();
    else if (stage === 'review') setStage('form');
    else onClose();
  }
  async function addPhoto() {
    if (!session || photos.length >= 3) return;
    const [input] = await pickPhotos();
    if (!input) return;
    const photo = await preparePhoto(input, session.user.id, undefined, { maxSide: 1280, maxBytes: photoLimit });
    const next: ReportPhoto[] = [...photoRef.current, { id: randomUUID(), mime: 'image/jpeg', photoId: photo.id }];
    photoRef.current = next;
    setPhotos(next);
  }
  function removePhoto(id: string) {
    const removed = photoRef.current.find((item) => item.id === id);
    if (!removed) return;
    photoRef.current = photoRef.current.filter((item) => item.id !== id);
    setPhotos(photoRef.current);
    void removeMomentDraftMedia(removed).catch(() => {});
  }
  async function submit() {
    if (!kind || !anchor) return;
    const proof = isUiDemo ? { localPhotos: photos.map(({ id, photoId, mime }) => ({ id, photoId, mime })) }
      : { photos: await Promise.all(photos.map(async (photo) => (await encodeMomentMedia(photo)).base64)) };
    await request('/p1/reports', {
      method: 'POST',
      body: {
        clientId, kind, groupId, peerId, anchorId: anchor.id, explanation, ...proof,
        ...(groupId ? { messageIds: lines.map(({ id }) => id) } :
          { messages: lines.map(({ id, content, mine, sentAt }) => ({ id, content, mine, sentAt })) }),
      },
    });
    keep.current = isUiDemo;
    setStage('success');
  }

  return <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={close}>
    <KeyboardAvoidingView style={styles.grow} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen title={stage === 'review' ? '确认举报' : stage === 'success' ? '举报完成' : '举报'} back={close}>
        {!!error && <Notice>{error}</Notice>}
        {stage === 'form' && <>
          <Section title="举报原因" />
          {[0, 3, 6].map((start) => <View key={start} style={local.reasonRow}>
            {reasonCodes.slice(start, start + 3).map((code) => <Pressable key={code} accessibilityRole="radio"
              accessibilityState={{ checked: code === kind }} onPress={() => setKind(code)}
              style={({ pressed }) => [local.reason, code === kind && local.chosen, pressed && local.pressed]}>
              <Text style={[styles.small, local.reasonLabel, code === kind && local.chosenText]}>{reportKinds[code]}</Text>
            </Pressable>)}
          </View>)}
          {groupId && targets.length > 1 && <>
            <Section title="举报对象" />
            {targets.map((line) => <CheckRow key={line.id}
              label={line.author + ' · ' + formatTime(line.sentAt)}
              selected={anchor?.senderId === line.senderId} action={() => setAnchor(line.id)} />)}
          </>}
          <Field title="补充说明（选填）" value={explanation} maxLength={500} multiline onChangeText={setExplanation} />
          <Section title="举报配图（选填）" detail={photos.length + ' / 3'} />
        </>}
        {stage === 'review' && <>
          <Section title={kind ? reportKinds[kind] : '举报原因'} detail={anchor?.author} />
          <ReportLines lines={lines} />
          {!!explanation.trim() && <><Section title="补充说明" /><Text style={styles.body}>{explanation}</Text></>}
        </>}
        {stage !== 'success' && photos.length > 0 && <View style={local.photos}>
          {photos.map((item) => <View key={item.id} style={local.photo}>
            <Pressable accessibilityRole="button" accessibilityLabel="预览举报配图" style={local.thumbnail} onPress={() => setPreview(item)}>
              <EditorMediaThumbnail item={item} />
            </Pressable>
            {stage === 'form' && <View style={local.removePhoto}><IconButton label="移除举报配图" icon="close" onPress={() => removePhoto(item.id)} /></View>}
          </View>)}
        </View>}
        {stage === 'form' && <>
          {photos.length < 3 && <Button label="从相册添加" icon="image-outline" variant="soft" disabled={busy} onPress={() => void run(addPhoto)} />}
          <Button label="预览提交内容" variant="gradient" disabled={!kind || !anchor || busy} onPress={() => { Keyboard.dismiss(); setStage('review'); }} />
        </>}
        {stage === 'review' && <>
          <Text style={styles.muted}>{isUiDemo ? '预览版仅在本机保存所选消息和补充材料。' : '审核仅接收你选中的消息及此页面显示的补充材料。'}</Text>
          <Button label={busy ? '提交中…' : '提交举报'} variant="gradient" disabled={busy} onPress={() => void run(submit)} />
        </>}
        {stage === 'success' && <>
          <Text style={styles.body}>{isUiDemo ? '这条举报已保存在本机。' : '举报已受理，将由审核人员处理。'}</Text>
          {kind === 'boundary' && <Text style={styles.muted}>可在「我的 → 生活边界保护计划」查看记录。</Text>}
          <Button label="完成" onPress={onFinish} />
        </>}
      </Screen>
    </KeyboardAvoidingView>
    {preview && <EditorMediaPreview item={preview} close={() => setPreview(undefined)} />}
  </Modal>;
}

const local = StyleSheet.create({
  entry: { minHeight: touch + 8, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.panel },
  danger: { color: colors.danger },
  pressed: { opacity: 0.72 },
  selection: { backgroundColor: colors.panel, paddingHorizontal: space.sm, paddingVertical: space.xxs },
  bar: { gap: space.xs },
  reasonRow: { flexDirection: 'row', gap: space.xs },
  reason: { flex: 1, minWidth: 0, minHeight: 52, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: space.xxs, paddingVertical: space.xs, borderRadius: radius.control, borderWidth: 1,
    borderColor: 'transparent', backgroundColor: colors.panel },
  chosen: { borderColor: colors.accent, backgroundColor: colors.lavender },
  reasonLabel: { textAlign: 'center', color: colors.text },
  chosenText: { fontWeight: '600' },
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  photo: { position: 'relative', width: '31%' },
  thumbnail: { width: '100%', aspectRatio: 1, backgroundColor: colors.search,
    borderRadius: radius.control, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  removePhoto: { position: 'absolute', top: 0, right: 0, backgroundColor: colors.panel, borderRadius: radius.pill },
  lines: { backgroundColor: colors.panel, borderRadius: radius.surface, paddingHorizontal: space.sm },
  line: { ...styles.divider, gap: space.xxs, paddingVertical: space.sm },
  lineMeta: { ...styles.row, gap: space.xs, flexWrap: 'wrap' },
});
