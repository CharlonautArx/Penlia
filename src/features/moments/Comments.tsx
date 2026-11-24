import { setStringAsync } from 'expo-clipboard';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Avatar, Button, IconButton, Notice, Sheet } from '../../components/ui';
import { demoPortrait } from '../../demo/visuals';
import { errorMessage } from '../../services/api';
import { useSession } from '../../services/session';
import { colors, radius, space, styles, touch } from '../../theme';
import { createdTime } from '../space/model';
import { chooseMomentPhotos, DraftMediaTile, MomentMediaTile, type LocalMedia } from './media';
import type { MomentComment } from './model';

export const commentEmoji = ['😊', '😂', '🙌', '🤍', '👀', '🎉', '☕', '🌿', '📷', '👍', '🤝', '✨'];

export function CommentList({ comments, owner, reply, remove, showEmpty }: {
  comments: MomentComment[]; owner: string; reply?: (comment: MomentComment) => void;
  remove?: (comment: MomentComment) => Promise<void>; showEmpty?: boolean;
}) {
  const own = useSession().session?.user.id;
  const [menu, setMenu] = useState<MomentComment>();
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  if (!comments.length) return showEmpty ? <Text style={local.empty}>还没有评论</Text> : null;
  const ordered = [...comments].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id));
  const byId = new Map(ordered.map((item) => [item.id, item]));
  const threads = new Map<string, MomentComment[]>();
  const root = (row: MomentComment) => {
    const seen = new Set([row.id]);
    let current = row;
    while (current.replyTo) {
      const next = byId.get(current.replyTo);
      if (!next || seen.has(next.id)) break;
      seen.add(next.id);
      current = next;
    }
    return current.id;
  };
  for (const item of ordered) {
    const id = root(item);
    if (id !== item.id) threads.set(id, [...(threads.get(id) ?? []), item]);
  }
  function line(item: MomentComment, inset = false) {
    const parent = item.replyTo && byId.get(item.replyTo);
    return <View key={item.id} style={[local.line, inset && local.inset]}>
      <Pressable accessibilityRole={reply ? 'button' : undefined} accessibilityLabel={item.author + '：' + (item.body || '图片')}
        onPress={reply && (() => reply(item))} onLongPress={item.body || (remove && (own === owner || own === item.authorId)) ? () => {
          Keyboard.dismiss(); setMenu(item); setProblem(''); setDeleting(false);
        } : undefined}
        style={({ pressed }) => [styles.row, local.row, pressed && local.pressed]}>
        <Avatar userId={item.authorId} name={item.author} source={demoPortrait(item.authorUsername ?? '')} size={inset ? 25 : 32} />
        <View style={styles.grow}>
          <Text style={styles.small}><Text style={styles.strong}>{item.author}</Text>{'  ' + createdTime(Date.parse(item.createdAt))}</Text>
          {!!parent && inset && <Text style={styles.small}>{'回复：' + parent.author}</Text>}
          {!!item.body && <Text style={styles.body}>{item.body}</Text>}
        </View>
      </Pressable>
      {item.photo && <View style={local.photo}>{item.photo.demoUri?.startsWith('space-local:')
        ? <DraftMediaTile item={{ id: item.photo.id, mime: 'image/jpeg', photoId: item.photo.demoUri.slice(12) }} />
        : <MomentMediaTile item={item.photo} />}</View>}
    </View>;
  }
  return <View style={local.list}>
    {ordered.filter((item) => root(item) === item.id).map((item) => <View key={item.id}>
      {line(item)}
      {threads.get(item.id)?.map((child) => line(child, true))}
    </View>)}
    {menu && <Sheet title={deleting ? '删除评论' : '评论操作'} onClose={() => { if (!busy) setMenu(undefined); }}>
      {!!problem && <Notice>{problem}</Notice>}
      {deleting ? <>
        <Text style={styles.small}>删除后，这条评论将从动态中移除。</Text>
        <Button label="确认删除" variant="danger" disabled={busy} onPress={() => {
          if (!remove || busy) return;
          setBusy(true);
          void remove(menu).then(() => setMenu(undefined)).catch((failure) => setProblem(errorMessage(failure)))
            .finally(() => setBusy(false));
        }} />
      </> : <>
        {!!menu.body && <Button label="复制" variant="soft" icon="copy-outline" onPress={() => {
          void setStringAsync(menu.body).then((success) => { if (!success) throw Error('无法访问剪贴板。'); setMenu(undefined); })
            .catch((failure) => setProblem(errorMessage(failure)));
        }} />}
        {remove && (own === owner || own === menu.authorId) && <Button label="删除" variant="danger" icon="trash-outline"
          onPress={() => setDeleting(true)} />}
      </>}
    </Sheet>}

  </View>;
}

