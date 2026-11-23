import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { GestureDetector, GestureHandlerRootView, usePanGesture } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { Button, Empty, Icon, IconButton, ListRow, Notice, Screen, Section, Sheet } from '../../../components/ui';
import { moveAlbumPhoto, movePosition, removeAlbumPhotos } from '../../../features/space/album-order';
import { selectPhotos, SpacePhoto } from '../../../features/space/media';
import { type Album, type Photo } from '../../../features/space/model';
import { useSpace } from '../../../features/space/store';
import { colors, styles } from '../../../theme';

const gap = 7;

export default function AlbumScreen() {
  const { id, viewer } = useLocalSearchParams<{ id: string; viewer?: string }>();
  const state = useSpace();
  const album = state.value?.albums.find((item) => item.id === id && state.albumVisible(item, viewer));
  const own = !!album && !viewer && state.owns(album.ownerId);
  const [photoIndex, setPhotoIndex] = useState<number>();
  const [panel, setPanel] = useState<'menu' | 'rename' | 'deleteAlbum' | 'deletePhotos'>();
  const [managing, setManaging] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [name, setName] = useState('');
  const [width, setWidth] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const active = useSharedValue(-1);
  const target = useSharedValue(-1);
  const back = () => router.canGoBack() ? router.back() : router.replace({ pathname: '/moments', params: { pane: 'albums' } });

  async function run(operation: () => Promise<void>) {
    if (!album || !own || lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try { await operation(); }
    catch { setError('保存或读取失败，请重试。'); }
    finally { lock.current = false; setBusy(false); }
  }

  function save(change: (value: Album) => Album | null, checkPhotos = false) {
    return state.save((data) => ({ ...data, albums: data.albums.flatMap((item) => {
      if (item.id !== id || !state.owns(item.ownerId)) return [item];
      if (checkPhotos && (item.photos.length !== album?.photos.length ||
        item.photos.some((photo, index) => photo !== album?.photos[index]))) throw new Error('相册已更新');
      return change(item) ?? [];
    }) }));
  }

  function move(from: number, to: number) {
    if (from === to) return;
    void run(async () => {
      await save((item) => moveAlbumPhoto(item, from, to), true);
      setSelected((current) => new Set([...current].map((index) => movePosition(index, from, to))));
    });
  }

  function choose(index: number) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  const size = Math.max(0, Math.floor((width - gap * 2) / 3));
  return <GestureHandlerRootView style={styles.grow}>
    <Screen title={album?.title ?? '相册'} back={back} actions={own && (managing ?
      <Button label="完成" variant="quiet" disabled={busy} onPress={() => { setManaging(false); setSelected(new Set()); }} /> : <>
      <IconButton label="相册菜单" icon="ellipsis-vertical" disabled={busy} onPress={() => setPanel('menu')} />
      <IconButton label="添加相册照片" icon="add-outline" disabled={busy || album!.photos.length >= 30}
        onPress={() => void run(async () => {
          const added = await selectPhotos(state.me!.id, Math.min(6, 30 - album!.photos.length));
          if (added.length) await save((item) => ({ ...item, photos: [...item.photos, ...added].slice(0, 30) }));
        })} />
    </>)}>
      {!!(error || state.error) && <Notice>{error || state.error}</Notice>}
      {album ? <>
        <Section title={album.theme} detail={album.photos.length + ' 张 · 本机相册'} />
        {own && managing && <View style={styles.row}>
          <Text style={[styles.muted, styles.grow]}>已选 {selected.size} 张 · 按住拖动排序</Text>
          <Button label="删除选中照片" variant="danger" disabled={!selected.size || busy} onPress={() => setPanel('deletePhotos')} />
        </View>}
        {album.photos.length ? <View style={local.grid} onLayout={({ nativeEvent }) => setWidth(nativeEvent.layout.width)}>
          {size > 0 && album.photos.map((photo, index) => <AlbumTile key={index} {...{
            photo, index, size, active, target, move, managing: own && managing, busy,
            count: album.photos.length, checked: selected.has(index), cover: album.cover === index,
            onPress: () => managing ? choose(index) : setPhotoIndex(index),
            onLongPress: own ? () => { if (!managing) { setManaging(true); setSelected(new Set([index])); } } : undefined,
          }} />)}
        </View> : <Empty icon="images-outline">相册还是空的，留点照片吧。</Empty>}
        {photoIndex !== undefined && album.photos[photoIndex] && <Sheet title={`照片 ${photoIndex + 1} / ${album.photos.length}`}
          onClose={() => setPhotoIndex(undefined)}>
          <SpacePhoto photo={album.photos[photoIndex]} style={local.large} />
          {own && album.cover !== photoIndex && <Button label="设为封面" variant="gradient" disabled={busy} onPress={() => void run(async () => {
            await save((item) => ({ ...item, cover: photoIndex }), true);
            setPhotoIndex(undefined);
          })} />}
        </Sheet>}
        {own && panel === 'menu' && <Sheet title="相册菜单" onClose={() => setPanel(undefined)}>
          <ListRow title="修改相册名" onPress={() => { setName(album.title); setPanel('rename'); }} />
          <ListRow title="删除相册" onPress={() => setPanel('deleteAlbum')} separator={false} />
        </Sheet>}
        {own && panel === 'rename' && <Sheet title="修改相册名" avoidKeyboard onClose={() => { if (!busy) setPanel(undefined); }}>
          <TextInput accessibilityLabel="相册名称" value={name} onChangeText={setName}
            maxLength={26} editable={!busy} style={styles.input} />
          {!!error && <Notice>{error}</Notice>}
          <Button label="保存相册名" disabled={busy || !name.trim()} onPress={() => void run(async () => {
            await save((item) => ({ ...item, title: name.trim() }));
            setPanel(undefined);
          })} />
        </Sheet>}
        {own && (panel === 'deleteAlbum' || panel === 'deletePhotos') && <Sheet
          title={panel === 'deleteAlbum' ? '删除相册' : '删除选中照片'} onClose={() => { if (!busy) setPanel(undefined); }}>
          <Text style={styles.muted}>{panel === 'deleteAlbum' ? `确认删除「${album.title}」及其中的相册记录？`
            : `确认从此相册移除选中的 ${selected.size} 张照片？`}</Text>
          {!!error && <Notice>{error}</Notice>}
          <Button label={panel === 'deleteAlbum' ? '确认删除相册' : '确认删除照片'} variant="danger" disabled={busy}
            onPress={() => void run(async () => {
              if (panel === 'deleteAlbum') { await save(() => null); back(); }
              else { await save((item) => removeAlbumPhotos(item, selected), true); setSelected(new Set()); setPanel(undefined); }
            })} />
        </Sheet>}
      </> : <Empty busy={state.loading} icon="images-outline">{state.loading ? '正在读取相册…' : '这个相册当前不可见。'}</Empty>}
    </Screen>
  </GestureHandlerRootView>;
}

function AlbumTile({ photo, index, size, count, active, target, move, managing, busy, checked, cover, onPress, onLongPress }: {
  photo: Photo; index: number; size: number; count: number; active: SharedValue<number>; target: SharedValue<number>;
  move: (from: number, to: number) => void; managing: boolean; busy: boolean; checked: boolean; cover: boolean;
  onPress: () => void; onLongPress?: () => void;
}) {
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const step = size + gap;
  const pan = usePanGesture({
    enabled: managing && !busy, activateAfterLongPress: 240, maxPointers: 1,
    onActivate: () => { 'worklet'; active.value = index; target.value = index; },
    onUpdate: (event) => {
      'worklet';
      x.value = event.translationX; y.value = event.translationY;
      const col = Math.max(0, Math.min(2, index % 3 + Math.round(x.value / step)));
      const row = Math.max(0, Math.floor(index / 3) + Math.round(y.value / step));
      target.value = Math.min(count - 1, row * 3 + col);
    },
    onDeactivate: (event) => {
      'worklet';
      const to = target.value;
      active.value = -1; target.value = -1;
      x.value = 0; y.value = 0;
      if (!event.canceled && to !== index) scheduleOnRN(move, index, to);
    },
  });
  const animated = useAnimatedStyle(() => {
    const held = active.value === index;
    const next = active.value < 0 || held ? index : movePosition(index, active.value, target.value);
    const tx = (next % 3 - index % 3) * step;
    const ty = (Math.floor(next / 3) - Math.floor(index / 3)) * step;
    return { zIndex: held ? 2 : 0, transform: [
      { translateX: held ? x.value : withTiming(tx, { duration: 130 }) },
      { translateY: held ? y.value : withTiming(ty, { duration: 130 }) },
    ] };
  });
  return <GestureDetector gesture={pan}>
    <Animated.View collapsable={false} style={[{ width: size, height: size }, animated]}>
      <Pressable style={local.frame} accessibilityRole={managing ? 'checkbox' : 'button'}
        accessibilityState={managing ? { checked } : undefined} disabled={busy}
        accessibilityLabel={(managing ? '选择照片 ' : '查看相册照片 ') + (index + 1)}
        accessibilityActions={managing ? [
          ...(index > 0 ? [{ name: 'earlier', label: '向前移动照片' }] : []),
          ...(index + 1 < count ? [{ name: 'later', label: '向后移动照片' }] : []),
        ] : undefined}
        onAccessibilityAction={({ nativeEvent }) => {
          if (nativeEvent.actionName === 'earlier') move(index, index - 1);
          if (nativeEvent.actionName === 'later') move(index, index + 1);
        }} onPress={onPress} onLongPress={managing ? undefined : onLongPress} delayLongPress={330}>
        <SpacePhoto photo={photo} style={local.photo} />
        {cover && <Text style={local.cover}>封面</Text>}
        {managing && <View style={[local.check, checked && local.checked]} pointerEvents="none">
          {checked && <Icon name="checkmark" color="#FFFFFF" size={14} />}
        </View>}
      </Pressable>
    </Animated.View>
  </GestureDetector>;
}

const local = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap },
  frame: { flex: 1, borderRadius: 11, overflow: 'hidden', backgroundColor: colors.lavender },
  photo: { width: '100%', height: '100%' },
  cover: { ...styles.small, position: 'absolute', left: 5, bottom: 5, paddingHorizontal: 5, paddingVertical: 2,
    overflow: 'hidden', borderRadius: 5, backgroundColor: '#272033BE', color: '#FFFFFF' },
  check: { width: 22, height: 22, position: 'absolute', top: 6, right: 6, borderWidth: 2, borderColor: '#FFFFFF',
    backgroundColor: '#28243155', borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  checked: { backgroundColor: '#514655' },
  large: { width: '100%', aspectRatio: 1, borderRadius: 12 },
});
