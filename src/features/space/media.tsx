import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import { Image, type ImageStyle, Platform, type StyleProp, View, type ViewStyle } from 'react-native';

import { spaceSamplePhoto } from '../../demo/visuals';
import { colors } from '../../theme';
import { localId } from '../local/document';
import type { Photo } from './model';

const maxBytes = 8 * 1024 * 1024;
const durableMediaId = /^[a-z\d_-]+\.(?:[a-z]+|mp4)$/i;

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
      await source.copy(new File(directory, id));
    }
    return { type: 'local', id };
  }));
}

export function nativePhotoUri(id: string): string | undefined {
  if (Platform.OS === 'web' || !durableMediaId.test(id)) return undefined;
  try {
    const file = new File(imageDirectory(), id);
    return file.exists ? file.uri : undefined;
  } catch {
    return undefined;
  }
}

export async function savePreparedPhoto(uri: string, account: string, limit?: number): Promise<Photo> {
  return { type: 'local', id: await saveSpaceMedia(uri, account, 'image/jpeg', limit) };
}

export async function saveSpaceMedia(uri: string, account: string, mime: 'image/jpeg' | 'video/mp4', maxSize?: number) {
  const photo = mime === 'image/jpeg';
  const id = account.replace(/[^a-z\d_-]/gi, '') + '-' + localId() + (photo ? '.jpg' : '.mp4');
  const limit = maxSize ?? (photo ? maxBytes : 4 * 1024 * 1024);
  if (Platform.OS === 'web') {
    if (!uri.startsWith('blob:') && !uri.startsWith('data:' + mime + ';'))
      throw new Error('无法读取选中的附件。');
    const blob = await (await fetch(uri)).blob();
    if (!blob.size || blob.size > limit || (blob.type && blob.type !== mime)) throw new Error('附件格式或大小不受支持。');
    await mediaStore('readwrite', (store) => store.put(blob, id));
  } else {
    const directory = imageDirectory();
    directory.create({ intermediates: true, idempotent: true });
    const source = new File(uri);
    if (!source.exists || !source.size || source.size > limit) throw new Error('附件过大或文件已失效。');
    source.copy(new File(directory, id));
  }
  return id;
}

export async function removeSpaceMedia(id?: string) {
  if (!id || !/^[a-z\d_-]+\.(jpg|mp4)$/i.test(id)) return;
  if (Platform.OS === 'web') await mediaStore('readwrite', (store) => store.delete(id));
  else {
    const file = new File(imageDirectory(), id);
    if (file.exists) file.delete();
  }
}

export function useLocalPhotoUri(localFile?: string) {
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
  return localFile && (Platform.OS === 'web'
    ? (webFile?.id === localFile ? webFile.uri : undefined) : nativePhotoUri(localFile));
}

export function SpacePhoto({ photo, style, label = '照片', resizeMode = 'cover' }: {
  photo?: Photo; style: StyleProp<ImageStyle>; label?: string; resizeMode?: 'cover' | 'contain';
}) {
  const localFile = photo?.type === 'local' && /^[a-z\d_-]+\.[a-z]+$/i.test(photo.id) ? photo.id : undefined;
  const uri = useLocalPhotoUri(localFile);
  const source = photo?.type === 'sample' ? spaceSamplePhoto(photo.id) : uri ? { uri } : undefined;
  return source ? <Image accessibilityLabel={label} accessible source={source} style={style} resizeMode={resizeMode} />
    : <View style={[{ backgroundColor: colors.lavender }, style as StyleProp<ViewStyle>]} />;
}

export async function readLocalPhoto(id: string): Promise<Blob | undefined> {
  if (Platform.OS !== 'web' || !durableMediaId.test(id)) return undefined;
  const value = await mediaStore<Blob | undefined>('readonly', (store) => store.get(id));
  return value instanceof Blob ? value : undefined;
}
