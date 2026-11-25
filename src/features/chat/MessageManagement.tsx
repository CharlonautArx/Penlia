import type { MessageLongPress } from './record-model';
import { setStringAsync } from 'expo-clipboard';
import { randomUUID } from 'expo-crypto';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Animated, Keyboard, Modal, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFontScale } from '../../components/Typography';
import { useAppearance } from '../../components/appearance';
import { Avatar, Button, Icon, IconButton, ListRow, Notice, Sheet, type IconName } from '../../components/ui';
import { useDemo } from '../../demo/state';
import { demoPortrait } from '../../demo/visuals';
import { errorMessage } from '../../services/api';
import { useFriends } from '../../services/friends';
import { imUserId, useIm } from '../../services/im';
import { useSession } from '../../services/session';
import { colors, radius, space, styles, touch } from '../../theme';
import { useHistoryState } from './management-state';
import { deliverPeerMessage, UnknownDelivery } from '../media/messages';
import type { ChatGroup } from '../privacy/types';
import { useChatHistory } from './history';
import { readRecordAsset, recordAsset, type RecordAsset } from './record-media';
import { shareSafeText, sortedRecords, type Quote, type RecordLine } from './record-model';
import type { Media } from '../moments/media';
import { displayName, emptyDirectory } from '../friends/directory';
import { useDirectory } from '../friends/store';

export type ManagedMessage = RecordLine & { recall?: () => Promise<void>; recallUntil?: number; portable?: boolean; assets?: RecordAsset[]; recordId?: string; canCopy?: boolean; replyable?: boolean };
type Target = { id: string; kind: 'peer' | 'group'; label: string };
type Payload = Omit<RecordLine, 'id'> & { mediaIds: string[] };
type Anchor = { x: number; y: number };
export type RecordEntry = Omit<RecordLine, 'id'> & { media: Media[] };

export function useMessageManagement(scope: string) {
  const history = useChatHistory(scope);
  const state = useHistoryState();
  const [deleting, setDeleting] = useState<ManagedMessage[]>();
  const [deletingBusy, setDeletingBusy] = useState(false);
  const [deletingError, setDeletingError] = useState('');
  const setMenu = (message: ManagedMessage, anchor?: Anchor) => {
    if (state.selected) return;
    Keyboard.dismiss();
    state.setMenu({ message, anchor });
  };
  const remove = (messages: ManagedMessage[]) => {
    state.setMenu(undefined);
    setDeletingError('');
    setDeleting(messages);
  };
  const confirmDelete = async () => {
    if (!deleting || deletingBusy) return;
    setDeletingBusy(true);
    try {
      await history.deleteSelected(deleting.map(({ id }) => id));
      state.setSelected(undefined);
      if (deleting.some((item) => item.id === state.quote?.id)) state.setQuote(undefined);
      setDeleting(undefined);
    } catch (failure) { setDeletingError(errorMessage(failure)); }
    finally { setDeletingBusy(false); }
  };
  return { ...state, setMenu, closeMenu: () => state.setMenu(undefined), remove, history,
    deleting, deletingBusy, deletingError, confirmDelete, cancelDelete: () => { if (!deletingBusy) setDeleting(undefined); } };

}

