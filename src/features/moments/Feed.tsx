import NativeMaskedView from '@react-native-masked-view/masked-view';
import { BlurTargetView, BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect, useIsFocused } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef, type ComponentType, type ReactElement, type RefObject } from 'react';
import { FlatList, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View, type FlatListProps, type ViewProps } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDesignPilot } from '../design-pilot/context';
import { MomentsCoverTitle, MomentsToolbar } from '../design-pilot/Moments';
import { useAppearance } from '../../components/appearance';
import { Button, Empty, Icon, ListRow, LoadingSkeleton, Notice, Section, Sheet, TopBar, type IconName } from '../../components/ui';
import { isUiDemo } from '../../demo/mode';
import { ApiError, errorMessage, type User } from '../../services/api';
import { useSession } from '../../services/session';
import { colors, contentWidth, radius, space, styles, touch } from '../../theme';
import { SpaceCollections, type AlbumTheme } from '../space/Collections';
import { EntryCard } from '../space/EntryCard';
import { lookupKeys, reconcileEntries, timelineRows, type MomentIdentity, type TimelineRow } from './timeline';
import { CoverEditor } from '../space/CoverEditor';
import { coverMetrics } from '../space/ImmersiveCover';
import { HomeFeedList } from './HomeFeedList';
import { emptySpace } from '../space/model';
import { SpaceHeader, type SpacePane } from '../space/SpaceHeader';
import { useRecord } from '../social/ui';
import { useSpace } from '../space/store';
import type { Moment } from './model';
import { PostCard } from './PostCard';

// The installed mask's legacy NativeMethods declaration predates the current RN View type.
const MaskedView = NativeMaskedView as unknown as ComponentType<ViewProps & { maskElement: ReactElement }>;

export { scopes, type Audience, type Moment } from './model';

