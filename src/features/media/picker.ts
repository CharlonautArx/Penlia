import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

import { savePreparedPhoto } from '../space/media';

const maxInputBytes = 15 * 1024 * 1024;
const maxInputPixels = 28_000_000;
const maxChatBytes = 2 * 1024 * 1024;

export type SelectedImage = ImagePicker.ImagePickerAsset;
export type PreparedPhoto = { id: string; width: number; height: number; bytes: number };

export async function pickPhotos(selectionLimit = 1): Promise<SelectedImage[]> {
  try {
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], selectionLimit, allowsMultipleSelection: selectionLimit > 1, exif: false,
    });
    if (picked.canceled) return [];
    if (picked.assets.length > selectionLimit) throw new Error('每次最多选择 ' + selectionLimit + ' 张照片。');
    for (const item of picked.assets) {
      const bytes = item.fileSize ?? item.file?.size ?? (Platform.OS !== 'web' ? new File(item.uri).size : 0);
      if (bytes > maxInputBytes || item.width * item.height > maxInputPixels) {
        throw new Error('图片过大，请选择 15 MB、2800 万像素以内的图片。');
      }
      if (!item.width || !item.height || (item.mimeType && !item.mimeType.startsWith('image/'))) {
        throw new Error('暂时无法读取这张图片，请试试 JPEG 或 PNG。');
      }
    }
    return picked.assets;
  } catch (failure) {
    const code = (failure as { code?: string })?.code ?? '';
    if (/permission|denied/i.test(code)) throw new Error('系统未允许选择照片。你可以在设置中调整权限后再试。');
    if (failure instanceof Error && !code) throw failure;
    throw new Error('暂时无法打开图库，请重试。');
  }
}

export async function pickOnePhoto(): Promise<SelectedImage | undefined> {
  return (await pickPhotos())[0];
}

export function squareCrop(width: number, height: number, zoom: number) {
  const size = Math.max(1, Math.floor(Math.min(width, height) / zoom));
  return { originX: Math.floor((width - size) / 2), originY: Math.floor((height - size) / 2), width: size, height: size };
}

export async function preparePhoto(input: SelectedImage, account: string, avatarZoom?: number): Promise<PreparedPhoto> {
  const longest = Math.max(input.width, input.height);
  const avatar = avatarZoom !== undefined;
  for (const quality of avatar ? [0.86] : [0.85, 0.7, 0.56]) {
    const context = ImageManipulator.manipulate(input.uri);
    try {
      if (avatar) {
        const rect = squareCrop(input.width, input.height, avatarZoom);
        context.crop(rect);
        context.resize({ width: Math.min(rect.width, 512) });
      } else if (longest > 1800) {
        context.resize(input.width >= input.height ? { width: 1800 } : { height: 1800 });
      }
      const image = await context.renderAsync();
      try {
        const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: quality });
        const bytes = Platform.OS === 'web' ? (await (await fetch(saved.uri)).blob()).size : new File(saved.uri).size;
        if (bytes > maxChatBytes) continue;
        const photo = await savePreparedPhoto(saved.uri, account);
        return { id: photo.id, width: saved.width, height: saved.height, bytes };
      } finally { image.release(); }
    } finally { context.release(); }
  }
  throw new Error('压缩后的照片仍超过 2 MB，请换一张再试。');
}
