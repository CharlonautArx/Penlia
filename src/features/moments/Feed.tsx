import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button, Empty, IconButton, ListRow, LoadingSkeleton, Notice, Screen, Segments, Sheet } from '../../components/ui';
import { errorMessage } from '../../services/api';
import { useSession } from '../../services/session';
import { space, styles } from '../../theme';
import type { Moment } from './model';
import { PostCard } from './PostCard';

export { scopes, type Audience, type Moment } from './model';

export function PrivateFeed({ mine, author }: { mine?: string; author?: string }) {
  const { session, request } = useSession();
  const [items, setItems] = useState<Moment[]>();
  const [actions, setActions] = useState(false);
  const [next, setNext] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const sequence = useRef(0);
  const selection = mine === '1' ? session?.user.id : author;

  const load = useCallback(
    async (cursor?: string) => {
      const id = ++sequence.current;
      setBusy(true);
      setError('');
      try {
        const params = new URLSearchParams();
        if (selection) params.set('author', selection);
        if (cursor) params.set('before', cursor);
        const result = await request<{ moments: Moment[]; next: string | null }>('/moments?' + params.toString());
        if (id !== sequence.current) return;
        setItems((current) =>
          cursor
            ? [...(current ?? []), ...result.moments.filter((entry) => !current?.some((item) => item.id === entry.id))]
            : result.moments,
        );
        setNext(result.next);
      } catch (failure) {
        if (id === sequence.current) {
          setError(errorMessage(failure));
          if (!cursor) setItems([]);
        }
      } finally {
        if (id === sequence.current) setBusy(false);
      }
    },
    [request, selection],
  );
  useFocusEffect(
    useCallback(() => {
      setItems(undefined);
      setNext(null);
      void load();
      return () => {
        sequence.current++;
      };
    }, [load]),
  );

  return (
    <Screen
      title="动态" solid inset={false}
      refreshing={busy}
      onRefresh={() => void load()}
      actions={
        <>
          <IconButton label="动态选项" icon="ellipsis-horizontal" onPress={() => setActions(true)} />
          <IconButton
            label="发布私密动态"
            icon="create-outline"
            tinted
            onPress={() => router.push('/private-moment')}
          />
        </>
      }
    >
      <View style={local.filters}>
        <Segments label="动态来源" value={mine === '1' ? 'mine' : 'friends'}
          options={[{ id: 'friends', label: '好友动态' }, { id: 'mine', label: '我的动态' }]}
          onChange={(value) => router.setParams({ mine: value === 'mine' ? '1' : '0', author: '' })} />
        {author && mine !== '1' && <Text style={styles.small}>查看好友</Text>}
        {!!error && <Notice action="重试" onAction={() => void load()}>{error}</Notice>}
      </View>
      {!items && !error && <LoadingSkeleton label="正在读取生活动态" />}
      {items?.length === 0 && !error && <Empty icon="image-outline">这里还没有你可以看到的动态。</Empty>}
      {items?.map((item) => <PostCard key={item.id} item={item}
        onManage={item.authorId === session?.user.id
          ? () => router.push({ pathname: '/private-moment', params: { id: item.id } })
          : undefined} />)}
      {actions && <Sheet title="动态选项" onClose={() => setActions(false)}>
        <ListRow title="共创动态" detail="邀请好友一起记录" onPress={() => {
          setActions(false); router.push({ pathname: '/collection/new', params: { kind: 'collaboration' } });
        }} />
        <ListRow title="瞬间共鸣" detail="查看或发起接力" onPress={() => {
          setActions(false); router.push({ pathname: '/world', params: { kind: 'relay' } });
        }} />
        <ListRow title="本机空间" detail="仅此设备" onPress={() => {
          setActions(false); router.setParams({ local: '1' });
        }} />
      </Sheet>}
      {next && <Button label="加载更早动态" variant="soft" disabled={busy} onPress={() => void load(next)} />}
    </Screen>
  );
}

const local = StyleSheet.create({
  filters: { paddingHorizontal: space.md, gap: space.xs },
});
