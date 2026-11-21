import { router } from 'expo-router';
import { Fragment, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Avatar, Button, Icon, IconButton, ListRow, Sheet, Tag } from '../../components/ui';
import { demoPortrait } from '../../demo/visuals';
import { colors, styles, type } from '../../theme';
import { localId } from '../local/document';
import { SpacePhoto } from './media';
import { audienceName, blankDraft, createdTime, type Entry, type Photo, type Reply } from './model';
import { useSpace } from './store';

export function openEntry(id: string, viewer?: string) {
  router.push({ pathname: '/space/post/[id]', params: { id, ...(viewer ? { viewer } : {}) } });
}

export function JournalLink({ entry, viewer }: { entry: Entry; viewer?: string }) {
  const { person, owns } = useSpace();
  return <Pressable accessibilityRole="button" accessibilityLabel={entry.title} onPress={() => openEntry(entry.id, viewer)}
    style={({ pressed }) => [local.journalLink, pressed && local.pressed]}>
    {entry.photos[0] && <SpacePhoto photo={entry.photos[0]} style={local.journalThumb} />}
    <View style={styles.grow}>
      <Text style={local.kind}>日志 · {createdTime(entry.at)}</Text>
      <Text numberOfLines={2} style={local.journalTitle}>{entry.title}</Text>
      <Text numberOfLines={2} style={styles.muted}>{entry.text}</Text>
      <Text numberOfLines={1} style={styles.small}>{!viewer && owns(entry.ownerId) ? audienceName(entry.audience) : person(entry.ownerId)?.name}</Text>
    </View>
    <Icon name="chevron-forward" color={colors.quiet} size={16} />
  </Pressable>;
}

