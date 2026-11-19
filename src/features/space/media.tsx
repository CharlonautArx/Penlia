import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import { Image, type ImageStyle, Platform, type StyleProp, View, type ViewStyle } from 'react-native';

import { spaceSamplePhoto } from '../../demo/visuals';
import { colors } from '../../theme';
import { localId } from '../local/document';
import type { Photo } from './model';

const maxBytes = 8 * 1024 * 1024;

function imageDirectory() {
  return new Directory(Paths.document, 'penlia-space-media');
}

function mediaStore<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    const open = indexedDB.open('penlia-space-media', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('photos');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const trans = db.transaction('photos', mode);
      const request = action(trans.objectStore('photos'));
      trans.oncomplete = () => { db.close(); resolve(request.result); };
      trans.onabort = () => { db.close(); reject(trans.error); };
    };
  });
}

export async function selectPhotos(account: string, remaining: number): Promise<Photo[]> {
  if (remaining < 1) return [];
  const picked = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'], allowsMultipleSelection: remaining > 1, selectionLimit: remaining, quality: 0.8,
  });
  if (picked.canceled) return [];
  const items = picked.assets.slice(0, remaining);
  if (items.some(({ fileSize, file }) => (fileSize ?? file?.size ?? 0) > maxBytes)) {
    throw new Error('请选择 8 MB 以内的照片。');
  }
  return Promise.all(items.map(async (asset) => {
    const suffix = /\.(jpg|jpeg|png|heic|webp|gif|avif)(?:\?|$)/i.exec(asset.uri)?.[1]?.toLowerCase() ?? 'jpg';
    const id = account.replace(/[^a-z\d_-]/gi, '') + '-' + localId() + '.' + suffix;
    if (Platform.OS === 'web') {
      if (!asset.file && !/^(blob:|data:image\/)/.test(asset.uri)) throw new Error('无法读取选中的图片。');
      const blob = asset.file ?? await (await fetch(asset.uri)).blob();
      if (blob.size > maxBytes || !blob.type.startsWith('image/')) throw new Error('请选择 8 MB 以内的照片。');
      await mediaStore('readwrite', (store) => store.put(blob, id));
    } else {
      const directory = imageDirectory();
      directory.create({ intermediates: true, idempotent: true });
      const source = new File(asset.uri);
      if (source.size > maxBytes) throw new Error('请选择 8 MB 以内的照片。');
      source.copy(new File(directory, id));
    }
    return { type: 'local', id };
  }));
}

export function SpacePhoto({ photo, style, label = '照片' }: {
  photo?: Photo; style: StyleProp<ImageStyle>; label?: string;
}) {
  const localFile = photo?.type === 'local' && /^[a-z\d_-]+\.[a-z]+$/i.test(photo.id) ? photo.id : undefined;
  const [webFile, setWebFile] = useState<{ id: string; uri: string }>();
  useEffect(() => {
    if (Platform.OS !== 'web' || !localFile) return;
    let active = true;
    let url: string | undefined;
    void mediaStore<Blob | undefined>('readonly', (store) => store.get(localFile)).then((blob) => {
      if (!active || !blob) return;
      url = URL.createObjectURL(blob);
      setWebFile({ id: localFile, uri: url });
    }).catch(() => {});
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [localFile]);
  const uri = localFile && (Platform.OS === 'web'
    ? (webFile?.id === localFile ? webFile.uri : undefined) : new File(imageDirectory(), localFile).uri);
  const source = photo?.type === 'sample' ? spaceSamplePhoto(photo.id) : uri ? { uri } : undefined;
  return source ? <Image accessibilityLabel={label} accessible source={source} style={style} resizeMode="cover" />
    : <View style={[{ backgroundColor: colors.lavender }, style as StyleProp<ViewStyle>]} />;
}
