import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Empty, Icon, IconButton, ListRow, LoadingSkeleton, Notice, Section, Sheet, TopBar } from '../../components/ui';
import { isUiDemo } from '../../demo/mode';
import { errorMessage, type User } from '../../services/api';
import { useSession } from '../../services/session';
import { colors, contentWidth, space, styles } from '../../theme';
import { CoverEditor } from '../space/CoverEditor';
import { emptySpace } from '../space/model';
import { SpaceHeader, type SpacePane } from '../space/SpaceHeader';
import { useSpace } from '../space/store';
import type { Moment } from './model';
import { PostCard } from './PostCard';

export { scopes, type Audience, type Moment } from './model';

export function PrivateFeed({ author }: { author?: string }) {
  const { session, request } = useSession();
  const state = useSpace();
  const me = session?.user;
  const home = !author;
  const mine = !!author && author === me?.id;
  const [items, setItems] = useState<Moment[]>();
  const [profile, setProfile] = useState<User>();
  const [count, setCount] = useState<number>();
  const [panel, setPanel] = useState<'actions' | 'cover'>();
  const [next, setNext] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const sequence = useRef(0);
  const pageLock = useRef(false);

  const load = useCallback(async (cursor?: string) => {
    if (cursor && pageLock.current) return;
    pageLock.current = true;
    const id = ++sequence.current;
    setBusy(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (author) params.set('author', author);
      else params.set('feed', 'friends');
      if (mine) params.set('order', 'pinned');
      if (cursor) params.set('before', cursor);
      const [result, owner, totals] = await Promise.all([
        request<{ moments: Moment[]; next: string | null }>('/moments?' + params.toString()),
        author && !mine && !cursor ? request<{ user: User }>('/people/' + author) : undefined,
        mine && !cursor ? request<{ count: number }>('/moments/count') : undefined,
      ]);
      if (id !== sequence.current) return;
      setItems((current) => cursor
        ? [...(current ?? []), ...result.moments.filter((entry) => !current?.some((item) => item.id === entry.id))]
        : result.moments);
      setNext(result.next);
      if (owner) setProfile(owner.user);
      if (totals) setCount(totals.count);
    } catch (failure) {
      if (id === sequence.current) {
        setError(errorMessage(failure));
        if (!cursor) { setItems([]); setNext(null); }
      }
    } finally {
      if (id === sequence.current) { setBusy(false); pageLock.current = false; }
    }
  }, [request, author, mine]);

  useFocusEffect(useCallback(() => {
    setItems(undefined);
    setProfile(undefined);
    setCount(undefined);
    setNext(null);
    void load();
    return () => { sequence.current++; pageLock.current = false; };
  }, [load]));

  const person = home || mine ? me : profile;
  const hasLocalProfile = !!person && (home || mine || (isUiDemo && state.spaceVisible(person.id)));
  const card = hasLocalProfile && person ? state.card(person.id) : emptySpace();
  const journals = mine ? state.value?.entries.filter((entry) => entry.ownerId === author && entry.kind === 'journal').length : undefined;
  const albums = mine ? state.value?.albums.filter((album) => album.ownerId === author).length : undefined;
  const archive = mine && state.value?.entries.some((entry) => entry.ownerId === author && entry.kind === 'thought');
  function openPane(pane: SpacePane) {
    if (pane === 'thought' || !person) return;
    router.push({ pathname: '/space/[id]', params: { id: person.id, pane } });
  }
  function update(id: string, change: Partial<Moment>) {
    setItems((current) => current?.map((item) => item.id === id ? { ...item, ...change } : item));
  }
  const header = <View style={local.header}>
    {person && <SpaceHeader person={person} card={card} avatarKey={home || mine ? state.demoAvatarKey : undefined}
      pane="thought" onPane={openPane} showsCollections={hasLocalProfile}
      onAvatar={home ? () => router.push({ pathname: '/life/timeline/[id]', params: { id: person.id } }) : undefined}
      onCover={home || mine ? () => setPanel('cover') : undefined}
      counts={mine ? { thought: count, journal: journals, albums } : undefined} />}
    {home && <Button label="发布动态" icon="create-outline" variant="soft" onPress={() => router.push('/private-moment')} />}
    <Section title={home ? '好友动态' : '动态记录'}>
      {archive && <Button label="本机旧动态" variant="quiet" onPress={() => router.push({
        pathname: '/space/[id]', params: { id: author!, archive: '1' },
      })} />}
    </Section>
    {!!error && <Notice action="重试" onAction={() => void load()}>{error}</Notice>}
  </View>;

  return <SafeAreaView style={local.safe} edges={home ? ['top', 'left', 'right'] : ['top', 'left', 'right', 'bottom']}>
    <TopBar title={home ? '动态' : mine ? '我的动态' : '好友动态'}
      back={home ? undefined : () => router.canGoBack() ? router.back() : router.replace('/moments')}
      actions={(home || mine) && <>
        <IconButton label="动态选项" icon="ellipsis-horizontal" onPress={() => setPanel('actions')} />
        <IconButton label="发布私密动态" icon="create-outline" tinted onPress={() => router.push('/private-moment')} />
      </>} />
    <FlatList data={items ?? []} keyExtractor={(entry) => entry.id} initialNumToRender={5}
      contentContainerStyle={local.list} ListHeaderComponent={header} refreshing={busy} onRefresh={() => void load()}
      renderItem={({ item }) => <PostCard item={item} onUpdate={(change) => update(item.id, change)}
        onPin={mine ? async (pinned) => {
          await request('/moments/' + item.id + '/pin', { method: 'PUT', body: { pinned } });
          void load();
        } : undefined} />}
      ListEmptyComponent={!items && !error ? <LoadingSkeleton label="正在读取动态" />
        : error ? undefined : <Empty icon="image-outline">{home ? '好友的新动态会出现在这里。' : '这里还没有你可见的动态。'}</Empty>}
      ListFooterComponent={next ? <View style={local.footer}>
        {busy ? <Text style={styles.small}>正在加载更早动态…</Text>
          : <Button label="加载更早动态" variant="soft" onPress={() => void load(next)} />}
      </View> : undefined}
    />
    {panel === 'cover' && (home || mine) && <CoverEditor initial={card} onClose={() => setPanel(undefined)} />}
    {panel === 'actions' && <Sheet title="动态选项" onClose={() => setPanel(undefined)}>
      <ListRow title="共创动态" left={<Icon name="people-outline" />} onPress={() => {
        setPanel(undefined); router.push({ pathname: '/collection/new', params: { kind: 'collaboration' } });
      }} />
      <ListRow title="瞬间共鸣" left={<Icon name="camera-outline" />} onPress={() => {
        setPanel(undefined); router.push({ pathname: '/world', params: { kind: 'relay' } });
      }} />
      <ListRow title="空间隐私" detail="本机空间与历史记录" left={<Icon name="shield-checkmark-outline" />} onPress={() => {
        setPanel(undefined); router.push('/space/privacy');
      }} separator={false} />
    </Sheet>}
  </SafeAreaView>;
}

const local = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.backdrop },
  list: { width: '100%', maxWidth: contentWidth, alignSelf: 'center', paddingBottom: space.xl },
  header: { gap: space.sm, padding: space.md },
  footer: { padding: space.md },
});
