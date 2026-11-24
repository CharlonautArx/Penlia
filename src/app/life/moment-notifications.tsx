import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Avatar, Button, Empty, ListRow, Notice, Screen, Sheet } from '../../components/ui';
import { isUiDemo } from '../../demo/mode';
import { errorMessage } from '../../services/api';
import { useSession } from '../../services/session';
import { forwardLabels, type MomentNotice } from '../../features/moments/model';
import { createdTime } from '../../features/space/model';
import { space, styles } from '../../theme';

type Page = { notifications: MomentNotice[]; next: string | null };

function label(item: MomentNotice) {
  if (item.kind === 'ye') return item.actor + ' 给你的动态比耶';
  if (item.kind === 'comment') return item.actor + ' 留了一条言';
  if (item.kind === 'forward_request') return item.actor + ' 申请转发你的动态';
  const result = { approved: '同意了你的转发请求', rejected: '拒绝了你的转发请求', revoked: '撤回了转发授权' };
  return item.actor + (item.decision && item.decision in result ? result[item.decision as keyof typeof result] : '更新了转发授权');
}

export default function MomentNotifications() {
  const { request } = useSession();
  const [rows, setRows] = useState<MomentNotice[]>();
  const [next, setNext] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [revoke, setRevoke] = useState<MomentNotice>();
  const lock = useRef(false);
  const sequence = useRef(0);
  const seen = useRef(new Set<string>());
  const load = useCallback(async (cursor?: string) => {
    const job = ++sequence.current;
    try {
      const result = await request<Page>('/moment-notifications' + (cursor ? '?before=' + encodeURIComponent(cursor) : ''));
      if (sequence.current !== job) return;
      setRows((previous) => cursor
        ? [...(previous ?? []), ...result.notifications.filter((item) => !previous?.some((row) => row.id === item.id))]
        : result.notifications);
      setNext(result.next);
      setError('');
      const ids = result.notifications.filter((item) => item.unread && !seen.current.has(item.id)).map((item) => item.id);
      if (ids.length) {
        ids.forEach((id) => seen.current.add(id));
        try { await request('/moment-notifications/read', { method: 'POST', body: { ids } }); }
        catch (failure) { ids.forEach((id) => seen.current.delete(id)); throw failure; }
      }
    } catch (failure) {
      if (sequence.current === job) {
        if (!cursor) setRows(undefined);
        setError(errorMessage(failure));
      }
    }
  }, [request]);

  useFocusEffect(useCallback(() => {
    setRows(undefined);
    void load();
    return () => { sequence.current++; seen.current.clear(); };
  }, [load]));

  async function perform(operation: () => Promise<unknown>) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try { await operation(); await load(); }
    catch (failure) { setError(errorMessage(failure)); }
    finally { lock.current = false; setBusy(false); }
  }

  function decide(item: MomentNotice, action: 'approve' | 'reject' | 'revoke') {
    if (!item.requestId) return;
    void perform(async () => {
      await request('/moment-forward-requests/' + item.requestId, { method: 'POST', body: { action } });
      setRevoke(undefined);
    });
  }

  return <Screen title="动态消息" back={() => router.canGoBack() ? router.back() : router.replace('/moments')}
    refreshing={busy} onRefresh={() => void load()}>
    {!!error && <Notice action="重试" onAction={() => void load()}>{error}</Notice>}
    {!rows && !error && <Empty busy>正在读取动态消息…</Empty>}
    {rows?.length === 0 && <Empty icon="notifications-outline">比耶、留言和转发请求会显示在这里。</Empty>}
    {rows?.map((item) => <View key={item.id}>
      <ListRow title={label(item)} detail={[item.comment, createdTime(Date.parse(item.createdAt)),
        item.kind === 'forward_request' && item.status ? forwardLabels[item.status] : ''].filter(Boolean).join(' · ')}
        left={<Avatar name={item.actor} size={36} />} onPress={() => router.push({
          pathname: '/life/moment/[id]', params: { id: item.momentId },
        })} />
      {item.kind === 'forward_request' && item.status === 'pending' && <View style={local.actions}>
        <Button label="拒绝转发" variant="quiet" disabled={busy} onPress={() => decide(item, 'reject')} />
        <Button label="同意转发" disabled={busy} onPress={() => decide(item, 'approve')} />
      </View>}
      {item.kind === 'forward_request' && (item.status === 'approved' || item.status === 'published') &&
        <Button label="撤回转发授权" variant="quiet" disabled={busy} onPress={() => setRevoke(item)} />}
    </View>)}
    {!!next && <Button label="查看更早消息" variant="soft" disabled={busy} onPress={() => void load(next)} />}
    {isUiDemo && <Button label="模拟本机互动" variant="quiet" disabled={busy}
      onPress={() => void perform(() => request('/moment-notifications/simulate', { method: 'POST' }))} />}
    {revoke && <Sheet title="撤回转发授权" onClose={() => { if (!busy) setRevoke(undefined); }}>
      <Text style={styles.muted}>撤回后，对方的转发将无法打开原动态。</Text>
      {!!error && <Notice>{error}</Notice>}
      <Button label="确认撤回授权" variant="danger" disabled={busy} onPress={() => decide(revoke, 'revoke')} />
    </Sheet>}
  </Screen>;
}

const local = StyleSheet.create({
  actions: { ...styles.row, flexWrap: 'wrap', justifyContent: 'flex-end', paddingVertical: space.xxs },
});
