import { momentPhotoGrid } from './photo-grid';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import type { MessageLongPress } from '../chat/record-model';
import { randomUUID } from 'expo-crypto';
import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useMemo, useState } from 'react';
import { Image, Platform, Pressable, Text, View } from 'react-native';
import { Icon } from '../../components/ui';
import { lifeDemoImages } from '../../demo/life-assets';
import { isUiDemo } from '../../demo/mode';
import { apiOrigin } from '../../services/api';
import { spaceSamplePhoto } from '../../demo/visuals';
import { useSession } from '../../services/session';
import { colors, fixed, radius, space, styles } from '../../theme';
import { MediaViewer, MediaViewerMessage, viewerStyles } from '../../components/MediaViewer';
import { pickPhotos, preparePhoto } from '../media/picker';
import { nativePhotoUri, readLocalPhoto, removeSpaceMedia, saveSpaceMedia, useLocalPhotoUri } from '../space/media';

export type Media = { id: string; mime: 'image/jpeg' | 'image/png' | 'video/mp4'; demoAsset?: string; demoUri?: string; thumbnail?: boolean; demoThumbnail?: string };
export type LocalMedia =
  | { id: string; mime: 'image/jpeg'; photoId: string; thumbnailId?: string }
  | { id: string; mime: 'video/mp4'; uri?: string; videoId?: string; bytes: number; duration?: number };
export type EditorMedia = LocalMedia | (Media & { published: true });
const maxVideo = 4 * 1024 * 1024;

export async function chooseMomentPhotos(owner: string, limit: number, thumbnails = false) {
  const inputs = await pickPhotos(limit);
  const assets: LocalMedia[] = [];
  try {
    for (const input of inputs) {
      const photo = await preparePhoto(input, owner);
      const asset: Extract<LocalMedia, { mime: 'image/jpeg' }> = { id: randomUUID(), mime: 'image/jpeg', photoId: photo.id };
      assets.push(asset);
      if (thumbnails) {
        const context = ImageManipulator.manipulate(input.uri);
        try {
          const longest = Math.max(input.width, input.height);
          if (longest > 400) context.resize(input.width >= input.height ? { width: 400 } : { height: 400 });
          const image = await context.renderAsync();
          try {
            const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.55 });
            const bytes = Platform.OS === 'web' ? (await (await fetch(saved.uri)).blob()).size : new File(saved.uri).size;
            if (bytes <= 98304) asset.thumbnailId = await saveSpaceMedia(saved.uri, owner, 'image/jpeg');
          } finally { image.release(); }
        } finally { context.release(); }
      }
    }
  } catch (error) {
    await Promise.allSettled(assets.map(removeMomentDraftMedia));
    throw error;
  }
  return assets;
}

export async function chooseMomentVideo(): Promise<(Extract<LocalMedia,{mime:'video/mp4'}> & { uri: string }) | undefined> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['videos'],
    selectionLimit: 1,
    exif: false,
    videoMaxDuration: 30,
  });
  if (result.canceled) return;
  const asset = result.assets[0];
  if (!asset) return;
  const size =
    asset.fileSize ??
    asset.file?.size ??
    (Platform.OS === 'web' ? (await (await fetch(asset.uri)).blob()).size : new File(asset.uri).size);
  if (
    !size ||
    size > maxVideo ||
    (asset.duration && asset.duration > 30_000) ||
    (asset.mimeType && asset.mimeType !== 'video/mp4')
  ) {
    throw new Error('请选择 4 MB、30 秒以内的 MP4 视频。');
  }
  return { id: randomUUID(), mime: 'video/mp4', uri: asset.uri, bytes:size, duration:asset.duration?asset.duration/1000:undefined };
}

export async function chooseMomentDraftVideo(owner: string) {
  const video = await chooseMomentVideo();
  if (!video?.uri) return undefined;
  const videoId = await saveSpaceMedia(video.uri, owner, 'video/mp4');
  return { ...video, videoId, uri: undefined };
}