type Manager = ReturnType<typeof useMessageManagement>;
export function ManagementUI({ manage }: { manage: Manager }) {
  const { menu, closeMenu, setSelected, setShare, setQuote, remove } = manage;
  const [currentTime, setCurrentTime] = useState(Date.now);
  const deadline = menu?.message.recallUntil;
  useEffect(() => {
    setCurrentTime(Date.now());
    if (!deadline) return;
    const timer = setTimeout(() => setCurrentTime(Date.now()), Math.max(0, deadline - Date.now()) + 25);
    return () => clearTimeout(timer);
  }, [deadline, menu?.message.id]);
  const [favorite, setFavorite] = useState<ManagedMessage>();
  const { send } = useRecordDelivery();
  const saveFavorite = async (item: ManagedMessage) => {
    setFavorite(item);
    try {
      await send([item], true);
      if (Platform.OS === 'android') {
        const { ToastAndroid } = await import('react-native');
        ToastAndroid.show('已加入我的收藏', ToastAndroid.SHORT);
      } else Alert.alert('已加入我的收藏');
    } catch (failure) { Alert.alert('收藏失败', errorMessage(failure)); }
    finally { setFavorite(undefined); }
  };
  let actions: { label: string; icon: IconName; run: () => void }[] = [];
  if (menu) {
    const { message: row } = menu;
    actions = [
      ...(row.canCopy ? [{ label: '复制', icon: 'copy-outline' as const, run: () => {
        void setStringAsync(row.body).then((ok) => { if (!ok) throw new Error('无法写入系统剪贴板。'); })
          .catch((failure) => Alert.alert('复制失败', errorMessage(failure)));
      } }] : []),
      ...(row.portable === false ? [] : [
        { label: '转发', icon: 'arrow-redo-outline' as const, run: () => setShare([row]) },
        { label: '收藏', icon: 'bookmark-outline' as const, run: () => { if (!favorite) void saveFavorite(row); } },
      ]),
      ...(row.recall && deadline && deadline > currentTime ? [{
        label: '撤回', icon: 'arrow-undo-outline' as const, run: () => {
          void row.recall!().catch((failure) => Alert.alert('撤回失败', errorMessage(failure)));
        },
      }] : []),
      { label: '多选', icon: 'checkbox-outline', run: () => setSelected(new Set([row.id])) },
      ...(manage.history.ready ? [{ label: '删除', icon: 'trash-outline' as const, run: () => remove([row]) }] : []),
      ...(row.replyable !== false ? [{ label: '引用', icon: 'return-down-back-outline' as const, run: () => setQuote({
        id: row.id, author: row.author, body: shareSafeText(row.body).slice(0, 180) || (row.kind === 'video' ? '[视频]' : '[图片]'),
      }) }] : []),
    ];
  }
  return <>
    {menu && <MessageMenu anchor={menu.anchor} onClose={closeMenu} actions={actions.map((action) => ({
      ...action, run: () => { closeMenu(); action.run(); },
    }))} />}
    {manage.deleting && <Sheet title="删除聊天记录" onClose={manage.cancelDelete}>
      <Text style={styles.small}>移除这台设备上的 {manage.deleting.length} 条所选消息。</Text>
      {!!manage.deletingError && <Notice>{manage.deletingError}</Notice>}
      <Button label="确认删除" variant="danger" disabled={manage.deletingBusy} onPress={() => void manage.confirmDelete()} />
    </Sheet>}
    {!!manage.share?.length && <ForwardPicker messages={manage.share} onClose={() => setShare(undefined)}
      done={() => { setShare(undefined); setSelected(undefined); }} />}
  </>;
}

function MessageMenu({ anchor, actions, onClose }: {
  anchor?: Anchor; actions: { label: string; icon: IconName; run: () => void }[]; onClose: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const inset = useSafeAreaInsets();
  const { reduced, scheme } = useAppearance();
  const progress = useRef(new Animated.Value(0)).current;
  const menuWidth = Math.min(width - 24, 310);
  const scale = useFontScale();
  const rowHeight = Math.max(53, 29 + Math.ceil(20 * scale));
  const menuHeight = 8 + Math.ceil(actions.length / 3) * rowHeight;
  const x = Math.max(12, Math.min(width - menuWidth - 12, (anchor?.x ?? width / 2) - menuWidth / 2));
  const y = anchor && anchor.y - menuHeight - 12 > inset.top ? anchor.y - menuHeight - 12 : (anchor?.y ?? height * 0.55) + 12;
  const top = Math.max(inset.top + 14, Math.min(height - inset.bottom - menuHeight - 12, y));
  useEffect(() => {
    const animation = Animated.timing(progress, { toValue: 1, duration: reduced ? 0 : 165, useNativeDriver: Platform.OS !== 'web' });
    animation.start();
    return () => animation.stop();
  }, [progress, reduced]);
  return <Modal visible transparent statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
    <View style={local.modal}>
      <Pressable accessible={false} onPress={onClose} style={StyleSheet.absoluteFill} />
      <Animated.View accessibilityViewIsModal accessibilityLabel="消息操作" style={[local.menu, scheme === 'dark' && local.dark,
        { width: menuWidth, left: x, top, opacity: progress, transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }] }]}>
        <LinearGradient pointerEvents="none" colors={['#FFFFFF20', '#FFFFFF00', '#AEFFF81C']} style={StyleSheet.absoluteFill} />
        {actions.map((action) => <Pressable accessibilityRole="button" accessibilityLabel={action.label} key={action.label} onPress={action.run}
          style={({ pressed }) => [local.action, { minHeight: rowHeight }, pressed && local.pressed]}>
          <Icon name={action.icon} size={21} color={(action.label === '删除' || action.label === '撤回') ? colors.danger : colors.ink} /><Text style={styles.small}>{action.label}</Text>
        </Pressable>)}
      </Animated.View>
    </View>
  </Modal>;
}

