import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Keyboard, Pressable, StyleSheet, Text, TextInput, View, type LayoutChangeEvent } from 'react-native';

import { useAppearance } from '../../components/appearance';
import { GlassLayer, UnreadMark } from '../../components/material';
import { Avatar, Button, Icon, IconButton, Sheet } from '../../components/ui';
import { colors, radius, space, styles, touch, type } from '../../theme';
import { useWallpaperLabel } from './background/WallpaperImage';
import { momentShareCaption, momentSharePath } from '../moments/model';

export const chatLayout = StyleSheet.create({
  page: { flex: 1, width: '100%', maxWidth: 620, alignSelf: 'center' },
  messages: { paddingHorizontal: space.sm, paddingVertical: space.md },
  inverted: { transform: [{ scaleY: -1 }] },
});

export function ConversationRow({ name, avatar, preview, time, unread, pinned, silent, signal, manualUnread, onPress }: {
  name: string; avatar?: ReactNode; preview: string; time: string; unread: number;
  pinned?: boolean; silent?: boolean; signal?: ReactNode; manualUnread?: boolean; onPress: () => void;
}) {
  const accessible = [name, pinned ? '置顶' : '', unread ? unread + ' 条未读消息' : manualUnread ? '已标为未读' : '', preview].filter(Boolean).join('，');
  return <Pressable accessibilityRole="button" accessibilityLabel={accessible} onPress={onPress}
    style={({ pressed }) => [ui.thread, pressed && ui.pressedRow]}>
    {avatar ?? <Avatar name={name} size={48} />}
    <View style={ui.threadBody}>
      <View style={ui.line}>
        <View style={[ui.threadName, styles.grow]}>
          <Text numberOfLines={1} style={[styles.strong, ui.name]}>{name}</Text>
          {pinned && <Icon name="pin-outline" size={13} color={colors.quiet} />}
          {signal}
        </View>
        <Text style={ui.time}>{time}</Text>
      </View>
      <View style={ui.line}>
        {silent && <Icon name="moon-outline" size={13} color={colors.moon} />}
        <Text numberOfLines={1} style={[styles.muted, styles.grow]}>{preview}</Text>
        <UnreadMark count={unread || Number(manualUnread === true)} dot={!unread} />
      </View>
    </View>
  </Pressable>;
}

export function ChatTimestamp({ value }: { value: number }) {
  const wall = useWallpaperLabel();
  return <View style={ui.timestamp}>
    <View>
      {wall && <View pointerEvents="none" style={[ui.wallLabel, wall]} />}
      <Text style={ui.time}>{messageDate(value)}</Text>
    </View>
  </View>;
}

export function startsMessageBlock(timestamp: number, previous?: number) {
  return previous === undefined || timestamp - previous >= 8 * 60_000
    || new Date(timestamp).toDateString() !== new Date(previous).toDateString();
}

