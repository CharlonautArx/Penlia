import { GlassFooter } from '../../components/focused-glass';
import { randomUUID } from 'expo-crypto';
import { router, useIsFocused } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Empty, Notice, TopBar } from '../../components/ui';
import { KeyboardInsets } from '../../components/keyboard-insets';
import { errorMessage } from '../../services/api';
import { useSession } from '../../services/session';
import { colors, contentWidth } from '../../theme';
import { useRecord } from '../social/ui';
import { CommentComposer, CommentList } from './Comments';
import { encodeMomentMedia, type LocalMedia, type Media } from './media';
import type { Moment, MomentComment } from './model';
import { PostCard } from './PostCard';

export function MomentDetail({ path, protectedReference, compose, replyId }: {
  path: string; protectedReference?: boolean; compose?: string; replyId?: string;
}) {
  const focused = useIsFocused();
  return <DiscussionScreen title={protectedReference ? '转发动态' : '动态详情'}>
    {focused && <Content key={path} path={path} protectedReference={protectedReference} compose={compose} replyId={replyId} />}
  </DiscussionScreen>;
}

export function DiscussionScreen({ title, children }: { title: string; children: ReactNode }) {
  const { bottom } = useSafeAreaInsets();
  return <SafeAreaView edges={['left','right','top']} style={local.screen}>
    <KeyboardAvoidingView style={local.frame} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <KeyboardInsets bottom={bottom} style={local.frame}>
        <TopBar title={title}
          back={() => router.canGoBack() ? router.back() : router.replace('/moments')} />
        {children}
      </KeyboardInsets>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

function Content({ path, protectedReference, compose, replyId }: {
  path: string; protectedReference?: boolean; compose?: string; replyId?: string;
}) {
  const { data, error, load } = useRecord<{ moment: Moment }>(path, protectedReference ? 10000 : undefined);
  return error ? <Notice action="重试" onAction={() => void load()}>{error}</Notice> : data?.moment ?
    <Discussion key={data.moment.id} item={data.moment} initialFocus={compose === '1'} replyId={replyId} /> :
    <Empty busy>正在读取动态…</Empty>;
}

function Discussion({ item, initialFocus, replyId }: { item: Moment; initialFocus: boolean; replyId?: string }) {
  const { request } = useSession();
  const [comments, setComments] = useState<MomentComment[]>();
  const [problem, setProblem] = useState('');
  const [focus, setFocus] = useState(initialFocus && !replyId ? 1 : 0);
  const [reply, setReply] = useState<MomentComment>();
  const [changes, setChanges] = useState<Partial<Moment>>({});
  const initialized = useRef(false);
  const revision = useRef(0);
  const mounted = useRef(true);
  const attempt = useRef<{ key: string; id: string; mediaId?: string } | undefined>(undefined);
  const endpoint = '/moments/' + item.id + '/comments';
  const read = useCallback(async () => {
    const version = ++revision.current;
    const all = new Map<string, MomentComment>();
    let cursor: string | null = null;
    do {
      const page: { comments: MomentComment[]; next: string | null } = await request(endpoint + (cursor ? '?before=' + encodeURIComponent(cursor) : ''));
      if (!mounted.current || version !== revision.current) return;
      page.comments.forEach((row) => all.set(row.id, row));
      setComments([...all.values()]);
      if (page.next === cursor) break;
      cursor = page.next;
    } while (cursor);
    if (!initialized.current) {
      initialized.current = true;
      if (initialFocus && replyId) { setReply(all.get(replyId)); setFocus(1); }
    }
    setChanges((old) => ({ ...old, commentCount: all.size }));
  }, [endpoint, initialFocus, replyId, request]);
  const reload = useCallback(() => {
    setProblem('');
    void read().catch((failure) => { if (mounted.current) setProblem(errorMessage(failure)); });
  }, [read]);
  useEffect(() => {
    mounted.current = true;
    reload();
    return () => { mounted.current = false; revision.current++; };
  }, [reload, item.commentCount]);

  return <GlassFooter content={(clearance) =>
    <ScrollView style={local.frame} contentContainerStyle={clearance ? { paddingBottom: clearance + 8 } : undefined} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
      <PostCard item={{ ...item, ...changes }} onUpdate={(change) => setChanges((old) => ({ ...old, ...change }))}
        detail hideComments onReply={() => { setReply(undefined); setFocus((value) => value + 1); }} />
      <View style={local.comments}>
        {!!problem && <Notice action="重试" onAction={reload}>{problem}</Notice>}
        <CommentList comments={comments ?? []} owner={item.authorId} showEmpty={!!comments}
          reply={(row) => { setReply(row); setFocus((value) => value + 1); }}
          remove={async (row) => {
            await request(endpoint + '?id=' + encodeURIComponent(row.id), { method: 'DELETE' });
            if (reply?.id === row.id) setReply(undefined);
            reload();
          }} />
      </View>
    </ScrollView>} footer={(glassSource) =>
    <CommentComposer glassSource={glassSource} initialReply={reply} focus={focus} cancel={() => setReply(undefined)} onSend={async (body, replyTo, photo?: LocalMedia) => {
      const key = JSON.stringify([body, replyTo, photo?.id]);
      if (attempt.current?.key !== key) attempt.current = { key, id: randomUUID() };
      const send = attempt.current;
      if (photo && !send.mediaId) {
        const { media } = await request<{ media: Media }>('/moment-media', { method: 'POST', body: await encodeMomentMedia(photo) });
        send.mediaId = media.id;
      }
      await request(endpoint, { method: 'POST', body: { clientId: send.id, body, replyTo, mediaId: send.mediaId } });
      attempt.current = undefined;
      reload();
    }} />} />;
}

const local = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.panel },
  frame: { flex: 1, width: '100%', maxWidth: contentWidth, alignSelf: 'center' },
  comments: { paddingHorizontal: 16 },
});