export function SelectionBar({ manage, selected }: { manage: Manager; selected: ManagedMessage[] }) {
  return <View style={local.selection}>
    <IconButton label="退出多选" icon="close" onPress={() => manage.setSelected(undefined)} />
    <Text style={[styles.small, styles.grow]}>已选 {selected.length} 条</Text>
    <Button label="转发" icon="arrow-redo-outline" variant="soft" disabled={!selected.length || selected.some((item) => item.portable === false)} onPress={() => manage.setShare(selected)} />
    <Button label="删除" icon="trash-outline" variant="quiet" disabled={!selected.length || !manage.history.ready} onPress={() => manage.remove(selected)} />
  </View>;
}
export function SelectionCheck({ active, checked, toggle, children }: { active: boolean; checked: boolean; toggle: () => void; children: React.ReactNode }) {
  if (!active) return children;
  return <Pressable accessibilityLabel="选择消息" accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={toggle} style={local.selectionRow}>
    <Icon name={checked ? 'checkmark-circle' : 'ellipse-outline'} color={checked ? colors.accent : colors.quiet} size={21} />
    <View style={styles.grow} pointerEvents="none" importantForAccessibility="no-hide-descendants">{children}</View>
  </Pressable>;
}

export function QuotePreview({ quote, cancel }: { quote: Quote; cancel?: () => void }) {
  return <View style={[local.quote, !cancel && local.bubbleQuote]}>
    <Icon name="return-down-back-outline" color={colors.quiet} size={15} />
    <Text style={[styles.small, styles.grow]} numberOfLines={1}>{quote.author} · {quote.body}</Text>
    {cancel && <IconButton label="取消引用" icon="close" onPress={cancel} />}
  </View>;
}

export function RecordLink({ id, onLongPress }: { id: string; onLongPress?: MessageLongPress }) {
  return <Pressable accessibilityRole="button" accessibilityLabel="查看聊天记录" onLongPress={onLongPress} style={local.record}
    onPress={() => router.push({ pathname: '/life/chat-record/[id]', params: { id } })}>
    <Icon name="reader-outline" size={20} /><Text style={styles.strong}>聊天记录</Text><Icon name="chevron-forward" size={14} />
  </Pressable>;
}

function useRecordDelivery() {
  const { request, session } = useSession();
  const { connection, online, changed } = useIm();
  const demo = useDemo();
  const saved = useRef(new Map<string, { clientId: string; files: Map<string, string>; recordId?: string; sent?: boolean; uncertain?: boolean }>());
  async function send(input: ManagedMessage[], merge: boolean, target?: Target, progress?: (done: number) => void) {
    const batches = merge ? [sortedRecords(input)] : sortedRecords(input).map((item) => [item]);
    if (!session || !input.length || input.length > 30) throw new Error('请选择 1 至 30 条消息。');
    if (target?.kind === 'peer' && !demo && (!connection || !online)) throw new Error('好友聊天尚未连接。');
    if (target?.kind === 'peer' && !demo) await request('/im/contact', { method: 'POST', body: { userId: target.id } });
    for (let index = 0; index < batches.length; index++) {
      const batch = batches[index];
      const key = JSON.stringify([target?.kind, target?.id, merge, batch.map((item) => item.id)]);
      let operation = saved.current.get(key);
      if (!operation) { operation = { clientId: randomUUID(), files: new Map() }; saved.current.set(key, operation); }
      if (operation.uncertain) throw new Error('暂未确认送达，请先查看目标会话。');
      if (operation.sent) { progress?.(index + 1); continue; }
      let recordId = operation.recordId;
      if (!recordId) {
        const lines: Payload[] = [];
        for (const item of batch) {
          const existing = item.recordId ? await request<{ lines: RecordEntry[] }>('/chat-records/' + item.recordId) : undefined;
          const source = existing ? existing.lines.map((line) => ({ ...line, assets: line.media.map(recordAsset) })) : [item];
          for (const line of source) {
            const mediaIds: string[] = [];
            for (const [attachment, asset] of (line.assets ?? []).entries()) {
              const fileKey = JSON.stringify([item.id, lines.length, attachment]);
              let clientId = operation.files.get(fileKey);
              if (!clientId) { clientId = randomUUID(); operation.files.set(fileKey, clientId); }
              const { media } = await request<{ media: Media }>('/moment-media', { method: 'POST', body: {
                clientId, mime: asset.mime, base64: await readRecordAsset(asset, session.token),
              } });
              mediaIds.push(media.id);
            }
            lines.push({ kind: line.kind, time: line.time, author: line.author.slice(0, 80),
              body: shareSafeText(line.body), quote: line.quote ? shareSafeText(line.quote) : undefined, mediaIds });
          }
        }
        if (lines.length > 30) throw new Error('合并后最多包含 30 条记录，可改用逐条转发。');
        const created = await request<{ id: string }>('/chat-records', { method: 'POST', body: { clientId: operation.clientId, lines,
          peerId: target?.kind === 'peer' ? target.id : undefined, groupId: target?.kind === 'group' ? target.id : undefined } });
        recordId = created.id;
        operation.recordId = recordId;
      }
      if (!target) {
        await request('/chat-favorites', { method: 'POST', body: { recordId, title: ('聊天 · ' + batch[0].author + ' · ' + shareSafeText(batch[0].body)).slice(0, 120) } });
      } else if (target.kind === 'group') {
        await request('/groups/' + target.id + '/messages', { method: 'POST',
          body: { clientId: operation.clientId, content: '', recordId } });
      } else if (demo) {
        demo.send(target.id, '[聊天记录]', { recordId });
      } else if (connection) {
        if (await connection.client.getCurrentUsername() !== imUserId(session.user.id)) throw new Error('聊天已断开，请重新连接。');
        try {
          await deliverPeerMessage(connection, imUserId(target.id), { kind: 'text', text: '[聊天记录]', recordId });
          changed();
        } catch (error) {
          if (error instanceof UnknownDelivery) operation.uncertain = true;
          throw error;
        }
      }
      operation.sent = true;
      progress?.(index + 1);
    }
  }
  return { send };
}

