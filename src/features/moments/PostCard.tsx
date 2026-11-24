import { router } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar, Button, Icon, IconButton, ListRow, Notice, Sheet, Tag, type IconName } from '../../components/ui';
import { demoPortrait } from '../../demo/visuals';
import { errorMessage } from '../../services/api';
import { useSession } from '../../services/session';
import { colors, space, styles, touch, type } from '../../theme';
import { createdTime } from '../space/model';
import { scopes, type Moment, type MomentComment } from './model';
import { MomentMediaGrid } from './media';
import { PeaceIcon } from './PeaceIcon';
import { CommentList } from './Comments';
import { MomentShareSheet } from './ShareSheet';

export function PostCard({ item, onUpdate, onPin, onRemove, onReply, detail = false, hideComments = false }: {
  item: Moment;
  onReply?: (comment?: MomentComment) => void;
  detail?: boolean;
  hideComments?: boolean;
  onUpdate?: (change: Partial<Moment>) => void;
  onPin?: (pinned: boolean) => Promise<void>;
  onRemove?: () => void;
}) {
  const { request, session } = useSession();
  const mine = item.authorId === session?.user.id;
  const path = '/moments/' + item.id;
  const [sheet, setSheet] = useState<'share' | 'options' | 'deleteForward'>();
  const [sharing, setSharing] = useState<Partial<Moment>>();
  const shareState = { ...item, ...sharing };
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [optimistic, setOptimistic] = useState<Pick<Moment, 'liked' | 'likeCount'>>();
  const [comments, setComments] = useState<MomentComment[]>();
  const locked = useRef(false);
  const liked = optimistic?.liked ?? item.liked ?? false;
  const count = optimistic?.likeCount ?? item.likeCount ?? 0;

  async function run(task: () => Promise<void>, rejected?: () => void) {
    if (locked.current) return;
    locked.current = true;
    setPending(true);
    setError('');
    try { await task(); }
    catch (failure) { rejected?.(); setError(errorMessage(failure)); }
    finally { locked.current = false; setPending(false); }
  }

  useEffect(() => {
    if (hideComments || !item.commentCount) { setComments(undefined); return; }
    let active = true;
    const all = new Map<string, MomentComment>();
    async function load() {
      let cursor: string | null = null;
      do {
        const page: { comments: MomentComment[]; next: string | null } = await request(path + '/comments' +
          (cursor ? '?before=' + encodeURIComponent(cursor) : ''));
        if (!active) return;
        page.comments.forEach((comment) => all.set(comment.id, comment));
        setComments([...all.values()]);
        if (cursor === page.next) break;
        cursor = page.next;
      } while (cursor);
    }
    setComments(undefined);
    void load().catch((failure) => { if (active) setError(errorMessage(failure)); });
    return () => { active = false; };
  }, [hideComments, item.commentCount, path, request]);

  function openDetail(comment?: MomentComment, compose = false) {
    router.push({ pathname: '/life/moment/[id]', params: { id: item.id, ...(compose ? { compose: '1' } : {}),
      ...(comment ? { reply: comment.id } : {}) } });
  }

  function like() {
    if (locked.current) return;
    setOptimistic({ liked: !liked, likeCount: Math.max(0, count + (liked ? -1 : 1)) });
    void run(async () => {
      const result = await request<Pick<Moment, 'liked' | 'likeCount'>>(path + '/like', { method: 'PUT', body: { liked: !liked } });
      onUpdate?.(result);
      setOptimistic(onUpdate ? undefined : result);
    }, () => setOptimistic(undefined));
  }

  const avatar = <Avatar userId={item.authorId} name={item.author} source={demoPortrait(item.authorUsername ?? '')} size={43} />;
  return <View style={local.post}>
    <View style={styles.row}>
      {mine ? avatar : <Pressable accessibilityRole="button" accessibilityLabel={item.author + '的动态'}
        onPress={() => router.push({ pathname: '/life/timeline/[id]', params: { id: item.authorId } })}>{avatar}</Pressable>}
      <View style={styles.grow}>
        <Text style={styles.strong} numberOfLines={2}>{item.author}</Text>
        <Text style={styles.small}>{createdTime(Date.parse(item.createdAt))}{item.scope ? ' · ' + scopes[item.scope] : ' · 可见范围由发布者设置'}</Text>
      </View>
      {!!item.pinned && mine && <Tag>置顶</Tag>}
      {mine && <IconButton label={item.pinned ? '管理置顶动态' : '管理这条动态'} icon="ellipsis-horizontal"
        onPress={() => { setError(''); setSheet('options'); }} />}
    </View>
    {item.forwarded && <ListRow title="查看转发的原动态" left={<Icon name="arrow-redo-outline" />}
      onPress={() => router.push({ pathname: '/life/moment/[id]', params: { id: item.id, original: '1' } })} separator={false} />}
    {!detail && <Pressable accessibilityRole="button" accessibilityLabel="查看动态详情" onPress={() => openDetail()}>
      {!!item.body ? <Text style={local.caption}>{item.body}</Text> : <Text style={styles.small}>查看动态详情</Text>}
    </Pressable>}
    {detail && !!item.body && <Text style={local.caption}>{item.body}</Text>}
    {!!item.media.length && <MomentMediaGrid media={item.media} />}
    {!!item.collaborationId && <ListRow title="查看共同创作" left={<Icon name="people-outline" color={colors.accent} />}
      onPress={() => router.push({ pathname: '/collection/[id]', params: { id: item.collaborationId! } })}
      separator={false} />}
    <View style={local.actions}>
      <Action icon={<PeaceIcon active={liked} />} label={liked ? '取消比耶' : '比耶'} badge={count}
        selected={liked} onPress={like} disabled={pending} />
      <Action icon="chatbubble-outline" label="评论" badge={item.commentCount} onPress={() => onReply ? onReply() : openDetail(undefined, true)} />
      {shareState.canForward !== false && !item.forwarded && item.scope !== 'private' && <Action icon="arrow-redo-outline" label="转发" onPress={() => { setError(''); setSheet('share'); }} />}
    </View>
    {!!error && !sheet && <Notice>{error}</Notice>}
    {!hideComments && !!comments?.length && <CommentList comments={comments} owner={item.authorId}
      reply={(comment) => openDetail(comment, true)} remove={async (comment) => {
        await request(path + '/comments?id=' + encodeURIComponent(comment.id), { method: 'DELETE' });
        setComments((old) => old?.filter((row) => row.id !== comment.id));
        onUpdate?.({ commentCount: Math.max(0, (item.commentCount ?? 1) - 1) });
      }} />}
    {sheet === 'share' && <MomentShareSheet item={shareState} onClose={() => setSheet(undefined)}
      onUpdate={(forwardRequest) => {
        setSharing((previous) => ({ ...previous, forwardRequest }));
        onUpdate?.({ forwardRequest });
      }} />}
    {sheet === 'deleteForward' && <Sheet title="删除转发动态" onClose={() => setSheet(undefined)}>
      {!!error && <Notice>{error}</Notice>}
      <Text style={styles.muted}>确认移除自己的这条转发？</Text>
      <Button label="确认删除转发" variant="danger" disabled={pending} onPress={() => void run(async () => {
        await request(path, { method: 'DELETE' });
        setSheet(undefined);
        if (onRemove) onRemove();
        else if (router.canGoBack()) router.back();
        else router.replace('/moments');
      })} />
    </Sheet>}
    {sheet === 'options' && <Sheet title="管理动态" onClose={() => setSheet(undefined)}>
      {!!error && <Notice>{error}</Notice>}
      {onPin && <ListRow title={item.pinned ? '取消置顶' : '置顶这条动态'} left={<Icon name="pin-outline" />}
        onPress={() => void run(async () => { await onPin(!item.pinned); setSheet(undefined); })} />}
      {!item.forwarded && item.scope !== 'private' && <ListRow
        title={shareState.allowForward === false ? '允许发起转发' : '关闭转发并撤回授权'}
        left={<Icon name="lock-closed-outline" />} onPress={() => void run(async () => {
          const allowed = shareState.allowForward === false;
          await request(path + '/forward-permission', { method: 'PUT', body: { allowed } });
          const update = { allowForward: allowed, canForward: allowed };
          setSharing((previous) => ({ ...previous, ...update }));
          onUpdate?.(update);
          setSheet(undefined);
        })} />}
      {item.forwarded ? <ListRow title="删除转发动态" onPress={() => setSheet('deleteForward')} separator={false} /> :
        <ListRow title="编辑或删除动态" left={<Icon name="create-outline" />} onPress={() => {
          setSheet(undefined);
          router.push({ pathname: '/private-moment', params: { id: item.id } });
        }} separator={false} />}
    </Sheet>}
  </View>;
}

function Action({ icon, label, onPress, badge, selected, disabled }: {
  icon: IconName | ReactNode; label: string; onPress: () => void; badge?: number; selected?: boolean; disabled?: boolean;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={badge ? label + ' ' + badge : label} accessibilityState={{ selected, disabled }}
    onPress={onPress} disabled={disabled} style={({ pressed }) => [local.action, pressed && local.pressed]}>
    {typeof icon === 'string' ? <Icon name={icon as IconName} size={19} /> : icon}
    {!!badge && <Text style={styles.small}>{badge}</Text>}
  </Pressable>;
}

const local = StyleSheet.create({
  post: { ...styles.divider, paddingHorizontal: space.md, paddingTop: space.md, paddingBottom: space.xs,
    backgroundColor: colors.panel, gap: space.sm },
  caption: { ...type.body, color: colors.text },
  actions: { ...styles.row, justifyContent: 'flex-end', gap: 0 },
  action: { ...styles.row, minHeight: touch, minWidth: touch, justifyContent: 'center', gap: 3, paddingHorizontal: space.xxs },
  pressed: { opacity: 0.7 },
});
