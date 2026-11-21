import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Avatar, Button, Icon, IconButton, Sheet } from '../../components/ui';
import { colors, fixed, radius, space, styles, touch, type } from '../../theme';
import { momentShareCaption, momentSharePath } from '../moments/model';

export const chatLayout = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.backdrop, width: '100%', maxWidth: 620, alignSelf: 'center' },
  messages: { paddingHorizontal: space.sm, paddingVertical: space.md },
  inverted: { transform: [{ scaleY: -1 }] },
});

export function ConversationRow({ name, avatar, preview, time, unread, pinned, silent, signal, onPress }: {
  name: string; avatar?: ReactNode; preview: string; time: string; unread: number;
  pinned?: boolean; silent?: boolean; signal?: ReactNode; onPress: () => void;
}) {
  const accessible = [name, pinned ? '置顶' : '', unread ? unread + ' 条未读消息' : '', preview].filter(Boolean).join('，');
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
        {unread > 0 && <View style={ui.unread}>
          <Text style={ui.unreadText}>{unread > 99 ? '99+' : unread}</Text>
        </View>}
      </View>
    </View>
  </Pressable>;
}

export function ChatTimestamp({ value }: { value: number }) {
  return <View style={ui.timestamp}><Text style={ui.time}>{messageDate(value)}</Text></View>;
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
  return <View style={[ui.messageRow, mine && ui.sentRow, first && ui.firstMessage]}>
    {!mine && <View style={ui.bubbleAvatar}>{first && avatar}</View>}
    <View style={[ui.messageContent, mine && ui.sentContent]}>
      {!!author && first && !mine && <Text numberOfLines={1} style={ui.sender}>{author}</Text>}
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

export function MessageComposer({ label, placeholder, value, onChange, editable, maxLength,
  attachLabel, photoLabel, onAttach, onPhoto, onEmoji, toolsDisabled, photoDisabled, sendLabel, sendDisabled, onSend, mode }: {
  label: string; placeholder: string; value: string; onChange: (value: string) => void; editable: boolean; maxLength: number;
  attachLabel: string; photoLabel: string; onAttach: () => void; onPhoto: () => void; onEmoji?: () => void;
  toolsDisabled?: boolean; photoDisabled?: boolean; sendLabel: string; sendDisabled: boolean; onSend: () => void;
  mode?: ReactNode;
}) {
  return <View style={ui.composer}>
    {mode && <View style={ui.composerMode}>{mode}</View>}
    <View style={ui.composerControls}>
      <IconButton label={attachLabel} icon="add-circle-outline" disabled={toolsDisabled} onPress={onAttach} />
      <IconButton label={photoLabel} icon="image-outline" disabled={toolsDisabled || photoDisabled} onPress={onPhoto} />
      <View style={ui.composerEntry}>
        <TextInput accessibilityLabel={label} placeholder={placeholder} placeholderTextColor={colors.quiet}
          multiline maxLength={maxLength} value={value} onChangeText={onChange} editable={editable} style={ui.composerInput} />
        {onEmoji && <IconButton label="表情" icon="happy-outline" disabled={toolsDisabled} onPress={onEmoji} />}
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={sendLabel} accessibilityState={{ disabled: sendDisabled, busy: sendLabel !== '发送' }}
        disabled={sendDisabled} onPress={onSend} style={({ pressed }) => [ui.send, sendDisabled && ui.sendDisabled, pressed && ui.pressedBubble]}>
        <Icon name="arrow-up" size={21} color={sendDisabled ? colors.quiet : fixed.onAction} />
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
  unread: { minWidth: 20, minHeight: 20, borderRadius: radius.pill, backgroundColor: colors.pink, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.xxs },
  unreadText: { ...type.tag, color: colors.accent },
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
  received: { backgroundColor: colors.panel, borderBottomLeftRadius: radius.small },
  sentJoined: { borderBottomRightRadius: 5 },
  receivedJoined: { borderBottomLeftRadius: 5 },
  pressedBubble: { opacity: 0.72 },
  postLink: { minHeight: touch },
  linkText: { color: colors.accent },
  composer: { ...styles.divider, borderBottomWidth: 0, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.panel, paddingHorizontal: space.xxs, paddingVertical: space.xxs },
  composerMode: { flexDirection: 'row', columnGap: space.sm, alignItems: 'center', flexWrap: 'wrap', paddingHorizontal: space.sm, paddingBottom: space.xxs },
  composerControls: { flexDirection: 'row', alignItems: 'flex-end', gap: space.xxs },
  composerEntry: { ...styles.grow, flexDirection: 'row', alignItems: 'flex-end', backgroundColor: colors.search, borderRadius: radius.surface },
  composerInput: { ...styles.grow, ...type.body, color: colors.text, minHeight: touch, maxHeight: 124, paddingHorizontal: space.sm, paddingVertical: 11 },
  send: { width: touch, minHeight: touch, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.action, borderRadius: radius.pill },
  sendDisabled: { backgroundColor: colors.search },
});