export function PrivateFeed({ author, linkedPane }: { author?: string; linkedPane?: SpacePane }) {
  const { session, request } = useSession();
  const state = useSpace();
  const me = session?.user;
  const home = !author;
  const pilot = useDesignPilot();
  const edition = home && pilot.variant !== 'original' ? pilot.variant : undefined;
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const focused = useIsFocused();
  const width = Math.max(1, window.width - insets.left - insets.right);
  const regularMetrics = coverMetrics(width, window.height, insets.top);
  const reveal = useSharedValue(0);
  const bellTarget = useRef<ComponentRef<typeof View>>(null);
  const coverHeaderHeight = useRef(0);
  const [statusSurface, setStatusSurface] = useState<'cover' | 'profile' | 'feed'>('cover');
  const mine = !!author && author === me?.id;
  const archiveOwner = home || mine ? me?.id : undefined;
  const [pane, setPane] = useState<SpacePane>(linkedPane ?? 'thought');
  const [albumTheme, setAlbumTheme] = useState<AlbumTheme>('全部');
  const [items, setItems] = useState<Moment[]>();
  const [profile, setProfile] = useState<User>();
  const immersive = home || mine;
  const history = useRef(state);
  history.current = state;
  const keys = useMemo(() => archiveOwner ? lookupKeys(state.value?.entries ?? [], archiveOwner).sort().join(',') : '',
    [archiveOwner, state.value?.entries]);
  const [canUseCache, setCanUseCache] = useState(false);
  useEffect(() => {
    if (!focused || !archiveOwner || !keys) return;
    let active = true;
    async function resolve() {
      const candidates = keys.split(',');
      for (let start = 0; active && start < candidates.length; start += 100) {
        const { identities } = await request<{ identities: MomentIdentity[] }>('/moments/resolve-ids',
          { method: 'POST', body: { keys: candidates.slice(start, start + 100) } });
        if (active && identities.length) history.current.update((data) => {
          const entries = reconcileEntries(data.entries, archiveOwner!, identities);
          return entries === data.entries ? data : { ...data, entries };
        });
      }
    }
    // Old servers can still reconcile identities from ordinary timeline pages.
    void resolve().catch(() => {});
    return () => { active = false; };
  }, [keys, archiveOwner, focused, request]);
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
      if (mine) params.set('order', 'pinned');
      if (cursor) params.set('before', cursor);
      const [result, owner] = await Promise.all([
        request<{ moments: Moment[]; next: string | null }>('/moments?' + params.toString()),
        author && !mine && !cursor ? request<{ user: User }>('/people/' + author) : undefined,
      ]);
      if (id !== sequence.current) return;
      setItems((current) => cursor
        ? [...(current ?? []), ...result.moments.filter((entry) => !current?.some((item) => item.id === entry.id))]
        : result.moments);
      setNext(result.next);
      if (owner) setProfile(owner.user);
      setCanUseCache(false);
      if (archiveOwner) history.current.update((data) => {
        const ownMoments = result.moments.filter((item) => item.authorId === archiveOwner);
        const entries = reconcileEntries(data.entries, archiveOwner, ownMoments);
        if (cursor || !mine) return entries === data.entries ? data : { ...data, entries };
        const timelineCache = ownMoments.filter((item) => !item.forwarded && !item.collaborationId);
        return { ...data, entries, timelineCache };
      });
    } catch (failure) {
      if (id === sequence.current) {
        setError(errorMessage(failure));
        if (!cursor) {
          setCanUseCache(!!archiveOwner && (!(failure instanceof ApiError) || failure.status >= 500));
          setItems([]); setNext(null);
        }
      }
    } finally {
      if (id === sequence.current) { setBusy(false); pageLock.current = false; }
    }
  }, [request, author, mine, archiveOwner]);

  useFocusEffect(useCallback(() => {
    setItems(undefined);
    setProfile(undefined);
    setCanUseCache(false);
    setNext(null);
    void load();
    return () => { sequence.current++; pageLock.current = false; };
  }, [load]));

  const person = home || mine ? me : profile;
  const hasLocalProfile = !!person && (home || mine || (isUiDemo && state.spaceVisible(person.id)));
  const card = hasLocalProfile && person ? state.card(person.id) : emptySpace();
  // A chosen photograph keeps its exact framing. With an empty cover the toolbar and feed can start earlier.
  const metrics = useMemo(() => {
    if (!edition || card.cover.photo) return regularMetrics;
    const titleAndIdentity = (edition === 'B' ? 122 : edition === 'C' ? 168 : edition === 'D' ? 150 : 177) * Math.min(1.3, window.fontScale);
    const resting = Math.min(regularMetrics.resting, insets.top + titleAndIdentity);
    return { resting, reserve: Math.min(regularMetrics.reserve, resting * 0.55) };
  }, [edition, card.cover.photo, regularMetrics.resting, regularMetrics.reserve, window.fontScale, insets.top]);
  const rows = useMemo(() => items ? timelineRows(canUseCache ? state.value?.timelineCache ?? [] : items,
    archiveOwner ? state.value?.entries ?? [] : [], archiveOwner, !!next, home) : [],
    [canUseCache, items, state.value?.timelineCache, state.value?.entries, archiveOwner, home, next]);
  function update(id: string, change: Partial<Moment>) {
    setItems((current) => current?.map((item) => item.id === id ? { ...item, ...change } : item));
  }
  function openPublish(collaboration = false) {
    setPanel(undefined);
    if (collaboration) router.push({ pathname: '/collection/new', params: { kind: 'collaboration' } });
    else router.push('/private-moment');
  }
  const spaceHeader = person && <SpaceHeader person={person} card={card} avatarKey={home || mine ? state.demoAvatarKey : undefined}
    immersive={immersive ? { ...metrics, width, reveal, top: insets.top } : undefined} hidePanes={mine || !!edition}
    pilotPaper={edition ? pilot.colors : undefined} paperWash={edition === 'D' && !card.cover.photo}
    pane={pane} onPane={setPane} showsCollections={hasLocalProfile}
    onAvatar={home ? () => router.push({ pathname: '/life/timeline/[id]', params: { id: person.id } }) : undefined}
    onCover={home || mine ? () => setPanel('cover') : undefined}
    />;
  const goBack = () => router.canGoBack() ? router.back() : router.replace('/moments');
  const header = <View style={!immersive && local.header}>
    {immersive ? <View onLayout={({ nativeEvent }) => { coverHeaderHeight.current = nativeEvent.layout.height; }}>
      {home ? <BlurTargetView ref={bellTarget}>{spaceHeader}</BlurTargetView> : spaceHeader}
      {edition && <MomentsCoverTitle edition={edition} top={insets.top} photo={!!card.cover.photo} />}
      {home ? <HomeNotificationBell target={bellTarget} photo={!!card.cover.photo} top={insets.top + space.xs} />
        : <View pointerEvents="box-none" style={[local.timelineNav, { top: insets.top + space.xs }]}>
          <CoverAction label="返回" icon="chevron-back" onPress={goBack} />
          <View style={styles.grow} />
          <CoverAction label="动态选项" icon="ellipsis-horizontal" onPress={() => setPanel('timelineActions')} />
          <CoverAction label="发布私密动态" icon="create-outline" onPress={() => openPublish()} />
        </View>}
    </View> : spaceHeader}
    {edition && <View style={local.column}><MomentsToolbar edition={edition} pane={pane} collections={hasLocalProfile}
      onPane={setPane} onPublish={() => setPanel('publish')} onPrivacy={() => router.push('/space/privacy')} /></View>}
    <View style={edition && pane === 'thought' && !error ? local.column : home ? [local.column, local.homeBody] : mine ? local.timelineBody : local.body}>
      {pane === 'thought' ? <>
        {!immersive && <Section title="动态记录" />}
        {home && !edition && <HomePublishBar onPublish={() => setPanel('publish')} />}
        {!!error && <Notice action="重试" onAction={() => void load()}>{error}</Notice>}
        {mine && !!state.error && <Notice action="重试" onAction={state.retry}>{state.error}</Notice>}
      </> : hasLocalProfile && person && <SpaceCollections owner={person.id} pane={pane}
        theme={albumTheme} onTheme={setAlbumTheme} />}
    </View>
  </View>;

  const list: FlatListProps<TimelineRow> = {
    data: pane === 'thought' ? rows : [], keyExtractor: (entry) => entry.key, initialNumToRender: 5,
    contentContainerStyle: immersive ? local.homeList : local.list, ListHeaderComponent: header,
    refreshing: pane === 'thought' && busy, onRefresh: pane === 'thought' ? () => void load() : undefined,
    renderItem: ({ item: row }) => {
      if (row.entry) return <View style={local.column}><EntryCard entry={row.entry} timeline={mine} /></View>;
      const item = row.moment;
      const post = <PostCard edition={edition} item={item} onRemove={() => { void load(); }} onUpdate={(change) => update(item.id, change)}
        showPin={!home}
        onPin={mine ? async (pinned) => {
          await request('/moments/' + item.id + '/pin', { method: 'PUT', body: { pinned } });
          void load();
        } : undefined} />;
      return immersive ? <View style={local.column}>{post}</View> : post;
    },
    ListEmptyComponent: pane !== 'thought' ? undefined : (!items || (mine && state.loading)) && !error ? <LoadingSkeleton label="正在读取动态" />
      : error ? undefined : <Empty icon="image-outline">{home ? '你和好友的新动态会出现在这里。' : '这里还没有你可见的动态。'}</Empty>,
    ListFooterComponent: pane === 'thought' && next ? <View style={local.footer}>
      {busy ? <Text style={styles.small}>正在加载更早动态…</Text>
        : <Button label="加载更早动态" variant="soft" onPress={() => void load(next)} />}
    </View> : undefined,
  };

  return <SafeAreaView style={[local.safe, edition && { backgroundColor: pilot.colors.background }]} edges={home ? ['left', 'right'] : mine ? ['left', 'right', 'bottom'] : ['top', 'left', 'right', 'bottom']}>
    {!immersive && <TopBar title="好友动态" back={goBack} />}
    {immersive ? <HomeFeedList {...list} reveal={reveal} reserve={metrics.reserve}
      onScroll={({ nativeEvent }) => {
        const barCenter = nativeEvent.contentOffset.y + insets.top / 2;
        const headerHeight = coverHeaderHeight.current;
        // Switch the system icons as they cross the light part of the existing lower fade.
        const nextSurface = headerHeight > 0 && barCenter >= headerHeight ? 'feed'
          : barCenter >= metrics.resting - 72 ? 'profile' : 'cover';
        if (nextSurface !== statusSurface) setStatusSurface(nextSurface);
      }} /> : <FlatList {...list} />}
    {immersive && focused && person && statusSurface !== 'feed' && <StatusBar
      style={(statusSurface === 'cover' && (card.cover.photo || (edition === 'D' && pilot.dark))) || (edition && pilot.dark && statusSurface === 'profile') ? 'light' : 'dark'} />}
    {panel === 'cover' && (home || mine) && <CoverEditor initial={card} framing={{ width, ...metrics }} onClose={() => setPanel(undefined)} />}
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

