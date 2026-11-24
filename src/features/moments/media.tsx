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
import { useSession } from '../../services/session';
import { colors, fixed, radius, space, styles } from '../../theme';
import { MediaViewer, MediaViewerMessage, viewerStyles } from '../../components/MediaViewer';
import { pickPhotos, preparePhoto } from '../media/picker';
import { nativePhotoUri, useLocalPhotoUri } from '../space/media';

export type Media = { id: string; mime: 'image/jpeg' | 'image/png' | 'video/mp4'; demoAsset?: string; demoUri?: string };
export type LocalMedia =
  | { id: string; mime: 'image/jpeg'; photoId: string }
  | { id: string; mime: 'video/mp4'; uri: string; bytes: number; duration?: number };
const maxVideo = 4 * 1024 * 1024;

export async function chooseMomentPhotos(owner: string, limit: number) {
  const inputs = await pickPhotos(limit);
  const assets: LocalMedia[] = [];
  for (const input of inputs) {
    const photo = await preparePhoto(input, owner);
    assets.push({ id: randomUUID(), mime: 'image/jpeg', photoId: photo.id });
  }
  return assets;
}

export async function chooseMomentVideo(): Promise<Extract<LocalMedia,{mime:'video/mp4'}> | undefined> {
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

export async function encodeMomentMedia(media: LocalMedia) {
  let uri = 'uri' in media ? media.uri : nativePhotoUri(media.photoId);
  if (Platform.OS !== 'web') {
    if (!uri) throw new Error('媒体文件已失效，请重新选择。');
    return { clientId: media.id, mime: media.mime, base64: await new File(uri).base64() };
  }
  if (!uri && 'photoId' in media) {
    const { readLocalPhoto } = await import('../space/media');
    const original = await readLocalPhoto(media.photoId);
    if (!original) throw new Error('图片文件已失效，请重新选择。');
    return { clientId: media.id, mime: media.mime, base64: await base64Of(original) };
  }
  if (!uri) throw new Error('媒体文件已失效，请重新选择。');
  const blob = await (await fetch(uri)).blob();
  return { clientId: media.id, mime: media.mime, base64: await base64Of(blob) };
}

function base64Of(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('无法读取媒体，请重试。'));
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.readAsDataURL(blob);
  });
}

function useProtectedSource(id: string, enabled = true, reviewId?:string) {
  const token = useSession().session?.token;
  const [cached, setCached] = useState<{ source: string; token: string; uri: string }>();
  const [problem, setProblem] = useState('');
  const uri = useMemo(() => {
    if (isUiDemo || !enabled || !token) return undefined;
    try {
      return apiOrigin() + (reviewId ? '/v1/p1/review-media/' + encodeURIComponent(reviewId) + '/' : '/v1/moment-media/')
        + encodeURIComponent(id);
    } catch {
      return undefined;
    }
  }, [id, token, enabled, reviewId]);
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

export function MomentMediaTile({ item, context = 'moment', reviewId, ratio, onLongPress }: {
  item: Media; context?: 'moment' | 'chat'; reviewId?: string; ratio?: number; onLongPress?: MessageLongPress;
}) {
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const video = item.mime === 'video/mp4';
  const { source, problem } = useProtectedSource(item.id, !video || open, reviewId);
  const displaySource = isUiDemo && item.demoUri ? { uri: item.demoUri } : source;
  const photoSource = isUiDemo && item.demoAsset ? lifeDemoImages[item.demoAsset] : displaySource;
  return <>
    <Pressable accessibilityRole="button"
      accessibilityLabel={reviewId ? '查看举报附件' : video ? '播放短视频' : context === 'chat' ? '查看聊天图片' : '查看动态照片'}
      onPress={() => setOpen(true)} onLongPress={onLongPress}
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
    </Pressable>
    {open && <MediaViewer title={reviewId ? '举报附件' : video ? '短视频' : '图片预览'} onClose={() => setOpen(false)}>
      {failed || problem ? <MediaViewerMessage>{problem || '暂时无法显示该媒体。'}</MediaViewerMessage>
        : !(video ? displaySource : photoSource) ? <MediaViewerMessage busy>正在加载媒体…</MediaViewerMessage>
        : video ? displaySource && <MomentVideo source={displaySource} immersive />
        : <Image source={photoSource} accessibilityLabel="原图预览" resizeMode="contain" style={viewerStyles.photo}
          onError={() => setFailed(true)} />}
    </MediaViewer>}
  </>;
}

export function MomentMediaGrid({ media }: { media: Media[] }) {
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
  return photo ? (
    <Image
      source={{ uri: photo }}
      style={{ width: 72, height: 72, borderRadius: radius.small }}
      accessibilityLabel="待发布照片"
    />
  ) : (
    <Text style={styles.muted}>{item.mime === 'video/mp4' ? '已选择 MP4 视频' : '照片处理中'}</Text>
  );
}