function ForwardPicker({ messages, onClose, done }: { messages: ManagedMessage[]; onClose: () => void; done: () => void }) {
  const { request } = useSession();
  const { relationships } = useFriends();
  const { value = emptyDirectory } = useDirectory();
  const { send } = useRecordDelivery();
  const [groups, setGroups] = useState<ChatGroup[]>([]);
  const [mode, setMode] = useState<boolean>();
  const [target, setTarget] = useState<Target>();
  const [error, setError] = useState('');
  const [groupError, setGroupError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(0);
  const working = useRef(false);
  const load = useCallback(() => {
    setGroupError('');
    void request<{ groups: ChatGroup[] }>('/groups').then(({ groups }) => setGroups(groups)).catch((failure) => setGroupError(errorMessage(failure)));
  }, [request]);
  useEffect(load, [load]);
  const chooseMode = messages.length > 1 && mode === undefined;
  return <Sheet title={chooseMode ? '转发方式' : target ? '确认转发' : '转发给'} onClose={() => { if (!working.current) onClose(); }}>
    {!!error && <Notice>{error}</Notice>}
    {chooseMode ? <>
      <ListRow title="合并转发" left={<Icon name="reader-outline" />} onPress={() => setMode(true)} />
      <ListRow title="逐条转发" left={<Icon name="arrow-redo-outline" />} onPress={() => setMode(false)} />
    </> : target ? <>
      <Text style={styles.body}>{target.label} · {messages.length} 条消息</Text>
      <Button label={busy ? '已发送 ' + sent + ' 条…' : '确认转发'} disabled={busy} variant="gradient" onPress={() => {
        if (working.current) return;
        working.current = true; setBusy(true); setError('');
        void send(messages, mode !== false, target, setSent).then(done)
          .catch((failure) => setError(errorMessage(failure))).finally(() => { working.current = false; setBusy(false); });
      }} />
    </> : <>
      {!!groupError && <Notice action="重试" onAction={load}>{groupError}</Notice>}
      {relationships?.filter((friend) => friend.status === 'accepted').map((friend) =>
        <ListRow key={friend.userId} title={displayName(friend, value)} left={<Avatar userId={friend.userId} name={friend.name}
          source={demoPortrait(friend.username)} size={34} />} onPress={() => setTarget({ id: friend.userId, kind: 'peer', label: displayName(friend, value) })} />)}
      {groups.map((group) => <ListRow key={group.id} title={group.name} detail="群聊" left={<Icon name="people-outline" />}
        onPress={() => setTarget({ id: group.id, kind: 'group', label: group.name })} />)}
      {!relationships?.some((friend) => friend.status === 'accepted') && !groups.length && <Text style={styles.small}>当前没有可转发的会话。</Text>}
    </>}
  </Sheet>;
}

const local = StyleSheet.create({
  modal: { flex: 1, backgroundColor: '#20212426' },
  menu: { position: 'absolute', padding: space.xxs, borderRadius: radius.surface, overflow: 'hidden',
    backgroundColor: '#FFFFFFF2', borderColor: '#FFFFFF', borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row', flexWrap: 'wrap', boxShadow: '0px 5px 22px #20212426' },
  dark: { backgroundColor: '#25272BF2', borderColor: '#FFFFFF24' },
  action: { width: '33.33%', minHeight: 53, justifyContent: 'center', alignItems: 'center', gap: 2 },
  pressed: { opacity: 0.6 },
  selection: { ...styles.row, justifyContent: 'space-evenly', paddingHorizontal: space.sm, backgroundColor: colors.panel, minHeight: touch },
  selectionRow: { ...styles.row, minHeight: touch, paddingLeft: space.xs },
  quote: { ...styles.row, borderLeftWidth: 2, borderLeftColor: colors.border, borderRadius: 5, backgroundColor: colors.backdrop,
    paddingHorizontal: space.xs, paddingVertical: space.xxs },
  bubbleQuote: { minWidth: 148, maxWidth: 216 },
  record: { ...styles.row, minHeight: touch },
});