function CoverAction({ label, icon, onPress }: { label: string; icon: IconName; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
    style={({ pressed }) => [local.coverAction, pressed && local.pressed]}>
    <View pointerEvents="none" style={local.coverGlyph}>
      <View style={local.coverEdge}><Icon name={icon} size={25} color="#25262BC4" /></View>
      {Platform.OS === 'web' ? <Icon name={icon} size={23} color="#FFFFFFD9" />
        : <MaskedView style={StyleSheet.absoluteFill}
          maskElement={<View style={local.coverGlyph}><Icon name={icon} size={23} color="black" /></View>}>
          <LinearGradient colors={['#FFFFFFF4', '#FFFFFFA8', '#FFEAF1D9', '#E9FFFBDC']}
            locations={[0, 0.45, 0.72, 1]} start={{ x: 0.25, y: 0 }} end={{ x: 0.78, y: 1 }}
            style={StyleSheet.absoluteFill} />
        </MaskedView>}
    </View>
  </Pressable>;
}

function HomeNotificationBell({ photo, top, target }: {
  photo: boolean; top: number; target: RefObject<ComponentRef<typeof View> | null>;
}) {
  const focused = useIsFocused();
  const { data } = useRecord<{ unread: boolean }>('/moment-notifications?badge=1', 20000);
  return <Pressable accessibilityRole="button" accessibilityLabel="动态消息" accessibilityHint={data?.unread ? '有未读互动' : undefined}
    onPress={() => router.push('/life/moment-notifications')}
    style={({ pressed }) => [local.bell, { top }, pressed && local.pressed]}>
    <View pointerEvents="none" style={local.bellGlyph}>
      <View style={local.bellEdge}><Icon name="notifications-outline" size={26} color="#25262BB8" /></View>
      {Platform.OS === 'web' ? <View style={local.bellFace}>
        <Icon name="notifications" size={24} color="#FFFFFF88" />
      </View> : <MaskedView style={StyleSheet.absoluteFill}
        maskElement={<View style={local.bellGlyph}><Icon name="notifications" size={24} color="black" /></View>}>
        {focused && (Platform.OS === 'ios' || Number(Platform.Version) >= 31) &&
          <BlurView tint="light" intensity={14} blurMethod="dimezisBlurViewSdk31Plus" blurTarget={target}
            style={StyleSheet.absoluteFill} />}
        <LinearGradient colors={['#FFFFFFED', '#FFFFFF36', '#42475038', '#FFFFFF99']}
          locations={[0, 0.38, 0.67, 1]} start={{x: 0.2, y: 0}} end={{x: 0.9, y: 1}} style={StyleSheet.absoluteFill} />
      </MaskedView>}
      <Icon name="notifications-outline" size={24} color={photo ? '#FFFFFFCE' : '#3F414AAA'} />
    </View>
    {data?.unread && <View pointerEvents="none" style={local.unread} />}
  </Pressable>;
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

  publishRow: { flexDirection: 'row', gap: space.xs },
  publishSurface: { minHeight: touch + space.xxs, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  publishLight: { backgroundColor: '#FFFFFF', boxShadow: '0px 1px 6px rgba(35, 36, 42, 0.06)' },
  publishDark: { backgroundColor: colors.panel },
  privacyButton: { minWidth: touch + space.xxs },
  publishButton: { ...styles.grow, flexDirection: 'row', gap: space.xs, paddingHorizontal: space.md, paddingVertical: space.xs },
  publishLabel: { flexShrink: 1 },
  pressed: { opacity: 0.72 },
  timelineBody: { paddingHorizontal: space.md, gap: space.xs },
  timelineNav: { position: 'absolute', left: space.sm, right: space.sm, zIndex: 2, flexDirection: 'row', alignItems: 'center', gap: space.xxs },
  coverAction: { width: touch, minHeight: touch, alignItems: 'center', justifyContent: 'center' },
  coverGlyph: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  coverEdge: { position: 'absolute', transform: [{ translateY: 0.5 }] },
  bell: { position: 'absolute', right: space.md, zIndex: 2, width: touch, height: touch, justifyContent: 'center', alignItems: 'center' },
  bellGlyph: { width: 26, height: 28, alignItems: 'center', justifyContent: 'center' },
  bellEdge: { position: 'absolute', top: 1 }, bellFace: { position: 'absolute', top: 2 },
  unread: { position: 'absolute', right: 5, top: 5, width: 9, height: 9, backgroundColor: '#E72442', borderRadius: 5,
    borderWidth: 1, borderColor: '#FFFFFF' },
  footer: { padding: space.md },
});