export function EntryCard({ entry, full = false, viewer }: { entry: Entry; full?: boolean; viewer?: string }) {
  const state = useSpace();
  const author = state.person(entry.ownerId);
  const mine = state.owns(entry.ownerId);
  const [sheet, setSheet] = useState<'options' | 'react' | 'share' | 'delete' | 'video'>();
  const [focusPhoto, setFocusPhoto] = useState<Photo>();
  const [comments, setComments] = useState(false);
  const [replyTo, setReplyTo] = useState<Reply>();
  const [comment, setComment] = useState('');
  const [forwarded, setForwarded] = useState(false);
  if (!author) return null;

  const settings = state.card(entry.ownerId).privacy;
  const visibleReplies = (viewer ? entry.ownerId === viewer : mine) || settings.revealReplies === 'viewers';
  const canReply = !viewer && state.canInteract(entry.ownerId);
  const shownComments = visibleReplies ? entry.comments : [];
  const source = entry.sourceId && state.value?.entries.find((item) => item.id === entry.sourceId && state.entryVisible(item, viewer));
  const paragraphs = entry.text.split(/\n\s*\n/).filter(Boolean);

  function addComment() {
    const text = comment.trim();
    if (!state.me || !text || !canReply) return;
    const reply = { id: localId(), text, authorId: state.me.id, at: Date.now(), replyTo: replyTo?.id };
    state.updateEntry(entry.id, (current) => ({ ...current, comments: [...current.comments, reply] }));
    setComment('');
    setReplyTo(undefined);
  }

  function forward() {
    if (!state.me || viewer) return;
    const ownerId = state.me.id;
    state.update((data) => ({ ...data, entries: [{
      ...blankDraft('thought'),
      id: localId(), ownerId, at: Date.now(), text: '转发了一条动态', sourceId: entry.id,
      audience: { mode: 'self', ids: [] }, likes: 0, liked: false, comments: [],
    }, ...data.entries] }));
    setSheet(undefined);
    setForwarded(true);
  }

  function photos(items: Photo[]) {
    return items.length > 0 && <View style={local.photos}>
      {items.map((photo, index) => <Pressable key={photo.id + index} accessibilityRole="button" accessibilityLabel={'查看照片 ' + (index + 1)}
        style={items.length === 1 ? local.largeFrame : local.smallFrame} onPress={() => setFocusPhoto(photo)}>
        <SpacePhoto photo={photo} style={local.image} />
      </Pressable>)}
    </View>;
  }

  return <View style={[local.post, full && local.full]}>
    <View style={styles.row}>
      <Pressable accessibilityRole="button" accessibilityLabel={author.name + '的空间'} onPress={() =>
        router.push({ pathname: '/space/[id]', params: { id: entry.ownerId, ...(viewer ? { viewer } : {}) } })}>
        <Avatar userId={author.id} name={author.name} source={demoPortrait((mine && state.demoAvatarKey) || author.username)} size={39} />
      </Pressable>
      <View style={styles.grow}>
        <Text style={styles.strong}>{author.name}</Text>
        <Text style={styles.small}>{createdTime(entry.at)}{entry.editedAt ? ' · 已编辑' : ''}</Text>
      </View>
      {mine && !viewer && <Tag>{audienceName(entry.audience)}</Tag>}
      {mine && !viewer && <IconButton label="动态选项" icon="ellipsis-horizontal" onPress={() => setSheet('options')} />}
    </View>
    {entry.kind === 'journal' && !full
      ? <JournalLink entry={entry} viewer={viewer} />
      : entry.kind === 'journal'
        ? <>
          <Text accessibilityRole="header" style={local.articleTitle}>{entry.title}</Text>
          {paragraphs.map((paragraph, index) => <Fragment key={index}>
            <Text style={local.paragraph}>{paragraph}</Text>
            {photos(entry.photos.filter((photo) => Math.min(photo.after ?? 0, paragraphs.length - 1) === index))}
          </Fragment>)}
        </>
        : <>
          <Text style={styles.body}>{entry.text}</Text>
          {!entry.videoPreview && photos(entry.photos)}
        </>}
    {entry.videoPreview && <Pressable accessibilityRole="button" accessibilityLabel="视频动态演示"
      style={local.video} onPress={() => setSheet('video')}>
      {entry.photos[0] && <SpacePhoto photo={entry.photos[0]} style={local.image} />}
      <View style={local.videoLabel}><Icon name="play-circle-outline" color="#FFFFFF" />
        <Text style={local.videoText}>视频样式 · 演示</Text></View>
    </Pressable>}
    {!!entry.location && <View style={local.location}><Icon size={13} name="location-outline" color={colors.accent} />
      <Text style={styles.small}>{entry.location}</Text></View>}
    {!!entry.sourceId && (source ? <ListRow title={source.title || '查看原动态'} detail={state.person(source.ownerId)?.name}
      left={<Icon name="arrow-redo-outline" />} onPress={() => openEntry(source.id, viewer)} />
      : <Text style={styles.small}>原动态当前不可见。</Text>)}
    {!viewer && <View style={local.actions}>
      <Action label={entry.liked ? '取消点赞' : '点赞'} icon={entry.liked ? 'heart' : 'heart-outline'} active={entry.liked}
        text={String(entry.likes)} onPress={() => state.updateEntry(entry.id, (current) => ({
          ...current, liked: !current.liked, likes: current.likes + (current.liked ? -1 : 1),
        }))} />
      <Action label="展开评论" icon="chatbubble-outline" text={visibleReplies ? String(shownComments.length) : undefined}
        onPress={() => setComments(!comments)} />
      <Action label="表情回应" icon="happy-outline" text={entry.reaction} onPress={() => setSheet('react')} />
      <View style={styles.grow} />
      <Action label="转发" icon="arrow-redo-outline" onPress={() => setSheet('share')} />
    </View>}
    {!comments && shownComments[0] && <Pressable accessibilityRole="button" accessibilityLabel="查看评论" style={local.comment}
      onPress={() => setComments(true)}>
      <Text style={styles.muted} numberOfLines={1}><Text style={styles.strong}>{state.person(shownComments[0].authorId)?.name ?? '好友'} </Text>
        {shownComments[0].text}</Text>
    </Pressable>}
    {forwarded && <Text accessibilityLiveRegion="polite" style={local.kind}>已转发到我的动态 · 仅自己可见</Text>}
    {comments && <View style={local.comments}>
      {shownComments.map((reply) => {
        const parent = reply.replyTo && entry.comments.find((item) => item.id === reply.replyTo);
        return <View key={reply.id} style={local.commentLine}>
          <Text style={styles.muted}><Text style={styles.strong}>{state.person(reply.authorId)?.name ?? '好友'}</Text>
            {parent ? ' 回复 ' + (state.person(parent.authorId)?.name ?? '好友') : ''}　{reply.text}</Text>
          {canReply && <Button label={'回复 ' + (state.person(reply.authorId)?.name ?? '好友')} variant="quiet" onPress={() => setReplyTo(reply)} />}
        </View>;
      })}
      {!visibleReplies && <Text style={styles.small}>留言仅空间主人可见。</Text>}
      {visibleReplies && !shownComments.length && <Text style={styles.small}>还没有评论。</Text>}
      {canReply && <>
        {replyTo && <ListRow title={'回复 ' + (state.person(replyTo.authorId)?.name ?? '好友')}
          trailing={<IconButton label="取消回复" icon="close-outline" onPress={() => setReplyTo(undefined)} />} />}
        <View style={styles.row}>
          <TextInput accessibilityLabel="评论内容" value={comment} onChangeText={setComment} maxLength={140}
            placeholder="说点什么…" placeholderTextColor={colors.quiet} style={[styles.input, styles.grow]} />
          <Button label="发表评论" disabled={!comment.trim()} onPress={addComment} />
        </View>
      </>}
      {!canReply && !viewer && <Text style={styles.small}>空间主人关闭了好友评论。</Text>}
    </View>}
    {focusPhoto && <Sheet title="照片" onClose={() => setFocusPhoto(undefined)}>
      <SpacePhoto photo={focusPhoto} style={local.fullPhoto} />
    </Sheet>}
    {sheet === 'options' && <Sheet title="动态选项" onClose={() => setSheet(undefined)}>
      <ListRow title={entry.kind === 'journal' ? '编辑日志' : '编辑动态'} left={<Icon name="create-outline" />}
        onPress={() => { setSheet(undefined); router.push({ pathname: '/space/compose', params: { kind: entry.kind, edit: entry.id } }); }} />
      <Button label="删除" variant="danger" onPress={() => setSheet('delete')} />
    </Sheet>}
    {sheet === 'delete' && <Sheet title="删除动态" onClose={() => setSheet(undefined)}>
      <Text style={styles.muted}>将从此设备移除这条内容和关联互动。</Text>
      <Button label="确认删除" variant="danger" onPress={() => {
        state.update((data) => ({ ...data, entries: data.entries.filter((item) => !(item.id === entry.id && state.owns(item.ownerId))) }));
        setSheet(undefined);
        if (full) { if (router.canGoBack()) router.back(); else router.replace('/moments'); }
      }} />
    </Sheet>}
    {sheet === 'react' && <Sheet title="表情回应" onClose={() => setSheet(undefined)}>
      <View style={local.actions}>{['❤️', '🙌', '😂', '✨', '☕'].map((emoji) => <Button key={emoji} label={emoji} variant="soft"
        onPress={() => {
          state.updateEntry(entry.id, (current) => ({ ...current, reaction: current.reaction === emoji ? undefined : emoji }));
          setSheet(undefined);
        }} />)}</View>
    </Sheet>}
    {sheet === 'share' && <Sheet title="转发动态" onClose={() => setSheet(undefined)}>
      <Text style={styles.muted}>转发只在本机创建原动态的引用。你的转发默认仅自己可见，原内容继续遵循原可见范围。</Text>
      <Button label="转发到我的动态" variant="gradient" onPress={forward} />
    </Sheet>}
    {sheet === 'video' && <Sheet title="视频动态样式" onClose={() => setSheet(undefined)}>
      <Text style={styles.muted}>此处演示视频封面与入口。</Text>
    </Sheet>}
  </View>;
}

