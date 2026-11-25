import { momentPhotoGrid } from '../moments/photo-grid';
import { router } from 'expo-router';
import { Fragment, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar, Button, Icon, IconButton, ListRow, Sheet, Tag } from '../../components/ui';
import { demoPortrait } from '../../demo/visuals';
import { colors, styles, type } from '../../theme';
import { CommentList } from '../moments/Comments';
import type { MomentComment } from '../moments/model';
import { visibilityText } from '../moments/model';
import { MomentAuthor } from '../moments/MomentAuthor';
import { PeaceIcon } from '../moments/PeaceIcon';
import { localId } from '../local/document';
import { SpacePhoto } from './media';
import { audienceName, blankDraft, createdTime, type Entry, type Photo } from './model';
import { useSpace } from './store';

export function openEntry(id: string, viewer?: string, compose?: string, reply?: string) {
  router.push({ pathname: '/space/post/[id]', params: { id, ...(viewer ? { viewer } : {}), compose, reply } });
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

export function EntryCard({ entry, full = false, viewer, timeline = false, onReply }: { entry: Entry; full?: boolean; viewer?: string; timeline?: boolean; onReply?: (comment?: MomentComment) => void }) {
  const state = useSpace();
  const author = state.person(entry.ownerId);
  const mine = state.owns(entry.ownerId);
  const [sheet, setSheet] = useState<'options' | 'share' | 'delete' | 'video'>();
  const [focusPhoto, setFocusPhoto] = useState<Photo>();
  const [forwarded, setForwarded] = useState(false);
  if (!author) return null;

  const settings = state.card(entry.ownerId).privacy;
  const visibleReplies = (viewer ? entry.ownerId === viewer : mine) || settings.revealReplies === 'viewers';
  const canReply = !viewer && state.canInteract(entry.ownerId);
  const shownComments: MomentComment[] = visibleReplies ? entry.comments.map((row) => {
    const person = state.person(row.authorId);
    return { id: row.id, authorId: row.authorId, author: person?.name ?? '好友', authorUsername: person?.username,
      body: row.text, createdAt: new Date(row.at).toISOString(), replyTo: row.replyTo,
      photo: row.photoId ? { id: row.photoId, mime: 'image/jpeg', demoUri: 'space-local:' + row.photoId } : undefined };
  }) : [];
  const source = entry.sourceId && state.value?.entries.find((item) => item.id === entry.sourceId && state.entryVisible(item, viewer));
  const paragraphs = entry.text.split(/\n\s*\n/).filter(Boolean);

  function forward() {
    if (!state.me || viewer || !mine) return;
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

  function thoughtPhotos(items: Photo[]) {
    if (items.length <= 1) return photos(items);
    const { rows, more } = momentPhotoGrid(items, full);
    return <View style={{ gap: 6 }}>{rows.map((row, rowIndex) => <View key={rowIndex} style={{ flexDirection: 'row', gap: 6 }}>
      {row.map((photo, col) => {
        const index = rowIndex * 3 + col + 1;
        const hidden = index === 9 && more;
        return <Pressable key={index} accessibilityRole="button" accessibilityLabel={hidden ? '查看全部照片' : '查看照片 ' + index}
          style={local.gridCell} onPress={() => { if (hidden) openEntry(entry.id, viewer); else setFocusPhoto(photo); }}>
          <SpacePhoto photo={photo} style={local.image} />
          {!!hidden && <View style={local.more}><Text style={local.moreText}>+{hidden}</Text></View>}
        </Pressable>;
      })}
      {Array.from({ length: 3 - row.length }, (_, index) => <View style={styles.grow} key={index} />)}
    </View>)}</View>;
  }

  const authorPhoto = demoPortrait((mine && state.demoAvatarKey) || author.username);
  const openAuthor = () => router.push({ pathname: '/space/[id]', params: { id: entry.ownerId, ...(viewer ? { viewer } : {}) } });
  const stamp = createdTime(entry.at) + (entry.editedAt ? ' · 已编辑' : '');
  const actions = <>
    {timeline && entry.pinned && <Tag>置顶</Tag>}
    {mine && !viewer && <IconButton label={timeline ? '管理这条动态' : '动态选项'} icon="ellipsis-horizontal" onPress={() => setSheet('options')} />}
  </>;

  return <View style={[local.post, full && local.full]}>
    {entry.kind === 'thought' ? <MomentAuthor id={author.id} name={author.name} photo={authorPhoto}
      stamp={stamp} visibility={visibilityText(null, entry.audience.mode === 'self' ? 'self' : entry.audience.mode === 'friends' ? 'friends' : 'partial')}
      onPress={openAuthor}>{actions}</MomentAuthor> : <View style={styles.row}>
      <Pressable accessibilityRole="button" accessibilityLabel={author.name + '的空间'} onPress={() =>
        router.push({ pathname: '/space/[id]', params: { id: entry.ownerId, ...(viewer ? { viewer } : {}) } })}>
        <Avatar userId={author.id} name={author.name} source={authorPhoto} size={39} />
      </Pressable>
      <View style={styles.grow}>
        <Text style={styles.strong}>{author.name}</Text>
        <Text style={styles.small}>{stamp}</Text>
      </View>
      {mine && !viewer && <Tag>{audienceName(entry.audience)}</Tag>}
      {actions}
    </View>}
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
          {full ? <Text style={styles.body}>{entry.text}</Text> :
            <Pressable accessibilityRole="button" accessibilityLabel="查看动态详情" onPress={() => openEntry(entry.id, viewer)}>
              <Text style={styles.body}>{entry.text || '查看动态详情'}</Text>
            </Pressable>}
          {!entry.videoPreview && thoughtPhotos(entry.photos)}
        </>}
    {entry.videoPreview && <Pressable accessibilityRole="button" accessibilityLabel="视频动态样式预览"
      style={local.video} onPress={() => setSheet('video')}>
      {entry.photos[0] && <SpacePhoto photo={entry.photos[0]} style={local.image} />}
      <View style={local.videoLabel}><Icon name="play-circle-outline" color="#FFFFFF" />
        <Text style={local.videoText}>视频样式</Text></View>
    </Pressable>}
    {!!entry.location && <View style={local.location}><Icon size={13} name="location-outline" color={colors.accent} />
      <Text style={styles.small}>{entry.location}</Text></View>}
    {!!entry.sourceId && (source ? <ListRow title={source.title || '查看原动态'} detail={state.person(source.ownerId)?.name}
      left={<Icon name="arrow-redo-outline" />} onPress={() => openEntry(source.id, viewer)} />
      : <Text style={styles.small}>原动态当前不可见。</Text>)}
    {!viewer && <View style={local.actions}>
      <Action label={entry.liked ? '取消比耶' : '比耶'} icon="peace" active={entry.liked}
        text={String(entry.likes)} onPress={() => state.updateEntry(entry.id, (current) => ({
          ...current, liked: !current.liked, likes: current.likes + (current.liked ? -1 : 1),
        }))} />
      <Action label="评论" icon="chatbubble-outline" text={visibleReplies && shownComments.length ? String(shownComments.length) : undefined}
        onPress={() => onReply && canReply ? onReply() : openEntry(entry.id, viewer, canReply ? '1' : undefined)} />
      <Action label="转发" icon="arrow-redo-outline" onPress={() => setSheet('share')} />
    </View>}
    {forwarded && <Text accessibilityLiveRegion="polite" style={local.kind}>已转发到我的动态 · 仅自己可见</Text>}
    {visibleReplies && <CommentList comments={shownComments} owner={entry.ownerId} compact={!full} showEmpty={full}
      reply={canReply ? (comment) => onReply ? onReply(comment) : openEntry(entry.id, viewer, '1', comment.id) : undefined}
      remove={viewer ? undefined : async (comment) => {
        const own = state.me?.id;
        if (!own || !state.entryVisible(entry) || (entry.ownerId !== own && comment.authorId !== own)) throw new Error('无法删除这条评论。');
        state.updateEntry(entry.id, (current) => ({
          ...current, comments: current.comments.filter((row) => row.id !== comment.id)
            .map((row) => row.replyTo === comment.id ? { ...row, replyTo: undefined } : row),
        }));
      }} />}
    {!visibleReplies && full && <Text style={styles.small}>评论仅空间主人可见。</Text>}
    {!canReply && full && !viewer && <Text style={styles.small}>空间主人关闭了好友评论。</Text>}
    {focusPhoto && <Sheet title="照片" onClose={() => setFocusPhoto(undefined)}>
      <SpacePhoto photo={focusPhoto} style={local.fullPhoto} />
    </Sheet>}
    {sheet === 'options' && <Sheet title="动态选项" onClose={() => setSheet(undefined)}>
      {timeline && <ListRow title={entry.pinned ? '取消置顶' : '置顶'} left={<Icon name="pin-outline" />} onPress={() => {
        state.updateEntry(entry.id, (current) => ({ ...current, pinned: !current.pinned }));
        setSheet(undefined);
      }} />}
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
    {sheet === 'share' && <Sheet title="转发动态" onClose={() => setSheet(undefined)}>
      <Text style={styles.muted}>转发只在本机创建原动态的引用。你的转发默认仅自己可见，原内容继续遵循原可见范围。</Text>
      {mine ? <Button label="转发到我的动态" variant="gradient" onPress={forward} />
        : <Text style={styles.muted}>本机旧动态无法向原作者发起授权。</Text>}
    </Sheet>}
    {sheet === 'video' && <Sheet title="视频动态样式" onClose={() => setSheet(undefined)}>
      <Text style={styles.muted}>此处仅预览视频封面与入口。</Text>
    </Sheet>}
  </View>;
}

function Action({ label, icon, text, active, onPress }: {
  label: string; icon: Parameters<typeof Icon>[0]['name'] | 'peace'; text?: string; active?: boolean; onPress: () => void;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label}
    style={({ pressed }) => [local.action, pressed && local.pressed]} onPress={onPress}>
    {icon === 'peace' ? <PeaceIcon active={active} /> : <Icon name={icon} size={19} color={active ? colors.accent : colors.ink} />}
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
  gridCell: { flex: 1, aspectRatio: 1, borderRadius: 9, overflow: 'hidden' },
  more: { ...StyleSheet.absoluteFill, backgroundColor: '#00000080', alignItems: 'center', justifyContent: 'center' },
  moreText: { ...styles.strong, fontSize: 24, color: '#FFFFFF' },
  fullPhoto: { width: '100%', aspectRatio: 1.04, borderRadius: 12 },
  video: { height: 145, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.ink, justifyContent: 'center' },
  videoLabel: { ...styles.row, gap: 6, position: 'absolute', alignSelf: 'center', borderRadius: 12, backgroundColor: '#261D30CC', padding: 10 },
  videoText: { ...type.control, color: '#FFFFFF', fontSize: 13 },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 0 },
  action: { ...styles.row, gap: 5, minHeight: 44, minWidth: 43, paddingHorizontal: 4 },
  pressed: { opacity: 0.72 },
  journalLink: { ...styles.row, borderRadius: 12, padding: 10, backgroundColor: colors.backdrop, minHeight: 94 },
  journalThumb: { width: 81, height: 87, borderRadius: 9 },
  journalTitle: { ...styles.strong, fontSize: 17, marginVertical: 4 },
});
