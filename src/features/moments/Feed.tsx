import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { Avatar, Button, Empty, IconButton, Notice, Screen } from '../../components/ui';
import { errorMessage } from '../../services/api';
import { useSession } from '../../services/session';
import { styles } from '../../theme';
import { MomentMediaTile, type Media } from './media';

export type Audience = 'private' | 'friends' | 'circle' | 'group' | 'selected';
export const scopes: Record<Audience, string> = {
  private: '仅自己',
  friends: '全部好友',
  circle: '亲密圈',
  group: '自定义关系组',
  selected: '指定好友',
};
export type Moment = {
  id: string;
  collaborationId?: string | null;
  authorId: string;
  author: string;
  body: string;
  createdAt: string;
  revision: number;
  scope: Audience | null;
  groupId: string | null;
  memberIds: string[] | null;
  media: Media[];
};

export function PrivateFeed({ mine, author }: { mine?: string; author?: string }) {
  const { session, request } = useSession();
  const [items, setItems] = useState<Moment[]>();
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
      title="动态"
      refreshing={busy}
      onRefresh={() => void load()}
      actions={
        <>
          <IconButton label="本机空间" icon="person-circle-outline" onPress={() => router.setParams({ local: '1' })} />
          <IconButton
            label="发布私密动态"
            icon="create-outline"
            tinted
            onPress={() => router.push('/private-moment')}
          />
        </>
      }
    >
      <View style={[styles.row,{flexWrap:'wrap'}]}>
        <Button
          label="好友动态"
          variant={!selection ? 'primary' : 'soft'}
          onPress={() => router.setParams({ mine: '0', author: '' })}
        />
        <Button
          label="我的动态"
          variant={mine === '1' ? 'primary' : 'soft'}
          onPress={() => router.setParams({ mine: '1', author: '' })}
        />
        <Button label="共创动态" variant="soft" onPress={() => router.push({pathname:'/collection/new',params:{kind:'collaboration'}})} />
        {author && mine !== '1' && <Text style={styles.small}>查看好友</Text>}
      </View>
      {!!error && (
        <Notice action="重试" onAction={() => void load()}>
          {error}
        </Notice>
      )}
      {!items && !error && <Empty busy>正在读取生活动态…</Empty>}
      {items?.length === 0 && !error && <Empty icon="image-outline">这里还没有你可以看到的动态。</Empty>}
      {items?.map((item) => (
        <View key={item.id} style={styles.card}>
          <View style={styles.row}>
            <Avatar name={item.author} size={43} />
            <View style={styles.grow}>
              <Text style={styles.strong}>{item.author}</Text>
              <Text style={styles.small}>
                {new Date(item.createdAt).toLocaleString('zh-CN')}
                {item.scope ? ' · ' + scopes[item.scope] : ''}
              </Text>
            </View>
            {item.authorId === session?.user.id && (
              <IconButton
                label="管理这条动态"
                icon="ellipsis-horizontal"
                onPress={() => router.push({ pathname: '/private-moment', params: { id: item.id } })}
              />
            )}
          </View>
          {!!item.body && <Text style={styles.body}>{item.body}</Text>}
          {item.collaborationId && <Button label="查看共同创作" variant="soft"
            onPress={() => router.push({pathname:'/collection/[id]',params:{id:item.collaborationId!}})} />}
          {!!item.media.length && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {item.media.map((media) => (
                <MomentMediaTile key={media.id} item={media} />
              ))}
            </View>
          )}
        </View>
      ))}
      {next && <Button label="加载更早动态" variant="soft" disabled={busy} onPress={() => void load(next)} />}
    </Screen>
  );
}