export function CommentComposer({ initialReply, focus, onSend, cancel }: {
  initialReply?: MomentComment; focus: number; onSend: (body: string, reply?: string, photo?: LocalMedia) => Promise<void>;
  cancel: () => void;
}) {
  const account = useSession().session?.user.id;
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const working = useRef(false);
  const [draft, setDraft] = useState('');
  const [photo, setPhoto] = useState<LocalMedia>();
  const [emoji, setEmoji] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  function showKeyboard() { setEmoji(false); requestAnimationFrame(() => input.current?.focus()); }
  useEffect(() => {
    if (!focus) return;
    setEmoji(false);
    const timer = setTimeout(() => input.current?.focus(), 140);
    return () => clearTimeout(timer);
  }, [focus]);
  async function run(task: () => Promise<void>) {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setError('');
    try { await task(); } catch (failure) { setError(errorMessage(failure)); }
    finally { working.current = false; setBusy(false); }
  }
  const placeholder = initialReply ? '回复：' + initialReply.author : '写评论…';
  return <View style={local.composer}>
    {!!error && <Notice>{error}</Notice>}
    {!!photo && <View style={styles.row}><DraftMediaTile item={photo} />
      <IconButton label="移除评论图片" icon="close-outline" disabled={busy} onPress={() => setPhoto(undefined)} />
    </View>}
    <View style={local.composeRow}>
      <IconButton label={emoji ? '打开键盘' : '评论表情'} icon={emoji ? 'keypad-outline' : 'happy-outline'} onPress={() => {
        if (emoji) showKeyboard();
        else { input.current?.blur(); Keyboard.dismiss(); setEmoji(true); }
      }} disabled={busy} />
      <IconButton label="选择评论图片" icon="image-outline" disabled={busy || !account}
        onPress={() => void run(async () => {
          const [chosen] = await chooseMomentPhotos(account!, 1);
          if (chosen) setPhoto(chosen);
          showKeyboard();
        })} />
      <TextInput ref={input} accessibilityLabel={initialReply ? placeholder : '评论内容'} placeholder={placeholder}
        onFocus={() => setEmoji(false)} placeholderTextColor={colors.quiet} style={local.input} value={draft}
        editable={!busy} onChangeText={setDraft} maxLength={500} multiline />
      {initialReply && <IconButton label="取消回复" icon="close" disabled={busy} onPress={cancel} />}
      <Button label="发送" variant="gradient" disabled={busy || (!draft.trim() && !photo)} onPress={() => void run(async () => {
        await onSend(draft.trim(), initialReply?.id, photo);
        setDraft('');
        setPhoto(undefined);
        setEmoji(false);
        Keyboard.dismiss();
        cancel();
      })} />
    </View>
    {emoji && <View style={local.emoji}>{commentEmoji.map((symbol) => <Button key={symbol} label={symbol} variant="soft"
      onPress={() => setDraft((value) => value.length + symbol.length <= 500 ? value + symbol : value)} />)}</View>}
  </View>;
}

const local = StyleSheet.create({
  list: { ...styles.divider, borderBottomWidth: 0, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  line: { paddingVertical: space.xxs },
  inset: { marginLeft: 41, borderLeftWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingLeft: space.xs },
  row: { alignItems: 'flex-start', paddingVertical: space.xxs, minHeight: touch },
  photo: { marginLeft: 39, maxWidth: 140 },
  empty: { ...styles.small, paddingVertical: space.md, textAlign: 'center' },
  pressed: { opacity: 0.66 },
  composer: { borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.panel, padding: space.xs, gap: space.xxs },
  composeRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  input: { ...styles.input, flex: 1, minWidth: 0, minHeight: touch, maxHeight: 100, borderRadius: radius.pill, paddingHorizontal: space.xs },
  emoji: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xxs, padding: space.xxs },
});
