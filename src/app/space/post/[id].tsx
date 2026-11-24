import { Redirect, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { Empty } from '../../../components/ui';
import { CommentComposer } from '../../../features/moments/Comments';
import { DiscussionScreen } from '../../../features/moments/MomentDetail';
import type { MomentComment } from '../../../features/moments/model';
import { EntryCard } from '../../../features/space/EntryCard';
import { localId } from '../../../features/local/document';
import { useSpace } from '../../../features/space/store';
import { styles } from '../../../theme';

export default function PostScreen() {
  const { id, viewer, compose, reply: requestedReply } = useLocalSearchParams<{ id: string; viewer?: string; compose?: string; reply?: string }>();
  const state = useSpace();
  const original = state.value?.entries.find((item) => item.id === id);
  const entry = original && state.entryVisible(original, viewer) ? original : undefined;
  const [focus, setFocus] = useState(compose === '1' ? 1 : 0);
  const [selected, setReply] = useState<MomentComment | null>();
  if (original?.cloudId && !viewer && state.owns(original.ownerId)) return <Redirect
    href={{ pathname: '/life/moment/[id]', params: { id: original.cloudId, compose, reply: requestedReply } }} />;
  const canReply = !!entry && !viewer && state.canInteract(entry.ownerId);
  const visibleReplies = !!entry && (state.owns(entry.ownerId) || state.card(entry.ownerId).privacy.revealReplies === 'viewers');
  const parent = visibleReplies && entry.comments.find((row) => row.id === requestedReply);
  const reply = selected === undefined && parent
    ? { id: parent.id, author: state.person(parent.authorId)?.name ?? '好友', authorId: parent.authorId,
      body: parent.text, createdAt: new Date(parent.at).toISOString() } : selected || undefined;
  return <DiscussionScreen title={entry?.kind === 'journal' ? '日志详情' : '动态详情'}>
    <ScrollView style={styles.grow} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
      <View style={{ paddingHorizontal: 16 }}>
        {entry ? <EntryCard entry={entry} viewer={viewer} full
          onReply={(row) => { setReply(row ?? null); setFocus((value) => value + 1); }} />
          : <Empty busy={state.loading}>{state.error || (state.loading ? '正在读取动态…' : '这条动态当前不可见。')}</Empty>}
      </View>
    </ScrollView>
    {canReply && <CommentComposer initialReply={reply} focus={focus} cancel={() => setReply(null)} onSend={async (body, replyTo, photo) => {
      if (!entry || !state.me || !state.entryVisible(entry) || !state.canInteract(entry.ownerId))
        throw new Error('当前无法评论这条内容。');
      if (replyTo && (!visibleReplies || !entry.comments.some((row) => row.id === replyTo))) throw new Error('该评论当前不可见。');
      const authorId = state.me.id;
      state.updateEntry(entry.id, (previous) => ({ ...previous, comments: [...previous.comments, {
        id: localId(), text: body, authorId, at: Date.now(), replyTo, photoId: photo?.mime === 'image/jpeg' ? photo.photoId : undefined,
      }] }));
    }} />}
  </DiscussionScreen>;
}