export async function removeMomentDraftMedia(media: LocalMedia) {
  await Promise.all(media.mime === 'image/jpeg'
    ? [removeSpaceMedia(media.photoId), removeSpaceMedia(media.thumbnailId)]
    : [removeSpaceMedia(media.videoId)]);
}

async function assetBase64(localId?: string, temporaryUri?: string) {
  const uri = temporaryUri ?? (localId && nativePhotoUri(localId));
  if (Platform.OS !== 'web') {
    if (!uri) throw new Error('媒体文件已失效，请重新选择。');
    return new File(uri).base64();
  }
  const blob = localId ? await readLocalPhoto(localId) : uri ? await (await fetch(uri)).blob() : undefined;
  if (!blob) throw new Error('媒体文件已失效，请重新选择。');
  return base64Of(blob);
}

export async function encodeMomentMedia(media: LocalMedia) {
  const photo = media.mime === 'image/jpeg';
  const base64 = await assetBase64(photo ? media.photoId : media.videoId, photo ? undefined : media.uri);
  const thumbnail = photo && media.thumbnailId ? await assetBase64(media.thumbnailId) : undefined;
  return { clientId: media.id, mime: media.mime, base64, thumbnail };
}

function base64Of(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('无法读取媒体，请重试。'));
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.readAsDataURL(blob);
  });
}

function useProtectedSource(id: string, enabled = true, reviewId?:string, thumbnail = false, boundaryId?: string) {
  const token = useSession().session?.token;
  const [cached, setCached] = useState<{ source: string; token: string; uri: string }>();
  const [problem, setProblem] = useState('');
  const uri = useMemo(() => {
    if (isUiDemo || !enabled || !token) return undefined;
    try {
      return apiOrigin() + (boundaryId ? '/v1/p1/boundary-media/' + encodeURIComponent(boundaryId) + '/' : reviewId ? '/v1/p1/review-media/' + encodeURIComponent(reviewId) + '/' : '/v1/moment-media/')
        + encodeURIComponent(id) + (thumbnail ? '?size=thumb' : '');
    } catch {
      return undefined;
    }
  }, [id, token, enabled, reviewId, thumbnail, boundaryId]);
  useEffect(() => {
    if (Platform.OS !== 'web' || !uri || !token) return;
    let active = true,
      blobUri: string | undefined;
    const abort = new AbortController();
    setProblem('');
    void fetch(uri, { headers: { Authorization: 'Bearer ' + token }, cache: 'no-store', signal: abort.signal })
      .then((response) => {
        if (!response.ok) throw new Error();
        return response.blob();
      })
      .then((blob) => {
        if (!active) return;
        blobUri = URL.createObjectURL(blob);
        setCached({ source:uri, token, uri: blobUri });
      })
      .catch(() => {
        if (active) setProblem('媒体暂不可访问。');
      });
    return () => {
      active = false;
      abort.abort();
      if (blobUri) URL.revokeObjectURL(blobUri);
    };
  }, [id, token, uri]);
  return {
    problem,
    source:
      Platform.OS === 'web'
        ? cached && cached.source === uri && cached.token === token
          ? { uri: cached.uri }
          : undefined
        : uri && token
          ? { uri, headers: { Authorization: 'Bearer ' + token }, cache: 'reload' as const }
          : undefined,
  };
}

