import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button, Empty, IconButton, Notice, Screen, Section, Sheet } from '../../components/ui';
import { Chips } from '../../features/play/Cards';
import { localId } from '../../features/local/document';
import { EntryCard, JournalLink } from '../../features/space/EntryCard';
import { SpacePhoto } from '../../features/space/media';
import { SpaceHeader, type SpacePane } from '../../features/space/SpaceHeader';
import { CoverEditor } from '../../features/space/CoverEditor';
import { useSpace } from '../../features/space/store';
import { colors, styles } from '../../theme';

const albumThemes = ['全部', '日常', '旅行', '聚会', '其他'] as const;

export default function SpaceScreen() {
  const { id, viewer, pane, archive } = useLocalSearchParams<{ id: string; viewer?: string; pane?: string; archive?: string }>();
  const state = useSpace();
  const person = state.person(id);
  const mine = state.owns(id) && !viewer;
  const visible = state.spaceVisible(id, viewer);
  const card = state.card(id);
  const current: SpacePane = pane === 'journal' || pane === 'albums' ? pane : 'thought';
  const [albumTheme, setAlbumTheme] = useState<typeof albumThemes[number]>('全部');
  const [panel, setPanel] = useState<'cover' | 'album'>();
  const entries = state.value?.entries.filter((post) => post.ownerId === id && post.kind === current
    && state.entryVisible(post, viewer)).sort((a, b) => b.at - a.at) ?? [];
  const albums = state.value?.albums.filter((album) => album.ownerId === id && state.albumVisible(album, viewer)
    && (albumTheme === '全部' || album.theme === albumTheme)) ?? [];

  return <Screen title={current === 'albums' ? '相册' : current === 'journal' ? '日志' : '本机空间'} back={() => router.canGoBack() ? router.back() : router.replace('/moments')}
    actions={mine && visible && <>
      <IconButton label="空间隐私" icon="shield-checkmark-outline" tinted onPress={() => router.push('/space/privacy')} />
    </>}>
    {mine && <Text style={styles.small}>仅保存在此设备</Text>}
    {viewer && visible && <Notice>{'好友视角预览 · ' + (state.person(viewer)?.name ?? '好友') + ' 能看到的内容'}</Notice>}
    {!state.loading && !!state.error && <Notice action="重试" onAction={state.retry}>{state.error}</Notice>}
    {state.loading || !visible || !person || !state.value ? <Empty busy={state.loading} icon="lock-closed-outline">
      {state.loading ? '正在读取空间…' : visible ? '暂时无法读取此空间。' : '这个空间当前不可访问。'}
    </Empty> : <>
      <SpaceHeader person={person} card={card} avatarKey={mine ? state.demoAvatarKey : undefined}
        pane={current} onPane={(value) => {
          if (value === 'thought' && !archive && !viewer) {
            router.replace({ pathname: '/life/timeline/[id]', params: { id } });
          } else router.setParams({ pane: value });
        }} onCover={mine ? () => setPanel('cover') : undefined} />
      {(current === 'thought' || current === 'journal') && <>
        <Section title={current === 'journal' ? '空间日志' : '最近动态'} detail={entries.length + ' 条'}>
          {mine && <Button label={current === 'journal' ? '写日志' : '发布动态'} icon="add-outline" variant="soft"
            onPress={() => router.push({ pathname: '/space/compose', params: { kind: current } })} />}
        </Section>
        {entries.map((entry) => current === 'journal'
          ? <JournalLink key={entry.id} entry={entry} viewer={viewer} />
          : <View key={entry.id} style={local.post}><EntryCard entry={entry} viewer={viewer} /></View>)}
        {!entries.length && <Empty icon={current === 'journal' ? 'book-outline' : 'chatbox-ellipses-outline'}>
          {current === 'journal' ? '还没有可见的日志。' : '还没有可见的动态。'}
        </Empty>}
      </>}
      {current === 'albums' && <>
        <Section title="主题相册" detail={albums.length + ' 本'}>
          {mine && <Button label="新建相册" icon="add-outline" variant="soft" onPress={() => setPanel('album')} />}
        </Section>
        <Chips items={albumThemes} value={albumTheme} onChange={setAlbumTheme} />
        {albums.length ? <View style={local.grid}>
          {albums.map((album) => <Pressable key={album.id} accessibilityRole="button" accessibilityLabel={album.title}
            style={({ pressed }) => [local.album, pressed && local.pressed]}
            onPress={() => router.push({ pathname: '/space/album/[id]', params: { id: album.id, ...(viewer ? { viewer } : {}) } })}>
            <View style={local.albumCover}><SpacePhoto photo={album.photos[album.cover]} style={local.albumPhoto}
              label={album.title + '封面'} /></View>
            <View style={local.albumText}>
              <Text style={styles.strong} numberOfLines={1}>{album.title}</Text>
              <Text style={styles.small}>{album.theme} · {album.photos.length} 张</Text>
            </View>
          </Pressable>)}
        </View> : <Empty icon="images-outline">还没有可见的相册。</Empty>}
      </>}

    </>}
    {panel === 'cover' && mine && <CoverEditor initial={card} onClose={() => setPanel(undefined)} />}
    {panel === 'album' && mine && <NewAlbum onClose={() => setPanel(undefined)} />}
  </Screen>;
}

function NewAlbum({ onClose }: { onClose: () => void }) {
  const state = useSpace();
  const [name, setName] = useState('');
  const [theme, setTheme] = useState('日常');
  return <Sheet title="新建相册" onClose={onClose}>
    <TextInput accessibilityLabel="相册名称" value={name} onChangeText={setName} style={styles.input}
      placeholder="给这些照片起个名字" placeholderTextColor={colors.quiet} maxLength={26} />
    <View style={[styles.row, local.wrap]}>
      {albumThemes.slice(1).map((item) => <Button key={item} label={item}
        variant={item === theme ? 'primary' : 'soft'} onPress={() => setTheme(item)} />)}
    </View>
    <Button label="创建" disabled={!name.trim()} variant="gradient" onPress={() => {
      if (!state.me) return;
      const id = localId();
      const album = { id, ownerId: state.me.id, title: name.trim(), theme, cover: 0, photos: [], at: Date.now() };
      state.update((previous) => ({ ...previous, albums: [album, ...previous.albums] }));
      onClose();
      router.push({ pathname: '/space/album/[id]', params: { id } });
    }} />
  </Sheet>;
}

const local = StyleSheet.create({
  pressed: { opacity: 0.74 },
  post: { overflow: 'hidden', borderRadius: 14 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  album: { width: '48%', borderWidth: 1, borderColor: colors.border, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.panel },
  albumCover: { height: 124 },
  albumPhoto: { width: '100%', height: '100%' },
  albumText: { padding: 9, gap: 2 },
  wrap: { flexWrap: 'wrap', gap: 7 },
});
