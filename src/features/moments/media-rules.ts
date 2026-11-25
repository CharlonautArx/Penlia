import { momentPhotoLimit } from './photo-grid';

export const momentVideoLimitMB = 20;
export const momentVideoLimit = momentVideoLimitMB * 1024 * 1024;

export function momentMediaCountError(photos: number, videos: number) {
  if (photos > momentPhotoLimit) return '最多选择 ' + momentPhotoLimit + ' 张图片。';
  if (videos > 1) return '最多选择 1 段视频。';
}