function messageDate(value: number) {
  const date = new Date(value);
  const day = date.toDateString() === new Date().toDateString()
    ? '今天' : date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  return day + ' ' + date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function ChatBubble({ mine, first, last, author, avatar, children, onActions }: {
  mine: boolean; first: boolean; last: boolean; author?: string; avatar?: ReactNode;
  children: ReactNode; onActions: () => void;
}) {
  const wall = useWallpaperLabel();
  return <View style={[ui.messageRow, mine && ui.sentRow, first && ui.firstMessage]}>
    {!mine && <View style={ui.bubbleAvatar}>{first && avatar}</View>}
    <View style={[ui.messageContent, mine && ui.sentContent]}>
      {!!author && first && !mine && <Text numberOfLines={1} style={[ui.sender, wall]}>{author}</Text>}
      <Pressable
        onLongPress={onActions}
        accessibilityActions={[{ name: 'longpress', label: '消息操作' }]}
        onAccessibilityAction={({ nativeEvent }) => { if (nativeEvent.actionName === 'longpress') onActions(); }}
        delayLongPress={380}
        style={({ pressed }) => [ui.bubble, mine ? ui.sent : ui.received,
          !last && (mine ? ui.sentJoined : ui.receivedJoined), pressed && ui.pressedBubble]}>
        {children}
      </Pressable>
    </View>
  </View>;
}

export function MessageActions({ timestamp, text, report, onClose }: {
  timestamp: number; text?: string; report?: () => void; onClose: () => void;
}) {
  return <Sheet title="消息操作" onClose={onClose}>
    <Text style={styles.muted}>{messageDate(timestamp)}</Text>
    {!!text && <Text selectable style={styles.body}>{text}</Text>}
    {report && <Button label="举报这条消息" variant="danger" icon="flag-outline" onPress={report} />}
  </Sheet>;
}

export function MessageBody({ text }: { text: string }) {
  const [caption, link, extra] = text.split('\n', 3);
  if (caption === momentShareCaption && link && extra === undefined) {
    const id = link.slice(-36);
    const path = momentSharePath + id;
    if (/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(id) &&
      (link === 'penlia://' + path.slice(1) || link === 'penlia://' + path || link === Linking.createURL(path))) {
      return <Pressable accessibilityRole="link" accessibilityLabel="查看分享的动态"
        onPress={() => router.push({ pathname: '/life/moment/[id]', params: { id } })}
        style={({ pressed }) => [styles.row, ui.postLink, pressed && ui.pressedBubble]}>
        <Icon name="images-outline" size={18} color={colors.accent} />
        <Text style={[styles.strong, styles.grow, ui.linkText]}>查看分享的动态</Text>
        <Icon name="chevron-forward" size={16} color={colors.accent} />
      </Pressable>;
    }
  }
  return <Text style={styles.body}>{text}</Text>;
}

export function MessageComposer({ label, placeholder, value, onChange, maxLength,
  attachLabel, photoLabel, onAttach, onPhoto, onEmoji, toolsDisabled, photoDisabled, photoBusy, sendLabel, sendDisabled, onSend,
  onSendLongPress, onLayout, mode, floating = false }: {
  label: string; placeholder?: string; value: string; onChange: (value: string) => void; maxLength: number;
  attachLabel: string; photoLabel: string; onAttach: () => void; onPhoto: () => void; onEmoji?: () => void;
  toolsDisabled?: boolean; photoDisabled?: boolean; photoBusy?: boolean; sendLabel: string; sendDisabled: boolean; onSend: () => void;
  onSendLongPress?: () => void; onLayout?: (event: LayoutChangeEvent) => void; mode?: ReactNode; floating?: boolean;
}) {
  const { scheme } = useAppearance();
  const dark = scheme === 'dark';
  const ink = dark ? '#F5F5F6' : '#202124';
  function openTool(action: () => void) {
    Keyboard.dismiss();
    action();
  }
  const tools = <>
    <IconButton label={attachLabel} icon={floating ? 'add' : 'add-circle-outline'}
      color={floating ? ink : undefined} iconOffsetX={floating ? 9 : undefined}
      disabled={toolsDisabled} onPress={() => openTool(onAttach)} />
    <IconButton label={photoLabel} icon="image-outline" color={floating ? ink : undefined}
      iconOffsetX={floating ? -9 : undefined} busy={photoBusy}
      disabled={toolsDisabled || photoDisabled} onPress={() => openTool(onPhoto)} />
  </>;
  return <View onLayout={onLayout} style={floating ? ui.floatingComposer : ui.composer}>
    {mode && <View style={ui.composerMode}>{mode}</View>}
    <View style={ui.composerControls}>
      {!floating && tools}
      <View style={[ui.composerEntry, floating && ui.floatingEntry, floating && (dark ? ui.neutralDark : ui.neutralLight)]}>
        {floating && tools}
        <TextInput accessibilityLabel={label} placeholder={placeholder} placeholderTextColor={colors.quiet}
          cursorColor={floating ? ink : undefined}
          multiline scrollEnabled maxLength={maxLength} value={value} onChangeText={onChange}
          style={[ui.composerInput, floating && ui.floatingInput, floating && { color: ink }]} />
        {onEmoji && <IconButton label="表情" icon="happy-outline" color={floating ? ink : undefined}
          disabled={toolsDisabled} onPress={() => openTool(onEmoji)} />}
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={sendLabel} accessibilityState={{ disabled: sendDisabled, busy: sendLabel !== '发送' }}
        accessibilityActions={onSendLongPress && !sendDisabled ? [{ name: 'longpress', label: '发送选项' }] : undefined}
        onAccessibilityAction={onSendLongPress && !sendDisabled ? ({ nativeEvent }) => {
          if (nativeEvent.actionName === 'longpress') onSendLongPress();
        } : undefined}
        disabled={sendDisabled} onPress={onSend} onLongPress={onSendLongPress} delayLongPress={onSendLongPress ? 380 : undefined}
        style={({ pressed }) => [ui.send, floating && ui.floatingSend,
          !floating && sendDisabled && ui.sendDisabled, pressed && ui.pressedBubble]}>
        {floating ? <View pointerEvents="none" style={[ui.sendFace, dark ? ui.neutralDark : ui.neutralLight, sendDisabled && ui.sendFaceDisabled]}>
          <Icon name="arrow-up" size={19} color={ink} />
        </View> : <>
          {!sendDisabled && <GlassLayer tone="control" roundness={radius.pill} />}
          <Icon name="arrow-up" size={21} color={sendDisabled ? colors.quiet : colors.ink} />
        </>}
      </Pressable>
    </View>
  </View>;
}

const ui = StyleSheet.create({
  thread: { flexDirection: 'row', alignItems: 'center', minHeight: 73, gap: space.sm, paddingLeft: space.md },
  threadBody: { ...styles.grow, ...styles.divider, alignSelf: 'stretch', justifyContent: 'center', gap: space.xxs, paddingRight: space.md, paddingVertical: space.xs },
  threadName: { ...styles.row, gap: space.xxs },
  name: { flexShrink: 1 },
  line: { ...styles.row, gap: space.xs },
  time: { ...type.time, color: colors.quiet },
  pressedRow: { backgroundColor: colors.backdrop },
  wallLabel: { position: 'absolute', top: -1, bottom: -1, left: -5, right: -5 },
  timestamp: { alignItems: 'center', paddingTop: space.md, paddingBottom: space.xs },
  messageRow: { flexDirection: 'row', alignItems: 'flex-start', paddingTop: 3, gap: space.xs },
  firstMessage: { paddingTop: space.xs },
  sentRow: { justifyContent: 'flex-end' },
  bubbleAvatar: { width: 31, paddingTop: 2 },
  messageContent: { maxWidth: '79%', minWidth: 0, alignItems: 'flex-start' },
  sentContent: { alignItems: 'flex-end' },
  sender: { ...type.caption, color: colors.muted, marginLeft: space.xxs, marginBottom: space.xxs },
  bubble: { maxWidth: '100%', borderRadius: radius.surface, gap: space.xxs, paddingVertical: space.xs, paddingHorizontal: space.sm },
  sent: { backgroundColor: colors.lavender, borderBottomRightRadius: radius.small },
  received: { backgroundColor: colors.chatReceived, borderBottomLeftRadius: radius.small },
  sentJoined: { borderBottomRightRadius: 5 },
  receivedJoined: { borderBottomLeftRadius: 5 },
  pressedBubble: { opacity: 0.72 },
  postLink: { minHeight: touch },
  linkText: { color: colors.accent },
  composer: { ...styles.divider, borderBottomWidth: 0, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.panel, paddingHorizontal: space.xxs, paddingVertical: space.xxs },
  floatingComposer: { paddingHorizontal: space.sm, paddingBottom: space.xs },
  composerMode: { flexDirection: 'row', columnGap: space.sm, alignItems: 'center', flexWrap: 'wrap', paddingHorizontal: space.sm, paddingBottom: space.xxs },
  composerControls: { flexDirection: 'row', alignItems: 'flex-end', gap: space.xxs },
  composerEntry: { ...styles.grow, flexDirection: 'row', alignItems: 'flex-end', backgroundColor: colors.search, borderRadius: radius.surface },
  floatingEntry: { minHeight: 52, borderRadius: 26, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', paddingHorizontal: 2 },
  neutralLight: { backgroundColor: '#FFFFFF', borderColor: '#FFFFFF',
    boxShadow: '0px 2px 8px #1E1E2212, 0px 0px 0px 0.5px #1616160C' },
  neutralDark: { backgroundColor: '#25262A', borderColor: '#FFFFFF26',
    boxShadow: '0px 2px 8px #00000040' },
  composerInput: { ...styles.grow, ...type.body, color: colors.text, minHeight: touch, maxHeight: 124, textAlignVertical: 'top', paddingHorizontal: space.sm, paddingVertical: 11 },
  floatingInput: { paddingLeft: space.xxs, paddingRight: 0 },
  send: { width: touch, minHeight: touch, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill },
  floatingSend: { marginBottom: 2 },
  sendFace: { width: 36, height: 36, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  sendFaceDisabled: { opacity: 0.55 },
  sendDisabled: { backgroundColor: colors.search },
});