function Action({ label, icon, text, active, onPress }: {
  label: string; icon: Parameters<typeof Icon>[0]['name']; text?: string; active?: boolean; onPress: () => void;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label}
    style={({ pressed }) => [local.action, pressed && local.pressed]} onPress={onPress}>
    <Icon name={icon} size={19} color={active ? colors.accent : colors.ink} />
    {!!text && <Text style={styles.muted}>{text}</Text>}
  </Pressable>;
}

const local = StyleSheet.create({
  post: { paddingHorizontal: 16, paddingVertical: 13, gap: 8, backgroundColor: colors.panel,
    borderBottomWidth: 5, borderBottomColor: colors.backdrop },
  full: { marginHorizontal: -16, borderBottomWidth: 0 },
  kind: { ...styles.small, color: colors.accent },
  articleTitle: { ...type.article, color: colors.text, marginTop: 7 },
  paragraph: { ...styles.body, fontSize: 16, lineHeight: 27, marginBottom: 5 },
  location: { ...styles.row, gap: 5 },
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  largeFrame: { width: '100%', aspectRatio: 1.82, borderRadius: 11, overflow: 'hidden' },
  smallFrame: { width: '48%', aspectRatio: 1.14, borderRadius: 9, overflow: 'hidden' },
  image: { width: '100%', height: '100%' },
  fullPhoto: { width: '100%', aspectRatio: 1.04, borderRadius: 12 },
  video: { height: 145, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.ink, justifyContent: 'center' },
  videoLabel: { ...styles.row, gap: 6, position: 'absolute', alignSelf: 'center', borderRadius: 12, backgroundColor: '#261D30CC', padding: 10 },
  videoText: { ...type.control, color: '#FFFFFF', fontSize: 13 },
  actions: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  action: { ...styles.row, gap: 5, minHeight: 44, minWidth: 43, paddingHorizontal: 4 },
  pressed: { opacity: 0.72 },
  comment: { backgroundColor: colors.backdrop, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 8 },
  comments: { backgroundColor: colors.backdrop, borderRadius: 10, padding: 10, gap: 7 },
  commentLine: { ...styles.divider, paddingBottom: 4 },
  journalLink: { ...styles.row, borderRadius: 12, padding: 10, backgroundColor: colors.backdrop, minHeight: 94 },
  journalThumb: { width: 81, height: 87, borderRadius: 9 },
  journalTitle: { ...styles.strong, fontSize: 17, marginVertical: 4 },
});
