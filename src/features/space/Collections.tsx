import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';

import { Button, Empty, Notice, Section, Sheet } from '../../components/ui';
import { colors, radius, space, styles } from '../../theme';
import { localId } from '../local/document';
import { CategoryManager } from './CategoryManager';
import { Chips } from '../play/Cards';
import { FrostedAction } from "./FrostedAction";
import { JournalLink } from './EntryCard';
import { SpacePhoto } from './media';
import { useSpace } from './store';

export type AlbumTheme = string;

export function SpaceCollections({ owner, viewer, pane, theme, onTheme }: {
  owner: string; viewer?: string; pane: 'journal' | 'albums';
  theme: AlbumTheme; onTheme: (value: AlbumTheme) => void;
}) {
  const state = useSpace();
  const [managing, setManaging] = useState(false);
  const [creating, setCreating] = useState(false);
  const { width, fontScale } = useWindowDimensions();
  const singleColumn = fontScale > 1.6 && width < 420;
  const mine = state.owns(owner) && !viewer;
  if (state.error) return <Notice action="重试" onAction={state.retry}>{state.error}</Notice>;
  if (state.loading || !state.value) return <Empty busy>正在读取空间…</Empty>;
  if (!state.spaceVisible(owner, viewer)) return <Empty icon="lock-closed-outline">这个空间当前不可访问。</Empty>;
  if (pane === 'journal') {
    const entries = state.value.entries.filter((entry) => entry.ownerId === owner && entry.kind === 'journal'
      && state.entryVisible(entry, viewer)).sort((a, b) => b.at - a.at);
    return <>
      <Section title="空间日志" detail={entries.length + ' 条'}>
        {mine && <FrostedAction label="写日志" icon="add-outline"
          onPress={() => router.push({ pathname: '/space/compose', params: { kind: 'journal' } })} />}
      </Section>
      {entries.map((entry) => <JournalLink key={entry.id} entry={entry} viewer={viewer} />)}
      {!entries.length && <Empty icon="book-outline">还没有可见的日志。</Empty>}
    </>;
  }
  const visible = state.value.albums.filter(album => album.ownerId === owner && state.albumVisible(album, viewer));
  const categories = (state.value.categories ?? []).filter(c => c.ownerId === owner && (mine || visible.some(a => a.categoryId === c.id)));
  const selected = categories.find(c => c.id === theme);
  const albums = selected ? visible.filter(a => a.categoryId === selected.id) : visible;
  return <>
    <Section title="主题相册" detail={albums.length + ' 本'}>
      {mine && <FrostedAction label="新建相册" icon="add-outline" onPress={() => setCreating(true)} />}
    </Section>
    <View style={[styles.row, local.filters]}>
      <View style={styles.grow}><Chips horizontal items={['全部', ...categories.map(c => c.name)]} value={selected?.name ?? '全部'}
        onChange={name => onTheme(categories.find(c => c.name === name)?.id ?? '全部')} /></View>
      {mine && <Button label="管理分类" variant="quiet" onPress={() => setManaging(true)} />}
    </View>
    {!!selected?.description && <Text style={styles.muted}>{selected.description}</Text>}
    {managing && mine && <CategoryManager owner={owner} close={() => setManaging(false)} />}
    {albums.length ? <View style={local.grid}>
      {albums.map((album) => <Pressable key={album.id} accessibilityRole="button" accessibilityLabel={album.title}
        style={({ pressed }) => [local.album, singleColumn && local.singleColumn, pressed && local.pressed]}
        onPress={() => router.push({ pathname: '/space/album/[id]', params: { id: album.id, ...(viewer ? { viewer } : {}) } })}>
        <View style={local.albumCover}><SpacePhoto photo={album.photos[album.cover]} style={local.albumPhoto}
          label={album.title + '封面'} /></View>
        <View style={local.albumText}>
          <Text style={styles.strong} numberOfLines={2}>{album.title}</Text>
          <Text style={styles.small}>{album.photos.length} 张</Text>
        </View>
      </Pressable>)}
    </View> : <Empty icon="images-outline">还没有可见的相册。</Empty>}
    {creating && mine && <NewAlbum initialCategory={selected?.id} onClose={() => setCreating(false)} />}
  </>;
}

function NewAlbum({ initialCategory, onClose }: { initialCategory?: string; onClose: () => void }) {
  const state = useSpace();
  const [name, setName] = useState('');
  const [category, setCategory] = useState(initialCategory);
  const groups = state.value?.categories?.filter(c => c.ownerId === state.me?.id) ?? [];
  return <Sheet avoidKeyboard title="新建相册" onClose={onClose}>
    <TextInput accessibilityLabel="相册名称" value={name} onChangeText={setName} style={styles.input}
      placeholder="给这些照片起个名字" placeholderTextColor={colors.quiet} maxLength={26} />
    {!!groups.length && <Chips items={['全部', ...groups.map(c => c.name)]} value={groups.find(c => c.id === category)?.name ?? '全部'}
      onChange={name => setCategory(groups.find(c => c.name === name)?.id)} />}
    <Button label="创建" disabled={!name.trim()} variant="gradient" onPress={() => {
      if (!state.me) return;
      const id = localId();
      const album = { id, ownerId: state.me.id, title: name.trim(), categoryId: category, cover: 0, photos: [], at: Date.now() };
      state.update((previous) => ({ ...previous, albums: [album, ...previous.albums] }));
      onClose();
      router.push({ pathname: '/space/album/[id]', params: { id } });
    }} />
  </Sheet>;
}

const local = StyleSheet.create({
  pressed: { opacity: 0.74 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  singleColumn: { width: '100%' },
  album: { width: '48%', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, borderRadius: radius.control, overflow: 'hidden', backgroundColor: colors.panel },
  albumCover: { aspectRatio: 1.4 },
  albumPhoto: { width: '100%', height: '100%' },
  albumText: { padding: space.sm, gap: 2 },
  filters: { justifyContent: 'space-between' },
});
