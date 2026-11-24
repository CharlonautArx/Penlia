import { File } from 'expo-file-system';
import { apiOrigin } from '../../services/api';
import { nativePhotoUri, readLocalPhoto } from '../space/media';
import type { Media } from '../moments/media';

export type RecordAsset = { mime: Media['mime']; photoId?: string; uri?: string; protectedId?: string; load?: () => Promise<string> };
const limit = 4 * 1024 * 1024;

export async function readRecordAsset(asset: RecordAsset, token?: string) {
  const uri = asset.uri ?? (asset.photoId ? nativePhotoUri(asset.photoId) : undefined) ?? await asset.load?.();
  if (uri?.startsWith('file://')) {
    const file = new File(uri);
    if (!file.exists || file.size > limit) throw new Error('附件无法读取或超过 4 MB。');
    return file.base64();
  }
  let blob: Blob | undefined;
  if (!uri && asset.photoId) blob = await readLocalPhoto(asset.photoId);
  else if (uri || (asset.protectedId && token)) {
    const response = await fetch(uri ?? (apiOrigin() + '/v1/moment-media/' + encodeURIComponent(asset.protectedId!)), {
      headers: !uri && token ? { Authorization: 'Bearer ' + token } : undefined,
    });
    if (!response.ok || Number(response.headers.get('content-length')) > limit) throw new Error('附件不可用或超过 4 MB。');
    blob = await response.blob();
  }
  if (!blob?.size || blob.size > limit) throw new Error('附件不可用或超过 4 MB。');
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(new Error('读取附件失败。'));
    reader.readAsDataURL(blob);
  });
}

export function recordAsset(media: Media): RecordAsset {
  return { mime: media.mime, uri: media.demoUri, protectedId: media.id };
}
