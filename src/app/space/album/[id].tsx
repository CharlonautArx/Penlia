import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Empty, IconButton, Notice, Screen, Section, Sheet } from '../../../components/ui';
import { selectPhotos, SpacePhoto } from '../../../features/space/media';
import { useSpace } from '../../../features/space/store';
import { colors, styles } from '../../../theme';

export default function AlbumScreen() {
  const { id, viewer } = useLocalSearchParams<{ id: string; viewer?: string }>();
  const state = useSpace();
  const album = state.value?.albums.find((item) => item.id === id && state.albumVisible(item, viewer));
  const own = !!album && !viewer && state.owns(album.ownerId);
  const [photoIndex, setPhotoIndex] = useState<number>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!album || !state.me || !own || busy) return;
    setBusy(true); setError('');
    try {
      const added = await selectPhotos(state.me.id, Math.min(6, 30 - album.photos.length));
      if (!added.length) return;
      state.update((data) => ({ ...data, albums: data.albums.map((item) => item.id === id && state.owns(item.ownerId)
        ? { ...item, photos: [...item.photos, ...added].slice(0, 30) } : item) }));
    } catch { setError('暂时无法读取照片，请重试。'); }
    finally { setBusy(false); }
  }

  return <Screen title={album?.title ?? '相册'} back={() => router.canGoBack() ? router.back() : router.replace('/moments')}
    actions={own && <IconButton label="添加相册照片" icon="add-outline" tinted disabled={busy || album!.photos.length >= 30}
      onPress={() => void add()} />}>
    {!!(error || state.error) && <Notice>{error || state.error}</Notice>}
    {album ? <>
      <Section title={album.theme} detail={album.photos.length + ' 张 · 本机相册'} />
      {album.photos.length ? <View style={local.grid}>
        {album.photos.map((photo, index) => <Pressable key={photo.id + index} style={local.frame}
          accessibilityRole="button" accessibilityLabel={'查看相册照片 ' + (index + 1)} onPress={() => setPhotoIndex(index)}>
          <SpacePhoto photo={photo} style={local.photo} />
          {album.cover === index && <Text style={local.cover}>封面</Text>}
        </Pressable>)}
      </View> : <Empty icon="images-outline">相册还是空的，留点照片吧。</Empty>}
      {photoIndex !== undefined && album.photos[photoIndex] && <Sheet title={`照片 ${photoIndex + 1} / ${album.photos.length}`}
        onClose={() => setPhotoIndex(undefined)}>
        <SpacePhoto photo={album.photos[photoIndex]} style={local.large} />
        {own && album.cover !== photoIndex && <Button label="设为封面" variant="gradient" onPress={() => {
          state.update((data) => ({ ...data, albums: data.albums.map((item) => item.id === album.id
            && state.owns(item.ownerId) ? { ...item, cover: photoIndex } : item) }));
          setPhotoIndex(undefined);
        }} />}
      </Sheet>}
    </> : <Empty busy={state.loading} icon="images-outline">{state.loading ? '正在读取相册…' : '这个相册当前不可见。'}</Empty>}
  </Screen>;
}

const local = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  frame: { width: '48%', aspectRatio: 1, borderRadius: 11, overflow: 'hidden', backgroundColor: colors.lavender },
  photo: { width: '100%', height: '100%' },
  cover: { ...styles.small, position: 'absolute', left: 5, bottom: 5, paddingHorizontal: 5, paddingVertical: 2,
    overflow: 'hidden', borderRadius: 5, backgroundColor: '#272033BE', color: '#FFFFFF' },
  large: { width: '100%', aspectRatio: 1, borderRadius: 12 },
});
