import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Text } from 'react-native';

import { Avatar, Button, Empty, Icon, ListRow, Notice, Sheet } from '../../components/ui';
import { isUiDemo } from '../../demo/mode';
import { demoPortrait } from '../../demo/visuals';
import { errorMessage } from '../../services/api';
import { useFriends } from '../../services/friends';
import { useSession } from '../../services/session';
import { styles } from '../../theme';
import { forwardLabels, momentChatSharePath, momentShareCaption, type ForwardRequest, type Moment } from './model';

export function MomentShareSheet({ item, onClose, onUpdate }: {
  item: Moment; onClose: () => void; onUpdate: (forward: ForwardRequest) => void;
}) {
  const { request, session } = useSession();
  const [page, setPage] = useState<'choose' | 'chat' | 'forward'>('choose');
  const [forward, setForward] = useState(item.forwardRequest);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const locking = useRef(false);
  const [changed, setChanged] = useState(false);
  const { relationships, refresh, error: friendsError } = useFriends();
  const friends = relationships?.filter((friend) => friend.status === 'accepted') ?? [];
  const route = '/moments/' + item.id;
  const simulatedAuthor = isUiDemo && session?.user.id !== item.authorId;

  useEffect(() => { if (page === 'chat') void refresh(); }, [page, refresh]);

  async function run(work: () => Promise<void>) {
    if (locking.current) return;
    locking.current = true; setBusy(true); setError('');
    try { await work(); }
    catch (failure) { setError(errorMessage(failure)); }
    finally { locking.current = false; setBusy(false); }
  }

  function update(value: ForwardRequest) { setForward(value); onUpdate(value); }
  async function readStatus() {
    const { moment } = await request<{ moment: Moment }>(route);
    if (moment.forwardRequest) update(moment.forwardRequest);
    if (moment.canForward === false) setChanged(true);
  }
  function act(action: 'publish' | 'approve' | 'reject' | 'revoke') {
    if (!forward) return;
    void run(async () => {
      const result = await request<Pick<ForwardRequest, 'status' | 'publishedId'>>('/moment-forward-requests/' + forward.id, {
        method: 'POST', body: { action, ...(simulatedAuthor && action !== 'publish' ? { simulateAuthor: true } : {}) },
      });
      update({ ...forward, ...result });
    });
  }

  return <Sheet title={page === 'chat' ? '转发给好友' : page === 'forward' ? '转发到我的动态' : '转发动态'}
    onClose={() => { if (!busy) onClose(); }}>
    {!!error && <Notice>{error}</Notice>}
    {page === 'choose' && <>
      <ListRow title="转发给好友" left={<Icon name="chatbubble-outline" />} onPress={() => setPage('chat')} />
      <ListRow title="转发到我的动态" left={<Icon name="arrow-redo-outline" />}
        onPress={() => { setPage('forward'); void run(readStatus); }} separator={false} />
    </>}
    {page === 'chat' && <>
      <Text style={styles.muted}>只有原本可查看这条动态的好友，才能收到有效的引用。</Text>
      {!!friendsError && <Notice action="重试" onAction={() => void refresh()}>{friendsError}</Notice>}
      {friends.map((friend) => <ListRow key={friend.userId} title={friend.name}
        left={<Avatar userId={friend.userId} name={friend.name} source={demoPortrait(friend.username)} size={38} />}
        onPress={() => void run(async () => {
          const { id } = await request<{ id: string }>(route + '/share-chat', { method: 'POST', body: { receiver: friend.userId } });
          const draft = momentShareCaption + '\n' + Linking.createURL(momentChatSharePath + id);
          onClose();
          router.push({ pathname: '/chat/[id]', params: { id: friend.userId, draft } });
        })} />)}
      {!friends.length && !friendsError && <Empty busy={!relationships}>暂无可选好友。</Empty>}
    </>}
    {page === 'forward' && <>
      {forward && <Text style={styles.strong} accessibilityLiveRegion="polite">{forwardLabels[forward.status]}</Text>}
      {changed && <Text style={styles.muted}>原作者已关闭转发。</Text>}
      {!forward && !changed && <Button label="发起转发请求" disabled={busy} onPress={() => void run(async () => {
        update(await request<ForwardRequest>(route + '/request-forward', { method: 'POST' }));
      })} />}
      {!changed && forward?.status === 'approved' && <Button label="发布转发动态" disabled={busy} onPress={() => act('publish')} />}
      {forward?.status === 'pending' && <>
        <Button label="刷新授权状态" variant="soft" disabled={busy} onPress={() => void run(readStatus)} />
        {simulatedAuthor && <>
          <Text style={styles.small}>本机模拟原作者处理</Text>
          <Button label="模拟同意" variant="soft" disabled={busy} onPress={() => act('approve')} />
          <Button label="模拟拒绝" variant="soft" disabled={busy} onPress={() => act('reject')} />
        </>}
      </>}
      {forward?.publishedId && forward.status === 'published' && <ListRow title="查看我的转发" onPress={() => {
        onClose();
        router.push({ pathname: '/life/moment/[id]', params: { id: forward.publishedId! } });
      }} />}
      {simulatedAuthor && (forward?.status === 'approved' || forward?.status === 'published') &&
        <Button label="模拟撤回授权" variant="quiet" disabled={busy} onPress={() => act('revoke')} />}
    </>}
  </Sheet>;
}
