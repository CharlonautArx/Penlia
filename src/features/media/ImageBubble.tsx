import type { MessageLongPress } from '../chat/record-model';
import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '../../components/ui';
import { MediaViewer, MediaViewerMessage, viewerStyles } from '../../components/MediaViewer';
import type { ImConnection } from '../../services/im';
import { colors, radius } from '../../theme';
import { useLocalPhotoUri } from '../space/media';
import { cachedAttachment, fetchAttachment, type ImageItem } from './messages';

export function ImageBubble({ item, connection, online, onDownloaded, onLongPress }: {
  item: ImageItem; connection: ImConnection | null; online: boolean; onDownloaded: () => void; onLongPress?: MessageLongPress;
}) {
  const localFile = useLocalPhotoUri(item.photoId);
  const [show, setShow] = useState(false);
  const [uri, setUri] = useState<string>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [thumbnailBroken, setThumbnailBroken] = useState(false);
  const full = localFile ?? uri ?? (connection && cachedAttachment(connection, item.source)) ?? undefined;
  const preview = full ?? (connection && cachedAttachment(connection, item.source, true)) ?? undefined;
  useEffect(() => { setThumbnailBroken(false); }, [preview]);

  async function download() {
    if (!item.source || !connection || !online) {
      setError('图片尚未保存在本机，请连接后再试。');
      return;
    }
    setBusy(true); setError('');
    try { setUri(await fetchAttachment(connection, item.source)); onDownloaded(); }
    catch { setError('图片下载失败，请检查网络后重试。'); }
    finally { setBusy(false); }
  }

  return <>
    <Pressable accessibilityRole="button" accessibilityLabel="查看大图" onLongPress={onLongPress} onPress={() => {
      setShow(true); setError('');
      if (!full && !item.photoId) void download();
    }} style={[local.preview, { aspectRatio: Math.max(0.7, Math.min(2, item.width / item.height)) }]}>
      {preview && !thumbnailBroken ? <Image source={{ uri: preview }} resizeMode="cover" style={local.fill}
        onError={() => setThumbnailBroken(true)} accessibilityLabel="聊天图片" /> : <View style={local.placeholder}><Icon name="image-outline" /></View>}
    </Pressable>
    {show && <MediaViewer title="图片预览" onClose={() => setShow(false)}>
      {!!full && <Image source={{ uri: full }} accessibilityLabel="原图预览" resizeMode="contain"
        style={viewerStyles.photo} onError={() => setError('图片暂时无法打开。')} />}
      {(!full || error) && <MediaViewerMessage busy={busy} retry={error && online && item.source ? () => void download() : undefined}>
        {error || (busy ? '正在读取图片…' : '这张图片还未保存到本机。')}
      </MediaViewerMessage>}
    </MediaViewer>}
  </>;
}

const local = StyleSheet.create({
  preview: { width: 190, maxWidth: '100%', overflow: 'hidden', borderRadius: radius.control },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.search },
  fill: { width: '100%', height: '100%' },
});
