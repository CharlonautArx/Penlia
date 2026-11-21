import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button, Empty, Notice, Section, Sheet } from '../../components/ui';
import { colors, styles } from '../../theme';
import { localId } from '../local/document';
import { Chips } from '../play/Cards';
import { JournalLink } from './EntryCard';
import { SpacePhoto } from './media';
import { useSpace } from './store';

const albumThemes = ['全部', '日常', '旅行', '聚会', '其他'] as const;
export type AlbumTheme = typeof albumThemes[number];

export function SpaceCollections({ owner, viewer, pane, theme, onTheme }: {
  owner: string; viewer?: string; pane: 'journal' | 'albums';
  theme: AlbumTheme; onTheme: (value: AlbumTheme) => void;
}) {
  const state = useSpace();
  const [creating, setCreating] = useState(false);
  const mine = state.owns(owner) && !viewer;
  if (state.error) return <Notice action="重试" onAction={state.retry}>{state.error}</Notice>;
  if (state.loading || !state.value) return <Empty busy>正在读取空间…</Empty>;
  if (!state.spaceVisible(owner, viewer)) return <Empty icon="lock-closed-outline">这个空间当前不可访问。</Empty>;
  if (pane === 'journal') {
    const entries = state.value.entries.filter((entry) => entry.ownerId === owner && entry.kind === 'journal'
      && state.entryVisible(entry, viewer)).sort((a, b) => b.at - a.at);
    return <>
      <Section title="空间日志" detail={entries.length + ' 条'}>
        {mine && <Button label="写日志" icon="add-outline" variant="soft"
          onPress={() => router.push({ pathname: '/space/compose', params: { kind: 'journal' } })} />}
      </Section>
      {entries.map((entry) => <JournalLink key={entry.id} entry={entry} viewer={viewer} />)}
      {!entries.length && <Empty icon="book-outline">还没有可见的日志。</Empty>}
    </>;
  }
  const albums = state.value.albums.filter((album) => album.ownerId === owner && state.albumVisible(album, viewer)
    && (theme === '全部' || album.theme === theme));
  return <>
    <Section title="主题相册" detail={albums.length + ' 本'}>
      {mine && <Button label="新建相册" icon="add-outline" variant="soft" onPress={() => setCreating(true)} />}
    </Section>
    <Chips items={albumThemes} value={theme} onChange={onTheme} />
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
    {creating && mine && <NewAlbum onClose={() => setCreating(false)} />}
  </>;
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
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  album: { width: '48%', borderWidth: 1, borderColor: colors.border, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.panel },
  albumCover: { height: 124 },
  albumPhoto: { width: '100%', height: '100%' },
  albumText: { padding: 9, gap: 2 },
  wrap: { flexWrap: 'wrap', gap: 7 },
});
