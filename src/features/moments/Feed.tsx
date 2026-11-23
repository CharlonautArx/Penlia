import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, useWindowDimensions, View, type FlatListProps } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSharedValue } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppearance } from '../../components/appearance';
import { Button, Empty, Icon, IconButton, ListRow, LoadingSkeleton, Notice, Section, Sheet, TopBar } from '../../components/ui';
import { isUiDemo } from '../../demo/mode';
import { errorMessage, type User } from '../../services/api';
import { useSession } from '../../services/session';
import { colors, contentWidth, radius, space, styles, touch } from '../../theme';
import { SpaceCollections, type AlbumTheme } from '../space/Collections';
import { CoverEditor } from '../space/CoverEditor';
import { coverMetrics } from '../space/ImmersiveCover';
import { HomeFeedList } from './HomeFeedList';
import { emptySpace } from '../space/model';
import { SpaceHeader, type SpacePane } from '../space/SpaceHeader';
import { useSpace } from '../space/store';
import type { Moment } from './model';
import { PostCard } from './PostCard';

export { scopes, type Audience, type Moment } from './model';

export function PrivateFeed({ author, linkedPane }: { author?: string; linkedPane?: SpacePane }) {
  const { session, request } = useSession();
  const state = useSpace();
  const me = session?.user;
  const home = !author;
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const { scheme } = useAppearance();
  const width = Math.max(1, window.width - insets.left - insets.right);
  const metrics = coverMetrics(width, window.height, insets.top);
  const reveal = useSharedValue(0);
  const mine = !!author && author === me?.id;
  const [pane, setPane] = useState<SpacePane>(linkedPane ?? 'thought');
  const [albumTheme, setAlbumTheme] = useState<AlbumTheme>('全部');
  const [items, setItems] = useState<Moment[]>();
  const [profile, setProfile] = useState<User>();
  const [count, setCount] = useState<number>();
  const [panel, setPanel] = useState<'publish' | 'timelineActions' | 'cover'>();
  const [next, setNext] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const sequence = useRef(0);
  const pageLock = useRef(false);

  useEffect(() => {
    if (home && linkedPane) {
      setPane(linkedPane);
      router.setParams({ pane: '' });
    }
  }, [home, linkedPane]);

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
  function update(id: string, change: Partial<Moment>) {
    setItems((current) => current?.map((item) => item.id === id ? { ...item, ...change } : item));
  }
  function openPublish(collaboration = false) {
    setPanel(undefined);
    if (collaboration) router.push({ pathname: '/collection/new', params: { kind: 'collaboration' } });
    else router.push('/private-moment');
  }
  const header = <View style={!home && local.header}>
    {person && <SpaceHeader person={person} card={card} avatarKey={home || mine ? state.demoAvatarKey : undefined}
      immersive={home ? { ...metrics, width, reveal, top: insets.top } : undefined}
      pane={pane} onPane={setPane} showsCollections={hasLocalProfile}
      onAvatar={home ? () => router.push({ pathname: '/life/timeline/[id]', params: { id: person.id } }) : undefined}
      onCover={home || mine ? () => setPanel('cover') : undefined}
      counts={mine ? { thought: count, journal: journals, albums } : undefined} />}
    <View style={home ? [local.column, local.homeBody] : local.body}>
      {pane === 'thought' ? <>
        {home && <HomePublishBar onPublish={() => setPanel('publish')} />}
        {!home && <Section title="动态记录">
          {archive && <Button label="本机旧动态" variant="quiet" onPress={() => router.push({
            pathname: '/space/[id]', params: { id: author!, archive: '1' },
          })} />}
        </Section>}
        {!!error && <Notice action="重试" onAction={() => void load()}>{error}</Notice>}
      </> : hasLocalProfile && person && <SpaceCollections owner={person.id} pane={pane}
        theme={albumTheme} onTheme={setAlbumTheme} />}
    </View>
  </View>;

  const list: FlatListProps<Moment> = {
    data: pane === 'thought' ? items ?? [] : [], keyExtractor: (entry) => entry.id, initialNumToRender: 5,
    contentContainerStyle: home ? local.homeList : local.list, ListHeaderComponent: header,
    refreshing: pane === 'thought' && busy, onRefresh: pane === 'thought' ? () => void load() : undefined,
    renderItem: ({ item }) => {
      const post = <PostCard item={item} onUpdate={(change) => update(item.id, change)}
        onPin={mine ? async (pinned) => {
          await request('/moments/' + item.id + '/pin', { method: 'PUT', body: { pinned } });
          void load();
        } : undefined} />;
      return home ? <View style={local.column}>{post}</View> : post;
    },
    ListEmptyComponent: pane !== 'thought' ? undefined : !items && !error ? <LoadingSkeleton label="正在读取动态" />
      : error ? undefined : <Empty icon="image-outline">{home ? '好友的新动态会出现在这里。' : '这里还没有你可见的动态。'}</Empty>,
    ListFooterComponent: pane === 'thought' && next ? <View style={local.footer}>
      {busy ? <Text style={styles.small}>正在加载更早动态…</Text>
        : <Button label="加载更早动态" variant="soft" onPress={() => void load(next)} />}
    </View> : undefined,
  };

  return <SafeAreaView style={local.safe} edges={home ? ['left', 'right'] : ['top', 'left', 'right', 'bottom']}>
    {!home && <TopBar title={mine ? '我的动态' : '好友动态'}
      back={() => router.canGoBack() ? router.back() : router.replace('/moments')}
      actions={mine && <>
        <IconButton label="动态选项" icon="ellipsis-horizontal" onPress={() => setPanel('timelineActions')} />
        <IconButton label="发布私密动态" icon="create-outline" tinted onPress={() => openPublish()} />
      </>} />}
    {home ? <HomeFeedList {...list} reveal={reveal} reserve={metrics.reserve} /> : <FlatList {...list} />}
    {home && insets.top > 0 && <LinearGradient pointerEvents="none"
      colors={scheme === 'dark' ? ['#14151ACA', '#14151A00'] : ['#FFFFFFC9', '#FFFFFF00']}
      style={[local.statusShade, { height: insets.top + 8 }]} />}
    {panel === 'cover' && (home || mine) && <CoverEditor initial={card} framing={home ? { width, ...metrics } : undefined} onClose={() => setPanel(undefined)} />}
    {home && panel === 'publish' && <Sheet title="选择发布方式" onClose={() => setPanel(undefined)}>
      <ListRow title="发布动态" left={<Icon name="create-outline" />} onPress={() => openPublish()} />
      <ListRow title="共创动态" left={<Icon name="people-outline" />} onPress={() => openPublish(true)} separator={false} />
    </Sheet>}
    {!home && mine && panel === 'timelineActions' && <Sheet title="动态选项" onClose={() => setPanel(undefined)}>
      <ListRow title="共创动态" left={<Icon name="people-outline" />} onPress={() => openPublish(true)} />
      <ListRow title="瞬间共鸣" left={<Icon name="camera-outline" />} onPress={() => {
        setPanel(undefined); router.push({ pathname: '/world', params: { kind: 'relay' } });
      }} />
      <ListRow title="空间隐私" detail="本机空间与历史记录" left={<Icon name="shield-checkmark-outline" />} onPress={() => {
        setPanel(undefined); router.push('/space/privacy');
      }} separator={false} />
    </Sheet>}
  </SafeAreaView>;
}