export function MomentMediaTile({ item, context = 'moment', reviewId, ratio, onLongPress, more, index, onMore, boundaryId }: {
  item: Media; context?: 'moment' | 'chat'; reviewId?: string; boundaryId?: string; ratio?: number; onLongPress?: MessageLongPress; more?: number; index?: number; onMore?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const [viewerFailed, setViewerFailed] = useState(false);
  const video = item.mime === 'video/mp4';
  const { source, problem } = useProtectedSource(item.id, !video, reviewId, !!item.thumbnail, boundaryId);
  const full = useProtectedSource(item.id, open && (video || !!item.thumbnail), reviewId, false, boundaryId);
  const openedSource = item.thumbnail || video ? full.source : source;
  const viewProblem = item.thumbnail || video ? full.problem : problem;
  const original = isUiDemo && item.demoUri ? { uri: item.demoUri } : openedSource;
  const displaySource = isUiDemo && item.demoUri ? { uri: item.demoUri } : source;
  const sample = isUiDemo && item.demoAsset ? lifeDemoImages[item.demoAsset] : undefined;
  const photoSource = sample ?? (isUiDemo && item.demoThumbnail ? { uri: item.demoThumbnail } : displaySource);
  const viewSource = sample ?? original;
  return <>
    <Pressable accessibilityRole="button"
      accessibilityLabel={more ? '查看全部照片，另有 ' + (more - 1) + ' 张' : index ? '查看动态照片 ' + index : (reviewId || boundaryId) ? '查看举报附件' : video ? '播放短视频' : context === 'chat' ? '查看聊天图片' : '查看动态照片'}
      onPress={more && onMore ? onMore : () => { setViewerFailed(false); setOpen(true); }} onLongPress={onLongPress}
      style={({ pressed }) => [{ height: ratio ? undefined : 140, aspectRatio: ratio, width: ratio ? '100%' : undefined,
        flexGrow: ratio ? 0 : 1, minWidth: ratio ? 0 : 100, overflow: 'hidden', opacity: pressed ? 0.84 : 1,
        borderRadius: ratio ? radius.small : radius.control, backgroundColor: video ? colors.lavender : colors.search,
        justifyContent: 'center', alignItems: 'center', gap: space.xs }]}>
      {video ? <>
        <Icon name="play-circle-outline" size={37} color={colors.accent} />
        <Text style={styles.muted}>短视频</Text>
      </> : photoSource && !failed ? (
        <Image source={photoSource} style={{ width: '100%', height: '100%' }} resizeMode="cover" resizeMethod="resize"
          onError={() => setFailed(true)} />
      ) : <Text style={styles.small}>{problem || (failed ? '照片暂不可访问' : '正在载入照片…')}</Text>}
      {!!more && <View pointerEvents="none" style={{ position:'absolute', inset: 0, backgroundColor:'#00000080',
        alignItems:'center', justifyContent:'center' }}><Text style={[styles.strong,{ color:'#FFFFFF', fontSize:24 }]}>+{more}</Text></View>}
    </Pressable>
    {open && <MediaViewer title={reviewId ? '举报附件' : video ? '短视频' : '图片预览'} onClose={() => setOpen(false)}>
      {viewerFailed || viewProblem ? <MediaViewerMessage>{viewProblem || '暂时无法显示该媒体。'}</MediaViewerMessage>
        : !(video ? original : viewSource) ? <MediaViewerMessage busy>正在加载媒体…</MediaViewerMessage>
        : video ? original && <MomentVideo source={original} immersive />
        : <Image source={viewSource} accessibilityLabel="原图预览" resizeMode="contain" style={viewerStyles.photo}
          onError={() => setViewerFailed(true)} />}
    </MediaViewer>}
  </>;
}

export function MomentMediaGrid({ media, mode, onMore }: { media: Media[]; mode?: 'feed' | 'detail'; onMore?: () => void }) {
  if (mode && media.length > 1 && media.every(({ mime }) => mime !== 'video/mp4')) {
    const { rows, more } = momentPhotoGrid(media, mode === 'detail');
    return <View style={{ gap: space.xxs }}>{rows.map((row, rowIndex) => (
      <View key={row[0].id} style={{ flexDirection: 'row', gap: space.xxs }}>
        {row.map((item, colIndex) => {
          const index = rowIndex * 3 + colIndex + 1;
          return <View key={item.id} style={styles.grow}>
            <MomentMediaTile item={item} ratio={1} index={index} more={index === 9 ? more : 0} onMore={onMore} />
          </View>;
        })}
        {Array.from({ length: 3 - row.length }, (_, index) => <View key={index} style={styles.grow} />)}
      </View>
    ))}</View>;
  }
  const full = media.length % 2 === 1;
  const remaining = full ? media.slice(1) : media;
  return <View style={{ gap: space.xxs }}>
    {full && <MomentMediaTile item={media[0]} ratio={media[0].mime === 'video/mp4' ? 16 / 9 : 4 / 3} />}
    {Array.from({ length: Math.ceil(remaining.length / 2) }, (_, row) => {
      const items = remaining.slice(row * 2, row * 2 + 2);
      return <View key={items[0].id} style={{ flexDirection: 'row', gap: space.xxs }}>
        {items.map((item) => <View key={item.id} style={styles.grow}><MomentMediaTile item={item} ratio={1} /></View>)}
      </View>;
    })}
  </View>;
}

export function MomentVideo({ source, immersive = false }: { source: { uri: string; headers?: Record<string, string> }; immersive?: boolean }) {
  const videoSource = useMemo(() => source, [source.uri, source.headers?.Authorization]);
  const player = useVideoPlayer(videoSource, (controller) => {
    controller.play();
  });
  return (
    <VideoView
      player={player}
      style={immersive ? viewerStyles.photo : { width: '100%', height: 360, backgroundColor: fixed.lens, borderRadius: radius.control }}
      nativeControls
      fullscreenOptions={{ enable: true }}
      allowsPictureInPicture={false}
    />
  );
}

export function DraftMediaTile({ item }: { item: LocalMedia }) {
  const photo = useLocalPhotoUri('photoId' in item ? item.photoId : undefined);
  return photo ? <Image source={{ uri: photo }} style={{ width: 72, height: 72, borderRadius: radius.small }}
    accessibilityLabel="待发布照片" />
    : <Text style={styles.muted}>{item.mime === 'video/mp4' ? '已选择 MP4 视频' : '照片处理中'}</Text>;
}

function useEditorSource(item: EditorMedia, thumbnail: boolean) {
  const published = 'published' in item;
  const photo = !published && item.mime === 'image/jpeg' ? item : undefined;
  const video = !published && item.mime === 'video/mp4' ? item : undefined;
  const local = useLocalPhotoUri(photo?.photoId ?? video?.videoId);
  const small = useLocalPhotoUri(thumbnail ? photo?.thumbnailId : undefined);
  const protectedFile = useProtectedSource(item.id, published && !(thumbnail && item.mime === 'video/mp4'),
    undefined, thumbnail && published && !!item.thumbnail);
  const sample = published && item.demoAsset ? lifeDemoImages[item.demoAsset] ?? spaceSamplePhoto(item.demoAsset) : undefined;
  const uri = published ? (thumbnail && item.demoThumbnail ? item.demoThumbnail : item.demoUri) : small ?? local ?? video?.uri;
  const uriSource = uri ? { uri } : protectedFile.source;
  return { source: sample ?? uriSource, uriSource, problem: protectedFile.problem };
}

export function EditorMediaThumbnail({ item }: { item: EditorMedia }) {
  const { source, problem } = useEditorSource(item, true);
  const [failed, setFailed] = useState(false);
  return item.mime === 'video/mp4' ? <>
    <Icon name="play-circle-outline" size={29} color={colors.accent} />
    <Text style={styles.small}>短视频</Text>
  </> : source && !failed ?
    <Image source={source} style={{ width: '100%', height: '100%' }} resizeMode="cover" resizeMethod="resize" onError={() => setFailed(true)} />
    : <Text style={styles.small}>{failed || problem ? '照片暂不可访问' : '正在加载…'}</Text>;
}

export function EditorMediaPreview({ item, close }: { item: EditorMedia; close: () => void }) {
  const { source, uriSource, problem } = useEditorSource(item, false);
  const [failed, setFailed] = useState(false);
  const video = item.mime === 'video/mp4';
  return <MediaViewer title={video ? '短视频' : '图片预览'} onClose={close}>
    {failed || problem ? <MediaViewerMessage>媒体暂不可访问。</MediaViewerMessage>
      : !source || (video && !uriSource) ? <MediaViewerMessage busy>正在加载媒体…</MediaViewerMessage>
      : video && uriSource ? <MomentVideo source={uriSource} immersive />
      : <Image source={source} accessibilityLabel="原图预览" resizeMode="contain" style={viewerStyles.photo}
        onError={() => setFailed(true)} />}
  </MediaViewer>;
}