function HomePublishBar({ onPublish }: { onPublish: () => void }) {
  const { scheme } = useAppearance();
  const surface = scheme === 'dark' ? local.publishDark : local.publishLight;
  return <View style={local.publishRow}>
    <Pressable accessibilityRole="button" accessibilityLabel="空间隐私" onPress={() => router.push('/space/privacy')}
      style={({ pressed }) => [local.publishSurface, surface, local.privacyButton, pressed && local.pressed]}>
      <Icon name="shield-checkmark-outline" size={21} />
    </Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel="发布动态" accessibilityHint="选择普通或共创发布方式"
      onPress={onPublish} style={({ pressed }) => [local.publishSurface, surface, local.publishButton, pressed && local.pressed]}>
      <Icon name="create-outline" size={19} />
      <Text style={[styles.strong, local.publishLabel]}>发布动态</Text>
    </Pressable>
  </View>;
}

const local = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.backdrop },
  list: { width: '100%', maxWidth: contentWidth, alignSelf: 'center', paddingBottom: space.xl },
  header: { gap: space.sm, padding: space.md },
  column: { width: '100%', maxWidth: contentWidth, alignSelf: 'center' },
  homeList: { paddingBottom: space.xl },
  body: { gap: space.sm },
  homeBody: { padding: space.md, gap: space.sm },
  statusShade: { position: 'absolute', top: 0, left: 0, right: 0 },

  publishRow: { flexDirection: 'row', gap: space.xs },
  publishSurface: { minHeight: touch + space.xxs, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  publishLight: { backgroundColor: '#FFFFFF', boxShadow: '0px 1px 6px rgba(35, 36, 42, 0.06)' },
  publishDark: { backgroundColor: colors.panel },
  privacyButton: { minWidth: touch + space.xxs },
  publishButton: { ...styles.grow, flexDirection: 'row', gap: space.xs, paddingHorizontal: space.md, paddingVertical: space.xs },
  publishLabel: { flexShrink: 1 },
  pressed: { opacity: 0.72 },
  footer: { padding: space.md },
});
